import type { CardEffectModule } from '../types';

export const guzguCard: CardEffectModule = {
  cardId: 'guzgu',
  effects: [
    { type: 'mirror' },
    { type: 'attack', playerDelta: 4, allianceDelta: 2 },
  ],
};
