import { ARENA_CARD_IDS } from '../catalog';
import { addOfficialScore, takeOfficialScore, BATTLE_SCORE_MAX } from '@/app/lib/battleScore/battleScoreConfig';
import type { ArenaMatchState, ArenaSide } from '../types';
import {
  isArenaDefenseClickCard,
  officialActiveUsers,
  officialArenaDamage,
  validateArenaCardMode,
  type ArenaCardMode,
} from './damage';
import { peakTenMinuteWindow } from './scoreHistory';
import { emptyArenaEffects, type ArenaChainStep, type ArenaEffectResult, type ArenaEffectState } from './types';
import { ARENA_ICE_FREEZE_MS } from '../reaction/config';
import { createArenaReaction, defendingSideForCard, qulPendingPeak } from '../reaction/policy';
import type { ArenaReactionPending } from '../reaction/types';
import {
  ARENA_REFLECT_MAX_DEPTH,
  arenaInteractionEvents,
  canReflectAttack,
  pickJokerMimic,
  qayaCounterOutcome,
  revealCasusCards,
  tikanliReplayAllowed,
} from './interaction';

const ARENA_TRANSFER_MAX = 3500;

function reject(message = 'REJECT'): never {
  throw new Error(message);
}

function opposite(side: ArenaSide): ArenaSide {
  return side === 'home' ? 'away' : 'home';
}

export function opponentPlayerId(match: ArenaMatchState, playerId: string): string | null {
  const side = match.players[playerId]?.side;
  if (!side) return null;
  const ids = side === 'home' ? match.awayPlayerIds : match.homePlayerIds;
  return ids.find((id): id is string => Boolean(id)) ?? null;
}

function pickStable(seed: string, items: string[]): string | null {
  if (!items.length) return null;
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return items[Math.abs(hash) % items.length] ?? null;
}

function effectsOf(match: ArenaMatchState): ArenaEffectState {
  return match.effects ?? emptyArenaEffects();
}

function grantScore(
  match: ArenaMatchState,
  toSide: ArenaSide,
  amount: number,
  serverNow: number
): ArenaMatchState {
  if (amount <= 0) return match;
  if ((effectsOf(match).frozenUntil[toSide] ?? 0) > serverNow) return match;
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

function replaceOpponentCard(
  match: ArenaMatchState,
  opponentId: string,
  seed: string
): { match: ArenaMatchState; replaced: ArenaEffectResult['replaced'] } {
  const loadout = match.loadouts[opponentId];
  if (!loadout) return { match, replaced: null };
  const owned = loadout.cards.map((card) => card.cardId);
  const pool = ARENA_CARD_IDS.filter((id) => !owned.includes(id));
  const from = pickStable(`${seed}:from`, owned);
  const to = pickStable(`${seed}:to`, pool);
  if (!from || !to) return { match, replaced: null };
  return {
    match: {
      ...match,
      loadouts: {
        ...match.loadouts,
        [opponentId]: {
          ...loadout,
          cards: loadout.cards.map((card) =>
            card.cardId === from ? { ...card, cardId: to, used: 0, remaining: card.maxUses } : card
          ),
        },
      },
    },
    replaced: { playerId: opponentId, from, to },
  };
}

function spyReveal(match: ArenaMatchState, opponentId: string, viewerId: string): { match: ArenaMatchState; ids: string[] } {
  const cards = revealCasusCards((match.loadouts[opponentId]?.cards ?? []).map((card) => card.cardId));
  const effects = effectsOf(match);
  return {
    ids: cards,
    match: {
      ...match,
      effects: {
        ...effects,
        spyReveal: { ...effects.spyReveal, [viewerId]: cards },
      },
    },
  };
}

function pushChain(effects: ArenaEffectState, step: ArenaChainStep, cardId: string, playerId: string): ArenaEffectState {
  return {
    ...effects,
    chain: [...effects.chain, { step, cardId, playerId }].slice(-40),
  };
}

export function resolveArenaCardEffect(input: {
  match: ArenaMatchState;
  playerId: string;
  cardId: string;
  actionId: string;
  serverNow: number;
  activeUsers: unknown;
  mode?: unknown;
}): { match: ArenaMatchState; result: ArenaEffectResult } {
  const { match, playerId, cardId, actionId, serverNow } = input;
  const side = match.players[playerId]?.side;
  if (!side) reject('REJECT');
  const mode = validateArenaCardMode(cardId, input.mode);
  const prior = effectsOf(match);
  const multiplier = prior.pendingDoubleFor === playerId && cardId !== '2x' ? 2 : 1;
  let resolvedCard = cardId;
  let mimicCardId: string | null = null;
  const opponentId = opponentPlayerId(match, playerId);

  if (cardId === 'joker') {
    const pool = (opponentId ? match.loadouts[opponentId]?.cards ?? [] : []).map((card) => card.cardId);
    mimicCardId = pickJokerMimic(`${actionId}:joker`, pool);
    if (mimicCardId && mimicCardId !== 'joker') {
      resolvedCard = mimicCardId;
    } else {
      mimicCardId = null;
    }
  }

  const mimicMode = resolvedCard !== cardId ? validateArenaCardMode(resolvedCard, null) : mode;
  const damage = officialArenaDamage({
    cardId: resolvedCard === cardId ? cardId : resolvedCard,
    mode: resolvedCard === cardId ? mode : mimicMode,
    activeUsers: input.activeUsers,
    multiplier,
  });
  const extra = cardId === 'joker' ? officialArenaDamage({ cardId: 'joker', activeUsers: input.activeUsers, multiplier }) : 0;
  const totalDamage =
    cardId === 'joker'
      ? Math.min(ARENA_TRANSFER_MAX, damage + extra)
      : officialArenaDamage({ cardId, mode, activeUsers: input.activeUsers, multiplier });

  const replayed = prior.forcedReplay?.playerId === playerId && prior.forcedReplay.cardId === cardId;
  let next = match;
  let chain: ArenaChainStep = 'ATTACK';
  const hiddenFromOpponent = prior.pendingHideNext;
  let replaced: ArenaEffectResult['replaced'] = null;
  let revealedCardIds: string[] = [];
  let peak = null as ArenaEffectResult['peak'];
  let slaveStatus: ArenaEffectResult['slaveStatus'] = null;
  let summary = '';
  const effectMode = resolvedCard === cardId ? mode : mimicMode;
  const effectCard = resolvedCard;
  const deferClick = match.gameMode !== '1v1' && isArenaDefenseClickCard(effectCard, effectMode);

  if (deferClick) {
    if (match.reaction?.status === 'ACTIVE') reject('REJECT');
    if (effectCard === 'usyan') {
      const slave = prior.slave;
      if (!slave || slave.attackerId === playerId) reject('REJECT');
      if (slave.status !== 'failed' && slave.status !== 'success') reject('REJECT');
    }
    const defenderSide = defendingSideForCard(side, effectCard);
    let pending: ArenaReactionPending;
    if (effectCard === 'qul') {
      peak = qulPendingPeak(next, defenderSide, serverNow);
      slaveStatus = 'pending';
      pending = {
        kind: 'qul',
        damage: 0,
        attackerId: playerId,
        attackerSide: side,
        defenderSide,
        peak,
      };
    } else if (effectCard === 'usyan') {
      peak = prior.slave ? { ...prior.slave.peak } : null;
      pending = {
        kind: 'usyan',
        damage: 0,
        attackerId: playerId,
        attackerSide: side,
        defenderSide,
        peak,
      };
    } else {
      pending = {
        kind: 'damage',
        damage: totalDamage,
        attackerId: playerId,
        attackerSide: side,
        defenderSide,
        peak: null,
      };
    }
    const reaction = {
      ...createArenaReaction({
        match: next,
        playerId,
        cardId: effectCard,
        mode: effectMode,
        actionId,
        serverNow,
        activeUsers: input.activeUsers,
        pending,
      }),
      ...(hiddenFromOpponent ? { chatText: '', chatForwarded: false } : {}),
    };
    summary =
      effectCard === 'felaket'
        ? effectMode === 'tsunami'
          ? 'Tsunami — müdafiə klikləri'
          : 'Zəlzələ — müdafiə klikləri'
        : effectCard === 'qul'
          ? 'Qul edən — müdafiə klikləri'
          : effectCard === 'usyan'
            ? 'Üsyan — müdafiə klikləri'
            : 'Yanğın — müdafiə klikləri';
    next = {
      ...next,
      reaction,
      effects: {
        ...pushChain(prior, 'ATTACK', effectCard, playerId),
        clickEvent: hiddenFromOpponent
          ? null
          : {
              cardId: effectCard,
              mode: effectMode,
              playerId,
              createdAt: serverNow,
              sharedToChat: false,
            },
        slave:
          effectCard === 'qul'
            ? {
                attackerId: playerId,
                defenderSide,
                peak: peak ?? { startAt: serverNow, score: 0 },
                status: 'pending',
                at: serverNow,
              }
            : prior.slave,
        lastSummary: summary,
      },
    };
  } else if (cardId === '2x') {
    next = {
      ...next,
      effects: { ...pushChain(prior, 'ATTACK', cardId, playerId), pendingDoubleFor: playerId, lastSummary: '2X aktivdir' },
    };
    summary = '2X aktivdir';
  } else if (cardId === 'qaya') {
    const last = prior.lastPlay;
    const outcome = qayaCounterOutcome(last, playerId);
    const breaksMirror = outcome.breaksMirror;
    const cancels = outcome.cancels;
    chain = outcome.chain;
    if (cancels && last && last.damage > 0 && !last.reflected) {
      next = transferScore(next, last.side, side, last.damage, serverNow);
    }
    next = {
      ...next,
      effects: {
        ...pushChain(effectsOf(next), chain, cardId, playerId),
        lastCounterOk: cancels || breaksMirror,
        countered: last && last.playerId !== playerId ? { playerId: last.playerId, cardId: last.cardId } : prior.countered,
        lastPlay: last ? { ...last, cancelled: true } : null,
        lastSummary: breaksMirror ? 'Daş Adam güzgünü qırdı' : cancels ? 'Daş Adam kartı blokladı' : 'Daş Adam',
      },
    };
    summary = next.effects.lastSummary;
    next = grantScore(next, side, totalDamage, serverNow);
  } else if (cardId === 'guzgu') {
    const last = prior.lastPlay;
    const canReflect = canReflectAttack(last, playerId);
    chain = canReflect ? 'REFLECT' : 'ATTACK';
    if (canReflect && last) {
      next = transferScore(next, last.side, side, last.damage, serverNow);
      next = {
        ...next,
        effects: {
          ...pushChain(effectsOf(next), 'REFLECT', cardId, playerId),
          lastPlay: { ...last, reflected: true, cancelled: true },
          lastSummary: 'Güzgü hücumu əks etdirdi',
        },
      };
      summary = 'Güzgü hücumu əks etdirdi';
    }
    next = grantScore(next, side, totalDamage, serverNow);
  } else if (cardId === 'tikanli') {
    const countered = prior.countered;
    if (
      !countered ||
      !tikanliReplayAllowed({
        lastCounterOk: prior.lastCounterOk,
        countered,
        forcedReplay: prior.forcedReplay,
        lastPlay: prior.lastPlay,
      })
    ) {
      reject('REJECT');
    }
    const forcedCard = countered.cardId;
    const target = countered.playerId;
    chain = 'REPLAY';
    next = {
      ...next,
      effects: {
        ...pushChain(prior, 'REPLAY', cardId, playerId),
        forcedReplay: { playerId: target, cardId: forcedCard, remaining: 1, ownerSide: side },
        lastCounterOk: false,
        lastSummary: 'Tikanlı Məftil 1 replay + 50% xal',
      },
    };
    summary = 'Tikanlı Məftil 1 replay + 50% xal';
  } else if (cardId === 'ogru' || resolvedCard === 'ogru') {
    next = transferScore(next, opposite(side), side, totalDamage, serverNow);
    summary = 'Oğru oğurladı';
  } else if (resolvedCard === 'sehrbaz' || cardId === 'sehrbaz') {
    if (opponentId) {
      const swapped = replaceOpponentCard(next, opponentId, actionId);
      next = swapped.match;
      replaced = swapped.replaced;
    }
    next = grantScore(next, side, totalDamage, serverNow);
    summary = replaced ? `Sehrbaz ${replaced.from} → ${replaced.to}` : 'Sehrbaz';
  } else if (resolvedCard === 'casus' || cardId === 'casus') {
    if (opponentId) {
      const spy = spyReveal(next, opponentId, playerId);
      next = spy.match;
      revealedCardIds = spy.ids;
    }
    next = grantScore(next, side, totalDamage, serverNow);
    summary = `Casus ${revealedCardIds.length} kart göstərdi`;
  } else if (cardId === 'qul' || resolvedCard === 'qul') {
    const defSide = opposite(side);
    peak = peakTenMinuteWindow(next.scoreHistory, defSide, serverNow);
    slaveStatus = peak.score > 0 ? 'success' : 'failed';
    if (slaveStatus === 'success') {
      next = transferScore(next, defSide, side, Math.min(ARENA_TRANSFER_MAX, peak.score), serverNow);
    }
    next = {
      ...next,
      effects: {
        ...pushChain(effectsOf(next), 'ATTACK', 'qul', playerId),
        slave: {
          attackerId: playerId,
          defenderSide: defSide,
          peak,
          status: slaveStatus,
          at: serverNow,
        },
        lastSummary: slaveStatus === 'success' ? 'Qul edən uğurlu' : 'Qul edən uğursuz',
      },
    };
    summary = next.effects.lastSummary;
  } else if (cardId === 'usyan' || resolvedCard === 'usyan') {
    const slave = prior.slave;
    if (!slave || slave.attackerId === playerId) reject('REJECT');
    if (slave.status !== 'failed' && slave.status !== 'success') reject('REJECT');
    const boosted = Math.min(ARENA_TRANSFER_MAX, slave.peak.score * 2);
    next = transferScore(next, opposite(side), side, boosted, serverNow);
    peak = { ...slave.peak, score: boosted };
    summary = 'Üsyan 2X interval tətbiq etdi';
  } else {
    next = grantScore(next, side, totalDamage, serverNow);
    summary =
      cardId === 'duman'
        ? 'Duman növbəti kartı gizlədir'
        : cardId === 'felaket'
            ? mode === 'tsunami'
              ? 'Tsunami'
              : 'Zəlzələ'
            : cardId === 'qutb'
              ? mode === 'ice'
                ? 'Buz'
                : 'Yanğın'
              : cardId;
  }

  if (replayed && prior.forcedReplay && prior.forcedReplay.ownerSide !== side && totalDamage > 0) {
    next = transferScore(next, side, prior.forcedReplay.ownerSide, Math.floor(totalDamage * 0.5), serverNow);
  }

  if (effectCard === 'qutb' && effectMode === 'ice' && !deferClick) {
    next = {
      ...next,
      effects: {
        ...effectsOf(next),
        frozenUntil: {
          ...effectsOf(next).frozenUntil,
          [opposite(side)]: serverNow + ARENA_ICE_FREEZE_MS,
        },
        lastSummary: summary || 'Buz — 10 dəq xal donur',
      },
    };
    summary = next.effects.lastSummary;
  }

  const clickEvent =
    hiddenFromOpponent || match.gameMode === '1v1'
      ? null
      : isArenaDefenseClickCard(effectCard, effectMode)
        ? {
            cardId: effectCard,
            mode: effectMode,
            playerId,
            createdAt: serverNow,
            sharedToChat: false,
          }
        : effectsOf(next).clickEvent;

  const lastPlay = {
    playerId,
    side,
    cardId,
    mode,
    damage: totalDamage,
    hidden: hiddenFromOpponent,
    cancelled: chain === 'CANCEL',
    reflected: chain === 'REFLECT',
    chain,
    reflectDepth: chain === 'REFLECT' ? ARENA_REFLECT_MAX_DEPTH : 0,
  };

  const lastEvents = arenaInteractionEvents({
    cardId,
    chain,
    mimicCardId,
    replayed,
    replayRequired: cardId === 'tikanli',
    hidden: hiddenFromOpponent,
  });

  const replayLeft = prior.forcedReplay;
  const nextForced =
    cardId === 'tikanli'
      ? effectsOf(next).forcedReplay
      : replayLeft && replayLeft.playerId === playerId && replayLeft.cardId === cardId
        ? replayLeft.remaining > 1
          ? { ...replayLeft, remaining: replayLeft.remaining - 1 }
          : null
        : replayLeft;

  const effects: ArenaEffectState = {
    ...effectsOf(next),
    pendingDoubleFor:
      cardId === '2x'
        ? playerId
        : cardId === 'qaya' && prior.lastPlay && prior.lastPlay.playerId === prior.pendingDoubleFor
          ? null
          : prior.pendingDoubleFor === playerId
            ? null
            : prior.pendingDoubleFor,
    pendingHideNext: cardId === 'duman' || effectCard === 'duman',
    lastPlay,
    lastCounterOk: cardId === 'qaya' ? effectsOf(next).lastCounterOk : cardId === 'tikanli' ? false : prior.lastCounterOk,
    countered: cardId === 'qaya' ? effectsOf(next).countered : cardId === 'tikanli' ? null : prior.countered,
    forcedReplay: nextForced,
    jokerMimic: mimicCardId,
    clickEvent,
    lastSummary: summary || effectsOf(next).lastSummary,
    lastEvents,
    chain: pushChain(effectsOf(next), chain, cardId, playerId).chain,
  };

  const result: ArenaEffectResult = {
    cardId,
    mode,
    effectType: mimicCardId ? `joker:${mimicCardId}` : cardId,
    damage: totalDamage,
    multiplier,
    chain,
    mimicCardId,
    revealedCardIds,
    replaced,
    hiddenFromOpponent,
    peak,
    slaveStatus,
    clickEvent,
    summary: effects.lastSummary,
  };

  return { match: { ...next, effects }, result };
}

export function serverActiveUsers(match: ArenaMatchState, presence: Record<string, { online?: boolean }>, side: ArenaSide): number {
  const ids = side === 'home' ? match.homePlayerIds : match.awayPlayerIds;
  const seated = ids.filter((id): id is string => Boolean(id));
  if (!seated.length) return 1;
  const online = seated.filter((id) => presence[id]?.online !== false).length;
  return officialActiveUsers(online || seated.length);
}

export type { ArenaCardMode };
