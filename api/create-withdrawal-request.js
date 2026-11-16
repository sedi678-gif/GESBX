const {
  ApiError,
  FieldValue,
  applyCors,
  getAdminFirestore,
  hmacRiskHash,
  sendJson,
  sha256,
  verifySecureRequest,
} = require('../services/apiSecurity');

const USER_ID_PATTERN = /^\d{1,20}$/;

function configuredNumber(name, fallback, min, max) {
  const value = Number(process.env[name]);
  return Number.isSafeInteger(value) && value >= min && value <= max ? value : fallback;
}

function normalizedName(value) {
  return String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

function ageAtBirthDate(value, now = Date.now()) {
  const birth = new Date(String(value || ''));
  if (!Number.isFinite(birth.getTime()) || birth.getTime() > now) return null;
  const today = new Date(now);
  let age = today.getUTCFullYear() - birth.getUTCFullYear();
  if (today.getUTCMonth() < birth.getUTCMonth()
    || (today.getUTCMonth() === birth.getUTCMonth() && today.getUTCDate() < birth.getUTCDate())) age -= 1;
  return age;
}

module.exports = async function createWithdrawalRequestHandler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return sendJson(res, 405, { error: 'METHOD_NOT_ALLOWED' });
  }

  try {
    const payload = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
    const identity = await verifySecureRequest(req, 'createWithdrawalRequest', payload, { requireIdempotency: true, uidLimit: { max: 3, windowMs: 24 * 60 * 60 * 1000 } });
    const userId = String(payload.userId || '').trim();
    const amount = Number(payload.amount);
    const paymentEmail = String(payload.paymentEmail || '').trim().toLowerCase();
    const legalName = String(payload.legalName || '').trim();
    if (!USER_ID_PATTERN.test(userId) || !Number.isSafeInteger(amount) || amount <= 0 || amount > 100000
      || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(paymentEmail) || paymentEmail.length > 254
      || legalName.length < 3 || legalName.length > 100
      || Object.keys(payload).length !== 4) throw new ApiError(400, 'INVALID_REQUEST');
    if (!identity.emailVerified || !identity.email || paymentEmail !== identity.email) {
      throw new ApiError(403, 'VERIFIED_EMAIL_REQUIRED');
    }

    const minimum = configuredNumber('WITHDRAWAL_MIN_AZN', 10, 1, 100000);
    const dailyLimit = configuredNumber('WITHDRAWAL_DAILY_LIMIT_AZN', 500, minimum, 100000);
    const manualReviewThreshold = configuredNumber('WITHDRAWAL_MANUAL_REVIEW_AZN', 100, minimum, 100000);
    if (amount < minimum) throw new ApiError(409, 'MINIMUM_WITHDRAWAL_NOT_MET');

    const db = getAdminFirestore();
    const playerRef = db.doc(`players/${userId}`);
    const userRef = db.doc(`users/${userId}`);
    const operationRef = db.doc(`operation_ledger/${sha256(`${identity.uid}:${identity.operationId}`).slice(0, 48)}`);
    const requestRef = db.doc(`withdrawal_requests/${sha256(`${identity.uid}:${identity.operationId}`).slice(0, 48)}`);
    const now = Date.now();
    const dayKey = new Date(now).toISOString().slice(0, 10);
    const dailyRef = db.doc(`withdrawal_daily_limits/${sha256(`${identity.uid}:${dayKey}`).slice(0, 48)}`);
    const ledgerRef = db.doc(`wallet_ledger/${sha256(`${identity.uid}:withdrawal_hold_${identity.operationId}`).slice(0, 48)}`);
    const [playerSnap, userSnap] = await Promise.all([playerRef.get(), userRef.get()]);
    if (!playerSnap.exists || !userSnap.exists) throw new ApiError(404, 'PROFILE_NOT_FOUND');
    const player = playerSnap.data() || {};
    const user = userSnap.data() || {};
    if (player.firebaseUid !== identity.uid || user.firebaseUid !== identity.uid) throw new ApiError(403, 'PROFILE_OWNER_MISMATCH');
    if (player.frozen === true || user.frozen === true || user.banned === true) throw new ApiError(403, 'PROFILE_UNAVAILABLE');
    if (!(Number(player.walletActivatedAt) > 0)) throw new ApiError(409, 'WALLET_NOT_ACTIVATED');
    const age = ageAtBirthDate(user.birthDate, now);
    if (age === null || (age < 18 && user.parentalConsentVerified !== true)) throw new ApiError(403, 'PARENTAL_CONSENT_REQUIRED');
    const expectedName = normalizedName(`${user.name || ''} ${user.surname || ''}`);
    if (!expectedName || normalizedName(legalName) !== expectedName) throw new ApiError(409, 'LEGAL_NAME_MISMATCH');

    const result = await db.runTransaction(async (tx) => {
      const [opSnap, existingRequest, currentPlayer, currentUser, dailySnap] = await Promise.all([
        tx.get(operationRef), tx.get(requestRef), tx.get(playerRef), tx.get(userRef), tx.get(dailyRef),
      ]);
      if (opSnap.exists) return opSnap.data().result;
      if (existingRequest.exists) return existingRequest.data();
      if (!currentPlayer.exists || !currentUser.exists
        || currentPlayer.data()?.firebaseUid !== identity.uid
        || currentUser.data()?.firebaseUid !== identity.uid) throw new ApiError(403, 'PROFILE_OWNER_MISMATCH');
      const latestPlayer = currentPlayer.data() || {};
      const latestUser = currentUser.data() || {};
      if (!(Number(latestPlayer.walletActivatedAt) > 0)) throw new ApiError(409, 'WALLET_NOT_ACTIVATED');
      if (latestPlayer.frozen === true || latestUser.frozen === true || latestUser.banned === true) throw new ApiError(403, 'PROFILE_UNAVAILABLE');
      const daily = dailySnap.exists ? dailySnap.data() || {} : {};
      const dailyTotal = Math.max(0, Number(daily.amount) || 0);
      if ((Number(daily.requestCount) || 0) >= 1 || dailyTotal + amount > dailyLimit) throw new ApiError(429, 'DAILY_WITHDRAWAL_LIMIT_REACHED');
      const balance = Math.max(0, Number(latestPlayer.manat ?? latestPlayer.coins) || 0);
      if (balance < amount) throw new ApiError(409, 'INSUFFICIENT_BALANCE');
      const nextBalance = balance - amount;
      const manualReview = amount >= manualReviewThreshold;
      const holdMs = 48 * 60 * 60 * 1000;
      const request = {
        authUid: identity.uid, playerId: userId, amount, currency: 'AZN', provider: 'paypal',
        paymentEmail, legalName, status: 'pending_review', manualReview,
        riskFlags: manualReview ? ['large_amount_manual_review'] : [],
        ipHash: hmacRiskHash(identity.ip, 'ip'),
        createdAtMillis: now, createdAt: FieldValue.serverTimestamp(),
        availableAt: now + holdMs, reviewedAt: null, reviewerUid: null, reviewNote: '',
      };
      const response = { requestId: requestRef.id, amount, status: request.status, availableAt: request.availableAt, balance: nextBalance };
      tx.set(playerRef, { manat: nextBalance, coins: nextBalance, updatedAt: now }, { merge: true });
      tx.create(requestRef, request);
      tx.set(dailyRef, {
        authUid: identity.uid, dateKey: dayKey, requestCount: (Number(daily.requestCount) || 0) + 1,
        amount: dailyTotal + amount, updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      tx.create(ledgerRef, {
        authUid: identity.uid, playerId: userId, operationId: `withdrawal_hold_${identity.operationId}`,
        type: 'withdrawal_hold', amount: -amount, balanceAfter: nextBalance, source: requestRef.id,
        createdAt: FieldValue.serverTimestamp(),
      });
      tx.create(operationRef, {
        authUid: identity.uid, playerId: userId, operationId: identity.operationId,
        action: 'createWithdrawalRequest', result: response, createdAt: FieldValue.serverTimestamp(),
      });
      return response;
    });
    return sendJson(res, 200, result);
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 500;
    const known = new Set([
      'AUTH_HEADERS_REQUIRED', 'AUTH_TOKEN_INVALID', 'APP_CHECK_INVALID', 'APP_CHECK_PROJECT_MISMATCH',
      'AUTH_OR_APP_CHECK_REQUIRED', 'FIREBASE_SERVICE_ACCOUNT_MISSING', 'FIREBASE_SERVICE_ACCOUNT_INVALID',
      'FIREBASE_SERVICE_ACCOUNT_PROJECT_MISMATCH', 'FIREBASE_AUTH_VERIFIER_UNAVAILABLE',
      'PLAY_INTEGRITY_REQUIRED', 'PLAY_INTEGRITY_NOT_CONFIGURED', 'PLAY_INTEGRITY_REJECTED',
      'PLAY_INTEGRITY_UNAVAILABLE', 'RATE_LIMITED', 'SECURITY_CONFIGURATION_MISSING',
      'INVALID_REQUEST', 'VERIFIED_EMAIL_REQUIRED', 'PROFILE_NOT_FOUND', 'PROFILE_OWNER_MISMATCH',
      'PROFILE_UNAVAILABLE', 'WALLET_NOT_ACTIVATED', 'PARENTAL_CONSENT_REQUIRED',
      'LEGAL_NAME_MISMATCH', 'MINIMUM_WITHDRAWAL_NOT_MET', 'DAILY_WITHDRAWAL_LIMIT_REACHED',
      'INSUFFICIENT_BALANCE',
    ]);
    const code = known.has(error.code) ? error.code : 'WITHDRAWAL_REQUEST_FAILED';
    if (status >= 500) console.error('create-withdrawal-request failed:', error.message);
    return sendJson(res, status, { error: code });
  }
};
