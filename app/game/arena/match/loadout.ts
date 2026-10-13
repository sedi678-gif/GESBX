import { ARENA_CARD_MAX_USES, ARENA_LOADOUT_SIZE, isArenaCardId, officialArenaCardCost } from './catalog';
import { ARENA_ENERGY_MAX } from './config';
import { resolveArenaCardEffect } from './effects/engine';
import { assertArenaMatchActive } from './policy';
import { advanceMatchTurn, filledTurnQueue } from './turnOrder';
import type { ArenaLoadoutCard, ArenaMatchState, ArenaPlayerLoadout } from './types';

function reject(message = 'REJECT'): never {
  throw new Error(message);
}

export function playerInMatch(match: ArenaMatchState, playerId: string): boolean {
  return Boolean(match.players[playerId]);
}

export function validateArenaLoadoutIds(rawIds: unknown): string[] {
  if (!Array.isArray(rawIds)) reject('Kart siyahısı yanlışdır');
  if (rawIds.length !== ARENA_LOADOUT_SIZE) reject('REJECT');
  const selected: string[] = [];
  const seen = new Set<string>();
  for (const raw of rawIds) {
    if (typeof raw !== 'string') reject('REJECT');
    const id = raw.trim();
    if (!isArenaCardId(id)) reject('REJECT');
    if (seen.has(id)) reject('REJECT');
    seen.add(id);
    selected.push(id);
  }
  return selected;
}

export function buildArenaLoadout(input: {
  playerId: string;
  matchId: string;
  cardIds: unknown;
}): ArenaPlayerLoadout {
  const cardIds = validateArenaLoadoutIds(input.cardIds);
  return {
    playerId: input.playerId,
    matchId: input.matchId,
    cards: cardIds.map((cardId) => ({
      cardId,
      maxUses: ARENA_CARD_MAX_USES,
      used: 0,
      remaining: ARENA_CARD_MAX_USES,
    })),
  };
}

export function clickerUsyanLoadout(playerId: string, matchId: string): ArenaPlayerLoadout {
  return {
    playerId,
    matchId,
    cards: [
      {
        cardId: 'usyan',
        maxUses: ARENA_CARD_MAX_USES,
        used: 0,
        remaining: ARENA_CARD_MAX_USES,
      },
    ],
  };
}

export function fillClickerUsyanLoadouts(match: ArenaMatchState): ArenaMatchState {
  const loadouts = { ...match.loadouts };
  let changed = false;
  for (const player of Object.values(match.players)) {
    if (player.role !== 'CLICKER') continue;
    if (loadouts[player.playerId]) continue;
    loadouts[player.playerId] = clickerUsyanLoadout(player.playerId, match.matchId);
    changed = true;
  }
  return changed ? { ...match, loadouts } : match;
}

export function assertArenaLoadoutLockAllowed(input: {
  match: ArenaMatchState;
  playerId: string;
  cardIds: unknown;
}): ArenaPlayerLoadout {
  const { match, playerId } = input;
  assertArenaMatchActive(match);
  if (match.phase !== 'loadout') reject('REJECT');
  if (!playerInMatch(match, playerId)) reject('REJECT');
  if (match.players[playerId]?.role === 'CLICKER') reject('REJECT');
  if (match.loadouts[playerId]) reject('REJECT');
  return buildArenaLoadout({ playerId, matchId: match.matchId, cardIds: input.cardIds });
}

export function allSeatedLoadoutsReady(match: ArenaMatchState): boolean {
  const seats = filledTurnQueue(match.homePlayerIds, match.awayPlayerIds);
  return seats.every((seat) => {
    if (match.players[seat.playerId]?.role === 'CLICKER') return true;
    return Boolean(match.loadouts[seat.playerId]);
  });
}

export function startArenaCombat(match: ArenaMatchState, serverNow: number): ArenaMatchState {
  const filled = fillClickerUsyanLoadouts(match);
  return {
    ...filled,
    phase: 'combat',
    turnStartedAt: serverNow,
    turnExpiresAt: serverNow + filled.turnDuration,
    lastActionId: null,
    lastActionTurnSeq: -1,
    updatedAt: serverNow,
  };
}

export function applyLockedLoadout(
  match: ArenaMatchState,
  loadout: ArenaPlayerLoadout,
  serverNow: number
): ArenaMatchState {
  const next = fillClickerUsyanLoadouts({
    ...match,
    loadouts: { ...match.loadouts, [loadout.playerId]: loadout },
    updatedAt: serverNow,
  });
  if (allSeatedLoadoutsReady(next)) {
    return startArenaCombat(next, serverNow);
  }
  return next;
}

function findLoadoutCard(cards: ArenaLoadoutCard[], cardId: string): ArenaLoadoutCard | undefined {
  return cards.find((card) => card.cardId === cardId);
}

export function assertArenaCardPlayAllowed(input: {
  match: ArenaMatchState;
  playerId: string;
  cardId: string;
  actionId: string;
  serverNow: number;
}): 'ok' | 'duplicate' {
  const { match, playerId, cardId, actionId, serverNow } = input;
  if (!match.matchId) reject('Match tapılmadı');
  assertArenaMatchActive(match);
  if (match.phase !== 'combat') reject('REJECT');
  if (!playerInMatch(match, playerId)) reject('REJECT');
  if (!actionId.trim()) reject('Action id yoxdur');
  if (match.usedActionIds[actionId]) return 'duplicate';
  const isClicker = match.players[playerId]?.role === 'CLICKER';
  if (isClicker && cardId !== 'usyan') reject('REJECT');
  if (!isClicker && match.currentTurn !== playerId) reject('REJECT');
  if (!isClicker && serverNow >= match.turnExpiresAt) reject('REJECT');
  if (!isClicker && match.lastActionTurnSeq === match.turnSeq) {
    if (match.lastActionId === actionId) return 'duplicate';
    reject('REJECT');
  }
  if (isClicker && match.lastActionId === actionId) return 'duplicate';
  const loadout = match.loadouts[playerId];
  if (!loadout) reject('REJECT');
  const forced = match.effects?.forcedReplay;
  if (forced && forced.playerId === playerId && forced.cardId !== cardId) reject('REJECT');
  const card = findLoadoutCard(loadout.cards, cardId);
  if (!card) reject('REJECT');
  if (card.remaining <= 0 || card.used >= card.maxUses) reject('REJECT');
  const cost = officialArenaCardCost(cardId);
  if (cost <= 0) reject('REJECT');
  const energy = match.players[playerId]?.energy ?? 0;
  if (energy < cost) reject('REJECT');
  return 'ok';
}

export function applyArenaCardPlay(input: {
  match: ArenaMatchState;
  playerId: string;
  cardId: string;
  actionId: string;
  serverNow: number;
  mode?: unknown;
  activeUsers?: unknown;
}): ArenaMatchState {
  const verdict = assertArenaCardPlayAllowed(input);
  if (verdict === 'duplicate') return input.match;

  const { match, playerId, cardId, actionId, serverNow } = input;
  const cost = officialArenaCardCost(cardId);
  const player = match.players[playerId];
  const nextEnergy = player.energy - cost;
  if (nextEnergy < 0 || nextEnergy > ARENA_ENERGY_MAX) reject('REJECT');

  const loadout = match.loadouts[playerId];
  const cards = loadout.cards.map((card) => {
    if (card.cardId !== cardId) return card;
    const used = card.used + 1;
    return {
      ...card,
      used,
      remaining: Math.max(0, card.maxUses - used),
      maxUses: ARENA_CARD_MAX_USES,
    };
  });

  const clickerUsyan = player.role === 'CLICKER' && cardId === 'usyan';
  const offTurnClicker = clickerUsyan && match.currentTurn !== playerId;
  const spent: ArenaMatchState = {
    ...match,
    players: {
      ...match.players,
      [playerId]: { ...player, energy: nextEnergy, maxEnergy: ARENA_ENERGY_MAX },
    },
    loadouts: {
      ...match.loadouts,
      [playerId]: { ...loadout, cards },
    },
    usedActionIds: { ...match.usedActionIds, [actionId]: true },
    lastActionId: actionId,
    lastActionTurnSeq: offTurnClicker ? match.lastActionTurnSeq : match.turnSeq,
    updatedAt: serverNow,
  };

  const resolved = resolveArenaCardEffect({
    match: spent,
    playerId,
    cardId,
    actionId,
    serverNow,
    activeUsers: input.activeUsers,
    mode: input.mode,
  });

  if (offTurnClicker) return resolved.match;
  return advanceMatchTurn(resolved.match, serverNow);
}

export function rejectClientLoadoutWrite(): never {
  throw new Error('Loadout client tərəfindən dəyişdirilə bilməz');
}

export function rejectClientCardUsageWrite(): never {
  throw new Error('Kart istifadə sayı client tərəfindən dəyişdirilə bilməz');
}

export function makeArenaActionId(): string {
  return `ac_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}
