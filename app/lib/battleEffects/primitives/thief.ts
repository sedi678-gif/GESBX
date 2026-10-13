import { contribute } from '../fold';
import type { EffectPrimitive } from '../types';

export const thiefPrimitive: EffectPrimitive = {
  type: 'thief',
  apply() {
    return contribute({ kinds: ['thief'] });
  },
};
