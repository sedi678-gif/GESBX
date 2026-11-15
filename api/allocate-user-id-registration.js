const {
  ApiError,
  applyCors,
  enforceClientRateLimits,
  getAdminAuth,
  getClientIp,
  header,
  sendJson,
} = require('../services/apiSecurity');
const { allocateUserId } = require('../services/userIdAllocator');

module.exports = async function allocateRegistrationUserId(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return sendJson(res, 405, { error: 'METHOD_NOT_ALLOWED' });
  }

  try {
    const authorization = header(req, 'authorization').match(/^Bearer\s+(.+)$/i);
    const installationId = header(req, 'x-firebase-installation-id').trim();
    if (!authorization || !/^[A-Za-z0-9_-]{8,200}$/.test(installationId)) {
      throw new ApiError(401, 'AUTH_HEADERS_REQUIRED');
    }

    let identity;
    try {
      identity = await getAdminAuth().verifyIdToken(authorization[1], true);
    } catch (error) {
      const code = typeof error?.code === 'string' ? error.code : '';
      if (code.startsWith('auth/')) throw new ApiError(401, 'AUTH_TOKEN_INVALID');
      if (code.startsWith('FIREBASE_SERVICE_ACCOUNT_')) throw new ApiError(503, code);
      console.error('Registration Auth verification failed:', error?.message || error);
      throw new ApiError(503, 'FIREBASE_AUTH_VERIFIER_UNAVAILABLE');
    }

    if (!identity?.uid) throw new ApiError(401, 'AUTH_TOKEN_INVALID');

    await enforceClientRateLimits(
      identity.uid,
      installationId,
      getClientIp(req),
      'allocateUserIdRegistration',
      { max: 5, windowMs: 10 * 60_000 },
    );

    const result = await allocateUserId(identity.uid);
    return sendJson(res, 200, result);
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 500;
    const code = typeof error?.message === 'string'
      && /^[A-Z0-9_]+$/.test(error.message)
      ? error.message
      : 'USER_ID_ALLOCATION_FAILED';
    if (status >= 500) console.error('Registration user ID allocation failed:', error?.message || error);
    return sendJson(res, status, { error: code });
  }
};
