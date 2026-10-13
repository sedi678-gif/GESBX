import type { CardEffectModule } from '../types';

export const usyanCard: CardEffectModule = {
  cardId: 'usyan',
  effects: [
    { type: 'rebellion' },
    { type: 'click_challenge', scale: 'double', target: 'own' },
    { type: 'steal', amount: 2 },
    { type: 'attack', playerDelta: 5, allianceDelta: 3 },
  ],
};
