const crypto = require('node:crypto');
const {
  FieldValue,
  getAdminAppCheck: getAppCheck,
  getAdminAuth: getAuth,
  getAdminFirestore,
} = require('./firebaseAdmin');
const { applyCors, header } = require('./apiSecurity');
const { z } = require('zod');

const db = getAdminFirestore();
const PAYPAL_API = 'https://api-m.paypal.com';
const WALLET_SCALE = 10_000;
const PAYOUT_MIN_CENTS = 100;
const PAYOUT_MAX_CENTS = 50_000;
const PAYOUTS_PER_UTC_DAY = 1;

const PAYPAL_CLIENT_ID = { value: () => process.env.PAYPAL_CLIENT_ID || '' };
const PAYPAL_CLIENT_SECRET = { value: () => process.env.PAYPAL_CLIENT_SECRET || '' };
const PAYPAL_MODE = { value: () => process.env.PAYPAL_MODE || '' };
const PAYPAL_WEBHOOK_ID = { value: () => process.env.PAYPAL_WEBHOOK_ID || '' };

const payoutInputSchema = z.object({
  amountUSD: z.number().finite().positive(),
  recipientEmail: z.email().max(254),
}).strict();

function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function toWalletUnits(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) return null;
  return Math.round(amount * WALLET_SCALE);
}

function fromWalletUnits(units) {
  return Number((units / WALLET_SCALE).toFixed(4));
}

function amountCents(value) {
  const cents = Math.round(Number(value) * 100);
  if (!Number.isSafeInteger(cents) || Math.abs(Number(value) * 100 - cents) > 1e-7) return null;
  return cents;
}

function formatUsd(cents) {
  return (cents / 100).toFixed(2);
}

function assertLivePayPalConfiguration() {
  if (String(PAYPAL_MODE.value() || '').trim().toLowerCase() !== 'live') {
    throw new Error('PAYPAL_MODE_NOT_LIVE');
  }
  if (!PAYPAL_CLIENT_ID.value() || !PAYPAL_CLIENT_SECRET.value()) {
    throw new Error('PAYPAL_CREDENTIALS_MISSING');
  }
}

async function getPayPalAccessToken() {
  assertLivePayPalConfiguration();
  const basic = Buffer.from(`${PAYPAL_CLIENT_ID.value()}:${PAYPAL_CLIENT_SECRET.value()}`).toString('base64');
  const response = await fetch(`${PAYPAL_API}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: 'grant_type=client_credentials',
    signal: AbortSignal.timeout(15_000),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || typeof result.access_token !== 'string') {
    const error = new Error('PAYPAL_TOKEN_REQUEST_FAILED');
    error.httpStatus = response.status;
    error.paypalCode = String(result.error || 'token_error').slice(0, 80);
    throw error;
  }
  return result.access_token;
}

function verifyRequestHeaders(req) {
  const authorization = header(req, 'authorization');
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  const appCheckToken = header(req, 'x-firebase-appcheck').trim();
  const idempotencyKey = header(req, 'idempotency-key').trim();
  if (!match || !appCheckToken || !/^[A-Za-z0-9_-]{16,80}$/.test(idempotencyKey)) {
    const error = new Error('AUTH_HEADERS_REQUIRED');
    error.httpStatus = 401;
    throw error;
  }
  return { idToken: match[1], appCheckToken, idempotencyKey };
}

async function verifyRequestIdentity(req) {
  const headers = verifyRequestHeaders(req);
  let decoded;
  let appCheck;
  try {
    [decoded, appCheck] = await Promise.all([
      getAuth().verifyIdToken(headers.idToken, true),
      getAppCheck().verifyToken(headers.appCheckToken),
    ]);
  } catch (error) {
    error.httpStatus = String(error.code || '').startsWith('auth/') ? 401 : 403;
    throw error;
  }
  if (!decoded.uid || decoded.email_verified !== true || !decoded.email) {
    const error = new Error('VERIFIED_EMAIL_REQUIRED');
    error.httpStatus = 403;
    throw error;
  }
  if (!appCheck?.appId) {
    const error = new Error('APP_CHECK_REQUIRED');
    error.httpStatus = 403;
    throw error;
  }
  return { ...headers, uid: decoded.uid, email: String(decoded.email).trim().toLowerCase() };
}

async function findOwnedCreator(uid) {
  const players = await db.collection('players').where('firebaseUid', '==', uid).limit(2).get();
  if (players.size !== 1) {
    const error = new Error('PLAYER_PROFILE_NOT_UNIQUE');
    error.httpStatus = 403;
    throw error;
  }
  const playerDoc = players.docs[0];
  const userSnap = await db.doc(`users/${playerDoc.id}`).get();
  const player = playerDoc.data();
  const user = userSnap.exists ? userSnap.data() : {};
  if (player.firebaseUid !== uid || user.firebaseUid !== uid || !userSnap.exists) {
    const error = new Error('PLAYER_PROFILE_NOT_OWNED');
    error.httpStatus = 403;
    throw error;
  }
  if (user.banned === true || user.frozen === true || player.frozen === true) {
    const error = new Error('ACCOUNT_NOT_ELIGIBLE');
    error.httpStatus = 403;
    throw error;
  }
  const identityVerifiedAt = player.identityVerifiedAt?.toMillis
    ? player.identityVerifiedAt.toMillis()
    : Number(player.identityVerifiedAt);
  if (!Number.isFinite(identityVerifiedAt) || identityVerifiedAt <= 0) {
    const error = new Error('IDENTITY_VERIFICATION_REQUIRED');
    error.httpStatus = 403;
    throw error;
  }
  const birthDate = new Date(String(user.birthDate || ''));
  if (!Number.isFinite(birthDate.getTime()) || birthDate.getTime() > Date.now()) {
    const error = new Error('VALID_BIRTH_DATE_REQUIRED');
    error.httpStatus = 403;
    throw error;
  }
  const now = new Date();
  let age = now.getUTCFullYear() - birthDate.getUTCFullYear();
  if (now.getUTCMonth() < birthDate.getUTCMonth()
    || (now.getUTCMonth() === birthDate.getUTCMonth() && now.getUTCDate() < birthDate.getUTCDate())) age -= 1;
  if (age < 18 && user.parentalConsentVerified !== true) {
    const error = new Error('PARENTAL_CONSENT_REQUIRED');
    error.httpStatus = 403;
    throw error;
  }
  return { playerId: playerDoc.id };
}

function payoutRequestHash(amountCentsValue, recipientEmail) {
  return sha256(JSON.stringify({ amountCents: amountCentsValue, recipientEmail: recipientEmail.toLowerCase() }));
}

async function reservePayout({ userId, playerId, amountCentsValue, recipientEmail, idempotencyKey }) {
  const requestId = sha256(`${userId}:${idempotencyKey}`).slice(0, 32);
  const requestRef = db.doc(`paypal_withdrawals/${requestId}`);
  const walletRef = db.doc(`user_wallets/${playerId}`);
  const playerRef = db.doc(`players/${playerId}`);
  const userRef = db.doc(`users/${playerId}`);
  const dayKey = new Date().toISOString().slice(0, 10);
  const dailyRef = db.doc(`paypal_payout_daily_limits/${sha256(userId).slice(0, 32)}_${dayKey}`);
  const holdLedgerRef = db.doc(`wallet_ledger/${sha256(`${userId}:paypal_payout_hold_${requestId}`).slice(0, 48)}`);
  const requestHash = payoutRequestHash(amountCentsValue, recipientEmail);
  const amountUnits = amountCentsValue * (WALLET_SCALE / 100);
  const senderBatchId = `gesbx_${requestId}`;

  return db.runTransaction(async (tx) => {
    const [requestSnap, walletSnap, playerSnap, userSnap, dailySnap] = await Promise.all([
      tx.get(requestRef), tx.get(walletRef), tx.get(playerRef), tx.get(userRef), tx.get(dailyRef),
    ]);
    if (requestSnap.exists) {
      const existing = requestSnap.data();
      if (existing.requestHash !== requestHash) {
        const error = new Error('IDEMPOTENCY_KEY_REUSED');
        error.httpStatus = 409;
        throw error;
      }
      return { requestRef, request: existing, created: false };
    }
    if (!playerSnap.exists || !userSnap.exists
      || playerSnap.data().firebaseUid !== userId || userSnap.data().firebaseUid !== userId
      || userSnap.data().banned === true || userSnap.data().frozen === true || playerSnap.data().frozen === true) {
      const error = new Error('ACCOUNT_NOT_ELIGIBLE');
      error.httpStatus = 403;
      throw error;
    }
    const verifiedAt = playerSnap.data().identityVerifiedAt?.toMillis
      ? playerSnap.data().identityVerifiedAt.toMillis()
      : Number(playerSnap.data().identityVerifiedAt);
    const birthDate = new Date(String(userSnap.data().birthDate || ''));
    if (!Number.isFinite(verifiedAt) || verifiedAt <= 0 || !Number.isFinite(birthDate.getTime()) || birthDate.getTime() > Date.now()) {
      const error = new Error('IDENTITY_VERIFICATION_REQUIRED');
      error.httpStatus = 403;
      throw error;
    }
    const nowDate = new Date();
    let age = nowDate.getUTCFullYear() - birthDate.getUTCFullYear();
    if (nowDate.getUTCMonth() < birthDate.getUTCMonth()
      || (nowDate.getUTCMonth() === birthDate.getUTCMonth() && nowDate.getUTCDate() < birthDate.getUTCDate())) age -= 1;
    if (age < 18 && userSnap.data().parentalConsentVerified !== true) {
      const error = new Error('PARENTAL_CONSENT_REQUIRED');
      error.httpStatus = 403;
      throw error;
    }
    if (!walletSnap.exists) {
      const error = new Error('USD_WALLET_NOT_FOUND');
      error.httpStatus = 409;
      throw error;
    }
    const wallet = walletSnap.data();
    if (wallet.authUid !== userId || wallet.currency !== 'USD') {
      const error = new Error('USD_WALLET_REQUIRED');
      error.httpStatus = 409;
      throw error;
    }
    const balanceUnits = toWalletUnits(wallet.balance);
    if (balanceUnits === null || balanceUnits < amountUnits) {
      const error = new Error('INSUFFICIENT_BALANCE');
      error.httpStatus = 409;
      throw error;
    }
    const dailyCount = dailySnap.exists ? Number(dailySnap.data().requestCount) || 0 : 0;
    const dailyAmountCents = dailySnap.exists ? Number(dailySnap.data().amountCents) || 0 : 0;
    if (dailyCount >= PAYOUTS_PER_UTC_DAY || dailyAmountCents + amountCentsValue > PAYOUT_MAX_CENTS) {
      const error = new Error('DAILY_PAYOUT_LIMIT_REACHED');
      error.httpStatus = 429;
      throw error;
    }

    const now = Date.now();
    const balanceAfter = balanceUnits - amountUnits;
    const request = {
      authUid: userId,
      playerId,
      amountUSD: amountCentsValue / 100,
      amountCents: amountCentsValue,
      amountWalletUnits: amountUnits,
      currency: 'USD',
      recipientEmail,
      senderBatchId,
      requestHash,
      status: 'PENDING',
      balanceAfter: fromWalletUnits(balanceAfter),
      refundApplied: false,
      createdAtMillis: now,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };
    tx.update(walletRef, { balance: fromWalletUnits(balanceAfter), updatedAt: FieldValue.serverTimestamp() });
    tx.create(requestRef, request);
    tx.create(holdLedgerRef, {
      authUid: userId,
      playerId,
      operationId: `paypal_payout_hold_${requestId}`,
      type: 'paypal_payout_hold',
      currency: 'USD',
      amount: -(amountCentsValue / 100),
      balanceAfter: fromWalletUnits(balanceAfter),
      source: requestId,
      createdAt: FieldValue.serverTimestamp(),
    });
    tx.set(dailyRef, {
      authUid: userId,
      dateKey: dayKey,
      requestCount: dailyCount + 1,
      amountCents: dailyAmountCents + amountCentsValue,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    return { requestRef, request, created: true };
  });
}

async function updatePayout(requestRef, update, allowedStatuses = ['PENDING']) {
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(requestRef);
    if (!snap.exists) throw new Error('PAYOUT_REQUEST_NOT_FOUND');
    const current = snap.data();
    if (!allowedStatuses.includes(current.status)) {
      // A fast webhook can arrive before the API response is persisted. Save
      // batch metadata without downgrading a more advanced webhook status.
      if (update.payoutBatchId && !current.payoutBatchId && current.status !== 'FAILED') {
        const metadata = {
          payoutBatchId: update.payoutBatchId,
          paypalBatchStatus: update.paypalBatchStatus,
          submittedAt: update.submittedAt,
          updatedAt: FieldValue.serverTimestamp(),
        };
        tx.update(requestRef, metadata);
        return { ...current, ...metadata };
      }
      return current;
    }
    tx.update(requestRef, { ...update, updatedAt: FieldValue.serverTimestamp() });
    return { ...current, ...update };
  });
}

async function refundPayout(requestRef, failureCode) {
  return db.runTransaction(async (tx) => {
    const requestSnap = await tx.get(requestRef);
    if (!requestSnap.exists) throw new Error('PAYOUT_REQUEST_NOT_FOUND');
    const payout = requestSnap.data();
    if (['FAILED', 'COMPLETED'].includes(payout.status)) return payout;
    const walletRef = db.doc(`user_wallets/${payout.playerId}`);
    const refundLedgerRef = db.doc(`wallet_ledger/${sha256(`${payout.authUid}:paypal_payout_refund_${requestRef.id}`).slice(0, 48)}`);
    const [walletSnap, ledgerSnap] = await Promise.all([tx.get(walletRef), tx.get(refundLedgerRef)]);
    if (!walletSnap.exists) throw new Error('USD_WALLET_NOT_FOUND_FOR_REFUND');
    const wallet = walletSnap.data();
    if (wallet.authUid !== payout.authUid || wallet.currency !== 'USD') throw new Error('USD_WALLET_OWNER_MISMATCH');
    const balanceUnits = toWalletUnits(wallet.balance);
    if (balanceUnits === null) throw new Error('USD_WALLET_BALANCE_INVALID');
    const nextUnits = balanceUnits + Number(payout.amountWalletUnits);
    if (!ledgerSnap.exists) {
      tx.create(refundLedgerRef, {
        authUid: payout.authUid,
        playerId: payout.playerId,
        operationId: `paypal_payout_refund_${requestRef.id}`,
        type: 'paypal_payout_refund',
        currency: 'USD',
        amount: Number(payout.amountUSD),
        balanceAfter: fromWalletUnits(nextUnits),
        source: requestRef.id,
        createdAt: FieldValue.serverTimestamp(),
      });
      tx.update(walletRef, { balance: fromWalletUnits(nextUnits), updatedAt: FieldValue.serverTimestamp() });
    }
    tx.update(requestRef, {
      status: 'FAILED',
      refundApplied: true,
      failureCode: String(failureCode || 'PAYOUT_FAILED').slice(0, 80),
      failedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return { ...payout, status: 'FAILED', refundApplied: true };
  });
}

function isDefinitivePayPalRejection(status, payload) {
  const providerCode = String(payload?.name || payload?.error || '').toUpperCase();
  if (/DUPLICATE|ALREADY_EXISTS|IN_PROGRESS/.test(providerCode)) return false;
  return [400, 401, 403, 422].includes(status);
}

async function processPayout({ userId, amountUSD, recipientEmail, idempotencyKey }) {
  const cents = amountCents(amountUSD);
  const email = String(recipientEmail || '').trim().toLowerCase();
  if (!userId || cents === null || cents < PAYOUT_MIN_CENTS || cents > PAYOUT_MAX_CENTS
    || !z.email().safeParse(email).success || email.length > 254) {
    const error = new Error('INVALID_PAYOUT_REQUEST');
    error.httpStatus = 400;
    throw error;
  }
  if (typeof idempotencyKey !== 'string' || !/^[A-Za-z0-9_-]{16,80}$/.test(idempotencyKey)) {
    const error = new Error('IDEMPOTENCY_KEY_REQUIRED');
    error.httpStatus = 400;
    throw error;
  }
  const { playerId } = await findOwnedCreator(userId);
  const reservation = await reservePayout({
    userId,
    playerId,
    amountCentsValue: cents,
    recipientEmail: email,
    idempotencyKey,
  });
  const { requestRef, request } = reservation;
  if (['SUBMITTED', 'PROCESSING', 'COMPLETED', 'FAILED'].includes(request.status)) {
    return { requestId: requestRef.id, status: request.status, amountUSD: request.amountUSD };
  }

  let token;
  try {
    token = await getPayPalAccessToken();
  } catch (error) {
    const failure = await refundPayout(requestRef, error.message || 'PAYPAL_TOKEN_ERROR');
    return { requestId: requestRef.id, status: failure.status, amountUSD: request.amountUSD };
  }

  let response;
  let result = {};
  try {
    response = await fetch(`${PAYPAL_API}/v1/payments/payouts`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'PayPal-Request-Id': request.senderBatchId,
      },
      body: JSON.stringify({
        sender_batch_header: {
          sender_batch_id: request.senderBatchId,
          email_subject: 'GESBX payout',
          email_message: 'A payout from GESBX has been sent to your PayPal account.',
        },
        items: [{
          recipient_type: 'EMAIL',
          amount: { value: formatUsd(cents), currency: 'USD' },
          receiver: email,
          sender_item_id: requestRef.id,
          note: 'GESBX account withdrawal',
        }],
      }),
      signal: AbortSignal.timeout(20_000),
    });
    result = await response.json().catch(() => ({}));
  } catch (error) {
    // A timeout or connection loss can happen after PayPal accepted the batch.
    // Keep the reservation pending and retry with the same idempotency IDs.
    await updatePayout(requestRef, {
      status: 'PENDING',
      retryRequired: true,
      lastProviderError: 'PAYPAL_CONNECTION_UNCERTAIN',
    });
    return { requestId: requestRef.id, status: 'PENDING', amountUSD: request.amountUSD, retryRequired: true };
  }

  if (!response.ok) {
    const providerCode = String(result.name || result.error || `HTTP_${response.status}`).slice(0, 80);
    if (isDefinitivePayPalRejection(response.status, result)) {
      const failure = await refundPayout(requestRef, providerCode);
      return { requestId: requestRef.id, status: failure.status, amountUSD: request.amountUSD };
    }
    await updatePayout(requestRef, {
      status: 'PENDING',
      retryRequired: true,
      lastProviderError: providerCode,
    });
    return { requestId: requestRef.id, status: 'PENDING', amountUSD: request.amountUSD, retryRequired: true };
  }

  const batchHeader = result.batch_header || result.payout_batch_header || {};
  const payoutBatchId = String(batchHeader.payout_batch_id || result.payout_batch_id || '').trim();
  const updated = await updatePayout(requestRef, {
    status: 'SUBMITTED',
    payoutBatchId: payoutBatchId || null,
    paypalBatchStatus: String(batchHeader.batch_status || 'PENDING').slice(0, 40),
    submittedAt: FieldValue.serverTimestamp(),
    retryRequired: false,
    lastProviderError: null,
  });
  return { requestId: requestRef.id, status: updated.status, amountUSD: request.amountUSD };
}

async function findPayoutForWebhook(event) {
  const resource = event.resource || {};
  const senderBatchId = String(
    resource.sender_batch_id
      || resource.batch_header?.sender_batch_id
      || resource.sender_batch_header?.sender_batch_id
      || resource.payout_batch?.sender_batch_id
      || '',
  ).trim();
  const payoutBatchId = String(
    resource.payout_batch_id
      || resource.batch_header?.payout_batch_id
      || resource.payout_batch?.payout_batch_id
      || '',
  ).trim();
  if (senderBatchId) {
    const bySender = await db.collection('paypal_withdrawals').where('senderBatchId', '==', senderBatchId).limit(1).get();
    if (!bySender.empty) return bySender.docs[0].ref;
  }
  if (payoutBatchId) {
    const byBatch = await db.collection('paypal_withdrawals').where('payoutBatchId', '==', payoutBatchId).limit(1).get();
    if (!byBatch.empty) return byBatch.docs[0].ref;
  }
  return null;
}

function normalizedEventType(type) {
  return String(type || '').replace(/^PAYMENT\./, '').toUpperCase();
}

async function verifyPayPalWebhook(req, event) {
  assertLivePayPalConfiguration();
  const token = await getPayPalAccessToken();
  const transmission = {
    auth_algo: header(req, 'paypal-auth-algo'),
    cert_url: header(req, 'paypal-cert-url'),
    transmission_id: header(req, 'paypal-transmission-id'),
    transmission_sig: header(req, 'paypal-transmission-sig'),
    transmission_time: header(req, 'paypal-transmission-time'),
    webhook_id: PAYPAL_WEBHOOK_ID.value(),
    webhook_event: event,
  };
  if (Object.values(transmission).some((value) => !value)) return false;
  const response = await fetch(`${PAYPAL_API}/v1/notifications/verify-webhook-signature`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(transmission),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error('PAYPAL_WEBHOOK_VERIFICATION_UNAVAILABLE');
  const result = await response.json().catch(() => ({}));
  return result.verification_status === 'SUCCESS';
}

async function readPayPalPayoutItem(token, payoutBatchId, withdrawalId) {
  if (!payoutBatchId) return null;
  const response = await fetch(`${PAYPAL_API}/v1/payments/payouts/${encodeURIComponent(payoutBatchId)}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error('PAYPAL_PAYOUT_STATUS_UNAVAILABLE');
  const batch = await response.json();
  const items = Array.isArray(batch.items) ? batch.items : (Array.isArray(batch.payout_items) ? batch.payout_items : []);
  const item = items.find((entry) => {
    const payoutItem = entry.payout_item || entry;
    return String(payoutItem.sender_item_id || '') === withdrawalId;
  }) || items[0];
  if (!item) return null;
  const payoutItem = item.payout_item || item;
  return String(item.transaction_status || payoutItem.transaction_status || payoutItem.transactionStatus || '').toUpperCase();
}

function eventDisposition(eventType, resource) {
  const type = normalizedEventType(eventType);
  if (type === 'PAYOUTSBATCH.DENIED' || type === 'PAYOUTSBATCH.REVERSED') return 'FAILED';
  if (type === 'PAYOUTS-ITEM.FAILED' || type === 'PAYOUTS-ITEM.RETURNED'
    || type === 'PAYOUTS-ITEM.REFUNDED' || type === 'PAYOUTS-ITEM.DENIED'
    || type === 'PAYOUTS-ITEM.BLOCKED' || type === 'PAYOUTS-ITEM.CANCELED') return 'FAILED';
  if (type === 'PAYOUTS-ITEM.SUCCEEDED' || type === 'PAYOUTS-ITEM.SUCCESS') return 'COMPLETED';
  if (type === 'PAYOUTSBATCH.SUCCESS') return 'CHECK_BATCH';
  if (type.startsWith('PAYOUTS-ITEM.')) {
    const status = String(resource.transaction_status || resource.payout_item?.transaction_status || '').toUpperCase();
    if (status === 'SUCCESS') return 'COMPLETED';
    if (['FAILED', 'RETURNED', 'REFUNDED', 'DENIED', 'BLOCKED', 'CANCELED'].includes(status)) return 'FAILED';
    return 'PROCESSING';
  }
  return null;
}

async function applyWebhookOutcome(event, requestRef, outcome, failureCode) {
  const eventId = String(event.id || '');
  if (!eventId) throw new Error('PAYPAL_WEBHOOK_EVENT_ID_MISSING');
  const eventRef = db.doc(`paypal_webhook_events/${sha256(eventId).slice(0, 48)}`);
  return db.runTransaction(async (tx) => {
    const [eventSnap, payoutSnap] = await Promise.all([tx.get(eventRef), tx.get(requestRef)]);
    if (eventSnap.exists) return { duplicate: true };
    if (!payoutSnap.exists) throw new Error('PAYOUT_REQUEST_NOT_FOUND');
    const payout = payoutSnap.data();
    if (outcome === 'FAILED' && !['FAILED', 'COMPLETED'].includes(payout.status)) {
      const walletRef = db.doc(`user_wallets/${payout.playerId}`);
      const refundRef = db.doc(`wallet_ledger/${sha256(`${payout.authUid}:paypal_payout_refund_${requestRef.id}`).slice(0, 48)}`);
      const [walletSnap, refundSnap] = await Promise.all([tx.get(walletRef), tx.get(refundRef)]);
      if (!walletSnap.exists) throw new Error('USD_WALLET_NOT_FOUND_FOR_REFUND');
      const wallet = walletSnap.data();
      if (wallet.authUid !== payout.authUid || wallet.currency !== 'USD') throw new Error('USD_WALLET_OWNER_MISMATCH');
      const balanceUnits = toWalletUnits(wallet.balance);
      if (balanceUnits === null) throw new Error('USD_WALLET_BALANCE_INVALID');
      const nextUnits = balanceUnits + Number(payout.amountWalletUnits);
      if (!refundSnap.exists) {
        tx.create(refundRef, {
          authUid: payout.authUid,
          playerId: payout.playerId,
          operationId: `paypal_payout_refund_${requestRef.id}`,
          type: 'paypal_payout_refund',
          currency: 'USD',
          amount: Number(payout.amountUSD),
          balanceAfter: fromWalletUnits(nextUnits),
          source: requestRef.id,
          createdAt: FieldValue.serverTimestamp(),
        });
        tx.update(walletRef, { balance: fromWalletUnits(nextUnits), updatedAt: FieldValue.serverTimestamp() });
      }
      tx.update(requestRef, {
        status: 'FAILED',
        refundApplied: true,
        failureCode: String(failureCode || 'PAYPAL_WEBHOOK_FAILED').slice(0, 80),
        failedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    } else if (outcome === 'COMPLETED' && !['FAILED', 'COMPLETED'].includes(payout.status)) {
      tx.update(requestRef, {
        status: 'COMPLETED',
        completedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    } else if (outcome === 'PROCESSING' && !['FAILED', 'COMPLETED'].includes(payout.status)) {
      tx.update(requestRef, { status: 'PROCESSING', updatedAt: FieldValue.serverTimestamp() });
    }
    tx.create(eventRef, {
      eventId,
      eventType: String(event.event_type || '').slice(0, 120),
      withdrawalId: requestRef.id,
      outcome,
      processedAt: FieldValue.serverTimestamp(),
    });
    return { duplicate: false };
  });
}

function sendJson(res, status, payload) {
  res.setHeader('Cache-Control', 'no-store');
  res.status(status).json(payload);
}

async function paypalPayoutRequest(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return sendJson(res, 405, { error: 'METHOD_NOT_ALLOWED' });
  }
  try {
    const identity = await verifyRequestIdentity(req);
    const parsed = payoutInputSchema.safeParse(req.body);
    if (!parsed.success) return sendJson(res, 400, { error: 'INVALID_PAYOUT_REQUEST' });
    const recipientEmail = parsed.data.recipientEmail.trim().toLowerCase();
    if (recipientEmail !== identity.email) return sendJson(res, 403, { error: 'RECIPIENT_MUST_MATCH_VERIFIED_EMAIL' });
    const cents = amountCents(parsed.data.amountUSD);
    if (cents === null || cents < PAYOUT_MIN_CENTS || cents > PAYOUT_MAX_CENTS) {
      return sendJson(res, 400, { error: 'AMOUNT_MUST_BE_USD_1_TO_500_WITH_CENTS' });
    }
    const result = await processPayout({
      userId: identity.uid,
      amountUSD: cents / 100,
      recipientEmail,
      idempotencyKey: identity.idempotencyKey,
    });
    return sendJson(res, result.status === 'PENDING' ? 202 : 200, result);
  } catch (error) {
    const status = Number(error.httpStatus)
      || (String(error.code || '').startsWith('auth/') ? 401 : 500);
    const knownErrors = new Set([
      'AUTH_HEADERS_REQUIRED', 'VERIFIED_EMAIL_REQUIRED', 'APP_CHECK_REQUIRED', 'PLAYER_PROFILE_NOT_UNIQUE',
      'PLAYER_PROFILE_NOT_OWNED', 'ACCOUNT_NOT_ELIGIBLE', 'IDENTITY_VERIFICATION_REQUIRED',
      'VALID_BIRTH_DATE_REQUIRED', 'PARENTAL_CONSENT_REQUIRED', 'INVALID_PAYOUT_REQUEST',
      'IDEMPOTENCY_KEY_REQUIRED', 'IDEMPOTENCY_KEY_REUSED', 'INSUFFICIENT_BALANCE',
      'USD_WALLET_NOT_FOUND', 'USD_WALLET_REQUIRED', 'DAILY_PAYOUT_LIMIT_REACHED',
    ]);
    const message = knownErrors.has(error.message) ? error.message : 'PAYOUT_REQUEST_FAILED';
    return sendJson(res, status, { error: message });
  }
}

async function paypalWebhook(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return sendJson(res, 405, { error: 'METHOD_NOT_ALLOWED' });
  }
  let event;
  try {
    event = req.body && typeof req.body === 'object'
      ? req.body
      : JSON.parse(Buffer.from(req.rawBody || '').toString('utf8'));
    if (!await verifyPayPalWebhook(req, event)) return sendJson(res, 400, { error: 'INVALID_WEBHOOK_SIGNATURE' });
    const outcome = eventDisposition(event.event_type, event.resource || {});
    if (!outcome) return sendJson(res, 200, { received: true, ignored: true });
    const requestRef = await findPayoutForWebhook(event);
    if (!requestRef) throw new Error('PAYOUT_REQUEST_NOT_FOUND');

    let finalOutcome = outcome;
    let failureCode = normalizedEventType(event.event_type).replace(/[^A-Z0-9_.-]/g, '').slice(0, 80);
    if (outcome === 'CHECK_BATCH') {
      const snap = await requestRef.get();
      if (!snap.exists) throw new Error('PAYOUT_REQUEST_NOT_FOUND');
      const accessToken = await getPayPalAccessToken();
      const itemStatus = await readPayPalPayoutItem(accessToken, snap.data().payoutBatchId, requestRef.id);
      if (itemStatus === 'SUCCESS') finalOutcome = 'COMPLETED';
      else if (['FAILED', 'RETURNED', 'REFUNDED', 'DENIED', 'BLOCKED', 'CANCELED'].includes(itemStatus)) {
        finalOutcome = 'FAILED';
        failureCode = `PAYPAL_ITEM_${itemStatus}`;
      } else finalOutcome = 'PROCESSING';
    }
    await applyWebhookOutcome(event, requestRef, finalOutcome, failureCode);
    return sendJson(res, 200, { received: true });
  } catch (error) {
    // Return 5xx so PayPal retries transient provider or database failures.
    return sendJson(res, 500, { error: 'WEBHOOK_PROCESSING_FAILED' });
  }
}

module.exports = { paypalPayoutRequest, paypalWebhook, processPayout };
