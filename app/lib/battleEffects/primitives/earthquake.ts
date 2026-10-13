import { contribute } from '../fold';
import type { EffectPrimitive } from '../types';

export const earthquakePrimitive: EffectPrimitive = {
  type: 'earthquake',
  apply(spec) {
    return contribute({ kinds: ['earthquake'], damage: spec.amount });
  },
};
