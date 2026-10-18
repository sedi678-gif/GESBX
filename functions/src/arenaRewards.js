/* eslint @typescript-eslint/no-require-imports: off */
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { getFirestore } = require('firebase-admin/firestore');

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

exports.settleArenaWeeklyRewards = onCall({ region: REGION, enforceAppCheck: true }, async (request) => {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Giriş tələb olunur.');
  const periodId = String(request.data?.periodId || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(periodId)) throw new HttpsError('invalid-argument', 'Period etibarsızdır.');
  const [board, reset] = await Promise.all([
    db.doc(`leaderboard_weekly/${periodId}`).get(),
    db.doc(`leaderboard_resets/weekly_${periodId}`).get(),
  ]);
  if (!board.exists || board.data()?.status !== 'closed' || !reset.exists || reset.data()?.status !== 'done' || reset.data()?.kind !== 'weekly') return null;
  const settlementId = `${periodId}_AZ`;
  const ref = db.doc(`arena_reward_settlements/${settlementId}`);
  const now = Date.now();
  await db.runTransaction(async (tx) => {
    const existing = await tx.get(ref);
    if (existing.exists) return;
    tx.create(ref, {
      settlementId, periodId, countryCode: 'AZ', status: 'completed', allocatedCount: 0,
      createdAt: now, sourceType: 'WEEKLY_RANKING', schemaVersion: 1, walletCredited: false,
    });
    tx.create(ref.collection('reward_events').doc('REWARD_ALLOCATION_STARTED'), {
      type: 'REWARD_ALLOCATION_STARTED', rewardId: settlementId, matchId: '', sourceId: periodId,
      periodId, status: 'COMPLETED', timestamp: now,
    });
    tx.create(ref.collection('reward_events').doc('REWARD_ALLOCATION_COMPLETED'), {
      type: 'REWARD_ALLOCATION_COMPLETED', rewardId: settlementId, matchId: '', sourceId: periodId,
      periodId, status: 'COMPLETED', timestamp: now,
    });
  });
  return { settlementId, periodId, countryCode: 'AZ', status: 'completed', allocatedCount: 0, createdAt: now };
});
