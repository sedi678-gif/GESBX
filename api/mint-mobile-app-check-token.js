const crypto = require('node:crypto');
const {
  ApiError,
  FieldValue,
  Timestamp,
  appCheckRequestHash,
  applyCors,
  enforceClientRateLimits,
  getAdminAppCheck,
  getAdminAuth,
  getAdminFirestore,
  getClientIp,
  sendJson,
  verifyPlayIntegrity,
} = require('../services/apiSecurity');

function digest(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

module.exports = async function mintMobileAppCheckTokenHandler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return sendJson(res, 405, { error: 'method_not_allowed' });
  }

  try {
    const authorization = String(req.headers.authorization || '');
    const tokenMatch = authorization.match(/^Bearer\s+(.+)$/i);
    if (!tokenMatch) return sendJson(res, 401, { error: 'auth_required' });
    const decoded = await getAdminAuth().verifyIdToken(tokenMatch[1], true);

    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const { challenge, integrityToken, installationId } = body;
    if (typeof challenge !== 'string' || !/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(challenge)
      || typeof integrityToken !== 'string' || integrityToken.length < 20 || integrityToken.length > 20_000
      || typeof installationId !== 'string' || !/^[A-Za-z0-9_-]{8,200}$/.test(installationId)) {
      return sendJson(res, 400, { error: 'invalid_request' });
    }

    const androidAppId = String(process.env.ANDROID_FIREBASE_APP_ID || '').trim();
    const packageName = String(process.env.PLAY_INTEGRITY_PACKAGE_NAME || '').trim();
    if (!androidAppId.includes(':android:') || !packageName) {
      return sendJson(res, 503, { error: 'android_app_check_not_configured' });
    }

    await verifyPlayIntegrity(
      integrityToken,
      packageName,
      appCheckRequestHash(decoded.uid, challenge, installationId),
    );
    await enforceClientRateLimits(decoded.uid, installationId, getClientIp(req), 'mintMobileAppCheckToken', {
      max: 20,
      windowMs: 60 * 60 * 1000,
    });

    const uidHash = digest(decoded.uid).slice(0, 32);
    const challengeHash = digest(challenge);
    const rateRef = getAdminFirestore().doc(`app_check_token_limits/${uidHash}`);
    const nonceRef = getAdminFirestore().doc(`app_check_nonces/${uidHash}_${challengeHash}`);
    const now = Date.now();
    await getAdminFirestore().runTransaction(async (tx) => {
      const [rateSnap, nonceSnap] = await Promise.all([tx.get(rateRef), tx.get(nonceRef)]);
      if (nonceSnap.exists) throw new ApiError(409, 'NONCE_REUSED');
      const previous = rateSnap.exists ? rateSnap.data() : {};
      const sameHour = Number(previous.windowStartedAt) > now - 60 * 60 * 1000;
      const count = sameHour ? Number(previous.count) || 0 : 0;
      if (count >= 20) throw new ApiError(429, 'RATE_LIMITED');
      tx.set(rateRef, {
        windowStartedAt: sameHour ? previous.windowStartedAt : now,
        count: count + 1,
        updatedAt: FieldValue.serverTimestamp(),
      });
      tx.create(nonceRef, {
        authUid: decoded.uid,
        challengeHash,
        expiresAt: Timestamp.fromMillis(now + 24 * 60 * 60 * 1000),
        createdAt: FieldValue.serverTimestamp(),
      });
    });

    const created = await getAdminAppCheck().createToken(androidAppId, { ttlMillis: 60 * 60 * 1000 });
    return sendJson(res, 200, { token: created.token, expireTimeMillis: Date.now() + created.ttlMillis });
  } catch (error) {
    const status = error instanceof ApiError
      ? error.status
      : (String(error.code || '').startsWith('auth/') ? 401 : 403);
    return sendJson(res, status, { error: status === 429 ? 'rate_limited' : 'integrity_rejected' });
  }
};
