import type { CardEffectModule } from '../types';

export const sehrbazCard: CardEffectModule = {
  cardId: 'sehrbaz',
  effects: [
    { type: 'swap' },
    { type: 'attack', playerDelta: 4, allianceDelta: 2 },
  ],
};
