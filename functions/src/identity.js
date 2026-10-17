const { z } = require('zod');
const {
  db,
  FieldValue,
  HttpsError,
  secureCallable,
  safeId,
  operationDocId,
  ensureRateLimitTx,
} = require('./security');

const schema = z.object({ userId: z.string().regex(/^\d{1,20}$/) }).strict();

async function bindPlayerIdentity({ uid, payload, operationId, rateLimit }) {
  const playerId = safeId(payload.userId, 'Oyunçu ID-si');
  const userRef = db.doc(`users/${playerId}`);
  const playerRef = db.doc(`players/${playerId}`);
  const opRef = db.doc(`operation_ledger/${operationDocId(uid, operationId)}`);
  const now = Date.now();

  return db.runTransaction(async (tx) => {
    const op = await tx.get(opRef);
    if (op.exists) return op.data().result;
    const rate = await ensureRateLimitTx(tx, uid, 'bindPlayerIdentity', rateLimit, now);
    const [userSnap, playerSnap] = await Promise.all([tx.get(userRef), tx.get(playerRef)]);
    if (!userSnap.exists || userSnap.data().firebaseUid !== uid) {
      throw new HttpsError('permission-denied', 'Profilin Firebase hesabına bağlı deyil.');
    }
    if (playerSnap.exists && playerSnap.data().firebaseUid && playerSnap.data().firebaseUid !== uid) {
      throw new HttpsError('permission-denied', 'Oyunçu profili başqa hesaba bağlıdır.');
    }
    const current = playerSnap.exists ? playerSnap.data() : {};
    if (current.firebaseUid && current.firebaseUid !== uid) {
      throw new HttpsError('failed-precondition', 'Köhnə oyunçu məlumatı təhlükəsiz şəkildə təsdiqlənmir.');
    }
    if (current.identityVerifiedAt) {
      const result = { userId: playerId, linked: true, balance: 0, alreadyLinked: true };
      tx.create(opRef, { authUid: uid, operationId, action: 'bindPlayerIdentity', result, createdAt: FieldValue.serverTimestamp() });
      tx.set(rate.ref, rate.next);
      return result;
    }
    // Balances and assets from the old client-written documents have no server ledger,
    // so the first binding starts at zero and cannot import client-authored value.
    const balance = 0;
    const result = { userId: playerId, linked: true, balance };
    tx.set(playerRef, {
      odId: playerId,
      firebaseUid: uid,
      identityVerifiedAt: now,
      displayName: current.displayName || [userSnap.data().name, userSnap.data().surname].filter(Boolean).join(' '),
      allianceId: current.allianceId || null,
      allianceName: current.allianceName || null,
      isLeader: false,
      manat: balance,
      coins: balance,
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
    }, { merge: true });
    tx.create(opRef, { authUid: uid, operationId, action: 'bindPlayerIdentity', result, createdAt: FieldValue.serverTimestamp() });
    tx.set(rate.ref, rate.next);
    return result;
  });
}

const bindPlayerIdentityCallable = secureCallable('bindPlayerIdentity', schema, bindPlayerIdentity, { max: 5, windowMs: 60_000 });

module.exports = { bindPlayerIdentity: bindPlayerIdentityCallable };
