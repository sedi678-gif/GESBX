const { onRequest } = require('firebase-functions/v2/https');
const { getAppCheck } = require('firebase-admin/app-check');
const { Timestamp } = require('firebase-admin/firestore');
const { z } = require('zod');
const {
  db,
  HttpsError,
  FieldValue,
  appCheckRequestHash,
  decodePlayIntegrityToken,
  assertIntegrityVerdict,
  enforceClientRateLimits,
  RISK_HASH_SECRET,
} = require('./security');

const requestSchema = z.object({
  challenge: z.string().uuid(),
  integrityToken: z.string().min(20).max(20_000),
  installationId: z.string().regex(/^[A-Za-z0-9_-]{8,200}$/),
}).strict();

function allowedOrigins() {
  return String(process.env.APP_CHECK_ALLOWED_ORIGINS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

async function issueToken(req, res) {
  const authHeader = String(req.headers.authorization || '');
  const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!bearer) return res.status(401).json({ error: 'auth_required' });

  let decoded;
  try {
    decoded = await require('firebase-admin/auth').getAuth().verifyIdToken(bearer);
  } catch {
    return res.status(401).json({ error: 'invalid_auth' });
  }

  const parsed = requestSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_request' });

  const androidAppId = String(process.env.ANDROID_FIREBASE_APP_ID || '').trim();
  if (!androidAppId || !androidAppId.includes(':android:')) {
    return res.status(503).json({ error: 'android_app_check_not_configured' });
  }
  const packageName = String(process.env.PLAY_INTEGRITY_PACKAGE_NAME || '').trim();
  if (!packageName) return res.status(503).json({ error: 'play_integrity_not_configured' });

  const uidHash = require('node:crypto').createHash('sha256').update(decoded.uid).digest('hex').slice(0, 32);
  const rateRef = db.doc(`app_check_token_limits/${uidHash}`);
  const challengeHash = require('node:crypto').createHash('sha256').update(parsed.data.challenge).digest('hex');
  const nonceRef = db.doc(`app_check_nonces/${uidHash}_${challengeHash}`);
  try {
    const verdict = await decodePlayIntegrityToken(parsed.data.integrityToken);
    assertIntegrityVerdict(
      verdict,
      appCheckRequestHash(decoded.uid, parsed.data.challenge, parsed.data.installationId),
    );
    await enforceClientRateLimits(decoded.uid, parsed.data.installationId, req.ip || '', 'mintMobileAppCheckToken');
    await db.runTransaction(async (tx) => {
      const [snap, nonceSnap] = await Promise.all([tx.get(rateRef), tx.get(nonceRef)]);
      if (nonceSnap.exists) throw new HttpsError('already-exists', 'App Check nonce təkrar istifadə edilib.');
      const now = Date.now();
      const previous = snap.exists ? snap.data() : {};
      const sameHour = Number(previous.windowStartedAt) > now - 60 * 60 * 1000;
      const count = sameHour ? Number(previous.count) || 0 : 0;
      if (count >= 20) throw new HttpsError('resource-exhausted', 'App Check token limiti keçilib.');
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

    const created = await getAppCheck().createToken(androidAppId, { ttlMillis: 60 * 60 * 1000 });
    return res.status(200).json({
      token: created.token,
      expireTimeMillis: Date.now() + created.ttlMillis,
    });
  } catch (error) {
    const status = error instanceof HttpsError && error.code === 'resource-exhausted' ? 429 : 403;
    return res.status(status).json({ error: status === 429 ? 'rate_limited' : 'integrity_rejected' });
  }
}

const mintMobileAppCheckToken = onRequest(
  { region: 'us-central1', cors: false, maxInstances: 20, secrets: [RISK_HASH_SECRET] },
  async (req, res) => {
    const origin = String(req.headers.origin || '');
    const origins = allowedOrigins();
    if (req.method === 'OPTIONS') {
      if (origins.includes(origin)) {
        res.set('Access-Control-Allow-Origin', origin);
        res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
        res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
        res.set('Access-Control-Max-Age', '3600');
      }
      return res.status(origins.includes(origin) ? 204 : 403).end();
    }
    if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
    if (origin && (!origins.length || !origins.includes(origin))) return res.status(403).json({ error: 'origin_rejected' });
    if (origin) res.set('Access-Control-Allow-Origin', origin);
    return issueToken(req, res);
  },
);

module.exports = { mintMobileAppCheckToken };
