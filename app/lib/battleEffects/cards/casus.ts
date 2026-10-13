import type { CardEffectModule } from '../types';

export const casusCard: CardEffectModule = {
  cardId: 'casus',
  effects: [
    { type: 'spy' },
    { type: 'attack', playerDelta: 3, allianceDelta: 1 },
  ],
};
