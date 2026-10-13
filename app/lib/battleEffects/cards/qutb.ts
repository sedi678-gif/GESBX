import type { CardEffectModule } from '../types';

export const qutbCard: CardEffectModule = {
  cardId: 'qutb',
  effects: [
    { type: 'fire' },
    { type: 'ice', freezeMs: 600_000 },
    { type: 'click_challenge', scale: 'normal', target: 'opponent' },
    { type: 'attack', playerDelta: 5, allianceDelta: 3 },
  ],
};
