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
  ADMIN_UIDS,
} = require('./security');

const playerIdSchema = z.string().regex(/^\d{1,20}$/);
const codeSchema = z.string().trim().min(6).max(20).transform((value) => value.toUpperCase());
const getCodeSchema = z.object({ userId: playerIdSchema, installationId: z.string().min(8).max(160).optional() }).strict();
const applySchema = z.object({ userId: playerIdSchema, code: codeSchema, installationId: z.string().min(8).max(160).optional() }).strict();
const reviewSchema = z.object({ referralId: z.string().min(12).max(100), decision: z.enum(['approve', 'reject']), note: z.string().trim().max(500).optional() }).strict();
const checkActivationSchema = z.object({ referralId: z.string().min(12).max(100) }).strict();
const getMyReferralsSchema = z.object({ userId: playerIdSchema }).strict();
const REFERRAL_XP_THRESHOLD = 6500;
const REFERRAL_REWARD_XP = 6500;

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
    const result = { referralId: referralRef.id, status: 'pending', xpThreshold: REFERRAL_XP_THRESHOLD };
    tx.create(referralRef, {
      inviterUid: inviter.authUid,
      inviterPlayerId: inviter.playerId,
      referredUid: uid,
      referredPlayerId: referred.playerId,
      code,
      dateKey: dayKey,
      status: 'pending',
      xpThreshold: REFERRAL_XP_THRESHOLD,
      rewardXp: REFERRAL_REWARD_XP,
      riskFlags,
      ipHash,
      installationHash,
      createdAtMillis: now,
      createdAt: FieldValue.serverTimestamp(),
      activatedAt: null,
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

async function checkReferralActivation({ uid, payload, operationId, rateLimit, ip }) {
  const now = Date.now();
  const referralRef = db.doc(`referrals/${payload.referralId}`);
  const operationRef = db.doc(`operation_ledger/${operationDocId(uid, operationId)}`);

  return db.runTransaction(async (tx) => {
    const operationSnap = await tx.get(operationRef);
    if (operationSnap.exists) return operationSnap.data().result;

    const rate = await ensureRateLimitTx(tx, uid, 'checkReferralActivation', rateLimit, now);
    const referralSnap = await tx.get(referralRef);
    if (!referralSnap.exists) throw new HttpsError('not-found', 'Referral qeydi tapılmadı.');
    const referral = referralSnap.data();

    if (referral.inviterUid !== uid) throw new HttpsError('permission-denied', 'Bu referral sizin dəvətiniz deyil.');
    if (referral.status === 'active') return { referralId: referralRef.id, status: 'active', alreadyActive: true };
    if (referral.status === 'rejected') throw new HttpsError('failed-precondition', 'Referral rədd edilib.');

    const referredPlayerRef = db.doc(`players/${referral.referredPlayerId}`);
    const referredPlayerSnap = await tx.get(referredPlayerRef);
    if (!referredPlayerSnap.exists) throw new HttpsError('not-found', 'Dəvət edilən Oyuncu tapılmadı.');

    const referredXp = storedXp(referredPlayerSnap.data());
    if (referredXp < REFERRAL_XP_THRESHOLD) {
      return {
        referralId: referralRef.id,
        status: 'pending',
        xpThreshold: REFERRAL_XP_THRESHOLD,
        currentXp: referredXp,
        progressPercent: Math.round((referredXp / REFERRAL_XP_THRESHOLD) * 100),
        notActive: true,
      };
    }

    const inviterPlayerRef = db.doc(`players/${referral.inviterPlayerId}`);
    const inviterPlayerSnap = await tx.get(inviterPlayerRef);
    if (!inviterPlayerSnap.exists) throw new HttpsError('not-found', 'Dəvət edən Oyuncu tapılmadı.');

    const deterministicId = `referral_activate_${payload.referralId}`;
    const xpLedgerRef = db.doc(`xp_ledger/${operationDocId(referral.inviterUid, deterministicId)}`);
    const previousXp = await tx.get(xpLedgerRef);
    if (previousXp.exists) {
      return { referralId: referralRef.id, status: 'active', alreadyActive: true, duplicate: true };
    }

    const nextXp = storedXp(inviterPlayerSnap.data()) + REFERRAL_REWARD_XP;
    const result = {
      referralId: referralRef.id,
      status: 'active',
      rewardXp: REFERRAL_REWARD_XP,
      xpAfter: nextXp,
      activatedAt: now,
    };

    tx.update(inviterPlayerRef, { xp: nextXp, updatedAt: now });
    writeXpLedger(tx, xpLedgerRef, {
      uid: referral.inviterUid,
      playerId: referral.inviterPlayerId,
      operationId: deterministicId,
      type: 'referral_reward',
      amount: REFERRAL_REWARD_XP,
      xpAfter: nextXp,
      source: payload.referralId,
      result,
    });

    tx.update(referralRef, {
      status: 'active',
      activatedAt: now,
      activatedByUid: uid,
    });

    tx.create(operationRef, { authUid: uid, operationId, action: 'checkReferralActivation', result, createdAt: FieldValue.serverTimestamp() });
    tx.set(rate.ref, rate.next);
    return result;
  });
}

async function getMyReferrals({ uid, payload, operationId, rateLimit, ip }) {
  const now = Date.now();
  const operationRef = db.doc(`operation_ledger/${operationDocId(uid, operationId)}`);

  return db.runTransaction(async (tx) => {
    const operationSnap = await tx.get(operationRef);
    if (operationSnap.exists) return operationSnap.data().result;

    const rate = await ensureRateLimitTx(tx, uid, 'getMyReferrals', rateLimit, now);
    const referralsSnap = await db.collection('referrals').where('inviterPlayerId', '==', payload.userId).get();
    const referrals = [];
    referralsSnap.forEach((doc) => {
      referrals.push({ id: doc.id, ...doc.data() });
    });

    const enriched = await Promise.all(referrals.map(async (ref) => {
      const referredSnap = await tx.get(db.doc(`players/${ref.referredPlayerId}`));
      const referredXp = referredSnap.exists ? storedXp(referredSnap.data()) : 0;
      return {
        ...ref,
        referredXp,
        progressPercent: Math.round((referredXp / REFERRAL_XP_THRESHOLD) * 100),
        isActive: ref.status === 'active',
        isPending: ref.status === 'pending',
        rewardEarned: ref.status === 'active' ? Number(ref.rewardXp || 0) : 0,
      };
    }));

    enriched.sort((a, b) => (b.createdAtMillis || 0) - (a.createdAtMillis || 0));

    const totalEarnings = enriched.filter((r) => r.isActive).reduce((sum, r) => sum + r.rewardEarned, 0);
    const activeCount = enriched.filter((r) => r.isActive).length;
    const pendingCount = enriched.filter((r) => r.isPending).length;

    const result = {
      referrals: enriched,
      totalEarnings,
      activeCount,
      pendingCount,
      xpThreshold: REFERRAL_XP_THRESHOLD,
    };

    tx.create(operationRef, { authUid: uid, operationId, action: 'getMyReferrals', result, createdAt: FieldValue.serverTimestamp() });
    tx.set(rate.ref, rate.next);
    return result;
  });
}

const referralSecrets = [REFERRAL_CODE_SECRET];
const getMyReferralCodeCallable = secureCallable('getMyReferralCode', getCodeSchema, getMyReferralCode, { max: 10, windowMs: 60_000 }, referralSecrets);
const applyReferralCallable = secureCallable('applyReferral', applySchema, applyReferral, { max: 3, windowMs: 24 * 60 * 60 * 1000 }, referralSecrets);
const reviewReferralCallable = secureCallable('reviewReferral', reviewSchema, reviewReferral, { max: 30, windowMs: 60_000 }, [REFERRAL_CODE_SECRET, ADMIN_UIDS]);
const checkReferralActivationCallable = secureCallable('checkReferralActivation', checkActivationSchema, checkReferralActivation, { max: 10, windowMs: 60_000 }, referralSecrets);
const getMyReferralsCallable = secureCallable('getMyReferrals', getMyReferralsSchema, getMyReferrals, { max: 10, windowMs: 60_000 }, referralSecrets);

module.exports = {
  getMyReferralCode: getMyReferralCodeCallable,
  applyReferral: applyReferralCallable,
  reviewReferral: reviewReferralCallable,
  checkReferralActivation: checkReferralActivationCallable,
  getMyReferrals: getMyReferralsCallable,
};
