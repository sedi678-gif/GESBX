import { contribute } from '../fold';
import type { EffectPrimitive } from '../types';

export const slavePrimitive: EffectPrimitive = {
  type: 'slave',
  apply() {
    return contribute({ kinds: ['slave'] });
  },
};
