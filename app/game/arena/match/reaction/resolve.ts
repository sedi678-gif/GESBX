import { addOfficialScore, takeOfficialScore, BATTLE_SCORE_MAX } from '@/app/lib/battleScore/battleScoreConfig';
import type { ArenaMatchState, ArenaSide } from '../types';
import type { ArenaReactionState } from './types';
import { ARENA_ICE_FREEZE_MS } from './config';

const ARENA_TRANSFER_MAX = 3500;

function reject(message = 'REJECT'): never {
  throw new Error(message);
}

function grantScore(
  match: ArenaMatchState,
  toSide: ArenaSide,
  amount: number,
  serverNow: number
): ArenaMatchState {
  if (amount <= 0) return match;
  if ((match.effects?.frozenUntil?.[toSide] ?? 0) > serverNow) return match;
  const added = addOfficialScore(match.sideScores[toSide], amount, ARENA_TRANSFER_MAX);
  if (added > BATTLE_SCORE_MAX) reject('REJECT');
  return {
    ...match,
    sideScores: {
      ...match.sideScores,
      [toSide]: added,
    },
    scoreHistory: [
      ...match.scoreHistory,
      { at: serverNow, side: toSide, score: amount },
    ].slice(-120),
  };
}

function transferScore(
  match: ArenaMatchState,
  fromSide: ArenaSide,
  toSide: ArenaSide,
  amount: number,
  serverNow: number
): ArenaMatchState {
  if (amount <= 0) return match;
  const taken = takeOfficialScore(match.sideScores[fromSide], amount, ARENA_TRANSFER_MAX);
  const added = addOfficialScore(match.sideScores[toSide], taken.taken, ARENA_TRANSFER_MAX);
  if (added > BATTLE_SCORE_MAX) reject('REJECT');
  return {
    ...match,
    sideScores: {
      ...match.sideScores,
      [fromSide]: taken.next,
      [toSide]: added,
    },
    scoreHistory: [
      ...match.scoreHistory,
      { at: serverNow, side: toSide, score: taken.taken },
    ].slice(-120),
  };
}

export function applyArenaReactionOutcome(
  match: ArenaMatchState,
  status: 'SUCCESS' | 'FAILED' | 'EXPIRED',
  serverNow: number
): ArenaMatchState {
  const reaction = match.reaction;
  if (!reaction) reject('REJECT');
  const closed: ArenaReactionState = {
    ...reaction,
    active: false,
    status,
  };
  let next: ArenaMatchState = { ...match, reaction: closed, updatedAt: serverNow };
  const pending = reaction.pending;
  const effects = next.effects;

  if (pending.kind === 'damage') {
    if (status === 'SUCCESS') {
      next = {
        ...next,
        effects: { ...effects, lastSummary: 'Müdafiə klikləri uğurlu', clickEvent: null },
      };
      return next;
    }
    next = grantScore(next, pending.attackerSide, pending.damage, serverNow);
    const freezeIce =
      reaction.cardId === 'qutb' && reaction.mode === 'ice'
        ? {
            ...next.effects.frozenUntil,
            [pending.defenderSide]: serverNow + ARENA_ICE_FREEZE_MS,
          }
        : next.effects.frozenUntil ?? { home: 0, away: 0 };
    next = {
      ...next,
      effects: {
        ...next.effects,
        frozenUntil: freezeIce ?? { home: 0, away: 0 },
        lastSummary: reaction.mode === 'ice' ? 'Buz — 10 dəq xal donur' : 'Müdafiə klikləri uğursuz',
        clickEvent: null,
      },
    };
    return next;
  }

  if (pending.kind === 'qul') {
    const peak = pending.peak ?? { startAt: serverNow, score: 0 };
    if (status === 'SUCCESS') {
      next = {
        ...next,
        effects: {
          ...effects,
          slave: {
            attackerId: pending.attackerId,
            defenderSide: pending.defenderSide,
            peak,
            status: 'failed',
            at: serverNow,
          },
          lastSummary: 'Qul edən uğursuz',
          clickEvent: null,
        },
      };
      return next;
    }
    const steal = Math.min(ARENA_TRANSFER_MAX, peak.score);
    next = transferScore(next, pending.defenderSide, pending.attackerSide, steal, serverNow);
    next = {
      ...next,
      effects: {
        ...next.effects,
        slave: {
          attackerId: pending.attackerId,
          defenderSide: pending.defenderSide,
          peak,
          status: steal > 0 ? 'success' : 'failed',
          at: serverNow,
        },
        lastSummary: steal > 0 ? 'Qul edən uğurlu' : 'Qul edən uğursuz',
        clickEvent: null,
      },
    };
    return next;
  }

  if (pending.kind === 'usyan') {
    const peak = pending.peak ?? { startAt: serverNow, score: 0 };
    if (status !== 'SUCCESS') {
      next = {
        ...next,
        effects: { ...effects, lastSummary: 'Üsyan uğursuz', clickEvent: null },
      };
      return next;
    }
    const victimSide =
      pending.defenderSide === pending.attackerSide
        ? pending.attackerSide === 'home'
          ? 'away'
          : 'home'
        : pending.defenderSide;
    const boosted = Math.min(ARENA_TRANSFER_MAX, peak.score * 2);
    next = transferScore(next, victimSide, pending.attackerSide, boosted, serverNow);
    next = {
      ...next,
      effects: {
        ...next.effects,
        lastSummary: 'Üsyan 2X interval tətbiq etdi',
        clickEvent: null,
      },
    };
    return next;
  }

  return next;
}
