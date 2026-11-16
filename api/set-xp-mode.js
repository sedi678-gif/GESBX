const {
  ApiError,
  FieldValue,
  applyCors,
  getAdminFirestore,
  sendJson,
  sha256,
  verifySecureRequest,
} = require('../services/apiSecurity');
const { isVerifiedAdminRecovery } = require('../services/verifiedAdminRecovery');

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
    const creatorType = payload.creatorType;
    const isCreatorActivation = creatorType === 'standard' || creatorType === 'vip';
    const requestAction = isCreatorActivation
      ? (creatorType === 'vip' ? 'purchaseVipProPlan' : 'activateFreeCreatorPanel')
      : 'setProPanelActive';
    const identity = await verifySecureRequest(req, requestAction, payload, { requireIdempotency: true });
    if (isCreatorActivation) {
      if (typeof payload.userId !== 'string' || !USER_ID_PATTERN.test(payload.userId)
        || Object.keys(payload).length !== 2) throw new ApiError(400, 'INVALID_REQUEST');
    } else if (typeof payload.active !== 'boolean' || Object.keys(payload).length !== 1) {
      throw new ApiError(400, 'INVALID_REQUEST');
    }

    const db = getAdminFirestore();
    const verifiedAdminRecovery = isVerifiedAdminRecovery(identity);
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
    const adminProfileId = adminSession.adminUid === identity.uid || verifiedAdminRecovery ? '92' : '';
    const userId = adminProfileId || userProfileId || playerProfileId || allocatedProfileId;
    if (adminProfileId && ((userProfileId && userProfileId !== '92')
      || (playerProfileId && playerProfileId !== '92')
      || (allocatedProfileId && allocatedProfileId !== '92'))) {
      throw new ApiError(409, 'PROFILE_LINK_MISMATCH');
    }
    if (userId && allocatedProfileId && userId !== allocatedProfileId) {
      throw new ApiError(409, 'PROFILE_LINK_MISMATCH');
    }
    if (!userId) throw new ApiError(404, 'PROFILE_NOT_FOUND');
    if (isCreatorActivation && payload.userId !== userId) throw new ApiError(403, 'PROFILE_OWNER_MISMATCH');
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
        && (verifiedAdminRecovery || (currentAdminSession.exists
          && currentAdminSession.data()?.adminUid === identity.uid));
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

      if (isBoundAdmin) {
        tx.set(userRef, {
          id: '92',
          name: user.name || 'Admin',
          surname: user.surname || '',
          handle: user.handle || '@admin',
          role: 'super_admin',
          isAdmin: true,
          isModerator: true,
          canViewReports: true,
          canAccessAdminPanel: true,
          firebaseUid: identity.uid,
          email: identity.email,
          createdAt: user.createdAt || now,
          updatedAt: now,
        }, { merge: true });
      }

      if (isCreatorActivation) {
        if (!playerSnap.exists || !userSnap.exists || !player.identityVerifiedAt) {
          throw new ApiError(409, 'PROFILE_NOT_VERIFIED');
        }
        if (creatorType === 'standard') {
          const standard = {
            userPlan: player.userPlan || 'FREE',
            hasVipPass: player.hasVipPass === true,
            isVipLifetime: player.isVipLifetime === true,
            proPanelActive: player.proPanelActive === true,
            creatorPanelExpiresAt: Number(player.creatorPanelExpiresAt) || 0,
            adFreeUntil: Number(player.adFreeUntil) || 0,
            freeCreatorPanelClaimedAt: Number(player.freeCreatorPanelClaimedAt) || now,
          };
          tx.set(playerRef, { ...standard, updatedAt: now }, { merge: true });
          tx.set(userRef, { ...standard, updatedAt: now }, { merge: true });
          tx.create(operationRef, {
            authUid: identity.uid, playerId: userId, operationId: identity.operationId,
            action: requestAction, type: 'free_creator_panel', amount: 0,
            result: standard, createdAt: FieldValue.serverTimestamp(),
          });
          return standard;
        }

        const manat = Number.isFinite(Number(player.manat)) ? Math.max(0, Math.floor(Number(player.manat))) : null;
        const coins = Number.isFinite(Number(player.coins)) ? Math.max(0, Math.floor(Number(player.coins))) : null;
        const balance = manat !== null && coins !== null ? Math.min(manat, coins) : (manat ?? coins ?? 0);
        if (balance < 30) throw new ApiError(409, 'INSUFFICIENT_BALANCE');
        const nextBalance = balance - 30;
        const oldCosmetics = player.cosmetics && typeof player.cosmetics === 'object' ? player.cosmetics : {};
        const oldVip = oldCosmetics.vip && typeof oldCosmetics.vip === 'object' ? oldCosmetics.vip : {};
        const cosmetics = {
          owned: Array.isArray(oldCosmetics.owned) ? oldCosmetics.owned : [],
          equipped: oldCosmetics.equipped && typeof oldCosmetics.equipped === 'object' ? oldCosmetics.equipped : {},
          vip: {
            tier: oldVip.tier === 'platinum' && Number(oldVip.expiresAt) > now ? 'platinum' : 'gold',
            expiresAt: Math.max(Number(oldVip.expiresAt) || 0, now) + 180 * 24 * 60 * 60 * 1000,
          },
        };
        const panelUntil = Math.max(Number(player.creatorPanelExpiresAt) || 0, now) + 30 * 24 * 60 * 60 * 1000;
        const adFreeUntil = Math.max(Number(player.adFreeUntil) || 0, now) + 30 * 24 * 60 * 60 * 1000;
        const vip = {
          userPlan: 'VIP_PRO', hasVipPass: true,
          isVipLifetime: player.isVipLifetime === true,
          proPanelActive: player.proPanelActive === true,
          creatorPanelExpiresAt: panelUntil, adFreeUntil, cosmetics,
        };
        const vipResult = { ...vip, balance: nextBalance };
        tx.set(playerRef, { manat: nextBalance, coins: nextBalance, ...vip, updatedAt: now }, { merge: true });
        tx.set(userRef, {
          userPlan: 'VIP_PRO', hasVipPass: true, isVipLifetime: vip.isVipLifetime,
          creatorPanelExpiresAt: panelUntil, adFreeUntil,
          vipTier: cosmetics.vip.tier, vipExpiresAt: cosmetics.vip.expiresAt,
          equippedCosmetics: cosmetics.equipped, updatedAt: now,
        }, { merge: true });
        tx.create(operationRef, {
          authUid: identity.uid, playerId: userId, operationId: identity.operationId,
          action: requestAction, type: 'vip_pro_purchase', amount: -30,
          balanceAfter: nextBalance, result: vipResult, createdAt: FieldValue.serverTimestamp(),
        });
        return vipResult;
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
        action: requestAction,
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
      'PROFILE_NOT_VERIFIED', 'INSUFFICIENT_BALANCE',
    ]);
    const code = knownCodes.has(error.code) ? error.code : 'XP_MODE_UPDATE_FAILED';
    if (status >= 500) console.error('set-xp-mode failed:', error.message);
    return sendJson(res, status, { error: code });
  }
};
