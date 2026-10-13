export const ARENA_SCORE_WINDOW_MS = 60 * 60 * 1000;
export const ARENA_SCORE_BUCKET_MS = 10 * 60 * 1000;

export type ArenaScoreTick = {
  at: number;
  side: 'home' | 'away';
  score: number;
};

export type ArenaPeakWindow = {
  startAt: number;
  score: number;
};

export function peakTenMinuteWindow(
  history: ArenaScoreTick[],
  side: 'home' | 'away',
  serverNow: number
): ArenaPeakWindow {
  const from = serverNow - ARENA_SCORE_WINDOW_MS;
  const ticks = history.filter((tick) => tick.side === side && tick.at >= from && tick.at <= serverNow);
  let best: ArenaPeakWindow = { startAt: from, score: 0 };
  for (let start = from; start < serverNow; start += ARENA_SCORE_BUCKET_MS) {
    const end = start + ARENA_SCORE_BUCKET_MS;
    const score = ticks
      .filter((tick) => tick.at >= start && tick.at < end)
      .reduce((sum, tick) => sum + Math.max(0, Math.trunc(tick.score)), 0);
    if (score > best.score) best = { startAt: start, score };
  }
  return best;
}
