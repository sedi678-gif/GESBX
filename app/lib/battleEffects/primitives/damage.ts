import { contribute } from '../fold';
import type { EffectPrimitive } from '../types';

export const damagePrimitive: EffectPrimitive = {
  type: 'damage',
  apply(spec) {
    return contribute({ kinds: ['damage'], damage: spec.amount });
  },
};
