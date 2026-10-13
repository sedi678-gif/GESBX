import type { CardEffectModule } from '../types';

export const twoXCard: CardEffectModule = {
  cardId: '2x',
  effects: [{ type: 'attack', playerDelta: 8, allianceDelta: 4 }],
};
