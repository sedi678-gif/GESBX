import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createMatchSnapshot } from './turnOrder';
import { toArenaHistoryEntry } from './history/view';
import {
  mergePublicTimeline,
  publicCardSummary,
  publicTimelineFromAudit,
  publicTimelineFromReaction,
} from './history/timeline';

function ids(...values: Array<string | null>): Array<string | null> {
  const next = [...values];
  while (next.length < 5) next.push(null);
  return next;
}

describe('arena stage 8 history', () => {
  it('does not treat an active match as history', () => {
    const match = createMatchSnapshot({
      matchId: 'm8',
      createdBy: 'h1',
      homePlayerIds: ids('h1'),
      awayPlayerIds: ids('a1'),
      serverNow: 1,
    });
    assert.equal(match.status, 'active');
    assert.equal(toArenaHistoryEntry(match, 'h1'), null);
  });

  it('hides Duman and hidden audit cards from the public timeline', () => {
    const events = publicTimelineFromAudit([
      {
        id: 'a1',
        data: {
          cardId: 'duman',
          effectType: 'Gizli kart',
          timestamp: 10,
          events: ['CARD_PLAYED', 'CARD_EFFECT_FINALIZED'],
        },
      },
      {
        id: 'a2',
        data: {
          cardId: 'hidden',
          effectType: 'Gizli kart',
          timestamp: 11,
          events: ['CARD_PLAYED'],
        },
      },
      {
        id: 'a3',
        data: {
          cardId: 'qaya',
          effectType: 'Blok',
          timestamp: 12,
          events: ['CARD_PLAYED', 'CARD_BLOCKED', 'COUNTER_PLAYED'],
        },
      },
    ]);
    assert.equal(events.some((event) => event.cardId === 'duman'), false);
    assert.equal(events.some((event) => event.label.toLowerCase().includes('duman')), false);
    assert.ok(events.some((event) => event.label === 'Gizli kart' && event.cardId == null));
    assert.ok(events.some((event) => event.kind === 'card_blocked' && event.cardId === 'qaya'));
  });

  it('maps reaction and completion events without internal fields', () => {
    const timeline = mergePublicTimeline(
      publicTimelineFromAudit([
        {
          id: 'fin',
          data: { effectType: 'BATTLE_COMPLETED', result: 'BATTLE_COMPLETED', timestamp: 40, cardId: '' },
        },
      ]),
      publicTimelineFromReaction([
        { id: 'r1', data: { type: 'reactionCreated', timestamp: 20, cardId: 'felaket' } },
        { id: 'r2', data: { type: 'clickReceived', timestamp: 21, cardId: 'felaket' } },
        { id: 'r3', data: { type: 'reactionExpired', timestamp: 30, cardId: 'felaket' } },
      ])
    );
    assert.deepEqual(
      timeline.map((event) => event.kind),
      ['reaction_started', 'reaction_failed', 'match_completed']
    );
    assert.equal(publicCardSummary(timeline).length, 0);
  });
});
