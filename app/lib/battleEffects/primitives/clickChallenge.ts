import { contribute } from '../fold';
import type { EffectPrimitive } from '../types';

/** Required say client-dən gəlmir — server ittifaq ölçüsündən hesab edir. */
export const clickChallengePrimitive: EffectPrimitive = {
  type: 'click_challenge',
  apply() {
    return contribute({ kinds: ['click_challenge'] });
  },
};
