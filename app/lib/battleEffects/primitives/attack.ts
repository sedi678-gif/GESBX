import { contribute } from '../fold';
import type { EffectPrimitive } from '../types';

export const attackPrimitive: EffectPrimitive = {
  type: 'attack',
  apply(spec) {
    return contribute({
      kinds: ['attack'],
      playerDelta: spec.playerDelta,
      allianceDelta: spec.allianceDelta,
    });
  },
};
