const crypto = require('node:crypto');
const {
  ApiError,
  FieldValue,
  applyCors,
  getAdminFirestore,
  sendJson,
  verifySecureRequest,
} = require('../apiSecurity');

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const storedXp = (player) => {
  const xp = Number(player?.xp);
  return Number.isSafeInteger(xp) && xp >= 0 ? xp : 0;
};

module.exports = async function checkReferralActivationHandler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return sendJson(res, 405, { error: 'METHOD_NOT_ALLOWED' });
  }

  try {
    const payload = req.body && typeof req.body === 'object' && !Array.isArray(req.body)
      ? req.body
      : {};
    const identity = await verifySecureRequest(req, 'checkReferralActivation', payload, {
      requireIdempotency: true,
      uidLimit: { max: 10, windowMs: 60_000 },
    });
    const referralId = String(payload.referralId || '').trim();
    if (!/^[A-Za-z0-9_-]{12,100}$/.test(referralId) || Object.keys(payload).length !== 1) {
      throw new ApiError(400, 'INVALID_REQUEST');
    }

    const db = getAdminFirestore();
    const operationId = req.get('Idempotency-Key') || req.headers['idempotency-key'];
    const operationRef = db.doc('operation_ledger/' + sha256(identity.uid + ':' + operationId).slice(0, 48));
    const referralRef = db.doc('referrals/' + referralId);
    const result = await db.runTransaction(async (tx) => {
      const operationSnap = await tx.get(operationRef);
      if (operationSnap.exists) return operationSnap.data().result;

      const referralSnap = await tx.get(referralRef);
      if (!referralSnap.exists) throw new ApiError(404, 'REFERRAL_NOT_FOUND');
      const referral = referralSnap.data() || {};
      if (referral.inviterUid !== identity.uid) throw new ApiError(403, 'REFERRAL_NOT_OWNED');
      if (referral.status === 'active') {
        return { referralId, status: 'active', alreadyActive: true };
      }
      if (referral.status === 'rejected') throw new ApiError(409, 'REFERRAL_REJECTED');

      const referredPlayerRef = db.doc('players/' + referral.referredPlayerId);
      const inviterPlayerRef = db.doc('players/' + referral.inviterPlayerId);
      const [referredPlayerSnap, inviterPlayerSnap] = await Promise.all([
        tx.get(referredPlayerRef),
        tx.get(inviterPlayerRef),
      ]);
      if (!referredPlayerSnap.exists) throw new ApiError(404, 'REFERRAL_RECRUITED_PROFILE_MISSING');
      const referredXp = storedXp(referredPlayerSnap.data());
      const threshold = Number(referral.xpThreshold) || 6500;
      if (referredXp < threshold) {
        return {
          referralId,
          status: 'pending',
          xpThreshold: threshold,
          currentXp: referredXp,
          progressPercent: Math.round((referredXp / threshold) * 100),
          notActive: true,
        };
      }
      if (!inviterPlayerSnap.exists) throw new ApiError(404, 'REFERRAL_INVITER_PROFILE_MISSING');

      const deterministicId = 'referral_activate_' + referralId;
      const xpLedgerRef = db.doc('xp_ledger/' + sha256(referral.inviterUid + ':' + deterministicId).slice(0, 48));
      const previousXpSnap = await tx.get(xpLedgerRef);
      if (previousXpSnap.exists) {
        return { referralId, status: 'active', alreadyActive: true, duplicate: true };
      }

      const rewardXp = Number(referral.rewardXp) || 6500;
      const nextXp = storedXp(inviterPlayerSnap.data()) + rewardXp;
      const response = {
        referralId,
        status: 'active',
        rewardXp,
        xpAfter: nextXp,
        activatedAt: Date.now(),
      };
      tx.update(inviterPlayerRef, { xp: nextXp, updatedAt: Date.now() });
      tx.create(xpLedgerRef, {
        authUid: referral.inviterUid,
        playerId: referral.inviterPlayerId,
        operationId: deterministicId,
        type: 'referral_reward',
        amount: rewardXp,
        xpAfter: nextXp,
        source: referralId,
        result: response,
        createdAt: FieldValue.serverTimestamp(),
      });
      tx.update(referralRef, {
        status: 'active',
        activatedAt: response.activatedAt,
        activatedByUid: identity.uid,
      });
      tx.create(operationRef, {
        authUid: identity.uid,
        operationId,
        action: 'checkReferralActivation',
        result: response,
        createdAt: FieldValue.serverTimestamp(),
      });
      return response;
    });

    return sendJson(res, 200, result);
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 500;
    const knownCodes = new Set([
      'AUTH_HEADERS_REQUIRED', 'AUTH_TOKEN_INVALID', 'APP_CHECK_INVALID',
      'APP_CHECK_PROJECT_MISMATCH', 'AUTH_OR_APP_CHECK_REQUIRED',
      'FIREBASE_SERVICE_ACCOUNT_MISSING', 'FIREBASE_SERVICE_ACCOUNT_INVALID',
      'FIREBASE_SERVICE_ACCOUNT_PROJECT_MISMATCH', 'FIREBASE_AUTH_VERIFIER_UNAVAILABLE',
      'RATE_LIMITED', 'SECURITY_CONFIGURATION_MISSING', 'INVALID_REQUEST',
      'REFERRAL_NOT_FOUND', 'REFERRAL_NOT_OWNED', 'REFERRAL_REJECTED',
      'REFERRAL_RECRUITED_PROFILE_MISSING', 'REFERRAL_INVITER_PROFILE_MISSING',
    ]);
    const code = knownCodes.has(error.code) ? error.code : 'REFERRAL_ACTIVATION_UNAVAILABLE';
    if (status >= 500) console.error('check-referral-activation failed:', error.message);
    return sendJson(res, status, { error: code });
  }
};
