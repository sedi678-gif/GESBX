const crypto = require('node:crypto');
const { z } = require('zod');
const {
  db,
  FieldValue,
  HttpsError,
  secureCallable,
  operationDocId,
  getOwnedPlayer,
  ensureRateLimitTx,
  writeXpLedger,
  storedXp,
  adminUid,
  riskHash,
  RISK_HASH_SECRET,
  REFERRAL_CODE_SECRET,
} = require('./security');

const playerIdSchema = z.string().regex(/^\d{1,20}$/);
const codeSchema = z.string().trim().min(6).max(20).transform((value) => value.toUpperCase());
const getCodeSchema = z.object({ userId: playerIdSchema, installationId: z.string().min(8).max(160).optional() }).strict();
const applySchema = z.object({ userId: playerIdSchema, code: codeSchema, installationId: z.string().min(8).max(160).optional() }).strict();
const reviewSchema = z.object({ referralId: z.string().min(12).max(100), decision: z.enum(['approve', 'reject']), note: z.string().trim().max(500).optional() }).strict();
const REFERRAL_XP = 8000;

function referralCode(uid) {
  const salt = String(REFERRAL_CODE_SECRET.value() || RISK_HASH_SECRET.value() || '').trim();
  if (!salt) throw new HttpsError('failed-precondition', 'Referral kodu üçün REFERRAL_CODE_SECRET təyin edilməlidir.');
  return crypto.createHmac('sha256', salt).update(`referral:${uid}`).digest('hex').slice(0, 10).toUpperCase();
}

async function getMyReferralCode({ uid, payload, operationId, rateLimit, ip }) {
  const code = referralCode(uid);
  const codeRef = db.doc(`referral_codes/${code}`);
  const operationRef = db.doc(`operation_ledger/${operationDocId(uid, operationId)}`);
  const now = Date.now();
  const ipHash = riskHash(ip, 'ip');
  const installationHash = riskHash(payload.installationId, 'installation');
  return db.runTransaction(async (tx) => {
    const operationSnap = await tx.get(operationRef);
    if (operationSnap.exists) return operationSnap.data().result;
    const rate = await ensureRateLimitTx(tx, uid, 'getMyReferralCode', rateLimit, now);
    const owned = await getOwnedPlayer(uid, payload.userId, tx);
    const existing = await tx.get(codeRef);
    if (existing.exists && existing.data().authUid !== uid) throw new HttpsError('already-exists', 'Referral kodu toqquşması baş verdi.');
    tx.set(codeRef, {
      authUid: uid,
      playerId: owned.playerId,
      installationHash: installationHash || null,
      ipHash: ipHash || null,
      createdAt: existing.exists ? existing.data().createdAt : FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    const result = { code };
    tx.create(operationRef, { authUid: uid, operationId, action: 'getMyReferralCode', result, createdAt: FieldValue.serverTimestamp() });
    tx.set(rate.ref, rate.next);
    return result;
  });
}

async function applyReferral({ uid, authToken, payload, operationId, rateLimit, ip }) {
  if (authToken.email_verified !== true) throw new HttpsError('failed-precondition', 'Referral üçün təsdiqlənmiş email tələb olunur.');
  const code = payload.code;
  const codeRef = db.doc(`referral_codes/${code}`);
  const referralRef = db.doc(`referrals/${operationDocId(uid, 'one-referral')}`);
  const operationRef = db.doc(`operation_ledger/${operationDocId(uid, operationId)}`);
  const now = Date.now();
  const dayKey = new Date(now).toISOString().slice(0, 10);
  const inviterLimitRef = db.doc(`referral_daily_limits/${operationDocId(code, dayKey)}`);
  const ipHash = riskHash(ip, 'ip');
  const installationHash = riskHash(payload.installationId, 'installation');

  return db.runTransaction(async (tx) => {
    const operationSnap = await tx.get(operationRef);
    if (operationSnap.exists) return operationSnap.data().result;
    const rate = await ensureRateLimitTx(tx, uid, 'applyReferral', rateLimit, now);
    const referred = await getOwnedPlayer(uid, payload.userId, tx);
    const [codeSnap, priorReferral, inviterLimitSnap] = await Promise.all([
      tx.get(codeRef), tx.get(referralRef), tx.get(inviterLimitRef),
    ]);
    if (!codeSnap.exists) throw new HttpsError('not-found', 'Referral kodu tapılmadı.');
    if (priorReferral.exists) throw new HttpsError('already-exists', 'Bu hesab artıq referral ilə qeydiyyatdan keçib.');
    const inviter = codeSnap.data();
    if (inviter.authUid === uid || inviter.playerId === referred.playerId) {
      throw new HttpsError('failed-precondition', 'Öz referral kodundan istifadə edə bilməzsən.');
    }
    const inviterRefs = [
      db.doc(`players/${inviter.playerId}`),
      db.doc(`users/${inviter.playerId}`),
    ];
    const [inviterPlayer, inviterUser] = await Promise.all(inviterRefs.map((ref) => tx.get(ref)));
    if (!inviterPlayer.exists || !inviterUser.exists || inviterPlayer.data().firebaseUid !== inviter.authUid || inviterUser.data().firebaseUid !== inviter.authUid) {
      throw new HttpsError('failed-precondition', 'Dəvət edən hesab təsdiqlənmir.');
    }
    const dailyCount = inviterLimitSnap.exists ? Number(inviterLimitSnap.data().count) || 0 : 0;
    if (dailyCount >= 5) throw new HttpsError('resource-exhausted', 'Dəvət edən hesabın gündəlik referral limiti dolub.');

    const riskFlags = [];
    if (!RISK_HASH_SECRET.value()) riskFlags.push('risk_hash_secret_missing');
    if (ipHash && inviter.ipHash && ipHash === inviter.ipHash) riskFlags.push('shared_ip');
    if (installationHash && inviter.installationHash && installationHash === inviter.installationHash) riskFlags.push('shared_installation');
    const eligibleAt = now + 7 * 24 * 60 * 60 * 1000;
    const result = { referralId: referralRef.id, status: 'pending_review', eligibleAt, reviewRequired: true };
    tx.create(referralRef, {
      inviterUid: inviter.authUid,
      inviterPlayerId: inviter.playerId,
      referredUid: uid,
      referredPlayerId: referred.playerId,
      code,
      dateKey: dayKey,
      status: 'pending_review',
      rewardXp: REFERRAL_XP,
      riskFlags,
      ipHash,
      installationHash,
      createdAtMillis: now,
      createdAt: FieldValue.serverTimestamp(),
      eligibleAt,
    });
    tx.set(inviterLimitRef, { count: dailyCount + 1, dateKey: dayKey, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    tx.create(operationRef, { authUid: uid, operationId, action: 'applyReferral', result, createdAt: FieldValue.serverTimestamp() });
    tx.set(rate.ref, rate.next);
    return result;
  });
}

async function reviewReferral({ uid, payload, operationId, rateLimit }) {
  if (!adminUid(uid)) throw new HttpsError('permission-denied', 'Admin icazəsi tələb olunur.');
  const referralRef = db.doc(`referrals/${payload.referralId}`);
  const operationRef = db.doc(`operation_ledger/${operationDocId(uid, operationId)}`);
  const now = Date.now();
  return db.runTransaction(async (tx) => {
    const operationSnap = await tx.get(operationRef);
    if (operationSnap.exists) return operationSnap.data().result;
    const rate = await ensureRateLimitTx(tx, uid, 'reviewReferral', rateLimit, now);
    const referralSnap = await tx.get(referralRef);
    if (!referralSnap.exists) throw new HttpsError('not-found', 'Referral qeydi tapılmadı.');
    const referral = referralSnap.data();
    if (referral.status !== 'pending_review') throw new HttpsError('failed-precondition', 'Referral artıq yoxlanılıb.');
    if (payload.decision === 'approve' && now < Number(referral.eligibleAt)) {
      throw new HttpsError('failed-precondition', 'Referral üçün 7 günlük gözləmə müddəti tamamlanmayıb.');
    }

    let playerRef = null;
    let xpLedgerRef = null;
    let result;
    if (payload.decision === 'approve') {
      playerRef = db.doc(`players/${referral.inviterPlayerId}`);
      const userRef = db.doc(`users/${referral.inviterPlayerId}`);
      const [playerSnap, userSnap] = await Promise.all([tx.get(playerRef), tx.get(userRef)]);
      if (!playerSnap.exists || !userSnap.exists || playerSnap.data().firebaseUid !== referral.inviterUid || userSnap.data().firebaseUid !== referral.inviterUid) {
        throw new HttpsError('failed-precondition', 'Mükafat alacaq hesab təsdiqlənmir.');
      }
      const deterministicId = `referral_${payload.referralId}`;
      xpLedgerRef = db.doc(`xp_ledger/${operationDocId(referral.inviterUid, deterministicId)}`);
      const previousXp = await tx.get(xpLedgerRef);
      if (!previousXp.exists) {
        const nextXp = storedXp(playerSnap.data()) + REFERRAL_XP;
        result = { referralId: referralRef.id, status: 'approved', rewardXp: REFERRAL_XP };
        tx.update(playerRef, { xp: nextXp, updatedAt: now });
        writeXpLedger(tx, xpLedgerRef, {
          uid: referral.inviterUid,
          playerId: referral.inviterPlayerId,
          operationId: deterministicId,
          type: 'referral_reward',
          amount: REFERRAL_XP,
          xpAfter: nextXp,
          source: payload.referralId,
          result,
        });
      } else {
        result = { referralId: referralRef.id, status: 'approved', rewardXp: 0, duplicate: true };
      }
    } else {
      result = { referralId: referralRef.id, status: 'rejected', rewardXp: 0 };
    }
    tx.update(referralRef, {
      status: result.status,
      reviewedAt: now,
      reviewerUid: uid,
      reviewNote: payload.note || '',
      rewardGrantedAt: result.status === 'approved' ? now : null,
    });
    tx.create(operationRef, { authUid: uid, operationId, action: 'reviewReferral', result, createdAt: FieldValue.serverTimestamp() });
    tx.set(rate.ref, rate.next);
    return result;
  });
}

const getMyReferralCodeCallable = secureCallable('getMyReferralCode', getCodeSchema, getMyReferralCode, { max: 10, windowMs: 60_000 });
const applyReferralCallable = secureCallable('applyReferral', applySchema, applyReferral, { max: 3, windowMs: 24 * 60 * 60 * 1000 });
const reviewReferralCallable = secureCallable('reviewReferral', reviewSchema, reviewReferral, { max: 30, windowMs: 60_000 });

module.exports = {
  getMyReferralCode: getMyReferralCodeCallable,
  applyReferral: applyReferralCallable,
  reviewReferral: reviewReferralCallable,
};
