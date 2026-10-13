import { isBattleLoadoutCardId, type BattleLoadoutCardId } from '@/app/lib/battleLoadout/battleLoadoutConfig';
import { emptyContribution, mergeContributions } from './fold';
import { defaultCardVariant, officialInfoDamage, type CardVariant } from './infoDamage';
import { getEffectPrimitive } from './primitives';
import { officialRequiredClicks as requiredClicksForAlliance } from '@/app/lib/battleClick/battleClickConfig';
import { getCardEffectModule } from './registry';
import type { EffectKind, EffectSpec, ResolvedCardEffect } from './types';

const EFFECT_LABELS: Record<EffectKind, string> = {
  attack: 'Hücum',
  damage: 'Zərər',
  click_challenge: 'Klik',
  freeze: 'Dondurma',
  steal: 'Oğurluq',
  negate: 'Ləğv',
  mirror: 'Güzgü',
  rebellion: 'Üsyan',
  spy: 'Cəsus',
  thief: 'Oğru',
  slave: 'Zəncir',
  fire: 'Od',
  ice: 'Buz',
  earthquake: 'Zəlzələ',
  tsunami: 'Sunami',
  joker: 'Joker',
  fog: 'Duman',
  swap: 'Dəyişmə',
};

function specsForVariant(cardId: string, effects: readonly EffectSpec[], variant: CardVariant | null): EffectSpec[] {
  return effects.filter((spec) => {
    if (cardId === 'qutb' && (spec.type === 'fire' || spec.type === 'ice')) return spec.type === variant;
    if (cardId === 'felaket' && (spec.type === 'tsunami' || spec.type === 'earthquake')) return spec.type === variant;
    return true;
  });
}

/** Server-only: kart ID-dən rəsmi effekt. Zərər info.json düsturundan gəlir. */
export function resolveCardEffect(cardId: string, variant?: CardVariant | null): ResolvedCardEffect | null {
  if (!isBattleLoadoutCardId(cardId)) return null;
  const module = getCardEffectModule(cardId);
  if (!module) return null;
  const chosen = variant === undefined ? defaultCardVariant(cardId) : variant;
  const specs = specsForVariant(cardId, module.effects, chosen);
  if (specs.length === 0) return null;

  let merged = emptyContribution();
  for (const spec of specs) {
    merged = mergeContributions(merged, getEffectPrimitive(spec.type).apply(spec));
  }
  if (merged.kinds.length === 0) return null;

  return {
    cardId,
    primary: specs[0]?.type ?? merged.kinds[0],
    ...merged,
    damage: officialInfoDamage(cardId, 1, chosen),
  };
}

export function officialClickRequired(cardId: string, memberCount?: unknown): number {
  if (memberCount !== undefined) return requiredClicksForAlliance(cardId, memberCount);
  return resolveCardEffect(cardId)?.kinds.includes('click_challenge') ? 1 : 0;
}

export function viewCardEffectLabel(cardId: string): string {
  const resolved = resolveCardEffect(cardId);
  if (!resolved) return '';
  return resolved.kinds.map((kind) => EFFECT_LABELS[kind]).join(' · ');
}

export function toScoreEffect(resolved: ResolvedCardEffect): {
  cardId: BattleLoadoutCardId;
  kind: EffectKind;
  damage: number;
  playerDelta: number;
  allianceDelta: number;
  steal: number;
} {
  return {
    cardId: resolved.cardId,
    kind: resolved.primary,
    damage: resolved.damage,
    playerDelta: resolved.playerDelta,
    allianceDelta: resolved.allianceDelta,
    steal: resolved.steal,
  };
}
