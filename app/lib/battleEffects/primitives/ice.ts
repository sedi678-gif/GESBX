import { contribute } from '../fold';
import type { EffectPrimitive } from '../types';

export const icePrimitive: EffectPrimitive = {
  type: 'ice',
  apply(spec) {
    return contribute({ kinds: ['ice'], freezeMs: spec.freezeMs ?? 600_000 });
  },
};
