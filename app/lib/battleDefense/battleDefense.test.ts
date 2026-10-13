import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { nextTurnState } from '@/app/lib/battlePlay/battlePlayConfig';
import type { BattleRecord } from '@/app/lib/battleEventLog/battleEventTypes';
import {
  BATTLE_DEFENSE_OFFLINE_MS,
  isDefenseOffline,
  officialDefenseAiPick,
  readStoredDefenseLoadout,
  validateDefenseLoadout,
} from './battleDefenseConfig';

const owned = { qaya: 1, duman: 1, ogru: 1, sehrbaz: 1, guzgu: 1, casus: 0 };

describe('offline defense', () => {
  it('keeps a real online defender in control', () => {
    const now = 100_000;
    assert.equal(isDefenseOffline(now - 1_000, now), false);
  });

  it('treats a stale defender as offline so AI may play', () => {
    const now = 100_000;
    assert.equal(isDefenseOffline(now - BATTLE_DEFENSE_OFFLINE_MS, now), true);
    assert.equal(isDefenseOffline(null, now), true);
  });

  it('stores at most five owned defense cards', () => {
    const ids = validateDefenseLoadout(['qaya', 'duman', 'ogru', 'sehrbaz', 'guzgu'], owned);
    assert.deepEqual(ids, ['qaya', 'duman', 'ogru', 'sehrbaz', 'guzgu']);
    assert.deepEqual(readStoredDefenseLoadout({ defenseLoadout: ids }), ids);
  });

  it('rejects a forged or unowned defense card', () => {
    assert.throws(() => validateDefenseLoadout(['fake-card'], owned), /hovuzunda yoxdur/);
    assert.throws(() => validateDefenseLoadout(['casus'], owned), /yoxdur/);
    assert.throws(() => validateDefenseLoadout(['qaya', 'qaya'], owned), /iki dəfə/);
    assert.throws(
      () => validateDefenseLoadout(['qaya', 'duman', 'ogru', 'sehrbaz', 'guzgu', 'usyan'], { ...owned, usyan: 1 }),
      /ən çox 5/
    );
  });

  it('picks only a snapshot card the energy and usage rules allow', () => {
    const picked = officialDefenseAiPick({
      cardIds: ['qaya', 'duman'],
      energy: 4,
      cardUsage: { qaya: 3 },
      serverNow: 1_000,
    });
    assert.equal(picked, 'duman');
    assert.equal(
      officialDefenseAiPick({
        cardIds: ['qaya'],
        energy: 2,
        cardUsage: {},
        serverNow: 1_000,
      }),
      null
    );
    assert.equal(
      officialDefenseAiPick({
        cardIds: ['duman'],
        energy: 20,
        cardUsage: { duman: 3 },
        serverNow: 1_000,
      }),
      null
    );
  });

  it('does not invent a card outside the snapshot', () => {
    assert.equal(
      officialDefenseAiPick({
        cardIds: ['not-a-card', 'qaya'],
        energy: 25,
        cardUsage: { qaya: 3 },
        serverNow: 1_000,
      }),
      null
    );
  });

  it('still runs the battle when no defender was seated', () => {
    assert.deepEqual(readStoredDefenseLoadout(null), []);
    const battle = {
      turn: 1,
      attackerPlayerIds: ['a1'],
      defenderPlayerIds: [],
    } as unknown as BattleRecord;
    const next = nextTurnState(battle, 'attacker');
    assert.equal(next.turnSide, 'attacker');
    assert.equal(next.turnPlayerId, 'a1');
  });

  it('returns the turn to a seated defender instead of skipping them', () => {
    const battle = {
      turn: 1,
      attackerPlayerIds: ['a1'],
      defenderPlayerIds: ['d1'],
    } as unknown as BattleRecord;
    const next = nextTurnState(battle, 'attacker');
    assert.equal(next.turnSide, 'defender');
    assert.equal(next.turnPlayerId, 'd1');
  });
});
