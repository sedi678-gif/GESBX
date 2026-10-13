import type { CardEffectModule } from '../types';

export const ogruCard: CardEffectModule = {
  cardId: 'ogru',
  effects: [
    { type: 'thief' },
    { type: 'steal', amount: 4 },
    { type: 'attack', playerDelta: 4, allianceDelta: 0 },
  ],
};
