import { contribute } from '../fold';
import type { EffectPrimitive } from '../types';

export const stealPrimitive: EffectPrimitive = {
  type: 'steal',
  apply(spec) {
    return contribute({ kinds: ['steal'], steal: spec.amount });
  },
};
