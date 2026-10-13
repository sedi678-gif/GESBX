import type { CardEffectModule } from '../types';

export const jokerCard: CardEffectModule = {
  cardId: 'joker',
  effects: [
    { type: 'joker' },
    { type: 'attack', playerDelta: 5, allianceDelta: 3 },
  ],
};
