const crypto = require('node:crypto');
const {
  ApiError,
  FieldValue,
  applyCors,
  getAdminFirestore,
  hmacRiskHash,
  sendJson,
  verifySecureRequest,
} = require('../apiSecurity');

const USER_ID_PATTERN = /^\d{1,20}$/;
const CODE_PATTERN = /^[A-Z0-9]{6,20}$/;
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

function verifiedAtMillis(value) {
  if (value && typeof value.toMillis === 'function') return value.toMillis();
  return Number(value);
}

module.exports = async function applyReferralHandler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return sendJson(res, 405, { error: 'METHOD_NOT_ALLOWED' });
  }

  try {
    const payload = req.body && typeof req.body === 'object' && !Array.isArray(req.body)
      ? req.body
      : {};
    const identity = await verifySecureRequest(req, 'applyReferral', payload, {
      requireIdempotency: true,
      uidLimit: { max: 3, windowMs: 24 * 60 * 60 * 1000 },
    });
    if (!identity.emailVerified) throw new ApiError(403, 'EMAIL_VERIFICATION_REQUIRED');

    const userId = String(payload.userId || '').trim();
    const code = String(payload.code || '').trim().toUpperCase();
    if (!USER_ID_PATTERN.test(userId) || !CODE_PATTERN.test(code)
      || Object.keys(payload).some((key) => !['userId', 'code'].includes(key))
      || Object.keys(payload).length !== 2) {
      throw new ApiError(400, 'INVALID_REQUEST');
    }

    const db = getAdminFirestore();
    const operationId = req.get('Idempotency-Key') || req.headers['idempotency-key'];
    const operationRef = db.doc('operation_ledger/' + sha256(identity.uid + ':' + operationId).slice(0, 48));
    const codeRef = db.doc('referral_codes/' + code);
    const referralRef = db.doc('referrals/' + sha256(identity.uid + ':one-referral').slice(0, 48));
    const dayKey = new Date().toISOString().slice(0, 10);
    const ipHash = identity.ip ? hmacRiskHash(identity.ip, 'ip') : null;
    const installationHash = hmacRiskHash(identity.installationId, 'installation');

    const result = await db.runTransaction(async (tx) => {
      const operationSnap = await tx.get(operationRef);
      if (operationSnap.exists) return operationSnap.data().result;

      const [playerSnap, userSnap, codeSnap, priorReferralSnap] = await Promise.all([
        tx.get(db.doc('players/' + userId)),
        tx.get(db.doc('users/' + userId)),
        tx.get(codeRef),
        tx.get(referralRef),
      ]);
      if (!playerSnap.exists || !userSnap.exists) throw new ApiError(404, 'PROFILE_NOT_FOUND');
      const player = playerSnap.data() || {};
      const user = userSnap.data() || {};
      if (player.firebaseUid !== identity.uid || user.firebaseUid !== identity.uid) {
        throw new ApiError(403, 'PROFILE_OWNER_MISMATCH');
      }
      const identityVerifiedAt = verifiedAtMillis(player.identityVerifiedAt);
      if (!Number.isFinite(identityVerifiedAt) || identityVerifiedAt <= 0) {
        throw new ApiError(409, 'PROFILE_NOT_VERIFIED');
      }
      if (player.frozen === true || user.frozen === true || user.banned === true) {
        throw new ApiError(403, 'PROFILE_UNAVAILABLE');
      }
      if (!codeSnap.exists) throw new ApiError(404, 'REFERRAL_CODE_NOT_FOUND');
      if (priorReferralSnap.exists) throw new ApiError(409, 'REFERRAL_ALREADY_APPLIED');

      const inviter = codeSnap.data() || {};
      if (inviter.authUid === identity.uid || String(inviter.playerId) === userId) {
        throw new ApiError(409, 'REFERRAL_SELF_USE');
      }
      const inviterPlayerRef = db.doc('players/' + inviter.playerId);
      const inviterUserRef = db.doc('users/' + inviter.playerId);
      const dayLimitRef = db.doc('referral_daily_limits/' + sha256(code + ':' + dayKey).slice(0, 48));
      const [inviterPlayerSnap, inviterUserSnap, dayLimitSnap] = await Promise.all([
        tx.get(inviterPlayerRef),
        tx.get(inviterUserRef),
        tx.get(dayLimitRef),
      ]);
      if (!inviterPlayerSnap.exists || !inviterUserSnap.exists
        || inviterPlayerSnap.data()?.firebaseUid !== inviter.authUid
        || inviterUserSnap.data()?.firebaseUid !== inviter.authUid) {
        throw new ApiError(409, 'REFERRAL_INVITER_INVALID');
      }
      const dailyCount = dayLimitSnap.exists ? Number(dayLimitSnap.data()?.count) || 0 : 0;
      if (dailyCount >= 5) throw new ApiError(429, 'REFERRAL_DAILY_LIMIT');

      const riskFlags = [];
      if (ipHash && inviter.ipHash && ipHash === inviter.ipHash) riskFlags.push('shared_ip');
      if (installationHash && inviter.installationHash && installationHash === inviter.installationHash) {
        riskFlags.push('shared_installation');
      }
      const createdAtMillis = Date.now();
      const response = { referralId: referralRef.id, status: 'pending', xpThreshold: 6500 };
      tx.create(referralRef, {
        inviterUid: inviter.authUid,
        inviterPlayerId: String(inviter.playerId),
        referredUid: identity.uid,
        referredPlayerId: userId,
        code,
        dateKey: dayKey,
        status: 'pending',
        xpThreshold: 6500,
        rewardXp: 6500,
        riskFlags,
        ipHash,
        installationHash,
        createdAtMillis,
        createdAt: FieldValue.serverTimestamp(),
        activatedAt: null,
      });
      tx.set(dayLimitRef, {
        count: dailyCount + 1,
        dateKey: dayKey,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      tx.create(operationRef, {
        authUid: identity.uid,
        operationId,
        action: 'applyReferral',
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
      'EMAIL_VERIFICATION_REQUIRED', 'PROFILE_NOT_FOUND', 'PROFILE_OWNER_MISMATCH',
      'PROFILE_NOT_VERIFIED', 'PROFILE_UNAVAILABLE', 'REFERRAL_CODE_NOT_FOUND',
      'REFERRAL_ALREADY_APPLIED', 'REFERRAL_SELF_USE', 'REFERRAL_INVITER_INVALID',
      'REFERRAL_DAILY_LIMIT',
    ]);
    const code = knownCodes.has(error.code) ? error.code : 'REFERRAL_APPLY_UNAVAILABLE';
    if (status >= 500) console.error('apply-referral failed:', error.message);
    return sendJson(res, status, { error: code });
  }
};
