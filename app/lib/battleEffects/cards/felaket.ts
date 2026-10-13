import type { CardEffectModule } from '../types';

export const felaketCard: CardEffectModule = {
  cardId: 'felaket',
  effects: [
    { type: 'earthquake' },
    { type: 'tsunami' },
    { type: 'click_challenge', scale: 'normal', target: 'opponent' },
    { type: 'attack', playerDelta: 6, allianceDelta: 4 },
  ],
};
