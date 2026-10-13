import { contribute } from '../fold';
import type { EffectPrimitive } from '../types';

export const swapPrimitive: EffectPrimitive = {
  type: 'swap',
  apply() {
    return contribute({ kinds: ['swap'] });
  },
};
