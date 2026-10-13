export { resolveCardEffect, officialClickRequired, viewCardEffectLabel, toScoreEffect } from './engine';
export {
  CARD_XP_DAMAGE,
  officialXpDamage,
  officialInfoDamage,
  lookupCardXpBand,
} from './infoDamage';
export { getCardEffectModule, registerCardEffect } from './registry';
export { getEffectPrimitive } from './primitives';
export { EFFECT_KINDS, isEffectKind } from './types';
export type {
  CardEffectModule,
  EffectContribution,
  EffectKind,
  EffectPrimitive,
  EffectSpec,
  ResolvedCardEffect,
} from './types';
