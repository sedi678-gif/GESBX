const {
  ApiError,
  FieldValue,
  applyCors,
  getAdminFirestore,
  sendJson,
  sha256,
  verifySecureRequest,
} = require('../services/apiSecurity');

const USER_ID_PATTERN = /^\d{1,20}$/;

module.exports = async function setXpModeHandler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return sendJson(res, 405, { error: 'METHOD_NOT_ALLOWED' });
  }

  try {
    const payload = req.body && typeof req.body === 'object' && !Array.isArray(req.body)
      ? req.body
      : {};
    const identity = await verifySecureRequest(req, 'setProPanelActive', payload, { requireIdempotency: true });
    if (typeof payload.active !== 'boolean' || Object.keys(payload).length !== 1) {
      throw new ApiError(400, 'INVALID_REQUEST');
    }

    const db = getAdminFirestore();
    const [usersByUid, playersByUid] = await Promise.all([
      db.collection('users').where('firebaseUid', '==', identity.uid).limit(2).get(),
      db.collection('players').where('firebaseUid', '==', identity.uid).limit(2).get(),
    ]);
    if (usersByUid.size > 1 || playersByUid.size > 1) {
      throw new ApiError(409, 'PROFILE_NOT_UNIQUE');
    }
    const userProfileId = usersByUid.empty ? '' : usersByUid.docs[0].id;
    const playerProfileId = playersByUid.empty ? '' : playersByUid.docs[0].id;
    if (userProfileId && playerProfileId && userProfileId !== playerProfileId) {
      throw new ApiError(409, 'PROFILE_LINK_MISMATCH');
    }
    const allocationRef = db.doc(`user_id_allocations/${sha256(identity.uid).slice(0, 48)}`);
    // Profile 92 is reserved for the super admin and is intentionally excluded
    // from normal user ID allocations. Its server-written admin session is the
    // authoritative UID-to-profile link when the profile documents are legacy.
    const adminSessionRef = db.doc('admin_sessions/92');
    const [allocationSnap, adminSessionSnap] = await Promise.all([
      allocationRef.get(),
      adminSessionRef.get(),
    ]);
    const allocatedProfileId = allocationSnap.exists
      ? String(allocationSnap.data()?.userId || '').trim()
      : '';
    if (allocationSnap.exists && allocationSnap.data()?.authUid !== identity.uid) {
      throw new ApiError(409, 'PROFILE_LINK_MISMATCH');
    }
    if (allocatedProfileId && !USER_ID_PATTERN.test(allocatedProfileId)) {
      throw new ApiError(409, 'PROFILE_NOT_UNIQUE');
    }
    const adminSession = adminSessionSnap.exists ? adminSessionSnap.data() || {} : {};
    const adminProfileId = adminSession.adminUid === identity.uid ? '92' : '';
    const userId = userProfileId || playerProfileId || allocatedProfileId || adminProfileId;
    if (userId && allocatedProfileId && userId !== allocatedProfileId) {
      throw new ApiError(409, 'PROFILE_LINK_MISMATCH');
    }
    if (!userId) throw new ApiError(404, 'PROFILE_NOT_FOUND');
    if (!USER_ID_PATTERN.test(userId)) throw new ApiError(409, 'PROFILE_NOT_UNIQUE');
    const playerRef = db.doc(`players/${userId}`);
    const userRef = db.doc(`users/${userId}`);
    const operationRef = db.doc(`operation_ledger/${sha256(`${identity.uid}:${identity.operationId}`).slice(0, 48)}`);
    const now = Date.now();

    const result = await db.runTransaction(async (tx) => {
      const operationSnap = await tx.get(operationRef);
      if (operationSnap.exists) return operationSnap.data().result;

      const [playerSnap, userSnap, currentAllocation, currentAdminSession] = await Promise.all([
        tx.get(playerRef),
        tx.get(userRef),
        tx.get(allocationRef),
        tx.get(adminSessionRef),
      ]);
      const isBoundAdmin = userId === '92'
        && currentAdminSession.exists
        && currentAdminSession.data()?.adminUid === identity.uid;
      if (!playerSnap.exists && !userSnap.exists && !currentAllocation.exists && !isBoundAdmin) {
        throw new ApiError(404, 'PROFILE_NOT_FOUND');
      }
      if (currentAllocation.exists
        && String(currentAllocation.data()?.userId || '') !== userId) {
        throw new ApiError(409, 'PROFILE_LINK_MISMATCH');
      }

      const player = playerSnap.exists ? playerSnap.data() || {} : {};
      const user = userSnap.exists ? userSnap.data() || {} : {};
      if ((userSnap.exists && user.firebaseUid !== identity.uid)
        || (player.firebaseUid && player.firebaseUid !== identity.uid)) {
        throw new ApiError(403, 'PROFILE_OWNER_MISMATCH');
      }
      if (player.frozen === true || user.frozen === true || user.banned === true) {
        throw new ApiError(403, 'PROFILE_UNAVAILABLE');
      }

      const alreadyBound = Boolean(player.identityVerifiedAt);
      const operationResult = {
        userPlan: alreadyBound ? player.userPlan || 'FREE' : 'FREE',
        hasVipPass: alreadyBound && player.hasVipPass === true,
        isVipLifetime: alreadyBound && player.isVipLifetime === true,
        proPanelActive: payload.active,
      };
      if (alreadyBound) {
        tx.set(playerRef, {
          firebaseUid: identity.uid,
          proPanelActive: payload.active,
          updatedAt: now,
        }, { merge: true });
      } else {
        // Bind legacy player documents using the same safe initialization as
        // bindPlayerIdentity; old client-written balances/assets are not trusted.
        tx.set(playerRef, {
          odId: userId,
          firebaseUid: identity.uid,
          identityVerifiedAt: now,
          displayName: player.displayName || [user.name, user.surname].filter(Boolean).join(' '),
          allianceId: player.allianceId || null,
          allianceName: player.allianceName || null,
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
          proPanelActive: payload.active,
          battleCardsVersion: 4,
          updatedAt: now,
        }, { merge: true });
      }
      tx.create(operationRef, {
        authUid: identity.uid,
        playerId: userId,
        operationId: identity.operationId,
        action: 'setProPanelActive',
        result: operationResult,
        createdAt: FieldValue.serverTimestamp(),
      });
      return operationResult;
    });

    return sendJson(res, 200, result);
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 500;
    const knownCodes = new Set([
      'AUTH_HEADERS_REQUIRED', 'AUTH_TOKEN_INVALID', 'APP_CHECK_INVALID',
      'APP_CHECK_PROJECT_MISMATCH', 'AUTH_OR_APP_CHECK_REQUIRED',
      'FIREBASE_SERVICE_ACCOUNT_MISSING', 'FIREBASE_SERVICE_ACCOUNT_INVALID',
      'FIREBASE_SERVICE_ACCOUNT_PROJECT_MISMATCH', 'FIREBASE_AUTH_VERIFIER_UNAVAILABLE',
      'PLAY_INTEGRITY_REQUIRED', 'PLAY_INTEGRITY_NOT_CONFIGURED', 'PLAY_INTEGRITY_REJECTED',
      'PLAY_INTEGRITY_UNAVAILABLE', 'RATE_LIMITED', 'SECURITY_CONFIGURATION_MISSING',
      'INVALID_REQUEST', 'PROFILE_NOT_FOUND', 'PROFILE_OWNER_MISMATCH',
      'PROFILE_NOT_UNIQUE', 'PROFILE_LINK_MISMATCH', 'PROFILE_UNAVAILABLE',
    ]);
    const code = knownCodes.has(error.code) ? error.code : 'XP_MODE_UPDATE_FAILED';
    if (status >= 500) console.error('set-xp-mode failed:', error.message);
    return sendJson(res, status, { error: code });
  }
};
