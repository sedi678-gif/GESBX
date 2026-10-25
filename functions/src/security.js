const crypto = require('node:crypto');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');

const ADMIN_UIDS = defineSecret('ADMIN_UIDS');
const RISK_HASH_SECRET = defineSecret('RISK_HASH_SECRET');
const REFERRAL_CODE_SECRET = defineSecret('REFERRAL_CODE_SECRET');

const db = getFirestore();
const REGION = 'us-central1';
const OPERATION_ID = /^[A-Za-z0-9_-]{16,80}$/;

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.keys(value).sort().map((key) => [key, stableValue(value[key])]),
  );
}

function canonicalJson(value) {
  return JSON.stringify(stableValue(value));
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('base64url');
}

function actionRequestHash(uid, action, operationId, payload, installationId) {
  return sha256(canonicalJson({ uid, action, operationId, payload, installationId }));
}

function appCheckRequestHash(uid, challenge, installationId) {
  return sha256(`${uid}|app-check|${challenge}|${installationId}`);
}

async function decodePlayIntegrityToken(integrityToken) {
  const packageName = String(process.env.PLAY_INTEGRITY_PACKAGE_NAME || '').trim();
  if (!packageName) {
    throw new HttpsError('failed-precondition', 'Play Integrity package name konfiqurasiya edilməyib.');
  }

  const { GoogleAuth } = require('google-auth-library');
  const googleAuth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/playintegrity'] });
  const client = await googleAuth.getClient();
  const token = await client.getAccessToken();
  if (!token?.token) throw new HttpsError('unavailable', 'Google Play Integrity xidməti əlçatan deyil.');

  const response = await fetch(
    `https://playintegrity.googleapis.com/v1/${encodeURIComponent(packageName)}:decodeIntegrityToken`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ integrity_token: integrityToken }),
    },
  );
  if (!response.ok) {
    throw new HttpsError('permission-denied', 'Play Integrity tokeni yoxlanmadı.');
  }
  const result = await response.json();
  return result.tokenPayloadExternal || result;
}

function assertIntegrityVerdict(verdict, expectedHash) {
  const request = verdict?.requestDetails || {};
  const app = verdict?.appIntegrity || {};
  const device = verdict?.deviceIntegrity || {};
  const account = verdict?.accountDetails || {};
  const packageName = String(process.env.PLAY_INTEGRITY_PACKAGE_NAME || '').trim();
  const sentAt = Number(request.timestampMillis);
  const now = Date.now();
  const allowedSkew = 2 * 60 * 1000;

  if (request.requestPackageName !== packageName || request.requestHash !== expectedHash) {
    throw new HttpsError('permission-denied', 'Integrity sorğusu bu əməliyyata uyğun deyil.');
  }
  if (!Number.isFinite(sentAt) || sentAt > now + 30_000 || now - sentAt > allowedSkew) {
    throw new HttpsError('deadline-exceeded', 'Integrity tokeninin vaxtı keçib.');
  }
  if (app.appRecognitionVerdict !== 'PLAY_RECOGNIZED') {
    throw new HttpsError('permission-denied', 'Rəsmi tətbiq təsdiqlənmədi.');
  }
  const deviceVerdicts = Array.isArray(device.deviceRecognitionVerdict)
    ? device.deviceRecognitionVerdict
    : [];
  if (!deviceVerdicts.some((value) => value === 'MEETS_DEVICE_INTEGRITY' || value === 'MEETS_STRONG_INTEGRITY')) {
    throw new HttpsError('permission-denied', 'Cihazın bütövlük hökmü uyğun deyil.');
  }
  if (account.appLicensingVerdict !== 'LICENSED') {
    throw new HttpsError('permission-denied', 'Google Play lisenziyası təsdiqlənmədi.');
  }
  return verdict;
}

async function verifyActionIntegrity(request, uid, action, operationId, payload) {
  const appId = String(request.app?.appId || '');
  if (!appId.includes(':android:')) return;
  const integrityToken = request.data?.integrityToken;
  if (typeof integrityToken !== 'string' || integrityToken.length < 20 || integrityToken.length > 20_000) {
    throw new HttpsError('permission-denied', 'Play Integrity tokeni tələb olunur.');
  }
  const installationId = request.data?.installationId;
  const expectedHash = actionRequestHash(uid, action, operationId, payload, installationId);
  const verdict = await decodePlayIntegrityToken(integrityToken);
  assertIntegrityVerdict(verdict, expectedHash);
}

async function enforceClientRateLimits(uid, installationId, ip, action) {
  const installHash = riskHash(installationId, 'installation');
  if (!installHash) throw new HttpsError('failed-precondition', 'Firebase Installation ID və risk açarı tələb olunur.');
  const ipHash = riskHash(ip, 'ip');
  const refs = [
    { ref: db.doc(`security_rate_limits/device_${sha256(`${action}:${installHash}`).slice(0, 40)}`), max: 120 },
  ];
  if (ipHash) refs.push({ ref: db.doc(`security_rate_limits/ip_${sha256(`${action}:${ipHash}`).slice(0, 40)}`), max: 600 });
  const now = Date.now();
  await db.runTransaction(async (tx) => {
    const snapshots = await Promise.all(refs.map((item) => tx.get(item.ref)));
    const updates = refs.map((item, index) => {
      const previous = snapshots[index].exists ? snapshots[index].data() : {};
      const sameWindow = Number(previous.windowStartedAt) > now - 60_000;
      const count = sameWindow ? Number(previous.count) || 0 : 0;
      if (count >= item.max) throw new HttpsError('resource-exhausted', 'Cihaz və ya şəbəkə üzrə sürət limiti keçilib.');
      return {
        ref: item.ref,
        data: {
          windowStartedAt: sameWindow ? previous.windowStartedAt : now,
          count: count + 1,
          updatedAt: FieldValue.serverTimestamp(),
        },
      };
    });
    updates.forEach((item) => tx.set(item.ref, item.data));
  });
}

function secureCallable(action, schema, handler, rateLimit = { max: 30, windowMs: 60_000 }, extraSecrets = []) {
  return onCall(
    {
      region: REGION,
      enforceAppCheck: true,
      maxInstances: 40,
      // Most actions only need the risk hash secret. Bind admin and referral
      // secrets only where used, so unrelated missing secrets cannot take down
      // ordinary callables such as the XP mode toggle.
      secrets: [...new Set([RISK_HASH_SECRET, ...extraSecrets])],
    },
    async (request) => {
      if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Giriş tələb olunur.');
      if (!request.app?.appId) throw new HttpsError('failed-precondition', 'App Check təsdiqi tələb olunur.');
      const operationId = request.data?.operationId;
      if (typeof operationId !== 'string' || !OPERATION_ID.test(operationId)) {
        throw new HttpsError('invalid-argument', 'Etibarlı operationId göndərin.');
      }
      let payload;
      try {
        payload = schema.parse(request.data?.payload);
      } catch (error) {
        throw new HttpsError('invalid-argument', 'Sorğunun məlumatları etibarsızdır.', error?.issues || undefined);
      }
      const installationId = request.data?.installationId;
      if (typeof installationId !== 'string' || !/^[A-Za-z0-9_-]{8,200}$/.test(installationId)) {
        throw new HttpsError('failed-precondition', 'Firebase Installation ID tələb olunur.');
      }
      await verifyActionIntegrity(request, request.auth.uid, action, operationId, payload);
      const ip = request.rawRequest?.ip || '';
      await enforceClientRateLimits(request.auth.uid, installationId, ip, action);
      return handler({
        uid: request.auth.uid,
        authToken: request.auth.token || {},
        appId: request.app.appId,
        payload,
        operationId,
        ip,
        installationId,
        rateLimit,
      });
    },
  );
}

function safeId(value, label = 'ID') {
  const id = String(value || '').trim();
  if (!/^\d{1,20}$/.test(id)) throw new HttpsError('invalid-argument', `${label} etibarsızdır.`);
  return id;
}

function operationDocId(uid, operationId) {
  return sha256(`${uid}:${operationId}`).slice(0, 48);
}

function playerDocIdFromUid(uid) {
  return db.collection('players').where('firebaseUid', '==', uid).limit(2);
}

function verifiedIdentityMillis(value) {
  if (value && typeof value.toMillis === 'function') return value.toMillis();
  return Number(value);
}

async function getOwnedPlayer(uid, requestedPlayerId, tx) {
  const playerId = safeId(requestedPlayerId, 'Oyunçu ID-si');
  const playerRef = db.doc(`players/${playerId}`);
  const userRef = db.doc(`users/${playerId}`);
  const [playerSnap, userSnap] = await Promise.all([tx.get(playerRef), tx.get(userRef)]);
  if (!playerSnap.exists || !userSnap.exists) throw new HttpsError('not-found', 'Oyunçu profili tapılmadı.');
  const player = playerSnap.data();
  const user = userSnap.data();
  if (player.firebaseUid !== uid || user.firebaseUid !== uid) {
    throw new HttpsError('permission-denied', 'Bu oyunçu profili bu hesaba bağlı deyil.');
  }
  const verifiedAt = verifiedIdentityMillis(player.identityVerifiedAt);
  if (!Number.isFinite(verifiedAt) || verifiedAt <= 0) {
    throw new HttpsError('failed-precondition', 'Oyunçu profili serverdə hələ təsdiqlənməyib.');
  }
  if (user.banned === true || user.frozen === true || player.frozen === true) {
    throw new HttpsError('permission-denied', 'Hesab hazırda əməliyyat apara bilmir.');
  }
  return { playerId, playerRef, userRef, player, user };
}

async function requireOwnedPlayer(uid, requestedPlayerId) {
  const playerId = safeId(requestedPlayerId, 'Oyunçu ID-si');
  const playerSnap = await db.doc(`players/${playerId}`).get();
  const userSnap = await db.doc(`users/${playerId}`).get();
  if (!playerSnap.exists || !userSnap.exists) throw new HttpsError('not-found', 'Oyunçu profili tapılmadı.');
  const player = playerSnap.data();
  const user = userSnap.data();
  if (player.firebaseUid !== uid || user.firebaseUid !== uid) {
    throw new HttpsError('permission-denied', 'Bu oyunçu profili bu hesaba bağlı deyil.');
  }
  const verifiedAt = verifiedIdentityMillis(player.identityVerifiedAt);
  if (!Number.isFinite(verifiedAt) || verifiedAt <= 0) {
    throw new HttpsError('failed-precondition', 'Oyunçu profili serverdə hələ təsdiqlənməyib.');
  }
  if (user.banned === true || user.frozen === true || player.frozen === true) {
    throw new HttpsError('permission-denied', 'Hesab hazırda əməliyyat apara bilmir.');
  }
  return { playerId, playerRef: db.doc(`players/${playerId}`), userRef: db.doc(`users/${playerId}`), player, user };
}

async function readOperation(tx, uid, operationId, collection = 'wallet_ledger') {
  const ref = db.doc(`${collection}/${operationDocId(uid, operationId)}`);
  const snap = await tx.get(ref);
  return { ref, snap, data: snap.exists ? snap.data() : null };
}

function ensureRateLimitTx(tx, uid, action, limit, now = Date.now()) {
  const ref = db.doc(`security_rate_limits/${sha256(`${uid}:${action}`).slice(0, 40)}`);
  return tx.get(ref).then((snap) => {
    const prev = snap.exists ? snap.data() : {};
    const sameWindow = Number(prev.windowStartedAt) > now - limit.windowMs;
    const count = sameWindow ? Number(prev.count) || 0 : 0;
    if (count >= limit.max) throw new HttpsError('resource-exhausted', 'Əməliyyat limiti keçilib. Bir az sonra yenidən yoxlayın.');
    return {
      ref,
      next: {
        windowStartedAt: sameWindow ? prev.windowStartedAt : now,
        count: count + 1,
        updatedAt: FieldValue.serverTimestamp(),
      },
    };
  });
}

function writeWalletLedger(tx, ref, input) {
  tx.create(ref, {
    authUid: input.uid,
    playerId: input.playerId,
    operationId: input.operationId,
    type: input.type,
    amount: input.amount,
    balanceAfter: input.balanceAfter,
    source: input.source,
    result: input.result,
    createdAt: FieldValue.serverTimestamp(),
  });
}

function writeXpLedger(tx, ref, input) {
  tx.create(ref, {
    authUid: input.uid,
    playerId: input.playerId,
    operationId: input.operationId,
    type: input.type,
    amount: input.amount,
    xpAfter: input.xpAfter,
    source: input.source,
    result: input.result,
    createdAt: FieldValue.serverTimestamp(),
  });
}

function storedManat(player) {
  const manat = Number.isFinite(Number(player.manat)) ? Math.max(0, Math.floor(Number(player.manat))) : null;
  const coins = Number.isFinite(Number(player.coins)) ? Math.max(0, Math.floor(Number(player.coins))) : null;
  if (manat !== null && coins !== null) return Math.min(manat, coins);
  return manat ?? coins ?? 0;
}

function storedXp(player) {
  const xp = Number(player.xp);
  return Number.isSafeInteger(xp) && xp >= 0 ? xp : 0;
}

async function ownsSuperAdminProfile(uid) {
  if (!uid) return false;
  const profileId = '92';
  const [userSnap, playerSnap] = await Promise.all([
    db.doc(`users/${profileId}`).get(),
    db.doc(`players/${profileId}`).get(),
  ]);
  return userSnap.exists
    && playerSnap.exists
    && userSnap.data().firebaseUid === uid
    && playerSnap.data().firebaseUid === uid
    && Boolean(playerSnap.data().identityVerifiedAt);
}

async function adminUid(uid) {
  // Admin access follows the verified super-admin profile, now ID 92.
  if (!await ownsSuperAdminProfile(uid)) return false;
  const user = await db.doc('users/92').get();
  const data = user.data() || {};
  return data.role === 'super_admin' && data.isAdmin === true;
}

function riskHash(value, source) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return null;
  const secret = String(RISK_HASH_SECRET.value() || '').trim();
  if (!secret) return null;
  return crypto.createHmac('sha256', secret).update(`${source}:${normalized}`).digest('hex');
}

module.exports = {
  REGION,
  OPERATION_ID,
  HttpsError,
  FieldValue,
  db,
  getAuth,
  secureCallable,
  safeId,
  actionRequestHash,
  appCheckRequestHash,
  decodePlayIntegrityToken,
  assertIntegrityVerdict,
  operationDocId,
  playerDocIdFromUid,
  getOwnedPlayer,
  requireOwnedPlayer,
  readOperation,
  ensureRateLimitTx,
  writeWalletLedger,
  writeXpLedger,
  storedManat,
  storedXp,
  adminUid,
  ownsSuperAdminProfile,
  riskHash,
  enforceClientRateLimits,
  ADMIN_UIDS,
  RISK_HASH_SECRET,
  REFERRAL_CODE_SECRET,
};
