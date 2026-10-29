const { ApiError, applyCors, sendJson, verifySecureRequest } = require('../services/apiSecurity');
const { allocateUserId } = require('../services/userIdAllocator');

module.exports = async function allocateUserIdHandler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return sendJson(res, 405, { error: 'METHOD_NOT_ALLOWED' });
  }
  try {
    const identity = await verifySecureRequest(req, 'allocateUserId', {}, { requireIdempotency: true });
    const result = await allocateUserId(identity.uid);
    return sendJson(res, 200, result);
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 500;
    const known = new Set([
      'AUTH_HEADERS_REQUIRED', 'AUTH_TOKEN_INVALID',
      'APP_CHECK_INVALID', 'APP_CHECK_PROJECT_MISMATCH', 'AUTH_OR_APP_CHECK_REQUIRED',
      'FIREBASE_SERVICE_ACCOUNT_MISSING', 'FIREBASE_SERVICE_ACCOUNT_INVALID',
      'FIREBASE_SERVICE_ACCOUNT_PROJECT_MISMATCH', 'FIREBASE_AUTH_VERIFIER_UNAVAILABLE',
      'PLAY_INTEGRITY_REQUIRED', 'PLAY_INTEGRITY_NOT_CONFIGURED', 'PLAY_INTEGRITY_REJECTED',
      'PLAY_INTEGRITY_UNAVAILABLE', 'RATE_LIMITED', 'SECURITY_CONFIGURATION_MISSING',
      'PROFILE_UID_NOT_UNIQUE', 'PROFILE_ID_MISMATCH', 'PROFILE_OWNER_MISMATCH',
      'USER_ID_COUNTER_INVALID', 'USER_ID_ALLOCATION_EXHAUSTED',
    ]);
    const message = known.has(error.code) ? error.code : 'USER_ID_ALLOCATION_FAILED';
    if (status >= 500) console.error('allocate-user-id failed:', error.message);
    return sendJson(res, status, { error: message });
  }
};
