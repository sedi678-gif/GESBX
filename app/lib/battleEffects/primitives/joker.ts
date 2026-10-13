import { contribute } from '../fold';
import type { EffectPrimitive } from '../types';

export const jokerPrimitive: EffectPrimitive = {
  type: 'joker',
  apply() {
    return contribute({ kinds: ['joker'] });
  },
};
