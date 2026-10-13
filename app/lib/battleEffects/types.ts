import type { BattleLoadoutCardId } from '@/app/lib/battleLoadout/battleLoadoutConfig';

export const EFFECT_KINDS = [
  'attack',
  'damage',
  'click_challenge',
  'freeze',
  'steal',
  'negate',
  'mirror',
  'rebellion',
  'spy',
  'thief',
  'slave',
  'fire',
  'ice',
  'earthquake',
  'tsunami',
  'joker',
  'fog',
  'swap',
] as const;

export type EffectKind = (typeof EFFECT_KINDS)[number];

export interface EffectSpec {
  type: EffectKind;
  amount?: number;
  playerDelta?: number;
  allianceDelta?: number;
  required?: number;
  freezeMs?: number;
  scale?: 'normal' | 'double';
  target?: 'own' | 'opponent';
}

export interface EffectContribution {
  kinds: EffectKind[];
  damage: number;
  playerDelta: number;
  allianceDelta: number;
  steal: number;
  clickRequired: number;
  freezeMs: number;
}

export interface EffectPrimitive {
  type: EffectKind;
  apply(spec: EffectSpec): EffectContribution;
}

export interface CardEffectModule {
  cardId: BattleLoadoutCardId;
  effects: readonly EffectSpec[];
}

export interface ResolvedCardEffect extends EffectContribution {
  cardId: BattleLoadoutCardId;
  primary: EffectKind;
}

export function isEffectKind(value: string): value is EffectKind {
  return (EFFECT_KINDS as readonly string[]).includes(value);
}
