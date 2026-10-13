import { MODEL_CARD_DEFS, modelCardImageUrl } from '@/app/components/alliance/modelCardsCatalog';
import type { ArenaViewModel } from './types';

export function createPlaceholderArenaView(): ArenaViewModel {
  return {
    homeAllianceName: 'Sən',
    awayAllianceName: 'Rəqib',
    matchState: { statusLabel: 'Arena' },
    timer: { label: '--:--' },
    energy: { label: '⚡ 30/30', current: 30, max: 30 },
    gameMode: '5v5',
    players: {
      away: [
        { id: 'away-1', name: 'Rəqib 1', role: 'LIDER', online: true },
        { id: 'away-2', name: 'Rəqib 2', role: 'HELP_LIDER', online: false },
        { id: 'away-3', name: 'Rəqib 3', role: 'CLICKER', online: true },
        { id: 'away-4', name: 'Rəqib 4', role: 'MEMBER', online: true },
        { id: 'away-5', name: 'Rəqib 5', role: 'MEMBER', online: true },
      ],
      home: [
        { id: 'home-1', name: 'Sən', role: 'LIDER', online: true },
        { id: 'home-2', name: 'Üzv 2', role: 'HELP_LIDER', online: true },
        { id: 'home-3', name: 'Üzv 3', role: 'CLICKER', online: false },
        { id: 'home-4', name: 'Üzv 4', role: 'MEMBER', online: true },
        { id: 'home-5', name: 'Üzv 5', role: 'MEMBER', online: true },
      ],
    },
    cards: {
      hand: MODEL_CARD_DEFS.slice(0, 5).map((def, index) => ({
        id: def.id,
        title: def.title,
        image: modelCardImageUrl(def),
        emoji: def.emoji,
        energyCostLabel: '--',
        remainingUsesLabel: '--',
        selected: index === 0,
      })),
    },
    activeCard: null,
    currentTurn: null,
    clickEvent: { visible: false, cardTitle: 'Klik kartı' },
  };
}
