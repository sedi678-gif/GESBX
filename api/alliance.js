const crypto = require('node:crypto');
const {
  ApiError,
  FieldValue,
  applyCors,
  getAdminFirestore,
  sendJson,
  verifySecureRequest,
} = require('../services/apiSecurity');

const PLAYER_ID = /^\\d{1,20}$/;

async function bindPlayerIdentity(req, res) {
  const payload = req.body && typeof req.body === 'object' ? req.body : {};
  if (typeof payload.userId !== 'string' || !PLAYER_ID.test(payload.userId)) {
    throw new ApiError(400, 'INVALID_PLAYER_ID');
  }
  const identity = await verifySecureRequest(req, 'bindPlayerIdentity', payload, {
    requireIdempotency: true,
    uidLimit: { max: 5, windowMs: 60_000 },
  });
  const db = getAdminFirestore();
  const uid = identity.uid;
  const playerId = payload.userId;
  const userRef = db.doc(`users/${playerId}`);
  const playerRef = db.doc(`players/${playerId}`);
  const opId = crypto.createHash('sha256')
    .update(`${uid}:${identity.operationId}`).digest('hex').slice(0, 40);
  const opRef = db.doc(`operation_ledger/${opId}`);
  const now = Date.now();

  return db.runTransaction(async (tx) => {
    const op = await tx.get(opRef);
    if (op.exists) return op.data().result;
    const [userSnap, playerSnap] = await Promise.all([tx.get(userRef), tx.get(playerRef)]);
    if (!userSnap.exists || userSnap.data().firebaseUid !== uid) {
      throw new ApiError(403, 'PROFILE_LINK_MISMATCH');
    }
    const current = playerSnap.exists ? playerSnap.data() : {};
    if (current.firebaseUid && current.firebaseUid !== uid) {
      throw new ApiError(403, 'PROFILE_LINK_MISMATCH');
    }
    if (current.identityVerifiedAt) {
      const already = { userId: playerId, linked: true, balance: 0, alreadyLinked: true };
      tx.create(opRef, {
        authUid: uid, operationId: identity.operationId,
        action: 'bindPlayerIdentity', result: already,
        createdAt: FieldValue.serverTimestamp(),
      });
      return already;
    }
    const linked = {
      odId: playerId,
      firebaseUid: uid,
      identityVerifiedAt: now,
      displayName: current.displayName || [userSnap.data().name, userSnap.data().surname].filter(Boolean).join(' '),
      allianceId: current.allianceId || null,
      allianceName: current.allianceName || null,
      isLeader: false,
      manat: 0,
      coins: 0,
      xp: 0,
      battleCards: { zombi: 0, yarasa: 0, duman: 0, mutant: 0, standing: 0, it: 0 },
      activeShields: [],
      cosmetics: { owned: [], equipped: {}, vip: { tier: 'none', expiresAt: 0 } },
      userPlan: 'FREE',
      hasVipPass: false,
      isVipLifetime: false,
      proPanelActive: false,
      battleCardsVersion: 4,
      updatedAt: now,
    };
    tx.set(playerRef, linked, { merge: true });
    const response = { userId: playerId, linked: true, balance: 0 };
    tx.create(opRef, {
      authUid: uid, operationId: identity.operationId,
      action: 'bindPlayerIdentity', result: response,
      createdAt: FieldValue.serverTimestamp(),
    });
    return response;
  });
}

async function createAlliance(req, res) {
  const payload = req.body && typeof req.body === 'object' ? req.body : {};
  const name = typeof payload.name === 'string' ? payload.name.trim() : '';
  const region = typeof payload.region === 'string' ? payload.region.trim() : '';
  const lat = Number(payload.lat);
  const lng = Number(payload.lng);
  if (typeof payload.userId !== 'string' || !PLAYER_ID.test(payload.userId)
    || name.length < 2 || name.length > 32 || !region || region.length > 64
    || !Number.isFinite(lat) || lat < -90 || lat > 90
    || !Number.isFinite(lng) || lng < -180 || lng > 180) {
    throw new ApiError(400, 'INVALID_ALLIANCE_DATA');
  }

  const identity = await verifySecureRequest(req, 'createAlliance', payload, {
    requireIdempotency: true,
    uidLimit: { max: 5, windowMs: 60_000 },
  });
  const db = getAdminFirestore();
  const playerId = payload.userId;
  const uid = identity.uid;
  const playerRef = db.doc(`players/${playerId}`);
  const userRef = db.doc(`users/${playerId}`);
  const opId = crypto.createHash('sha256')
    .update(`${uid}:${identity.operationId}`).digest('hex').slice(0, 40);
  const opRef = db.doc(`operation_ledger/${opId}`);
  const allianceRef = db.collection('alliances').doc();
  const now = Date.now();

  return db.runTransaction(async (tx) => {
    const op = await tx.get(opRef);
    if (op.exists) return op.data().result;
    const [playerSnap, userSnap] = await Promise.all([tx.get(playerRef), tx.get(userRef)]);
    if (!playerSnap.exists || !userSnap.exists) throw new ApiError(404, 'PROFILE_NOT_FOUND');
    const player = playerSnap.data();
    const user = userSnap.data();
    if (player.firebaseUid !== uid || user.firebaseUid !== uid) {
      throw new ApiError(403, 'PROFILE_LINK_MISMATCH');
    }
    const verifiedAt = player.identityVerifiedAt?.toMillis
      ? player.identityVerifiedAt.toMillis()
      : Number(player.identityVerifiedAt);
    if (!Number.isFinite(verifiedAt) || verifiedAt <= 0) {
      throw new ApiError(409, 'PROFILE_NOT_VERIFIED');
    }
    if (user.banned === true || user.frozen === true || player.frozen === true) {
      throw new ApiError(403, 'ACCOUNT_RESTRICTED');
    }
    if (player.allianceId) throw new ApiError(409, 'ALREADY_IN_ALLIANCE');

    const leader = String(player.displayName || [user.name, user.surname].filter(Boolean).join(' ')).trim().slice(0, 100);
    const alliance = {
      name, region, lat, lng,
      leaderId: playerId,
      leader,
      score: 50,
      members: [playerId],
      createdAt: now,
      flag: {
        backgroundColor: '#7f1d1d', accentColor: '#fbbf24', thirdColor: '#f8fafc',
        emblem: '🦁', pattern: 'canton', shape: 'rect',
      },
      fortressLevel: 1,
      fortressQualifyingMs: 0,
    };
    const response = { id: allianceRef.id, ...alliance };
    tx.create(allianceRef, alliance);
    tx.create(db.doc(`alliance_members/${allianceRef.id}/members/${uid}`), {
      playerId, createdAt: now,
    });
    tx.update(playerRef, {
      allianceId: allianceRef.id, allianceName: name,
      isLeader: true, score: 50, updatedAt: now,
    });
    tx.create(opRef, {
      authUid: uid, operationId: identity.operationId,
      action: 'createAlliance', result: response,
      createdAt: FieldValue.serverTimestamp(),
    });
    return response;
  });
}

module.exports = async function allianceApi(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return sendJson(res, 405, { error: 'METHOD_NOT_ALLOWED' });
  }
  const operation = String(req.query?.operation || 'create');
  if (operation !== 'bind' && operation !== 'create') {
    return sendJson(res, 400, { error: 'INVALID_OPERATION' });
  }
  try {
    const result = operation === 'bind'
      ? await bindPlayerIdentity(req, res)
      : await createAlliance(req, res);
    return sendJson(res, 200, result);
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 500;
    const code = error instanceof ApiError
      ? error.code
      : operation === 'bind' ? 'IDENTITY_BIND_FAILED' : 'ALLIANCE_CREATE_FAILED';
    if (status >= 500) console.error('Alliance API failed:', error);
    return sendJson(res, status, { error: code });
  }
};
