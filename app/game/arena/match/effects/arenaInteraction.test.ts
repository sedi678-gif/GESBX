import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ARENA_JOKER_COPY_MAX_DEPTH,
  ARENA_REFLECT_MAX_DEPTH,
  canReflectAttack,
  pickJokerMimic,
  publicAuditCardId,
  qayaCounterOutcome,
  revealCasusCards,
  sanitizeSpyReveal,
  tikanliReplayAllowed,
} from './interaction';
import type { ArenaLastPlay } from './types';

function last(partial: Partial<ArenaLastPlay>): ArenaLastPlay {
  return {
    playerId: 'A',
    side: 'home',
    cardId: 'ogru',
    mode: null,
    damage: 100,
    hidden: false,
    cancelled: false,
    reflected: false,
    chain: 'ATTACK',
    reflectDepth: 0,
    ...partial,
  };
}

describe('arena interaction guards', () => {
  it('Güzgü yalnız 1 dəfə əks etdirir', () => {
    assert.equal(ARENA_REFLECT_MAX_DEPTH, 1);
    assert.equal(canReflectAttack(last({}), 'B'), true);
    assert.equal(canReflectAttack(last({ reflected: true }), 'B'), false);
    assert.equal(canReflectAttack(last({ chain: 'REFLECT', reflectDepth: 1 }), 'B'), false);
    assert.equal(canReflectAttack(last({ playerId: 'B' }), 'B'), false);
  });

  it('Daş Adam Güzgünü serverdə qırır', () => {
    const outcome = qayaCounterOutcome(last({ cardId: 'guzgu', playerId: 'B' }), 'A');
    assert.equal(outcome.breaksMirror, true);
    assert.equal(outcome.chain, 'CANCEL');
  });

  it('Joker joker kopyalamır', () => {
    assert.equal(ARENA_JOKER_COPY_MAX_DEPTH, 1);
    const mimic = pickJokerMimic('seed', ['joker', 'joker']);
    assert.ok(mimic);
    assert.notEqual(mimic, 'joker');
  });

  it('Casus Duman göstərmir', () => {
    assert.deepEqual(revealCasusCards(['duman', 'casus', 'qaya', 'guzgu']), ['casus', 'qaya', 'guzgu']);
    assert.deepEqual(sanitizeSpyReveal(['duman', 'duman', 'ogru']), ['ogru']);
  });

  it('Duman audit-də gizlidir', () => {
    assert.equal(publicAuditCardId('duman', false), 'hidden');
    assert.equal(publicAuditCardId('ogru', true), 'hidden');
    assert.equal(publicAuditCardId('ogru', false), 'ogru');
  });

  it('Tikanlı ikinci replay loop olmur', () => {
    assert.equal(
      tikanliReplayAllowed({
        lastCounterOk: true,
        countered: { playerId: 'A', cardId: 'ogru' },
        forcedReplay: { playerId: 'A', cardId: 'ogru' },
        lastPlay: last({ chain: 'REPLAY' }),
      }),
      false
    );
  });
});
