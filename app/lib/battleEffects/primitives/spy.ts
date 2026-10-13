import { contribute } from '../fold';
import type { EffectPrimitive } from '../types';

export const spyPrimitive: EffectPrimitive = {
  type: 'spy',
  apply() {
    return contribute({ kinds: ['spy'] });
  },
};
