import { contribute } from '../fold';
import type { EffectPrimitive } from '../types';

export const negatePrimitive: EffectPrimitive = {
  type: 'negate',
  apply() {
    return contribute({ kinds: ['negate'] });
  },
};
