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
const VIP_PRICE_AZN = 30;
const VIP_MONTH_MS = 30 * 24 * 60 * 60 * 1000;
const VIP_SHOP_PASS_MS = 180 * 24 * 60 * 60 * 1000;

function verifiedAtMillis(value) {
  if (value && typeof value.toMillis === 'function') return value.toMillis();
  return Number(value) || 0;
}

function normalizedCosmetics(raw) {
  const equipped = raw?.equipped && typeof raw.equipped === 'object' ? { ...raw.equipped } : {};
  const vip = raw?.vip && typeof raw.vip === 'object' ? raw.vip : {};
  return {
    owned: Array.isArray(raw?.owned) ? [...new Set(raw.owned.filter((id) => typeof id === 'string'))] : [],
    equipped,
    vip: {
      tier: vip.tier === 'gold' || vip.tier === 'platinum' ? vip.tier : 'none',
      expiresAt: Number(vip.expiresAt) || 0,
    },
  };
}

function storedManat(player) {
  const manat = Number.isFinite(Number(player.manat)) ? Math.max(0, Math.floor(Number(player.manat))) : null;
  const coins = Number.isFinite(Number(player.coins)) ? Math.max(0, Math.floor(Number(player.coins))) : null;
  if (manat !== null && coins !== null) return Math.min(manat, coins);
  return manat ?? coins ?? 0;
}

module.exports = async function creatorActivationHandler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return sendJson(res, 405, { error: 'METHOD_NOT_ALLOWED' });
  }

  try {
    const payload = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
    const userId = String(payload.userId || '').trim();
    const creatorType = String(payload.creatorType || '').trim();
    if (!USER_ID_PATTERN.test(userId) || !['standard', 'vip'].includes(creatorType)
      || Object.keys(payload).length !== 2) {
      throw new ApiError(400, 'INVALID_REQUEST');
    }

    const action = creatorType === 'vip' ? 'purchaseVipProPlan' : 'activateFreeCreatorPanel';
    const identity = await verifySecureRequest(req, action, payload, {
      requireIdempotency: true,
      uidLimit: creatorType === 'vip'
        ? { max: 5, windowMs: 60_000 }
        : { max: 3, windowMs: 60_000 },
    });

    const db = getAdminFirestore();
    const playerRef = db.doc(`players/${userId}`);
    const userRef = db.doc(`users/${userId}`);
    const operationRef = db.doc(`operation_ledger/${sha256(`${identity.uid}:${identity.operationId}`).slice(0, 48)}`);
    const now = Date.now();

    const result = await db.runTransaction(async (tx) => {
      const operationSnap = await tx.get(operationRef);
      if (operationSnap.exists) return operationSnap.data()?.result;

      const [playerSnap, userSnap] = await Promise.all([tx.get(playerRef), tx.get(userRef)]);
      if (!playerSnap.exists || !userSnap.exists) throw new ApiError(404, 'PROFILE_NOT_FOUND');
      const player = playerSnap.data() || {};
      const user = userSnap.data() || {};
      if (player.firebaseUid !== identity.uid || user.firebaseUid !== identity.uid) {
        throw new ApiError(403, 'PROFILE_OWNER_MISMATCH');
      }
      if (player.frozen === true || user.frozen === true || user.banned === true) {
        throw new ApiError(403, 'PROFILE_UNAVAILABLE');
      }
      if (verifiedAtMillis(player.identityVerifiedAt) <= 0) {
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
          type: 'free_creator_panel', amount: 0, source: 'free_creator_panel',
          result: standard, createdAt: FieldValue.serverTimestamp(),
        });
        return standard;
      }

      const balance = storedManat(player);
      if (balance < VIP_PRICE_AZN) throw new ApiError(409, 'INSUFFICIENT_BALANCE');
      const nextBalance = balance - VIP_PRICE_AZN;
      const oldCosmetics = normalizedCosmetics(player.cosmetics);
      const panelUntil = Math.max(Number(player.creatorPanelExpiresAt) || 0, now) + VIP_MONTH_MS;
      const adFreeUntil = Math.max(Number(player.adFreeUntil) || 0, now) + VIP_MONTH_MS;
      const vipUntil = Math.max(oldCosmetics.vip.expiresAt, now) + VIP_SHOP_PASS_MS;
      const tier = oldCosmetics.vip.tier === 'platinum' && oldCosmetics.vip.expiresAt > now
        ? 'platinum'
        : 'gold';
      const cosmetics = { ...oldCosmetics, vip: { tier, expiresAt: vipUntil } };
      const vip = {
        userPlan: 'VIP_PRO',
        hasVipPass: true,
        isVipLifetime: player.isVipLifetime === true,
        proPanelActive: player.proPanelActive === true,
        creatorPanelExpiresAt: panelUntil,
        adFreeUntil,
        cosmetics,
      };
      const vipResult = { ...vip, balance: nextBalance };

      tx.set(playerRef, { manat: nextBalance, coins: nextBalance, ...vip, updatedAt: now }, { merge: true });
      tx.set(userRef, {
        userPlan: 'VIP_PRO', hasVipPass: true, isVipLifetime: vip.isVipLifetime,
        creatorPanelExpiresAt: panelUntil, adFreeUntil, vipTier: tier,
        vipExpiresAt: vipUntil, equippedCosmetics: cosmetics.equipped, updatedAt: now,
      }, { merge: true });
      tx.create(operationRef, {
        authUid: identity.uid, playerId: userId, operationId: identity.operationId,
        type: 'vip_pro_purchase', amount: -VIP_PRICE_AZN, balanceAfter: nextBalance,
        source: 'vip_pro', result: vipResult, createdAt: FieldValue.serverTimestamp(),
      });
      return vipResult;
    });

    return sendJson(res, 200, result);
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 500;
    const known = new Set([
      'AUTH_HEADERS_REQUIRED', 'AUTH_TOKEN_INVALID', 'APP_CHECK_INVALID',
      'APP_CHECK_PROJECT_MISMATCH', 'AUTH_OR_APP_CHECK_REQUIRED',
      'FIREBASE_SERVICE_ACCOUNT_MISSING', 'FIREBASE_SERVICE_ACCOUNT_INVALID',
      'FIREBASE_SERVICE_ACCOUNT_PROJECT_MISMATCH', 'FIREBASE_AUTH_VERIFIER_UNAVAILABLE',
      'PLAY_INTEGRITY_REQUIRED', 'PLAY_INTEGRITY_NOT_CONFIGURED', 'PLAY_INTEGRITY_REJECTED',
      'PLAY_INTEGRITY_UNAVAILABLE', 'RATE_LIMITED', 'SECURITY_CONFIGURATION_MISSING',
      'INVALID_REQUEST', 'PROFILE_NOT_FOUND', 'PROFILE_OWNER_MISMATCH',
      'PROFILE_UNAVAILABLE', 'PROFILE_NOT_VERIFIED', 'INSUFFICIENT_BALANCE',
    ]);
    const code = known.has(error.code) ? error.code : 'CREATOR_ACTIVATION_FAILED';
    if (status >= 500) console.error('creator-activation failed:', error);
    return sendJson(res, status, { error: code });
  }
};
