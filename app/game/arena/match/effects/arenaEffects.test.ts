import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { officialArenaDamage, validateArenaCardMode } from './damage';
import { resolveArenaCardEffect } from './engine';
import { peakTenMinuteWindow } from './scoreHistory';
import { applyArenaCardPlay, applyLockedLoadout, assertArenaLoadoutLockAllowed } from '../loadout';
import { createMatchSnapshot } from '../turnOrder';
import type { ArenaMatchState } from '../types';

const HOME = ['sehrbaz', '2x', 'ogru', 'qutb', 'joker'] as const;
const AWAY = ['duman', 'casus', 'qaya', 'guzgu', 'tikanli'] as const;

function ids(...values: Array<string | null>): Array<string | null> {
  const next = [...values];
  while (next.length < 5) next.push(null);
  return next;
}

function setup(home: string[], away: string[] = []): ArenaMatchState {
  let match: ArenaMatchState = {
    ...createMatchSnapshot({
      matchId: 'fx',
      createdBy: home[0],
      homePlayerIds: ids(...home),
      awayPlayerIds: ids(...away),
      serverNow: 1_000_000,
    }),
    phase: 'loadout',
  };
  const a = assertArenaLoadoutLockAllowed({ match, playerId: home[0], cardIds: [...HOME] });
  match = applyLockedLoadout(match, a, 1_000_000);
  if (away[0]) {
    const b = assertArenaLoadoutLockAllowed({ match, playerId: away[0], cardIds: [...AWAY] });
    match = applyLockedLoadout(match, b, 1_000_000);
  }
  return match;
}

function play(match: ArenaMatchState, playerId: string, cardId: string, extra?: { mode?: unknown; users?: number; id?: string }) {
  return applyArenaCardPlay({
    match,
    playerId,
    cardId,
    actionId: extra?.id ?? `a_${playerId}_${cardId}_${match.turnSeq}`,
    serverNow: match.turnStartedAt + 20,
    mode: extra?.mode,
    activeUsers: extra?.users ?? 10,
  });
}

describe('arena damage formula', () => {
  for (const [users, ogru, quake, fire, tsunami, strategic] of [
    [1, 10, 10, 10, 4, 2],
    [5, 50, 50, 50, 20, 10],
    [10, 100, 100, 100, 40, 20],
    [25, 250, 250, 250, 100, 50],
    [50, 500, 500, 500, 200, 100],
    [100, 500, 500, 500, 200, 100],
  ] as const) {
    it(`${users} user damage caps`, () => {
      assert.equal(officialArenaDamage({ cardId: 'ogru', activeUsers: users }), ogru);
      assert.equal(officialArenaDamage({ cardId: 'felaket', mode: 'earthquake', activeUsers: users }), quake);
      assert.equal(officialArenaDamage({ cardId: 'qutb', mode: 'fire', activeUsers: users }), fire);
      assert.equal(officialArenaDamage({ cardId: 'qutb', mode: 'ice', activeUsers: users }), ogru);
      assert.equal(officialArenaDamage({ cardId: 'felaket', mode: 'tsunami', activeUsers: users }), tsunami);
      assert.equal(officialArenaDamage({ cardId: 'sehrbaz', activeUsers: users }), strategic);
      assert.equal(officialArenaDamage({ cardId: '2x', activeUsers: users }), 0);
      assert.equal(officialArenaDamage({ cardId: 'qul', activeUsers: users }), 0);
      assert.equal(officialArenaDamage({ cardId: 'tikanli', activeUsers: users }), 0);
      assert.equal(officialArenaDamage({ cardId: 'usyan', activeUsers: users }), 0);
      assert.equal(officialArenaDamage({ cardId: 'qaya', activeUsers: users }), strategic);
      assert.equal(officialArenaDamage({ cardId: 'casus', activeUsers: users }), strategic);
      assert.equal(officialArenaDamage({ cardId: 'duman', activeUsers: users }), strategic);
      assert.equal(officialArenaDamage({ cardId: 'joker', activeUsers: users }), strategic);
      assert.equal(officialArenaDamage({ cardId: 'guzgu', activeUsers: users }), strategic);
    });
  }
});

describe('arena card mechanics', () => {
  it('Sehrbaz', () => {
    const match = setup(['A'], ['B']);
    const next = play(match, 'A', 'sehrbaz', { users: 10 });
    assert.equal(next.effects.lastPlay?.damage, 20);
    assert.equal(next.sideScores.home, 20);
    assert.ok(next.effects.lastSummary.includes('Sehrbaz'));
  });

  it('2X', () => {
    let match = setup(['A'], ['B']);
    match = play(match, 'A', '2x', { users: 10 });
    assert.equal(match.effects.pendingDoubleFor, 'A');
    assert.equal(match.effects.lastPlay?.damage, 0);
    match = play(match, 'B', 'casus', { users: 10 });
    match = play(match, 'A', 'ogru', { users: 10 });
    assert.equal(match.effects.lastPlay?.damage, 200);
  });

  it('Duman növbəti kartı gizlədir', () => {
    let match = setup(['A'], ['B']);
    match = play(match, 'A', 'sehrbaz', { users: 10 });
    match = play(match, 'B', 'duman', { users: 10 });
    assert.equal(match.effects.pendingHideNext, true);
    match = play(match, 'A', 'ogru', { users: 10 });
    assert.equal(match.effects.lastPlay?.hidden, true);
    assert.equal(match.effects.pendingHideNext, false);
  });

  it('Daş Adam', () => {
    let match = setup(['A'], ['B']);
    match = play(match, 'A', 'ogru', { users: 10 });
    match = play(match, 'B', 'qaya', { users: 10 });
    assert.equal(match.effects.lastPlay?.cancelled, true);
    assert.equal(match.effects.chain.at(-1)?.step, 'CANCEL');
  });

  it('Casus', () => {
    const match = play(setup(['A'], ['B']), 'A', 'joker', { users: 5 });
    const spy = resolveArenaCardEffect({
      match: setup(['A'], ['B']),
      playerId: 'A',
      cardId: 'casus',
      actionId: 'spy1',
      serverNow: 1_000_100,
      activeUsers: 10,
    });
    assert.ok(!spy.result.revealedCardIds.includes('duman'));
    assert.ok(spy.result.revealedCardIds.length <= 3);
    assert.equal(match.gameMode, '1v1');
  });

  it('Duman', () => {
    const fog = resolveArenaCardEffect({
      match: setup(['A'], ['B']),
      playerId: 'B',
      cardId: 'duman',
      actionId: 'fog',
      serverNow: 1_000_100,
      activeUsers: 10,
    });
    assert.equal(fog.result.hiddenFromOpponent, false);
    assert.equal(fog.match.effects.pendingHideNext, true);
    assert.equal(fog.result.damage, 20);
  });

  it('Joker', () => {
    const spy = resolveArenaCardEffect({
      match: setup(['A'], ['B']),
      playerId: 'A',
      cardId: 'joker',
      actionId: 'j1',
      serverNow: 1_000_100,
      activeUsers: 10,
    });
    assert.ok(spy.result.mimicCardId);
    assert.notEqual(spy.result.mimicCardId, 'joker');
  });

  it('Güzgü', () => {
    let match = setup(['A'], ['B']);
    match = play(match, 'A', 'ogru', { users: 10 });
    match = play(match, 'B', 'guzgu', { users: 10 });
    assert.equal(match.effects.chain.some((step) => step.step === 'REFLECT'), true);
  });

  it('Qul edən successful', () => {
    const qulHome = {
      ...setup(['A'], ['B']),
      scoreHistory: [{ at: 1_000_000 - 60_000, side: 'away' as const, score: 80 }],
    };
    const resolved = resolveArenaCardEffect({
      match: qulHome,
      playerId: 'A',
      cardId: 'qul',
      actionId: 'q1',
      serverNow: 1_000_100,
      activeUsers: 10,
    });
    assert.equal(resolved.result.slaveStatus, 'success');
    assert.ok((resolved.result.peak?.score ?? 0) >= 80);
  });

  it('Qul edən failed', () => {
    const resolved = resolveArenaCardEffect({
      match: setup(['A'], ['B']),
      playerId: 'A',
      cardId: 'qul',
      actionId: 'q0',
      serverNow: 1_000_100,
      activeUsers: 10,
    });
    assert.equal(resolved.result.slaveStatus, 'failed');
  });

  it('Tikanlı Məftil replay', () => {
    let match = setup(['A'], ['B']);
    match = play(match, 'A', 'ogru', { users: 10 });
    match = play(match, 'B', 'qaya', { users: 10 });
    const wired = resolveArenaCardEffect({
      match,
      playerId: 'B',
      cardId: 'tikanli',
      actionId: 'wire',
      serverNow: match.turnStartedAt + 20,
      activeUsers: 10,
    });
    assert.equal(wired.match.effects.forcedReplay?.cardId, 'ogru');
    assert.equal(wired.match.effects.forcedReplay?.remaining, 1);
  });

  it('Üsyan → Qul edən', () => {
    const match = setup(['A'], ['B']);
    const afterQul = resolveArenaCardEffect({
      match: {
        ...match,
        scoreHistory: [{ at: 940_000, side: 'away' as const, score: 40 }],
      },
      playerId: 'A',
      cardId: 'qul',
      actionId: 'q2',
      serverNow: 1_000_100,
      activeUsers: 5,
    });
    const afterUsyan = resolveArenaCardEffect({
      match: afterQul.match,
      playerId: 'B',
      cardId: 'usyan',
      actionId: 'u1',
      serverNow: 1_000_200,
      activeUsers: 5,
    });
    assert.equal(afterUsyan.result.summary.includes('Üsyan'), true);
    assert.ok((afterUsyan.result.peak?.score ?? 0) >= 40);
  });

  it('Oğru', () => {
    const next = play(setup(['A'], ['B']), 'A', 'ogru', { users: 25 });
    assert.equal(next.effects.lastPlay?.damage, 250);
  });

  it('Zəlzələ', () => {
    const next = play(setup(['A'], ['B']), 'A', 'qutb', { users: 10, mode: 'fire' });
    assert.equal(validateArenaCardMode('felaket', 'earthquake'), 'earthquake');
    const quake = resolveArenaCardEffect({
      match: setup(['A'], ['B']),
      playerId: 'A',
      cardId: 'felaket',
      actionId: 'eq',
      serverNow: 1_000_100,
      activeUsers: 10,
      mode: 'earthquake',
    });
    assert.equal(quake.result.damage, 100);
    assert.equal(quake.result.mode, 'earthquake');
    assert.equal(next.effects.lastPlay?.mode, 'fire');
  });

  it('Tsunami', () => {
    const wave = resolveArenaCardEffect({
      match: setup(['A'], ['B']),
      playerId: 'A',
      cardId: 'felaket',
      actionId: 'ts',
      serverNow: 1_000_100,
      activeUsers: 25,
      mode: 'tsunami',
    });
    assert.equal(wave.result.damage, 100);
    assert.equal(wave.result.mode, 'tsunami');
    assert.throws(() => validateArenaCardMode('felaket', 'fire'));
  });

  it('Yanğın', () => {
    const fire = resolveArenaCardEffect({
      match: setup(['A'], ['B']),
      playerId: 'A',
      cardId: 'qutb',
      actionId: 'fr',
      serverNow: 1_000_100,
      activeUsers: 50,
      mode: 'fire',
    });
    assert.equal(fire.result.damage, 500);
  });

  it('Buz', () => {
    const ice = resolveArenaCardEffect({
      match: setup(['A'], ['B']),
      playerId: 'A',
      cardId: 'qutb',
      actionId: 'ice',
      serverNow: 1_000_100,
      activeUsers: 50,
      mode: 'ice',
    });
    assert.equal(ice.result.damage, 500);
    assert.ok((ice.match.effects.frozenUntil.away ?? 0) > 1_000_100);
  });
});

describe('arena counters', () => {
  it('Daş Adam → Güzgü', () => {
    const afterMirror = resolveArenaCardEffect({
      match: play(setup(['A'], ['B']), 'A', 'ogru', { users: 5 }),
      playerId: 'B',
      cardId: 'guzgu',
      actionId: 'm1',
      serverNow: 1_000_200,
      activeUsers: 5,
    });
    const broken = resolveArenaCardEffect({
      match: afterMirror.match,
      playerId: 'A',
      cardId: 'qaya',
      actionId: 'st1',
      serverNow: 1_000_300,
      activeUsers: 5,
    });
    assert.equal(broken.result.chain === 'CANCEL' || broken.match.effects.lastPlay?.cancelled, true);
  });

  it('Casus → Duman gizlidir', () => {
    const spy = resolveArenaCardEffect({
      match: setup(['A'], ['B']),
      playerId: 'A',
      cardId: 'casus',
      actionId: 'cd',
      serverNow: 1_000_100,
      activeUsers: 5,
    });
    assert.equal(spy.result.revealedCardIds.includes('duman'), false);
  });

  it('peak window 10 dəqiqə / 60 dəqiqə', () => {
    const peak = peakTenMinuteWindow(
      [
        { at: 1_000_000 - 50 * 60_000, side: 'away' as const, score: 10 },
        { at: 1_000_000 - 8 * 60_000, side: 'away' as const, score: 30 },
        { at: 1_000_000 - 7 * 60_000, side: 'away' as const, score: 25 },
      ],
      'away',
      1_000_000
    );
    assert.ok(peak.score >= 55);
  });

  it('Güzgü reflect dərinliyi 1', () => {
    let match = play(setup(['A'], ['B']), 'A', 'ogru', { users: 10 });
    const first = resolveArenaCardEffect({
      match,
      playerId: 'B',
      cardId: 'guzgu',
      actionId: 'g1',
      serverNow: 1_000_200,
      activeUsers: 10,
    });
    assert.equal(first.result.chain, 'REFLECT');
    const second = resolveArenaCardEffect({
      match: first.match,
      playerId: 'A',
      cardId: 'guzgu',
      actionId: 'g2',
      serverNow: 1_000_300,
      activeUsers: 10,
    });
    assert.notEqual(second.result.chain, 'REFLECT');
  });

  it('Tikanli ikinci replay loop REJECT', () => {
    let match = setup(['A'], ['B']);
    match = play(match, 'A', 'ogru', { users: 10 });
    match = play(match, 'B', 'qaya', { users: 10 });
    const first = resolveArenaCardEffect({
      match,
      playerId: 'B',
      cardId: 'tikanli',
      actionId: 'w1',
      serverNow: match.turnStartedAt + 20,
      activeUsers: 10,
    });
    assert.throws(() =>
      resolveArenaCardEffect({
        match: first.match,
        playerId: 'B',
        cardId: 'tikanli',
        actionId: 'w2',
        serverNow: match.turnStartedAt + 40,
        activeUsers: 10,
      })
    );
  });

  it('Joker joker kopyalamır', () => {
    const result = resolveArenaCardEffect({
      match: setup(['A'], ['B']),
      playerId: 'A',
      cardId: 'joker',
      actionId: 'jj',
      serverNow: 1_000_100,
      activeUsers: 10,
    });
    assert.notEqual(result.result.mimicCardId, 'joker');
  });
});
