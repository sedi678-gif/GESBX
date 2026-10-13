import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { officialArenaCardCost } from './catalog';
import {
  applyArenaCardPlay,
  applyLockedLoadout,
  assertArenaCardPlayAllowed,
  assertArenaLoadoutLockAllowed,
  rejectClientCardUsageWrite,
  validateArenaLoadoutIds,
} from './loadout';
import { rejectClientEnergyWrite } from './policy';
import { createMatchSnapshot } from './turnOrder';
import type { ArenaMatchState } from './types';

const FIVE = ['sehrbaz', '2x', 'ogru', 'qutb', 'joker'] as const;

function ids(...values: Array<string | null>): Array<string | null> {
  const next = [...values];
  while (next.length < 5) next.push(null);
  return next;
}

function loadoutMatch(home: string[], phase: ArenaMatchState['phase'] = 'loadout'): ArenaMatchState {
  return {
    ...createMatchSnapshot({
      matchId: 'm1',
      createdBy: home[0],
      homePlayerIds: ids(...home),
      awayPlayerIds: ids(),
      serverNow: 1_000_000,
    }),
    phase,
  };
}

function armedSolo(): ArenaMatchState {
  const setup = loadoutMatch(['A'], 'loadout');
  const loadout = assertArenaLoadoutLockAllowed({ match: setup, playerId: 'A', cardIds: [...FIVE] });
  return applyLockedLoadout(setup, loadout, 1_000_000);
}

describe('arena loadout + card play', () => {
  it('TEST 1: 13 kartdan 5 kart seçilir → SUCCESS', () => {
    assert.deepEqual(validateArenaLoadoutIds([...FIVE]), [...FIVE]);
    const match = loadoutMatch(['A']);
    const loadout = assertArenaLoadoutLockAllowed({ match, playerId: 'A', cardIds: [...FIVE] });
    assert.equal(loadout.cards.length, 5);
    assert.equal(loadout.cards[0].remaining, 3);
  });

  it('TEST 2: 4 kart seçilir → REJECT', () => {
    assert.throws(() => validateArenaLoadoutIds(['sehrbaz', '2x', 'ogru', 'joker']), /REJECT/);
  });

  it('TEST 3: 6 kart seçilir → REJECT', () => {
    assert.throws(() => validateArenaLoadoutIds([...FIVE, 'duman']), /REJECT/);
  });

  it('TEST 4: Eyni kart iki dəfə seçilir → REJECT', () => {
    assert.throws(() => validateArenaLoadoutIds(['sehrbaz', '2x', 'ogru', 'joker', 'sehrbaz']), /REJECT/);
  });

  it('TEST 5: Seçilməmiş kart oynanılır → REJECT', () => {
    const match = armedSolo();
    assert.throws(
      () =>
        assertArenaCardPlayAllowed({
          match,
          playerId: 'A',
          cardId: 'duman',
          actionId: 'act-1',
          serverNow: match.turnStartedAt + 100,
        }),
      /REJECT/
    );
  });

  it('TEST 6: Kart 3 dəfə oynanılır → SUCCESS', () => {
    let match = armedSolo();
    match = applyArenaCardPlay({ match, playerId: 'A', cardId: 'ogru', actionId: 'a1', serverNow: match.turnStartedAt + 10 });
    match = applyArenaCardPlay({ match, playerId: 'A', cardId: 'ogru', actionId: 'a2', serverNow: match.turnStartedAt + 10 });
    match = applyArenaCardPlay({ match, playerId: 'A', cardId: 'ogru', actionId: 'a3', serverNow: match.turnStartedAt + 10 });
    const card = match.loadouts.A.cards.find((item) => item.cardId === 'ogru');
    assert.equal(card?.used, 3);
    assert.equal(card?.remaining, 0);
  });

  it('TEST 7: Kart 4-cü dəfə oynanılır → REJECT', () => {
    let match = armedSolo();
    match = applyArenaCardPlay({ match, playerId: 'A', cardId: 'ogru', actionId: 'a1', serverNow: match.turnStartedAt + 10 });
    match = applyArenaCardPlay({ match, playerId: 'A', cardId: 'ogru', actionId: 'a2', serverNow: match.turnStartedAt + 10 });
    match = applyArenaCardPlay({ match, playerId: 'A', cardId: 'ogru', actionId: 'a3', serverNow: match.turnStartedAt + 10 });
    assert.throws(
      () =>
        applyArenaCardPlay({
          match,
          playerId: 'A',
          cardId: 'ogru',
          actionId: 'a4',
          serverNow: match.turnStartedAt + 10,
        }),
      /REJECT/
    );
  });

  it('TEST 8: Energy kart cost-dan azdır → REJECT', () => {
    const match = armedSolo();
    match.players.A.energy = 4;
    const remaining = match.loadouts.A.cards.find((item) => item.cardId === 'sehrbaz')?.remaining;
    assert.throws(
      () =>
        applyArenaCardPlay({
          match,
          playerId: 'A',
          cardId: 'sehrbaz',
          actionId: 'low',
          serverNow: match.turnStartedAt + 10,
        }),
      /REJECT/
    );
    assert.equal(match.players.A.energy, 4);
    assert.equal(match.loadouts.A.cards.find((item) => item.cardId === 'sehrbaz')?.remaining, remaining);
  });

  it('TEST 9: Kart oynanır → energy serverdə azalır', () => {
    const match = armedSolo();
    const cost = officialArenaCardCost('sehrbaz');
    const next = applyArenaCardPlay({
      match,
      playerId: 'A',
      cardId: 'sehrbaz',
      actionId: 'e1',
      serverNow: match.turnStartedAt + 10,
    });
    assert.equal(next.players.A.energy, 30 - cost);
    assert.equal(match.players.A.energy, 30);
  });

  it('TEST 10: Kart oynanır → remainingUses serverdə 1 azalır', () => {
    const match = armedSolo();
    const next = applyArenaCardPlay({
      match,
      playerId: 'A',
      cardId: 'joker',
      actionId: 'u1',
      serverNow: match.turnStartedAt + 10,
    });
    assert.equal(next.loadouts.A.cards.find((item) => item.cardId === 'joker')?.remaining, 2);
    assert.equal(match.loadouts.A.cards.find((item) => item.cardId === 'joker')?.remaining, 3);
  });

  it('TEST 11: Player öz növbəsi olmadığı halda kart oynayır → REJECT', () => {
    const setup = loadoutMatch(['A', 'B'], 'loadout');
    const a = assertArenaLoadoutLockAllowed({ match: setup, playerId: 'A', cardIds: [...FIVE] });
    let match = applyLockedLoadout(setup, a, 1_000_000);
    const b = assertArenaLoadoutLockAllowed({
      match,
      playerId: 'B',
      cardIds: ['duman', 'casus', 'qaya', 'guzgu', 'usyan'],
    });
    match = applyLockedLoadout(match, b, 1_000_000);
    assert.equal(match.currentTurn, 'A');
    assert.throws(
      () =>
        applyArenaCardPlay({
          match,
          playerId: 'B',
          cardId: 'duman',
          actionId: 'b1',
          serverNow: match.turnStartedAt + 10,
        }),
      /REJECT/
    );
  });

  it('TEST 12: Turn timeout olduqdan sonra kart oynama request-i → REJECT', () => {
    const match = armedSolo();
    assert.throws(
      () =>
        applyArenaCardPlay({
          match,
          playerId: 'A',
          cardId: 'ogru',
          actionId: 'late',
          serverNow: match.turnExpiresAt,
        }),
      /REJECT/
    );
  });

  it('TEST 13: Eyni action request iki dəfə göndərilir → yalnız biri icra olunur', () => {
    const match = armedSolo();
    const first = applyArenaCardPlay({
      match,
      playerId: 'A',
      cardId: 'ogru',
      actionId: 'dup',
      serverNow: match.turnStartedAt + 10,
    });
    const second = applyArenaCardPlay({
      match: first,
      playerId: 'A',
      cardId: 'ogru',
      actionId: 'dup',
      serverNow: first.turnStartedAt + 10,
    });
    assert.equal(second.players.A.energy, first.players.A.energy);
    assert.equal(second.loadouts.A.cards.find((item) => item.cardId === 'ogru')?.used, 1);
  });

  it('TEST 14: Client saxta energy göndərir → server qəbul etmir', () => {
    const match = armedSolo();
    const next = applyArenaCardPlay({
      match,
      playerId: 'A',
      cardId: 'ogru',
      actionId: 'fake-e',
      serverNow: match.turnStartedAt + 10,
      energy: 1,
    } as never);
    assert.equal(next.players.A.energy, 30 - officialArenaCardCost('ogru'));
    assert.throws(() => rejectClientEnergyWrite());
  });

  it('TEST 15: Client saxta remainingUses göndərir → server qəbul etmir', () => {
    const match = armedSolo();
    const next = applyArenaCardPlay({
      match,
      playerId: 'A',
      cardId: 'ogru',
      actionId: 'fake-u',
      serverNow: match.turnStartedAt + 10,
      remainingUses: 0,
    } as never);
    assert.equal(next.loadouts.A.cards.find((item) => item.cardId === 'ogru')?.remaining, 2);
    assert.throws(() => rejectClientCardUsageWrite());
  });

  it('TEST 16: Battle başladıqdan sonra loadout dəyişdirilməyə çalışılır → REJECT', () => {
    const match = armedSolo();
    assert.equal(match.phase, 'combat');
    assert.throws(
      () =>
        assertArenaLoadoutLockAllowed({
          match,
          playerId: 'A',
          cardIds: ['duman', 'casus', 'qaya', 'guzgu', 'usyan'],
        }),
      /REJECT/
    );
  });
});
