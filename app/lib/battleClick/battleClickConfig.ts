import { isBattleLoadoutCardId } from '@/app/lib/battleLoadout/battleLoadoutConfig';
import { getCardEffectModule } from '@/app/lib/battleEffects/registry';

export const BATTLE_CHALLENGE_COLLECTION = 'challenges';
export const BATTLE_CHALLENGE_CLICKS = 'clicks';
export const BATTLE_CHALLENGE_DURATION_MS = 15_000;
export const BATTLE_CHALLENGE_CLICK_MAX = 14;
export const BATTLE_CHALLENGE_SCHEMA = 1;

export type BattleChallengeStatus = 'active' | 'succeeded' | 'expired';
export type BattleClickTarget = 'own' | 'opponent';

const CLICK_CARDS = new Set(['qul', 'qutb', 'felaket', 'usyan']);

export function cardClickScale(cardId: string): 0 | 1 | 2 {
  if (!isBattleLoadoutCardId(cardId) || !CLICK_CARDS.has(cardId)) return 0;
  const module = getCardEffectModule(cardId);
  const spec = module?.effects.find((item) => item.type === 'click_challenge');
  return spec?.scale === 'double' ? 2 : 1;
}

export function officialClickTarget(cardId: string): BattleClickTarget {
  const module = getCardEffectModule(cardId);
  const spec = module?.effects.find((item) => item.type === 'click_challenge');
  return spec?.target === 'own' ? 'own' : 'opponent';
}

export function allianceMemberCount(raw: unknown): number {
  if (!Array.isArray(raw)) return 1;
  const n = raw.map(String).filter(Boolean).length;
  if (!Number.isInteger(n) || n < 1) return 1;
  return Math.min(200, n);
}

/** Kiçik 3, orta 5, böyük 7. Üsyan 2×. Client required göndərmir. */
export function officialRequiredClicks(cardId: string, memberCount: unknown): number {
  const scale = cardClickScale(cardId);
  if (scale <= 0) return 0;
  const members = allianceMemberCount(memberCount);
  const band = members <= 5 ? 3 : members <= 15 ? 5 : 7;
  const required = band * scale;
  if (required < 1 || required > BATTLE_CHALLENGE_CLICK_MAX) return 0;
  return required;
}

export function challengeExpiresAt(startedAt: number): number {
  return startedAt > 0 ? startedAt + BATTLE_CHALLENGE_DURATION_MS : 0;
}
