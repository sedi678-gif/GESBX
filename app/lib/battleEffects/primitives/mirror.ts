import { contribute } from '../fold';
import type { EffectPrimitive } from '../types';

export const mirrorPrimitive: EffectPrimitive = {
  type: 'mirror',
  apply() {
    return contribute({ kinds: ['mirror'] });
  },
};
