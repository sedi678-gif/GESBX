const {
  ApiError,
  FieldValue,
  applyCors,
  getAdminFirestore,
  sendJson,
  verifySecureRequest,
} = require('../services/apiSecurity');

const PLAYER_ID = /^\d{1,20}$/;

module.exports = async function bindPlayerIdentityApi(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return sendJson(res, 405, { error: 'METHOD_NOT_ALLOWED' });
  }

  try {
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
    const opId = require('node:crypto').createHash('sha256')
      .update(`${uid}:${identity.operationId}`).digest('hex').slice(0, 40);
    const opRef = db.doc(`operation_ledger/${opId}`);
    const now = Date.now();

    const result = await db.runTransaction(async (tx) => {
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
    return sendJson(res, 200, result);
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 500;
    const code = error instanceof ApiError ? error.code : 'IDENTITY_BIND_FAILED';
    if (status >= 500) console.error('bindPlayerIdentity API failed:', error);
    return sendJson(res, status, { error: code });
  }
};
