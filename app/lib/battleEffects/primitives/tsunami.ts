import { contribute } from '../fold';
import type { EffectPrimitive } from '../types';

export const tsunamiPrimitive: EffectPrimitive = {
  type: 'tsunami',
  apply() {
    return contribute({ kinds: ['tsunami'] });
  },
};
