import type { EffectKind, EffectPrimitive } from '../types';
import { attackPrimitive } from './attack';
import { clickChallengePrimitive } from './clickChallenge';
import { damagePrimitive } from './damage';
import { earthquakePrimitive } from './earthquake';
import { firePrimitive } from './fire';
import { fogPrimitive } from './fog';
import { freezePrimitive } from './freeze';
import { icePrimitive } from './ice';
import { jokerPrimitive } from './joker';
import { mirrorPrimitive } from './mirror';
import { negatePrimitive } from './negate';
import { rebellionPrimitive } from './rebellion';
import { slavePrimitive } from './slave';
import { spyPrimitive } from './spy';
import { stealPrimitive } from './steal';
import { swapPrimitive } from './swap';
import { thiefPrimitive } from './thief';
import { tsunamiPrimitive } from './tsunami';

const PRIMITIVES: Record<EffectKind, EffectPrimitive> = {
  attack: attackPrimitive,
  damage: damagePrimitive,
  click_challenge: clickChallengePrimitive,
  freeze: freezePrimitive,
  steal: stealPrimitive,
  negate: negatePrimitive,
  mirror: mirrorPrimitive,
  rebellion: rebellionPrimitive,
  spy: spyPrimitive,
  thief: thiefPrimitive,
  slave: slavePrimitive,
  fire: firePrimitive,
  ice: icePrimitive,
  earthquake: earthquakePrimitive,
  tsunami: tsunamiPrimitive,
  joker: jokerPrimitive,
  fog: fogPrimitive,
  swap: swapPrimitive,
};

export function getEffectPrimitive(type: EffectKind): EffectPrimitive {
  const primitive = PRIMITIVES[type];
  if (!primitive) throw new Error(`Effekt tapılmadı: ${type}`);
  return primitive;
}
