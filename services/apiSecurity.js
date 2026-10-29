const crypto = require('node:crypto');
const { GoogleAuth } = require('google-auth-library');
const {
  FieldValue,
  getAdminAppCheck,
  getAdminAuth,
  getAdminFirestore,
  getServiceAccount,
} = require('./firebaseAdmin');

const REGION = 'us-central1';
const PLAY_INTEGRITY_SCOPE = 'https://www.googleapis.com/auth/playintegrity';

class ApiError extends Error {
  constructor(status, code, message = code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function header(req, name) {
  if (typeof req.get === 'function') return String(req.get(name) || '');
  return String(req.headers?.[name.toLowerCase()] || '');
}

function allowedOrigins() {
  const configured = String(process.env.APP_CHECK_ALLOWED_ORIGINS || '')
    .split(',').map((value) => value.trim()).filter(Boolean);
  return new Set(configured.length ? configured : [
    'https://gesbx.vercel.app',
    'https://gesbx-c4312.web.app',
    'https://gesbx-c4312.firebaseapp.com',
    'https://localhost',
    'capacitor://localhost',
    'http://localhost',
    'http://localhost:3000',
  ]);
}

function applyCors(req, res, methods = 'POST, OPTIONS') {
  const origin = header(req, 'origin');
  const origins = allowedOrigins();
  if (origin && !origins.has(origin)) {
    res.status(403).end();
    return true;
  }
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', methods);
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Authorization, Content-Type, X-Firebase-AppCheck, X-Firebase-Installation-Id, X-Play-Integrity, Idempotency-Key',
  );
  res.setHeader('Access-Control-Max-Age', '3600');
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return true;
  }
  return false;
}

function sendJson(res, status, body) {
  res.setHeader('Cache-Control', 'no-store');
  res.status(status).json(body);
}

function sha256(value, encoding = 'hex') {
  return crypto.createHash('sha256').update(value).digest(encoding);
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
}

function stableJson(value) {
  return JSON.stringify(stableValue(value));
}

function actionRequestHash(uid, action, operationId, payload, installationId) {
  return sha256(stableJson({ uid, action, operationId, payload, installationId }), 'base64url');
}

function appCheckRequestHash(uid, challenge, installationId) {
  return sha256(`${uid}|app-check|${challenge}|${installationId}`, 'base64url');
}

function getClientIp(req) {
  const forwarded = header(req, 'x-forwarded-for').split(',')[0].trim();
  return forwarded || req.socket?.remoteAddress || '';
}

function hmacRiskHash(value, source) {
  const normalized = String(value || '').trim().toLowerCase();
  const secret = String(process.env.RISK_HASH_SECRET || '').trim();
  if (!normalized || secret.length < 32) {
    throw new ApiError(503, 'SECURITY_CONFIGURATION_MISSING');
  }
  return crypto.createHmac('sha256', secret).update(`${source}:${normalized}`).digest('hex');
}

function rateLimitRef(key) {
  return getAdminFirestore().doc(`security_rate_limits/${sha256(key).slice(0, 40)}`);
}

async function enforceClientRateLimits(uid, installationId, ip, action, uidLimit = { max: 10, windowMs: 60_000 }) {
  const installHash = hmacRiskHash(installationId, 'installation');
  const refs = [
    { ref: rateLimitRef(`${action}:${installHash}`), max: 120 },
  ];
  const ipHash = ip ? hmacRiskHash(ip, 'ip') : null;
  if (ipHash) refs.push({ ref: rateLimitRef(`${action}:${ipHash}`), max: 600 });
  const uidRef = rateLimitRef(`${uid}:${action}`);
  refs.push({ ref: uidRef, max: uidLimit.max, windowMs: uidLimit.windowMs });
  const now = Date.now();
  const db = getAdminFirestore();
  await db.runTransaction(async (tx) => {
    const snapshots = await Promise.all(refs.map(({ ref }) => tx.get(ref)));
    const updates = refs.map((item, index) => {
      const previous = snapshots[index].exists ? snapshots[index].data() : {};
      const windowMs = item.windowMs || 60_000;
      const sameWindow = Number(previous.windowStartedAt) > now - windowMs;
      const count = sameWindow ? Number(previous.count) || 0 : 0;
      if (count >= item.max) throw new ApiError(429, 'RATE_LIMITED');
      return {
        ref: item.ref,
        data: {
          windowStartedAt: sameWindow ? previous.windowStartedAt : now,
          count: count + 1,
          updatedAt: FieldValue.serverTimestamp(),
        },
      };
    });
    updates.forEach(({ ref, data }) => tx.set(ref, data));
  });
}

function appCheckVerificationError(error) {
  const message = error instanceof Error ? error.message : String(error || 'Unknown App Check error');
  const code = typeof error?.code === 'string' ? error.code : 'unknown';
  const projectMismatch = /same Firebase project|incorrect ["']aud["']|audience claim/i.test(message);
  console.error('[App Check] Token verification failed:', { code, message });
  return new ApiError(403, projectMismatch ? 'APP_CHECK_PROJECT_MISMATCH' : 'APP_CHECK_INVALID');
}

async function verifyPlayIntegrity(integrityToken, packageName, expectedHash) {
  if (typeof integrityToken !== 'string' || integrityToken.length < 20 || integrityToken.length > 20_000) {
    throw new ApiError(403, 'PLAY_INTEGRITY_REQUIRED');
  }
  if (!packageName) throw new ApiError(503, 'PLAY_INTEGRITY_NOT_CONFIGURED');
  const googleAuth = new GoogleAuth({
    credentials: getServiceAccount(),
    scopes: [PLAY_INTEGRITY_SCOPE],
  });
  const client = await googleAuth.getClient();
  const accessToken = await client.getAccessToken();
  if (!accessToken.token) throw new ApiError(503, 'PLAY_INTEGRITY_UNAVAILABLE');
  const response = await fetch(
    `https://playintegrity.googleapis.com/v1/${encodeURIComponent(packageName)}:decodeIntegrityToken`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ integrity_token: integrityToken }),
      signal: AbortSignal.timeout(15_000),
    },
  );
  if (!response.ok) throw new ApiError(403, 'PLAY_INTEGRITY_REJECTED');
  const decoded = await response.json();
  const verdict = decoded.tokenPayloadExternal || decoded;
  const request = verdict.requestDetails || {};
  const app = verdict.appIntegrity || {};
  const device = verdict.deviceIntegrity || {};
  const account = verdict.accountDetails || {};
  const sentAt = Number(request.timestampMillis);
  const now = Date.now();
  const deviceVerdicts = Array.isArray(device.deviceRecognitionVerdict) ? device.deviceRecognitionVerdict : [];
  if (request.requestPackageName !== packageName || request.requestHash !== expectedHash
    || !Number.isFinite(sentAt) || sentAt > now + 30_000 || now - sentAt > 120_000
    || app.appRecognitionVerdict !== 'PLAY_RECOGNIZED'
    || !deviceVerdicts.some((value) => value === 'MEETS_DEVICE_INTEGRITY' || value === 'MEETS_STRONG_INTEGRITY')
    || account.appLicensingVerdict !== 'LICENSED') {
    throw new ApiError(403, 'PLAY_INTEGRITY_REJECTED');
  }
  return verdict;
}

async function verifySecureRequest(req, action, payload, { requireIdempotency = false } = {}) {
  const authorization = header(req, 'authorization').match(/^Bearer\s+(.+)$/i);
  const appCheckToken = header(req, 'x-firebase-appcheck').trim();
  const installationId = header(req, 'x-firebase-installation-id').trim();
  const operationId = header(req, 'idempotency-key').trim();
  if (!authorization || !appCheckToken || !/^[A-Za-z0-9_-]{8,200}$/.test(installationId)
    || (requireIdempotency && !/^[A-Za-z0-9_-]{16,80}$/.test(operationId))) {
    throw new ApiError(401, 'AUTH_HEADERS_REQUIRED');
  }
  let decoded;
  try {
    decoded = await getAdminAuth().verifyIdToken(authorization[1], true);
  } catch (error) {
    const isAuthError = String(error.code || '').startsWith('auth/');
    throw new ApiError(isAuthError ? 401 : 403, isAuthError ? 'AUTH_TOKEN_INVALID' : 'AUTH_VERIFICATION_FAILED');
  }
  let appCheck;
  try {
    appCheck = await getAdminAppCheck().verifyToken(appCheckToken);
  } catch (error) {
    throw appCheckVerificationError(error);
  }
  if (!decoded.uid || !appCheck?.appId) throw new ApiError(403, 'AUTH_OR_APP_CHECK_REQUIRED');
  const integrityToken = header(req, 'x-play-integrity').trim();
  if (String(appCheck.appId).includes(':android:')) {
    const packageName = String(process.env.PLAY_INTEGRITY_PACKAGE_NAME || '').trim();
    const requestHash = actionRequestHash(decoded.uid, action, operationId, payload, installationId);
    await verifyPlayIntegrity(integrityToken, packageName, requestHash);
  }
  await enforceClientRateLimits(decoded.uid, installationId, getClientIp(req), action);
  return {
    uid: decoded.uid,
    email: String(decoded.email || '').trim().toLowerCase(),
    emailVerified: decoded.email_verified === true,
    appId: appCheck.appId,
    installationId,
    operationId,
    ip: getClientIp(req),
  };
}

async function verifyIdentityAndAppCheck(req) {
  const authorization = header(req, 'authorization').match(/^Bearer\s+(.+)$/i);
  const appCheckToken = header(req, 'x-firebase-appcheck').trim();
  if (!authorization || !appCheckToken) throw new ApiError(401, 'AUTH_HEADERS_REQUIRED');
  let decoded;
  try {
    decoded = await getAdminAuth().verifyIdToken(authorization[1], true);
  } catch (error) {
    const isAuthError = String(error.code || '').startsWith('auth/');
    throw new ApiError(isAuthError ? 401 : 403, isAuthError ? 'AUTH_TOKEN_INVALID' : 'AUTH_VERIFICATION_FAILED');
  }
  let appCheck;
  try {
    appCheck = await getAdminAppCheck().verifyToken(appCheckToken);
  } catch (error) {
    throw appCheckVerificationError(error);
  }
  if (!decoded.uid || !appCheck?.appId) throw new ApiError(403, 'AUTH_OR_APP_CHECK_REQUIRED');
  return {
    uid: decoded.uid,
    email: String(decoded.email || '').trim().toLowerCase(),
    emailVerified: decoded.email_verified === true,
    appId: appCheck.appId,
    idempotencyKey: header(req, 'idempotency-key').trim(),
  };
}

module.exports = {
  ApiError,
  FieldValue,
  Timestamp: require('firebase-admin/firestore').Timestamp,
  actionRequestHash,
  appCheckRequestHash,
  applyCors,
  enforceClientRateLimits,
  getAdminAppCheck,
  getAdminAuth,
  getAdminFirestore,
  getClientIp,
  getServiceAccount,
  header,
  sendJson,
  sha256,
  verifyIdentityAndAppCheck,
  verifyPlayIntegrity,
  verifySecureRequest,
};
