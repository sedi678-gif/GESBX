import { contribute } from '../fold';
import type { EffectPrimitive } from '../types';

export const rebellionPrimitive: EffectPrimitive = {
  type: 'rebellion',
  apply() {
    return contribute({ kinds: ['rebellion'] });
  },
};
