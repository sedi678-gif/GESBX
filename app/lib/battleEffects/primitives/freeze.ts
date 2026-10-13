import { contribute } from '../fold';
import type { EffectPrimitive } from '../types';

export const freezePrimitive: EffectPrimitive = {
  type: 'freeze',
  apply(spec) {
    return contribute({ kinds: ['freeze'], freezeMs: spec.freezeMs ?? 600_000 });
  },
};
