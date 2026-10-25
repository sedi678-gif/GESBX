const { z } = require('zod');
const {
  db,
  FieldValue,
  HttpsError,
  secureCallable,
  operationDocId,
  getOwnedPlayer,
  readOperation,
  ensureRateLimitTx,
  writeWalletLedger,
  storedManat,
  adminUid,
  riskHash,
  ADMIN_UIDS,
} = require('./security');

const playerIdSchema = z.string().regex(/^\d{1,20}$/);
const createSchema = z.object({
  userId: playerIdSchema,
  amount: z.number().int().positive().max(100_000),
  paymentEmail: z.email().max(254),
  legalName: z.string().trim().min(3).max(100),
}).strict();
const reviewSchema = z.object({
  requestId: z.string().min(12).max(100),
  decision: z.enum(['approve', 'reject', 'paid']),
  note: z.string().trim().max(500).optional(),
}).strict();
const listReviewsSchema = z.object({ kind: z.enum(['withdrawals', 'referrals']) }).strict();

function configuredNumber(name, fallback, min, max) {
  const parsed = Number(process.env[name]);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) return fallback;
  return parsed;
}

function normalizedName(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function ageAtBirthDate(value, now = Date.now()) {
  const birth = new Date(String(value || ''));
  if (!Number.isFinite(birth.getTime()) || birth.getTime() > now) return null;
  const today = new Date(now);
  let age = today.getUTCFullYear() - birth.getUTCFullYear();
  const monthDelta = today.getUTCMonth() - birth.getUTCMonth();
  if (monthDelta < 0 || (monthDelta === 0 && today.getUTCDate() < birth.getUTCDate())) age -= 1;
  return age;
}

async function createWithdrawalRequest({ uid, authToken, payload, operationId, rateLimit, ip }) {
  if (authToken.email_verified !== true) throw new HttpsError('failed-precondition', 'Pul çıxarışı üçün təsdiqlənmiş email tələb olunur.');
  const verifiedEmail = String(authToken.email || '').trim().toLowerCase();
  if (!verifiedEmail || payload.paymentEmail.trim().toLowerCase() !== verifiedEmail) {
    throw new HttpsError('failed-precondition', 'PayPal email-i təsdiqlənmiş hesab email-i ilə eyni olmalıdır.');
  }
  const minimum = configuredNumber('WITHDRAWAL_MIN_AZN', 10, 1, 100_000);
  const dailyLimit = configuredNumber('WITHDRAWAL_DAILY_LIMIT_AZN', 500, minimum, 100_000);
  const manualReviewThreshold = configuredNumber('WITHDRAWAL_MANUAL_REVIEW_AZN', 100, minimum, 100_000);
  const amount = payload.amount;
  if (amount < minimum) throw new HttpsError('failed-precondition', `Minimum çıxarış məbləği ${minimum} AZN-dir.`);
  const now = Date.now();
  const dayKey = new Date(now).toISOString().slice(0, 10);
  const dailyRef = db.doc(`withdrawal_daily_limits/${operationDocId(uid, dayKey)}`);
  const requestRef = db.doc(`withdrawal_requests/${operationDocId(uid, operationId)}`);
  const holdMs = 48 * 60 * 60 * 1000;

  return db.runTransaction(async (tx) => {
    const ledger = await readOperation(tx, uid, operationId);
    if (ledger.data) return ledger.data.result;
    const rate = await ensureRateLimitTx(tx, uid, 'createWithdrawalRequest', rateLimit, now);
    const owned = await getOwnedPlayer(uid, payload.userId, tx);
    const [dailySnap, existingRequest] = await Promise.all([tx.get(dailyRef), tx.get(requestRef)]);
    if (existingRequest.exists) return existingRequest.data();
    const age = ageAtBirthDate(owned.user.birthDate, now);
    if (age == null || age < 18) {
      if (owned.user.parentalConsentVerified !== true) {
        throw new HttpsError('permission-denied', 'Yetkinlik yaşına çatmayan hesab üçün təsdiqlənmiş valideyn icazəsi tələb olunur.');
      }
    }
    const expectedName = normalizedName(`${owned.user.name || ''} ${owned.user.surname || ''}`);
    if (!expectedName || normalizedName(payload.legalName) !== expectedName) {
      throw new HttpsError('failed-precondition', 'Ödəniş hesabındakı ad profil adı ilə uyğun gəlmir.');
    }
    const daily = dailySnap.exists ? dailySnap.data() : { requestCount: 0, amount: 0 };
    const dailyTotal = Math.max(0, Number(daily.amount) || 0);
    if ((Number(daily.requestCount) || 0) >= 1 || dailyTotal + amount > dailyLimit) {
      throw new HttpsError('resource-exhausted', `Gündəlik çıxarış limiti ${dailyLimit} AZN-dir.`);
    }
    const balance = storedManat(owned.player);
    if (balance < amount) throw new HttpsError('failed-precondition', 'Balansda kifayət qədər manat yoxdur.');
    const nextBalance = balance - amount;
    const manualReview = amount >= manualReviewThreshold;
    const data = {
      authUid: uid,
      playerId: owned.playerId,
      amount,
      currency: 'AZN',
      provider: 'paypal',
      paymentEmail: payload.paymentEmail.trim().toLowerCase(),
      legalName: payload.legalName.trim(),
      status: 'pending_review',
      manualReview,
      riskFlags: manualReview ? ['large_amount_manual_review'] : [],
      ipHash: riskHash(ip, 'ip'),
      createdAtMillis: now,
      createdAt: FieldValue.serverTimestamp(),
      availableAt: now + holdMs,
      reviewedAt: null,
      reviewerUid: null,
      reviewNote: '',
    };
    tx.create(requestRef, data);
    tx.set(dailyRef, {
      authUid: uid,
      dateKey: dayKey,
      requestCount: (Number(daily.requestCount) || 0) + 1,
      amount: dailyTotal + amount,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    tx.set(owned.playerRef, { manat: nextBalance, coins: nextBalance, updatedAt: now }, { merge: true });
    const result = { requestId: requestRef.id, amount, status: data.status, availableAt: data.availableAt, balance: nextBalance };
    writeWalletLedger(tx, ledger.ref, {
      uid, playerId: owned.playerId, operationId, type: 'withdrawal_hold', amount: -amount,
      balanceAfter: nextBalance, source: requestRef.id, result,
    });
    tx.set(rate.ref, rate.next);
    return result;
  });
}

async function reviewWithdrawal({ uid, payload, operationId, rateLimit }) {
  if (!await adminUid(uid)) throw new HttpsError('permission-denied', 'Admin icazəsi tələb olunur.');
  const requestRef = db.doc(`withdrawal_requests/${payload.requestId}`);
  const now = Date.now();
  const operationRef = db.doc(`operation_ledger/${operationDocId(uid, operationId)}`);
  return db.runTransaction(async (tx) => {
    const op = await tx.get(operationRef);
    if (op.exists) return op.data().result;
    const rate = await ensureRateLimitTx(tx, uid, 'reviewWithdrawal', rateLimit, now);
    const requestSnap = await tx.get(requestRef);
    if (!requestSnap.exists) throw new HttpsError('not-found', 'Çıxarış sorğusu tapılmadı.');
    const request = requestSnap.data();
    let playerRef = null;
    let player = null;
    if (payload.decision === 'reject') {
      playerRef = db.doc(`players/${request.playerId}`);
      const playerSnap = await tx.get(playerRef);
      if (!playerSnap.exists || playerSnap.data().firebaseUid !== request.authUid) {
        throw new HttpsError('failed-precondition', 'Sorğunun oyunçu hesabı təsdiqlənmir.');
      }
      player = playerSnap.data();
    }

    if (payload.decision === 'approve') {
      if (request.status !== 'pending_review') throw new HttpsError('failed-precondition', 'Sorğu təsdiq üçün uyğun statusda deyil.');
      if (now < Number(request.availableAt)) throw new HttpsError('failed-precondition', 'Gözləmə müddəti hələ tamamlanmayıb.');
      tx.update(requestRef, { status: 'approved', reviewedAt: now, reviewerUid: uid, reviewNote: payload.note || '' });
    } else if (payload.decision === 'paid') {
      if (request.status !== 'approved') throw new HttpsError('failed-precondition', 'Əvvəlcə sorğu təsdiqlənməlidir.');
      tx.update(requestRef, { status: 'paid', paidAt: now, paidBy: uid, reviewNote: payload.note || request.reviewNote || '' });
    } else {
      if (!['pending_review', 'approved'].includes(request.status)) throw new HttpsError('failed-precondition', 'Sorğu artıq bağlanıb.');
      const balance = storedManat(player);
      const nextBalance = balance + Number(request.amount);
      tx.update(playerRef, { manat: nextBalance, coins: nextBalance, updatedAt: now });
      tx.update(requestRef, { status: 'rejected', reviewedAt: now, reviewerUid: uid, reviewNote: payload.note || '' });
      const refundId = `withdrawal_refund_${requestRef.id}`;
      const refundRef = db.doc(`wallet_ledger/${operationDocId(request.authUid, refundId)}`);
      tx.create(refundRef, {
        authUid: request.authUid,
        playerId: request.playerId,
        operationId: refundId,
        type: 'withdrawal_refund',
        amount: Number(request.amount),
        balanceAfter: nextBalance,
        source: requestRef.id,
        createdAt: FieldValue.serverTimestamp(),
      });
    }
    const result = { requestId: requestRef.id, status: payload.decision === 'paid' ? 'paid' : payload.decision === 'approve' ? 'approved' : 'rejected' };
    tx.create(operationRef, { authUid: uid, operationId, action: 'reviewWithdrawal', result, createdAt: FieldValue.serverTimestamp() });
    tx.set(rate.ref, rate.next);
    return result;
  });
}

async function listSecurityReviews({ uid, payload, rateLimit }) {
  if (!await adminUid(uid)) throw new HttpsError('permission-denied', 'Admin icazəsi tələb olunur.');
  const now = Date.now();
  await db.runTransaction(async (tx) => {
    const rate = await ensureRateLimitTx(tx, uid, 'listSecurityReviews', rateLimit, now);
    tx.set(rate.ref, rate.next);
  });

  if (payload.kind === 'withdrawals') {
    const snapshot = await db.collection('withdrawal_requests')
      .where('status', 'in', ['pending_review', 'approved'])
      .orderBy('createdAtMillis', 'desc')
      .limit(100)
      .get();
    return snapshot.docs.map((doc) => {
      const item = doc.data();
      return {
        id: doc.id,
        requestId: doc.id,
        playerId: item.playerId,
        amount: item.amount,
        currency: item.currency,
        paymentEmail: item.paymentEmail,
        legalName: item.legalName,
        status: item.status,
        manualReview: item.manualReview === true,
        riskFlags: Array.isArray(item.riskFlags) ? item.riskFlags : [],
        createdAtMillis: item.createdAtMillis,
        availableAt: item.availableAt,
      };
    });
  }

  const snapshot = await db.collection('referrals')
    .where('status', '==', 'pending_review')
    .orderBy('createdAtMillis', 'desc')
    .limit(100)
    .get();
  return snapshot.docs.map((doc) => {
    const item = doc.data();
    return {
      id: doc.id,
      referralId: doc.id,
      inviterPlayerId: item.inviterPlayerId,
      referredPlayerId: item.referredPlayerId,
      status: item.status,
      rewardXp: item.rewardXp,
      riskFlags: Array.isArray(item.riskFlags) ? item.riskFlags : [],
      createdAtMillis: item.createdAtMillis,
      eligibleAt: item.eligibleAt,
    };
  });
}

const createWithdrawalRequestCallable = secureCallable('createWithdrawalRequest', createSchema, createWithdrawalRequest, { max: 3, windowMs: 24 * 60 * 60 * 1000 });
const reviewWithdrawalCallable = secureCallable('reviewWithdrawal', reviewSchema, reviewWithdrawal, { max: 30, windowMs: 60_000 }, [ADMIN_UIDS]);
const listSecurityReviewsCallable = secureCallable(
  'listSecurityReviews',
  listReviewsSchema,
  listSecurityReviews,
  { max: 10, windowMs: 60_000 },
  [ADMIN_UIDS],
);

module.exports = {
  createWithdrawalRequest: createWithdrawalRequestCallable,
  reviewWithdrawal: reviewWithdrawalCallable,
  listSecurityReviews: listSecurityReviewsCallable,
};
