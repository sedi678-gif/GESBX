import { officialClickTarget } from '@/app/lib/battleClick/battleClickConfig';
import { isArenaClickCard } from '../effects/damage';
import { peakTenMinuteWindow } from '../effects/scoreHistory';
import { assertArenaMatchActive } from '../policy';
import type { ArenaMatchState, ArenaSide } from '../types';
import {
  getAllianceSizeTier,
  officialArenaRequiredClicks,
  officialReactionChatText,
  officialReactionDurationMs,
  type ArenaReactionStatus,
} from './config';
import type { ArenaReactionPending, ArenaReactionState } from './types';
import { applyArenaReactionOutcome } from './resolve';

function reject(message = 'REJECT'): never {
  throw new Error(message);
}

export function defendingSideForCard(attackerSide: ArenaSide, cardId: string): ArenaSide {
  const target = officialClickTarget(cardId);
  if (target === 'own') return attackerSide;
  return attackerSide === 'home' ? 'away' : 'home';
}

export function playerOnSide(match: ArenaMatchState, playerId: string, side: ArenaSide): boolean {
  const ids = side === 'home' ? match.homePlayerIds : match.awayPlayerIds;
  return ids.includes(playerId) || match.players[playerId]?.side === side;
}

export function createArenaReaction(input: {
  match: ArenaMatchState;
  playerId: string;
  cardId: string;
  mode: ArenaReactionState['mode'];
  actionId: string;
  serverNow: number;
  activeUsers: unknown;
  pending: ArenaReactionPending;
}): ArenaReactionState {
  const { match, playerId, cardId, serverNow } = input;
  assertArenaMatchActive(match);
  if (match.gameMode === '1v1') reject('REJECT');
  if (!isArenaClickCard(cardId)) reject('REJECT');
  const side = match.players[playerId]?.side;
  if (!side) reject('REJECT');
  const targetSide = defendingSideForCard(side, cardId);
  const requiredClicks = officialArenaRequiredClicks(cardId, input.activeUsers);
  if (requiredClicks < 1) reject('REJECT');
  const sourceAllianceId = side === 'home' ? match.homeAllianceId : match.awayAllianceId;
  const targetAllianceId = targetSide === 'home' ? match.homeAllianceId : match.awayAllianceId;
  return {
    active: true,
    reactionId: `rx_${input.actionId}`.slice(0, 64),
    matchId: match.matchId,
    sourcePlayerId: playerId,
    sourceAllianceId,
    targetAllianceId,
    targetSide,
    cardId,
    mode: input.mode,
    startedAt: serverNow,
    expiresAt: serverNow + officialReactionDurationMs(cardId, input.mode),
    durationMs: officialReactionDurationMs(cardId, input.mode),
    requiredClicks,
    currentClicks: 0,
    status: 'ACTIVE',
    sizeTier: getAllianceSizeTier(input.activeUsers),
    usedActionIds: {},
    clickers: {},
    pending: input.pending,
    chatForwarded: false,
    chatText: officialReactionChatText(cardId, input.mode),
  };
}

export function qulPendingPeak(match: ArenaMatchState, defenderSide: ArenaSide, serverNow: number) {
  return peakTenMinuteWindow(match.scoreHistory, defenderSide, serverNow);
}

export function assertArenaClickAllowed(input: {
  match: ArenaMatchState;
  playerId: string;
  reactionId: string;
  actionId: string;
  serverNow: number;
  extra?: Record<string, unknown>;
}): 'ok' | 'duplicate' {
  const { match, playerId, reactionId, actionId, serverNow } = input;
  assertArenaMatchActive(match);
  const reaction = match.reaction;
  if (!reaction || !reaction.active) reject('REJECT');
  if (reaction.reactionId !== reactionId) reject('REJECT');
  if (reaction.status !== 'ACTIVE') reject('REJECT');
  if (serverNow >= reaction.expiresAt) reject('REJECT');
  if (!actionId.trim()) reject('REJECT');
  if (reaction.usedActionIds[actionId]) reject('REJECT');
  if (!playerOnSide(match, playerId, reaction.targetSide)) reject('REJECT');
  if (reaction.currentClicks >= reaction.requiredClicks) reject('REJECT');
  if (input.extra && ('currentClicks' in input.extra || 'requiredClicks' in input.extra || 'success' in input.extra)) {
    /* client game values ignored; identity still validated */
  }
  return 'ok';
}

export function applyArenaClick(input: {
  match: ArenaMatchState;
  playerId: string;
  reactionId: string;
  actionId: string;
  serverNow: number;
}): ArenaMatchState {
  assertArenaClickAllowed(input);
  const reaction = input.match.reaction;
  if (!reaction) reject('REJECT');
  const currentClicks = reaction.currentClicks + 1;
  const status: ArenaReactionStatus = currentClicks >= reaction.requiredClicks ? 'SUCCESS' : 'ACTIVE';
  const next: ArenaMatchState = {
    ...input.match,
    reaction: {
      ...reaction,
      currentClicks,
      status,
      active: status === 'ACTIVE',
      usedActionIds: { ...reaction.usedActionIds, [input.actionId]: true },
      clickers: { ...reaction.clickers, [input.playerId]: true },
    },
    updatedAt: input.serverNow,
  };
  if (status === 'SUCCESS') {
    return applyArenaReactionOutcome(next, 'SUCCESS', input.serverNow);
  }
  return next;
}

export function assertArenaReactionExpireAllowed(match: ArenaMatchState, serverNow: number): void {
  assertArenaMatchActive(match);
  const reaction = match.reaction;
  if (!reaction || reaction.status !== 'ACTIVE') reject('REJECT');
  if (serverNow < reaction.expiresAt) reject('REJECT');
}

export function expireArenaReactionState(match: ArenaMatchState, serverNow: number): ArenaMatchState {
  assertArenaReactionExpireAllowed(match, serverNow);
  const reaction = match.reaction;
  if (!reaction) reject('REJECT');
  const failed = reaction.currentClicks < reaction.requiredClicks;
  const next: ArenaMatchState = {
    ...match,
    reaction: {
      ...reaction,
      active: false,
      status: failed ? 'EXPIRED' : 'SUCCESS',
    },
    updatedAt: serverNow,
  };
  return applyArenaReactionOutcome(next, failed ? 'EXPIRED' : 'SUCCESS', serverNow);
}

export function forwardArenaReactionChat(match: ArenaMatchState, playerId: string, serverNow: number): ArenaMatchState {
  assertArenaMatchActive(match);
  const reaction = match.reaction;
  if (!reaction || !reaction.active) reject('REJECT');
  if (match.players[playerId]?.role !== 'CLICKER') reject('REJECT');
  if (!playerOnSide(match, playerId, reaction.targetSide) && !playerOnSide(match, playerId, match.players[reaction.sourcePlayerId]?.side ?? 'home')) {
    reject('REJECT');
  }
  return {
    ...match,
    reaction: {
      ...reaction,
      chatForwarded: true,
      chatText: officialReactionChatText(reaction.cardId, reaction.mode),
    },
    updatedAt: serverNow,
  };
}
