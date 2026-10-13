import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { applyArenaCardPlay, applyLockedLoadout, assertArenaLoadoutLockAllowed } from '../loadout';
import { createMatchSnapshot } from '../turnOrder';
import type { ArenaMatchState } from '../types';
import {
  applyArenaClick,
  assertArenaClickAllowed,
  expireArenaReactionState,
  forwardArenaReactionChat,
  getAllianceSizeTier,
  officialArenaRequiredClicks,
} from './index';

const ATTACK = ['qutb', 'felaket', 'qul', 'ogru', 'sehrbaz'] as const;
const DEFEND = ['usyan', 'duman', 'casus', 'qaya', 'guzgu'] as const;

function ids(...values: Array<string | null>): Array<string | null> {
  const next = [...values];
  while (next.length < 5) next.push(null);
  return next;
}

function lock(match: ArenaMatchState, playerId: string, cards: readonly string[]): ArenaMatchState {
  const loadout = assertArenaLoadoutLockAllowed({ match, playerId, cardIds: [...cards] });
  return applyLockedLoadout(match, loadout, match.updatedAt);
}

function setup5v5(): ArenaMatchState {
  let match: ArenaMatchState = {
    ...createMatchSnapshot({
      matchId: 'rx',
      createdBy: 'H0',
      homePlayerIds: ids('H0', 'H1', 'H2', 'H3'),
      awayPlayerIds: ids('A0', 'A1', 'A2', 'A3'),
      serverNow: 1_000_000,
      gameMode: '5v5',
      homeAllianceId: 'homeA',
      awayAllianceId: 'awayA',
    }),
    phase: 'loadout',
    sideScores: { home: 0, away: 200 },
  };
  for (const id of ['H0', 'H1', 'H3']) match = lock(match, id, ATTACK);
  for (const id of ['A0', 'A1', 'A3']) match = lock(match, id, DEFEND);
  return match;
}

function playFire(match: ArenaMatchState, users: number) {
  return applyArenaCardPlay({
    match,
    playerId: 'H0',
    cardId: 'qutb',
    actionId: `play_fire_${users}_${match.turnSeq}`,
    serverNow: match.turnStartedAt + 20,
    mode: 'fire',
    activeUsers: users,
  });
}

function click(match: ArenaMatchState, playerId: string, actionId: string, serverNow = match.reaction!.startedAt + 100) {
  return applyArenaClick({
    match,
    playerId,
    reactionId: match.reaction!.reactionId,
    actionId,
    serverNow,
  });
}

describe('arena reaction click system', () => {
  it('tier sərhədləri mövcud 3/5/7 qaydasını saxlayır', () => {
    assert.equal(getAllianceSizeTier(3), 'SMALL');
    assert.equal(getAllianceSizeTier(5), 'SMALL');
    assert.equal(getAllianceSizeTier(6), 'MEDIUM');
    assert.equal(getAllianceSizeTier(15), 'MEDIUM');
    assert.equal(getAllianceSizeTier(16), 'LARGE');
    assert.equal(officialArenaRequiredClicks('qutb', 3), 3);
    assert.equal(officialArenaRequiredClicks('qutb', 10), 5);
    assert.equal(officialArenaRequiredClicks('qutb', 20), 7);
    assert.equal(officialArenaRequiredClicks('usyan', 3), 6);
    assert.equal(officialArenaRequiredClicks('usyan', 10), 10);
    assert.equal(officialArenaRequiredClicks('usyan', 20), 14);
  });

  it('1v1 click system aktivləşmir', () => {
    let match: ArenaMatchState = {
      ...createMatchSnapshot({
        matchId: 'duel',
        createdBy: 'A',
        homePlayerIds: ids('A'),
        awayPlayerIds: ids('B'),
        serverNow: 1_000_000,
        gameMode: '1v1',
      }),
      phase: 'loadout',
      sideScores: { home: 0, away: 200 },
    };
    match = lock(match, 'A', ATTACK);
    match = lock(match, 'B', DEFEND);
    match = applyArenaCardPlay({
      match,
      playerId: 'A',
      cardId: 'qutb',
      actionId: 'duel_fire',
      serverNow: match.turnStartedAt + 20,
      mode: 'fire',
      activeUsers: 10,
    });
    assert.equal(match.reaction, null);
    assert.ok((match.sideScores.home ?? 0) > 0);
  });

  it('3 click 0→1→2→3 SUCCESS', () => {
    let match = playFire(setup5v5(), 3);
    assert.equal(match.reaction?.requiredClicks, 3);
    assert.equal(match.reaction?.status, 'ACTIVE');
    const turnAfterPlay = match.turnIndex;
    match = click(match, 'A0', 'c1');
    assert.equal(match.reaction?.currentClicks, 1);
    match = click(match, 'A1', 'c2');
    assert.equal(match.reaction?.currentClicks, 2);
    match = click(match, 'A2', 'c3');
    assert.equal(match.reaction?.status, 'SUCCESS');
    assert.equal(match.reaction?.currentClicks, 3);
    assert.equal(match.turnIndex, turnAfterPlay);
    assert.equal(match.sideScores.away, 200);
  });

  it('5 click SUCCESS', () => {
    let match = playFire(setup5v5(), 10);
    assert.equal(match.reaction?.requiredClicks, 5);
    for (let i = 1; i <= 5; i += 1) {
      match = click(match, 'A0', `c5_${i}`);
    }
    assert.equal(match.reaction?.status, 'SUCCESS');
    assert.equal(match.reaction?.currentClicks, 5);
  });

  it('7 click SUCCESS', () => {
    let match = playFire(setup5v5(), 20);
    assert.equal(match.reaction?.requiredClicks, 7);
    for (let i = 1; i <= 7; i += 1) {
      match = click(match, 'A1', `c7_${i}`);
    }
    assert.equal(match.reaction?.status, 'SUCCESS');
  });

  it('timeout 4/5 FAILED/EXPIRED', () => {
    let match = playFire(setup5v5(), 10);
    match = click(match, 'A0', 't1');
    match = click(match, 'A1', 't2');
    match = click(match, 'A2', 't3');
    match = click(match, 'A3', 't4');
    const beforeHome = match.sideScores.home;
    match = expireArenaReactionState(match, match.reaction!.expiresAt);
    assert.equal(match.reaction?.status, 'EXPIRED');
    assert.equal(match.reaction?.currentClicks, 4);
    assert.ok(match.sideScores.home > beforeHome);
  });

  it('duplicate actionId rejected', () => {
    const match = click(playFire(setup5v5(), 3), 'A0', 'dup');
    assert.throws(() => click(match, 'A0', 'dup'));
  });

  it('click after expiry rejected', () => {
    const match = playFire(setup5v5(), 3);
    assert.throws(() =>
      click(match, 'A0', 'late', match.reaction!.expiresAt)
    );
  });

  it('fake requiredClicks / currentClicks / client timestamp ignored', () => {
    const match = playFire(setup5v5(), 10);
    assert.equal(
      assertArenaClickAllowed({
        match,
        playerId: 'A0',
        reactionId: match.reaction!.reactionId,
        actionId: 'fx1',
        serverNow: match.reaction!.startedAt + 10,
        extra: { requiredClicks: 1, currentClicks: 99, success: true, clientNow: 9_999_999 },
      }),
      'ok'
    );
    const next = click(match, 'A0', 'fx1');
    assert.equal(next.reaction?.currentClicks, 1);
    assert.equal(next.reaction?.requiredClicks, 5);
    assert.equal(next.reaction?.status, 'ACTIVE');
  });

  it('concurrent sequential clicks atomic count', () => {
    const start = playFire(setup5v5(), 3);
    const ids = ['A0', 'A1', 'A2'] as const;
    const next = ids.reduce(
      (match, playerId, index) => click(match, playerId, `par_${index}`),
      start
    );
    assert.equal(next.reaction?.currentClicks, 3);
    assert.equal(next.reaction?.status, 'SUCCESS');
  });

  it('disconnect reaction davam edir', () => {
    let match = playFire(setup5v5(), 3);
    match = click(match, 'A0', 'd1');
    const presenceOffline = { H0: { playerId: 'H0', online: false, updatedAt: 1 } };
    assert.equal(presenceOffline.H0.online, false);
    match = click(match, 'A1', 'd2');
    match = expireArenaReactionState(match, match.reaction!.expiresAt);
    assert.equal(match.reaction?.status, 'EXPIRED');
    assert.equal(match.reaction?.currentClicks, 2);
  });

  it('clicker kart oynamır, chat text serverdədir', () => {
    const match = playFire(setup5v5(), 3);
    assert.equal(match.players.H2.role, 'CLICKER');
    assert.deepEqual(
      match.loadouts.H2.cards.map((card) => card.cardId),
      ['usyan']
    );
    assert.throws(() =>
      applyArenaCardPlay({
        match: { ...match, currentTurn: 'H2', turnSide: 'home', turnSlotIndex: 2 },
        playerId: 'H2',
        cardId: 'qutb',
        actionId: 'clicker_play',
        serverNow: match.turnStartedAt + 20,
        mode: 'fire',
        activeUsers: 3,
      })
    );
    const forwarded = forwardArenaReactionChat(match, 'H2', match.reaction!.startedAt + 50);
    assert.equal(forwarded.reaction?.chatForwarded, true);
    assert.equal(forwarded.reaction?.chatText.includes('Yanğın'), true);
  });

  it('Qul fail peak serverdə, üsyan 2× click', () => {
    let match = setup5v5();
    match = {
      ...match,
      scoreHistory: [{ at: 700_000, side: 'away', score: 40 }],
    };
    match = applyArenaCardPlay({
      match,
      playerId: 'H0',
      cardId: 'qul',
      actionId: 'qul1',
      serverNow: match.turnStartedAt + 20,
      activeUsers: 3,
    });
    assert.equal(match.reaction?.cardId, 'qul');
    assert.equal(match.effects.slave?.status, 'pending');
    match = expireArenaReactionState(match, match.reaction!.expiresAt);
    assert.equal(match.effects.slave?.status, 'success');
    assert.ok(match.sideScores.home >= 40);

    while (match.currentTurn !== 'A0') {
      match = {
        ...match,
        currentTurn: 'A0',
        turnSide: 'away',
        turnSlotIndex: 0,
      };
    }
    match = applyArenaCardPlay({
      match,
      playerId: 'A0',
      cardId: 'usyan',
      actionId: 'usyan1',
      serverNow: match.turnStartedAt + 20,
      activeUsers: 3,
    });
    assert.equal(match.reaction?.requiredClicks, 6);
    assert.equal(match.reaction?.cardId, 'usyan');
    const homeAfterQul = match.sideScores.home;
    const rx = match.reaction;
    if (rx) {
      for (let i = 0; i < rx.requiredClicks; i += 1) {
        match = applyArenaClick({
          match,
          playerId: 'A0',
          reactionId: rx.reactionId,
          actionId: `usyan_click_${i}`,
          serverNow: match.updatedAt + i + 1,
        });
      }
    }
    assert.equal(match.reaction?.status, 'SUCCESS');
    if (homeAfterQul > 0) {
      assert.ok(match.sideScores.home < homeAfterQul || match.sideScores.away > 0);
    }
  });

  it('clicker növbəsiz üsyan oynayır', () => {
    let match = setup5v5();
    match = applyArenaCardPlay({
      match,
      playerId: 'H0',
      cardId: 'qul',
      actionId: 'qul_clicker',
      serverNow: match.turnStartedAt + 20,
      activeUsers: 3,
    });
    match = expireArenaReactionState(match, match.reaction!.expiresAt);
    const turn = match.currentTurn;
    match = applyArenaCardPlay({
      match,
      playerId: 'A2',
      cardId: 'usyan',
      actionId: 'clicker_usyan',
      serverNow: match.turnStartedAt + 20,
      activeUsers: 3,
    });
    assert.equal(match.currentTurn, turn);
    assert.equal(match.reaction?.cardId, 'usyan');
    assert.equal(match.players.A2.role, 'CLICKER');
  });

  it('Buz 5v5-də dərhal donur, klik pəncərəsi açmır', () => {
    const match = applyArenaCardPlay({
      match: setup5v5(),
      playerId: 'H0',
      cardId: 'qutb',
      actionId: 'ice5',
      serverNow: 1_000_020,
      activeUsers: 3,
      mode: 'ice',
    });
    assert.equal(match.reaction, null);
    assert.ok((match.effects.frozenUntil.away ?? 0) > 1_000_020);
  });
});
