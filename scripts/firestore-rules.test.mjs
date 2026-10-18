import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { after, before, test } from 'node:test';
import {
  assertFails,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, setDoc } from 'firebase/firestore';

let env;

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-gesbx-rules',
    firestore: {
      rules: await readFile(new URL('../firestore.rules', import.meta.url), 'utf8'),
    },
  });
});

after(async () => {
  await env?.cleanup();
});

test('signed-in clients cannot create arena reward records or reward events', async () => {
  const db = env.authenticatedContext('player-1').firestore();
  await assertFails(setDoc(doc(db, 'arena_rewards/reward-1'), { rewardId: 'reward-1' }));

  await env.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'arena_rewards/reward-1'), {
      rewardId: 'reward-1',
      recipientId: 'player-1',
      viewerIds: ['player-1'],
    });
  });
  await assertFails(setDoc(doc(db, 'arena_rewards/reward-1/reward_events/forged'), {
    type: 'REWARD_APPROVED',
    rewardId: 'reward-1',
  }));
});

test('signed-in clients cannot create weekly settlement receipts or events', async () => {
  const db = env.authenticatedContext('player-1').firestore();
  await assertFails(setDoc(doc(db, 'arena_reward_settlements/2026-10-12_AZ'), {
    settlementId: '2026-10-12_AZ',
    periodId: '2026-10-12',
    status: 'completed',
  }));

  await env.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'arena_reward_settlements/2026-10-12_AZ'), {
      settlementId: '2026-10-12_AZ',
    });
  });
  await assertFails(setDoc(doc(db, 'arena_reward_settlements/2026-10-12_AZ/reward_events/forged'), {
    type: 'REWARD_ALLOCATION_COMPLETED',
    rewardId: '2026-10-12_AZ',
  }));
});
