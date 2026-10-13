import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ARENA_ENERGY_MAX,
  ARENA_ENERGY_START,
  ARENA_TURN_DURATION_MS,
} from './config';
import {
  assertArenaActionAllowed,
  assertArenaTimeoutAllowed,
  assertEnergyUntouched,
  assertStartEnergy,
  rejectClientEnergyWrite,
} from './policy';
import { matchToArenaView } from './matchView';
import {
  advanceMatchTurn,
  createMatchSnapshot,
  filledTurnQueue,
  nextFilledSeat,
  remainingTurnSeconds,
} from './turnOrder';

function ids(...values: Array<string | null>): Array<string | null> {
  const next = [...values];
  while (next.length < 5) next.push(null);
  return next;
}

function matchWith(home: Array<string | null>, away: Array<string | null> = ids()) {
  return createMatchSnapshot({
    matchId: 'm1',
    createdBy: home.find(Boolean) || 'p1',
    homePlayerIds: ids(...home),
    awayPlayerIds: ids(...away),
    displayNames: {},
    serverNow: 1_000_000,
  });
}

function turnIds(home: Array<string | null>, steps: number): string[] {
  const seats = filledTurnQueue(ids(...home), ids());
  let seat = seats[0];
  const out = [seat.playerId];
  for (let i = 0; i < steps; i += 1) {
    seat = nextFilledSeat(seats, seat);
    out.push(seat.playerId);
  }
  return out;
}

describe('arena match energy + turn + timer', () => {
  it('TEST 1: 5 oyunçu → sıra Lider → Köməkçi → Kliker → Üzv → Üzv → Lider', () => {
    const order = turnIds(['L', 'H', 'C', 'M1', 'M2'], 5);
    assert.deepEqual(order, ['L', 'H', 'C', 'M1', 'M2', 'L']);
  });

  it('TEST 2: 4 oyunçu → boş slot keçilir', () => {
    const order = turnIds(['L', 'H', 'C', 'M1', null], 4);
    assert.deepEqual(order, ['L', 'H', 'C', 'M1', 'L']);
  });

  it('TEST 3: 3 oyunçu → boş slotlar keçilir', () => {
    const order = turnIds(['L', 'H', 'C', null, null], 3);
    assert.deepEqual(order, ['L', 'H', 'C', 'L']);
  });

  it('TEST 4: 2 oyunçu → yalnız 2 aktiv oyunçu növbələşir', () => {
    const order = turnIds(['L', 'H', null, null, null], 4);
    assert.deepEqual(order, ['L', 'H', 'L', 'H', 'L']);
  });

  it('TEST 5: 1 oyunçu → bütün mövcud rollar həmin oyunçudadır', () => {
    const order = turnIds(['solo', null, null, null, null], 3);
    assert.deepEqual(order, ['solo', 'solo', 'solo', 'solo']);
    const match = matchWith(['solo']);
    assert.equal(Object.keys(match.players).length, 1);
    assert.equal(match.players.solo.role, 'LIDER');
  });

  it('TEST 6: 15 saniyə bitir → server timeout edir və növbəti oyunçuya keçir', () => {
    const match = matchWith(['A', 'B']);
    assert.equal(match.currentTurn, 'A');
    assert.equal(match.turnExpiresAt, match.turnStartedAt + ARENA_TURN_DURATION_MS);
    assert.throws(() => assertArenaTimeoutAllowed(match, match.turnExpiresAt - 1));
    assert.doesNotThrow(() => assertArenaTimeoutAllowed(match, match.turnExpiresAt));
    const next = advanceMatchTurn(match, match.turnExpiresAt);
    assert.equal(next.currentTurn, 'B');
    assert.equal(next.turnIndex, match.turnIndex + 1);
    assert.equal(next.turnExpiresAt, match.turnExpiresAt + ARENA_TURN_DURATION_MS);
  });

  it('TEST 7: Player A növbəsində Player B action göndərir → reject', () => {
    const match = matchWith(['A', 'B']);
    assert.throws(
      () =>
        assertArenaActionAllowed({
          match,
          playerId: 'B',
          actionId: 'act-1',
          serverNow: match.turnStartedAt + 100,
        }),
      /REJECT/
    );
  });

  it('TEST 8: Player A eyni action-u iki dəfə göndərir → yalnız biri qəbul', () => {
    const match = matchWith(['A', 'B']);
    const first = assertArenaActionAllowed({
      match,
      playerId: 'A',
      actionId: 'act-1',
      serverNow: match.turnStartedAt + 100,
    });
    assert.equal(first, 'ok');
    const afterFirst = { ...match, lastActionId: 'act-1', lastActionTurnSeq: match.turnSeq };
    const dup = assertArenaActionAllowed({
      match: afterFirst,
      playerId: 'A',
      actionId: 'act-1',
      serverNow: match.turnStartedAt + 200,
    });
    assert.equal(dup, 'duplicate');
    assert.throws(
      () =>
        assertArenaActionAllowed({
          match: afterFirst,
          playerId: 'A',
          actionId: 'act-2',
          serverNow: match.turnStartedAt + 200,
        }),
      /REJECT/
    );
  });

  it('TEST 9: Client saatını dəyişmək timer həqiqətini poza bilməz', () => {
    const match = matchWith(['A']);
    const fakeDeviceNow = match.turnExpiresAt + 60_000;
    const serverNow = match.turnStartedAt + 3_000;
    assert.equal(remainingTurnSeconds(match.turnExpiresAt, serverNow), 12);
    assert.notEqual(remainingTurnSeconds(match.turnExpiresAt, serverNow), remainingTurnSeconds(match.turnExpiresAt, fakeDeviceNow));
    assert.equal(remainingTurnSeconds(match.turnExpiresAt, fakeDeviceNow), 0);
  });

  it('TEST 10: iki client eyni match-də eyni turn və timer görür', () => {
    const match = matchWith(['A', 'B']);
    const serverNow = match.turnStartedAt + 4_000;
    const viewA = matchToArenaView({ match, viewerPlayerId: 'A', serverNow, presence: {} });
    const viewB = matchToArenaView({ match, viewerPlayerId: 'B', serverNow, presence: {} });
    assert.equal(viewA.currentTurn?.playerId, viewB.currentTurn?.playerId);
    assert.equal(viewA.timer.label, viewB.timer.label);
    assert.equal(viewA.timer.label, '11');
  });

  it('TEST 11: Energy başlanğıcda bütün oyunçularda 30/30 olur', () => {
    const match = matchWith(['A', 'B', 'C']);
    assertStartEnergy(match.players);
    for (const player of Object.values(match.players)) {
      assert.equal(player.energy, ARENA_ENERGY_START);
      assert.equal(player.maxEnergy, ARENA_ENERGY_MAX);
    }
  });

  it('TEST 12: Client energy-ni dəyişməyə cəhd edir → qəbul olunmur', () => {
    const match = matchWith(['A']);
    const tampered = {
      ...match.players,
      A: { ...match.players.A, energy: 29 },
    };
    assert.throws(() => assertEnergyUntouched(match.players, tampered));
    assert.throws(() => rejectClientEnergyWrite());
  });
});
