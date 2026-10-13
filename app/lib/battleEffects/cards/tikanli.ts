import type { CardEffectModule } from '../types';

export const tikanliCard: CardEffectModule = {
  cardId: 'tikanli',
  effects: [
    { type: 'steal', amount: 2 },
    { type: 'attack', playerDelta: 3, allianceDelta: 2 },
  ],
};
