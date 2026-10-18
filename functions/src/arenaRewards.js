/* eslint @typescript-eslint/no-require-imports: off */
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { getFirestore } = require('firebase-admin/firestore');
const { ADMIN_UIDS, adminUid } = require('./security');
const { planWeeklyRewards } = require('./arenaWeeklyPlanner');

const db = getFirestore();
const REGION = 'us-central1';
const eventTypes = ['REWARD_ELIGIBILITY_CHECKED', 'REWARD_CREATED', 'REWARD_SECURITY_CHECKED'];

function rewardId(periodId, sourceId, recipientType, recipientId) {
  return `${periodId}_${sourceId}_${recipientType}_${recipientId}_BATTLE_COMPLETION`
    .replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80);
}

exports.awardArenaMatchRewards = onCall({ region: REGION, enforceAppCheck: true }, async (request) => {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Giriş tələb olunur.');
  const matchId = String(request.data?.matchId || '').trim();
  if (!/^[A-Za-z0-9_-]{1,120}$/.test(matchId)) throw new HttpsError('invalid-argument', 'Match ID etibarsızdır.');
  const matchRef = db.doc(`arena_matches/${matchId}`);
  const snap = await matchRef.get();
  if (!snap.exists) throw new HttpsError('not-found', 'Match tapılmadı.');
  const match = snap.data();
  if (!(match.participantIds || []).includes(request.auth.uid)) {
    throw new HttpsError('permission-denied', 'Bu match-ə çıxışınız yoxdur.');
  }
  const result = match.result || {};
  if (match.status !== 'closed' || result.status !== 'COMPLETED' || result.matchId !== matchId) {
    throw new HttpsError('failed-precondition', 'Match yekunlaşmayıb.');
  }
  const recipientType = result.gameMode === '1v1' ? 'USER' : 'ALLIANCE';
  const recipientId = recipientType === 'USER' ? result.winnerPlayerId : result.winnerAllianceId;
  if (!recipientId) return { rewards: [] };
  const completedAt = Number(result.completedAt);
  if (!Number.isFinite(completedAt) || completedAt <= 0) throw new HttpsError('failed-precondition', 'Yekun vaxtı etibarsızdır.');
  const d = new Date(completedAt + 4 * 60 * 60 * 1000);
  const day = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const weekday = (day.getUTCDay() + 6) % 7;
  day.setUTCDate(day.getUTCDate() - weekday);
  const periodId = `${day.getUTCFullYear()}-${String(day.getUTCMonth() + 1).padStart(2, '0')}-${String(day.getUTCDate()).padStart(2, '0')}`;
  const id = rewardId(periodId, result.resultId, recipientType, recipientId);
  const ref = db.doc(`arena_rewards/${id}`);
  const now = Date.now();
  const recipientSnap = recipientType === 'USER'
    ? await db.doc(`players/${recipientId}`).get()
    : await db.doc(`alliances/${recipientId}`).get();
  const blocked = recipientSnap.data()?.banned === true || recipientSnap.data()?.frozen === true;
  await db.runTransaction(async (tx) => {
    const old = await tx.get(ref);
    if (old.exists) return;
    tx.create(ref, {
      rewardId: id, periodId, sourceType: 'ARENA_MATCH', sourceId: result.resultId,
      matchId, rewardType: 'BATTLE_COMPLETION', recipientType, recipientId,
      countryCode: 'AZ', rank: null, amount: null, currency: 'AZN',
      status: blocked ? 'REJECTED' : 'APPROVED', createdAt: now,
      approvedAt: blocked ? null : now, rejectedAt: blocked ? now : null,
      securityStatus: blocked ? 'BLOCKED' : 'CLEAR',
      viewerIds: [...new Set([...(match.participantIds || []), recipientId])],
      payoutCheckStatus: null, payoutCheckedAt: null, payoutReady: false,
    });
    for (const type of [...eventTypes, blocked ? 'REWARD_REJECTED' : 'REWARD_APPROVED']) {
      tx.create(ref.collection('reward_events').doc(type), {
        type, rewardId: id, matchId, sourceId: result.resultId, periodId,
        status: blocked ? 'REJECTED' : 'APPROVED', timestamp: now,
      });
    }
  });
  const saved = await ref.get();
  return { rewards: [{ ...saved.data(), rewardId: id }] };
});

exports.settleArenaWeeklyRewards = onCall({ region: REGION, enforceAppCheck: true, secrets: [ADMIN_UIDS], timeoutSeconds: 300 }, async (request) => {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Giriş tələb olunur.');
  if (!adminUid(request.auth.uid)) throw new HttpsError('permission-denied', 'Həftəlik mükafat hesablaşması yalnız admin üçündür.');
  const periodId = String(request.data?.periodId || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(periodId)) {
    throw new HttpsError('invalid-argument', 'Həftə periodu yanlışdır.');
  }

  const settlementId = `${periodId}_AZ`;
  const settlementRef = db.doc(`arena_reward_settlements/${settlementId}`);
  const [oldSettlement, boardSnap, resetSnap, allocationSnap] = await Promise.all([
    settlementRef.get(),
    db.doc(`leaderboard_weekly/${periodId}`).get(),
    db.doc(`leaderboard_resets/weekly_${periodId}`).get(),
    db.doc('app_config/arena_reward_allocation').get(),
  ]);
  if (oldSettlement.exists) return oldSettlement.data();
  if (!boardSnap.exists || boardSnap.data().periodKey !== periodId || boardSnap.data().status !== 'closed') {
    throw new HttpsError('failed-precondition', 'Həftəlik reytinq bağlı deyil.');
  }
  if (!resetSnap.exists || resetSnap.data().status !== 'done' || resetSnap.data().kind !== 'weekly') {
    throw new HttpsError('failed-precondition', 'Həftəlik reytinqin yekunlaşdırılması tamamlanmayıb.');
  }
  if (!allocationSnap.exists || !Array.isArray(allocationSnap.data().entries) || allocationSnap.data().entries.length === 0) {
    throw new HttpsError('failed-precondition', 'app_config/arena_reward_allocation entries cədvəli boşdur.');
  }

  let plans;
  try {
    plans = planWeeklyRewards(boardSnap.data(), allocationSnap.data(), 'AZ');
  } catch (error) {
    throw new HttpsError('failed-precondition', error instanceof Error ? error.message : 'Mükafat cədvəli yanlışdır.');
  }
  if (plans.length === 0) {
    throw new HttpsError('failed-precondition', 'Bağlı reytinqdə konfiqurasiya edilmiş rank mükafatı yoxdur.');
  }

  const now = Date.now();
  for (const plan of plans) {
    const rewardRef = db.doc(`arena_rewards/${plan.rewardId}`);
    await db.runTransaction(async (tx) => {
      const existing = await tx.get(rewardRef);
      if (existing.exists) {
        const old = existing.data();
        if (old.sourceType !== 'WEEKLY_RANKING' || old.periodId !== periodId || old.recipientId !== plan.recipientId || old.rank !== plan.rank || old.amount !== plan.amount) {
          throw new HttpsError('already-exists', 'Mövcud mükafat qeydi yeni hesablaşma planı ilə uyğun gəlmir.');
        }
        return;
      }
      const allianceSnap = await tx.get(db.doc(`alliances/${plan.recipientId}`));
      if (!allianceSnap.exists) {
        throw new HttpsError('failed-precondition', `Reytinqdəki ${plan.recipientId} ittifaqı tapılmadı.`);
      }
      const alliance = allianceSnap.data();
      const allianceMembers = await tx.get(db.collection(`alliance_members/${plan.recipientId}/members`));
      let viewerIds = allianceMembers.docs.map((member) => member.id);
      if (viewerIds.length === 0 && Array.isArray(alliance.members)) {
        const userSnaps = await Promise.all(alliance.members.map((id) => tx.get(db.doc(`users/${id}`))));
        viewerIds = userSnaps.map((user) => String(user.data()?.firebaseUid || '')).filter(Boolean);
      }
      viewerIds = [...new Set(viewerIds)];
      if (viewerIds.length === 0) {
        throw new HttpsError('failed-precondition', `İttifaq ${plan.recipientId} üzvlərinin Firebase UID-ləri tapılmadı.`);
      }
      const blocked = alliance.banned === true || alliance.frozen === true;
      const status = blocked ? 'REJECTED' : 'APPROVED';
      tx.create(rewardRef, {
        ...plan,
        viewerIds,
        rewardType: 'WEEKLY_RANKING',
        sourceType: 'WEEKLY_RANKING',
        status,
        createdAt: now,
        approvedAt: blocked ? null : now,
        rejectedAt: blocked ? now : null,
        securityStatus: blocked ? 'BLOCKED' : 'CLEAR',
        payoutCheckStatus: null,
        payoutCheckedAt: null,
        payoutReady: false,
        walletCredited: false,
      });
      for (const type of [
        'REWARD_ELIGIBILITY_CHECKED',
        'REWARD_ALLOCATION_CREATED',
        'REWARD_SECURITY_CHECKED',
        blocked ? 'REWARD_REJECTED' : 'REWARD_APPROVED',
      ]) {
        tx.create(rewardRef.collection('reward_events').doc(type), {
          type,
          rewardId: plan.rewardId,
          sourceId: periodId,
          periodId,
          rank: plan.rank,
          amount: plan.amount,
          currency: plan.currency,
          status,
          timestamp: now,
        });
      }
    });
  }

  await db.runTransaction(async (tx) => {
    const existing = await tx.get(settlementRef);
    if (existing.exists) return;
    tx.create(settlementRef, {
      settlementId,
      periodId,
      countryCode: 'AZ',
      sourceType: 'WEEKLY_RANKING',
      status: 'completed',
      allocatedCount: plans.length,
      walletCredited: false,
      createdAt: now,
    });
    tx.create(settlementRef.collection('reward_events').doc('REWARD_ALLOCATION_COMPLETED'), {
      type: 'REWARD_ALLOCATION_COMPLETED',
      settlementId,
      periodId,
      allocatedCount: plans.length,
      walletCredited: false,
      timestamp: now,
    });
  });
  const settlement = await settlementRef.get();
  return settlement.data();
});
