import { contribute } from '../fold';
import type { EffectPrimitive } from '../types';

export const firePrimitive: EffectPrimitive = {
  type: 'fire',
  apply(spec) {
    return contribute({ kinds: ['fire'], damage: spec.amount });
  },
};
