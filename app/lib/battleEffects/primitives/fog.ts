import { contribute } from '../fold';
import type { EffectPrimitive } from '../types';

export const fogPrimitive: EffectPrimitive = {
  type: 'fog',
  apply() {
    return contribute({ kinds: ['fog'] });
  },
};
