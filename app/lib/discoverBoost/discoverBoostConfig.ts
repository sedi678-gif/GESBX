export const DISCOVER_BOOST_COLLECTION = 'discover_boosts';

export const DISCOVER_BOOST_OPTIONS = [
  { durationMs: 5_000, cost: 100, label: '5 saniyə' },
  { durationMs: 10_000, cost: 200, label: '10 saniyə' },
  { durationMs: 25_000, cost: 500, label: '25 saniyə' },
  { durationMs: 60_000, cost: 1_000, label: '1 dəqiqə' },
  { durationMs: 2 * 60_000, cost: 2_000, label: '2 dəqiqə' },
  { durationMs: 3 * 60_000, cost: 3_000, label: '3 dəqiqə' },
  { durationMs: 4 * 60_000, cost: 4_000, label: '4 dəqiqə' },
  { durationMs: 5 * 60_000, cost: 5_000, label: '5 dəqiqə' },
] as const;

export type DiscoverBoostOption = (typeof DISCOVER_BOOST_OPTIONS)[number];

export const DISCOVER_BOOST_MS = DISCOVER_BOOST_OPTIONS[0].durationMs;
export const DISCOVER_BOOST_MAX_MS = DISCOVER_BOOST_OPTIONS[DISCOVER_BOOST_OPTIONS.length - 1].durationMs;

export function formatDiscoverBoostDuration(durationMs: number): string {
  const option = DISCOVER_BOOST_OPTIONS.find((item) => item.durationMs === durationMs);
  return option?.label ?? 'Kəşf boostu';
}
