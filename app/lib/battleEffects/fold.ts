import type { EffectContribution, EffectKind } from './types';
import {
  EFFECT_ALLIANCE_DELTA_MAX,
  EFFECT_CLICK_MAX,
  EFFECT_DAMAGE_MAX,
  EFFECT_FREEZE_MAX_MS,
  EFFECT_KIND_MAX,
  EFFECT_PLAYER_DELTA_MAX,
  EFFECT_STEAL_MAX,
  officialInt,
} from './limits';

export function emptyContribution(): EffectContribution {
  return {
    kinds: [],
    damage: 0,
    playerDelta: 0,
    allianceDelta: 0,
    steal: 0,
    clickRequired: 0,
    freezeMs: 0,
  };
}

export function contribute(partial: Partial<EffectContribution> & { kinds: EffectKind[] }): EffectContribution {
  return {
    kinds: partial.kinds.slice(0, EFFECT_KIND_MAX),
    damage: officialInt(partial.damage ?? 0, EFFECT_DAMAGE_MAX),
    playerDelta: officialInt(partial.playerDelta ?? 0, EFFECT_PLAYER_DELTA_MAX),
    allianceDelta: officialInt(partial.allianceDelta ?? 0, EFFECT_ALLIANCE_DELTA_MAX),
    steal: officialInt(partial.steal ?? 0, EFFECT_STEAL_MAX),
    clickRequired: officialInt(partial.clickRequired ?? 0, EFFECT_CLICK_MAX),
    freezeMs: officialInt(partial.freezeMs ?? 0, EFFECT_FREEZE_MAX_MS),
  };
}

function addBound(left: number, right: number, max: number, label: string): number {
  const next = left + right;
  if (!Number.isInteger(next) || next < 0 || next > max) {
    throw new Error(`${label} limiti aşıldı`);
  }
  return next;
}

export function mergeContributions(left: EffectContribution, right: EffectContribution): EffectContribution {
  const kinds = [...left.kinds];
  for (const kind of right.kinds) {
    if (!kinds.includes(kind) && kinds.length < EFFECT_KIND_MAX) kinds.push(kind);
  }
  return {
    kinds,
    damage: addBound(left.damage, right.damage, EFFECT_DAMAGE_MAX, 'Damage'),
    playerDelta: addBound(left.playerDelta, right.playerDelta, EFFECT_PLAYER_DELTA_MAX, 'Player score'),
    allianceDelta: addBound(left.allianceDelta, right.allianceDelta, EFFECT_ALLIANCE_DELTA_MAX, 'Alliance score'),
    steal: addBound(left.steal, right.steal, EFFECT_STEAL_MAX, 'Steal'),
    clickRequired: Math.max(left.clickRequired, right.clickRequired),
    freezeMs: Math.max(left.freezeMs, right.freezeMs),
  };
}
