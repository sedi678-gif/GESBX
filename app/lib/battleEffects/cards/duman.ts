import type { CardEffectModule } from '../types';

export const dumanCard: CardEffectModule = {
  cardId: 'duman',
  effects: [
    { type: 'fog' },
    { type: 'attack', playerDelta: 2, allianceDelta: 1 },
  ],
};
