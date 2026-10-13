import { ARENA_SLOT_COUNT } from './config';
import { arenaCardMeta, arenaCardTitle, isArenaCardId, officialArenaCardCost } from './catalog';
import { remainingTurnSeconds, roleLabelAz, sideSlots, turnLabel } from './turnOrder';
import type { ArenaMatchState, ArenaPresenceState } from './types';
import type { ArenaHandCardView, ArenaSlotPlayer, ArenaViewModel } from '../types';
import { createPlaceholderArenaView } from '../placeholderView';
import { playerOnSide } from './reaction/policy';
import { sanitizeSpyReveal } from './effects/interaction';

function slotsFromMatch(
  match: ArenaMatchState,
  side: 'home' | 'away',
  presence: Record<string, ArenaPresenceState>
): Array<ArenaSlotPlayer | null> {
  const ids = sideSlots(match, side);
  const next: Array<ArenaSlotPlayer | null> = [];
  for (let i = 0; i < ARENA_SLOT_COUNT; i += 1) {
    const id = ids[i];
    if (!id) {
      next.push(null);
      continue;
    }
    const player = match.players[id];
    next.push({
      id,
      name: match.displayNames[id]?.trim() || id.slice(0, 8),
      role: player?.role ?? (i === 0 ? 'LIDER' : i === 1 ? 'HELP_LIDER' : i === 2 ? 'CLICKER' : 'MEMBER'),
      online: presence[id]?.online === true,
    });
  }
  return next;
}

function handFromMatch(match: ArenaMatchState, viewerPlayerId: string): ArenaHandCardView[] {
  const loadout = match.loadouts[viewerPlayerId];
  const energy = match.players[viewerPlayerId]?.energy ?? 0;
  if (!loadout) return [];
  return loadout.cards.map((card) => {
    const meta = isArenaCardId(card.cardId) ? arenaCardMeta(card.cardId) : null;
    const cost = officialArenaCardCost(card.cardId);
    const disabled = match.status !== 'active' || card.remaining <= 0 || energy < cost;
    return {
      id: card.cardId,
      title: meta?.title ?? card.cardId,
      image: meta?.image,
      emoji: meta?.emoji,
      energyCostLabel: `⚡ ${cost}`,
      remainingUsesLabel: `${card.remaining}/${card.maxUses}`,
      selected: false,
      disabled,
    };
  });
}

export function matchToArenaView(input: {
  match: ArenaMatchState;
  viewerPlayerId: string;
  serverNow: number;
  presence: Record<string, ArenaPresenceState>;
}): ArenaViewModel {
  const { match, viewerPlayerId, serverNow, presence } = input;
  const viewer = match.players[viewerPlayerId];
  const mode = match.gameMode === '1v1' ? '1v1' : '5v5';
  const energyCap = mode === '1v1' ? 35 : 30;
  const energy = viewer?.energy ?? energyCap;
  const seconds = remainingTurnSeconds(match.turnExpiresAt, serverNow);
  const base = createPlaceholderArenaView();
  const loadoutPhase = match.phase === 'loadout';
  const reaction = match.reaction;
  const click = reaction?.status === 'ACTIVE' ? reaction : null;
  const last = match.effects?.lastPlay;
  const hide = Boolean(last?.hidden && last.playerId !== viewerPlayerId);
  const viewerRole = match.players[viewerPlayerId]?.role;
  const modeLabel =
    click?.cardId === 'qutb'
      ? click.mode === 'ice'
        ? 'Buz'
        : 'Yanğın'
      : click?.cardId === 'felaket'
        ? click.mode === 'tsunami'
          ? 'Tsunami'
          : 'Zəlzələ'
        : click?.cardId === 'qul'
          ? 'Qul edən'
          : click?.cardId === 'usyan'
            ? 'Üsyan'
            : '';
  return {
    ...base,
    homeAllianceName: 'Sən',
    awayAllianceName: 'Rəqib',
    matchState: { statusLabel: loadoutPhase ? 'Kart seçimi' : match.status === 'active' ? 'Arena' : 'Nəticə' },
    timer: { label: loadoutPhase || serverNow <= 0 ? '--' : String(seconds) },
    energy: { label: `⚡ ${energy}/${energyCap}`, current: energy, max: energyCap },
    gameMode: mode,
    players: {
      home: slotsFromMatch(match, 'home', presence),
      away: slotsFromMatch(match, 'away', presence),
    },
    currentTurn: loadoutPhase
      ? null
      : {
          playerId: match.currentTurn,
          label: turnLabel(match),
        },
    cards: { hand: handFromMatch(match, viewerPlayerId) },
    clickEvent: {
      visible: Boolean(click),
      cardTitle: click ? arenaCardTitle(click.cardId) : 'Klik kartı',
      shareable: Boolean(click) && viewerRole === 'CLICKER' && !click?.chatForwarded,
      modeLabel,
      remainingSeconds: click ? remainingTurnSeconds(click.expiresAt, serverNow) : 0,
      currentClicks: click?.currentClicks ?? 0,
      requiredClicks: click?.requiredClicks ?? 0,
      canClick: Boolean(click && playerOnSide(match, viewerPlayerId, click.targetSide)),
      chatText: click?.chatText,
      reactionId: click?.reactionId,
    },
    effectLabel: hide ? 'Gizli kart' : match.effects?.lastSummary,
    doubleActive: match.effects?.pendingDoubleFor === viewerPlayerId,
    spyReveal: sanitizeSpyReveal(match.effects?.spyReveal?.[viewerPlayerId] ?? []),
  };
}

export { roleLabelAz };
