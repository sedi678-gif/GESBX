import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BATTLE_FINISH_SCORE_WIN, BATTLE_FINISH_TURN_LIMIT } from '@/app/lib/battleFinish/battleFinishConfig';
import { assertArenaActionAllowed } from './policy';
import { createMatchSnapshot } from './turnOrder';
import {
  applyArenaMatchCompletion,
  buildArenaMatchResult,
  officialArenaFinalDamage,
  officialArenaFinishReason,
  officialArenaLeader,
} from './completion';

function ids(...values: Array<string | null>): Array<string | null> {
  const next = [...values];
  while (next.length < 5) next.push(null);
  return next;
}

function baseMatch(mode: '1v1' | '5v5' = '5v5') {
  return createMatchSnapshot({
    matchId: 'm7',
    createdBy: 'h1',
    homePlayerIds: ids('h1'),
    awayPlayerIds: ids('a1'),
    serverNow: 2_000_000,
    gameMode: mode,
    homeAllianceId: mode === '5v5' ? 'HA' : '',
    awayAllianceId: mode === '5v5' ? 'AA' : '',
  });
}

describe('arena stage 7 match completion', () => {
  it('does not finish while scores and turns are under the existing limits', () => {
    const match = { ...baseMatch(), sideScores: { home: 10, away: 8 }, turnIndex: BATTLE_FINISH_TURN_LIMIT };
    assert.equal(officialArenaFinishReason(match), null);
  });

  it('finishes from existing score win rule using authoritative sideScores', () => {
    const match = { ...baseMatch(), sideScores: { home: BATTLE_FINISH_SCORE_WIN, away: 12 } };
    assert.equal(officialArenaFinishReason(match), 'score_reached');
    const result = buildArenaMatchResult(match, 3_000_000);
    assert.equal(result.status, 'COMPLETED');
    assert.equal(result.resultId, 'm7_final');
    assert.equal(result.matchId, 'm7');
    assert.equal(result.winnerAllianceId, 'HA');
    assert.equal(result.loserAllianceId, 'AA');
    assert.equal(result.winnerPlayerId, null);
    assert.equal(result.loserPlayerId, null);
    assert.equal(result.winnerScore, BATTLE_FINISH_SCORE_WIN);
    assert.equal(result.loserScore, 12);
    assert.equal(result.finalDamage, officialArenaFinalDamage(match));
    assert.equal(result.completedAt, 3_000_000);
  });

  it('uses 1v1 player ids from the filled seats, not client input', () => {
    const match = {
      ...baseMatch('1v1'),
      sideScores: { home: 3, away: BATTLE_FINISH_SCORE_WIN },
    };
    const result = buildArenaMatchResult(match, 4_000_000);
    assert.equal(result.gameMode, '1v1');
    assert.equal(result.winnerAllianceId, null);
    assert.equal(result.loserAllianceId, null);
    assert.equal(result.winnerPlayerId, 'a1');
    assert.equal(result.loserPlayerId, 'h1');
    assert.equal(officialArenaLeader(match).winnerSide, 'away');
  });

  it('records DRAW when sideScores are equal after the turn limit', () => {
    const match = {
      ...baseMatch(),
      sideScores: { home: 20, away: 20 },
      turnIndex: BATTLE_FINISH_TURN_LIMIT + 1,
    };
    assert.equal(officialArenaFinishReason(match), 'turn_limit');
    const result = buildArenaMatchResult(match, 5_000_000);
    assert.equal(result.winnerAllianceId, null);
    assert.equal(result.loserAllianceId, null);
    assert.equal(result.winnerScore, 20);
    assert.equal(result.loserScore, 20);
  });

  it('finishes as draw when both sides reach the score cap', () => {
    const match = {
      ...baseMatch(),
      sideScores: { home: BATTLE_FINISH_SCORE_WIN, away: BATTLE_FINISH_SCORE_WIN },
    };
    assert.equal(officialArenaFinishReason(match), 'score_reached');
    const result = buildArenaMatchResult(match, 5_100_000);
    assert.equal(result.winnerAllianceId, null);
    assert.equal(result.winnerScore, BATTLE_FINISH_SCORE_WIN);
  });

  it('does not complete while a reaction is ACTIVE', () => {
    const match = baseMatch();
    const blocked = {
      ...match,
      sideScores: { home: BATTLE_FINISH_SCORE_WIN, away: 0 },
      reaction: {
        active: true,
        reactionId: 'rx',
        matchId: match.matchId,
        sourcePlayerId: 'h1',
        sourceAllianceId: 'HA',
        targetAllianceId: 'AA',
        targetSide: 'away' as const,
        cardId: 'felaket',
        mode: 'earthquake' as const,
        startedAt: 1,
        expiresAt: 2,
        durationMs: 15_000,
        requiredClicks: 3,
        currentClicks: 1,
        status: 'ACTIVE' as const,
        sizeTier: 'SMALL' as const,
        usedActionIds: {},
        clickers: {},
        pending: {
          kind: 'damage' as const,
          damage: 1,
          attackerId: 'h1',
          attackerSide: 'home' as const,
          defenderSide: 'away' as const,
          peak: null,
        },
        chatForwarded: false,
        chatText: '',
      },
    };
    assert.equal(officialArenaFinishReason(blocked), null);
    assert.throws(() => applyArenaMatchCompletion(blocked, 6_000_000));
  });

  it('locks the match and is idempotent', () => {
    const match = {
      ...baseMatch(),
      sideScores: { home: BATTLE_FINISH_SCORE_WIN, away: 1 },
    };
    const first = applyArenaMatchCompletion(match, 7_000_000);
    assert.equal(first.status, 'closed');
    assert.equal(first.result?.resultId, 'm7_final');
    const second = applyArenaMatchCompletion(first, 8_000_000);
    assert.equal(second.result?.completedAt, 7_000_000);
    assert.equal(second.result?.resultId, first.result?.resultId);
    assert.throws(() =>
      assertArenaActionAllowed({
        match: first,
        playerId: 'h1',
        actionId: 'x',
        serverNow: 7_000_001,
      })
    );
  });
});
