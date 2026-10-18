const COUNTRY_CODE = 'AZ';
const CURRENCY = 'AZN';
const MAX_ALLOCATION = 100;

function makeWeeklyRewardId(periodId, countryCode, recipientId, rank) {
  return `${periodId}_${countryCode}_ALLIANCE_${recipientId}_${rank}_WEEKLY_RANKING`
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 120);
}

function planWeeklyRewards(board, allocation, countryCode = COUNTRY_CODE) {
  if (!board || board.kind !== 'weekly' || board.status !== 'closed') return [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(board.periodKey || ''))) return [];
  if (!/^[A-Z]{2}$/.test(countryCode)) return [];
  if (!Array.isArray(board.rows) || !Array.isArray(allocation?.entries)) return [];

  const entries = allocation.entries.filter((entry) =>
    entry
    && entry.countryCode === countryCode
    && entry.recipientType === 'ALLIANCE'
    && entry.currency === CURRENCY
    && Number.isSafeInteger(entry.rank)
    && entry.rank > 0
    && Number.isSafeInteger(entry.amount)
    && entry.amount >= 0
  );
  if (entries.length > MAX_ALLOCATION) throw new Error('Allocation table exceeds supported size.');
  const configuredRanks = new Set();
  for (const entry of entries) {
    if (configuredRanks.has(entry.rank)) throw new Error(`Duplicate weekly reward allocation for rank ${entry.rank}.`);
    configuredRanks.add(entry.rank);
  }

  const seen = new Set();
  const plans = [];
  for (const row of board.rows) {
    const recipientId = String(row?.id || '').trim();
    const rank = Number(row?.rank);
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(recipientId) || !Number.isSafeInteger(rank) || rank < 1 || seen.has(recipientId)) continue;
    const entry = entries.find((candidate) => candidate.rank === rank);
    if (!entry) continue;
    seen.add(recipientId);
    plans.push({
      rewardId: makeWeeklyRewardId(board.periodKey, countryCode, recipientId, rank),
      periodId: board.periodKey,
      sourceId: board.periodKey,
      matchId: '',
      recipientType: 'ALLIANCE',
      recipientId,
      viewerIds: [recipientId],
      sourceType: 'WEEKLY_RANKING',
      rewardType: 'WEEKLY_RANKING',
      countryCode,
      rank,
      amount: entry.amount,
      currency: CURRENCY,
    });
  }
  return plans;
}

module.exports = { makeWeeklyRewardId, planWeeklyRewards };
