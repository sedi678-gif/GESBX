import { readFile } from 'node:fs/promises';
import { after, before, test } from 'node:test';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';

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

test('clients cannot create or rewrite alliance membership documents', async () => {
  const db = env.authenticatedContext('player-1').firestore();
  await assertFails(setDoc(doc(db, 'alliances/forged'), {
    name: 'Forged', leaderId: 'player-1', members: ['player-1'], score: 50,
  }));

  await env.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'alliances/real'), {
      name: 'Real', leaderId: 'owner', members: ['owner'], score: 50,
    });
  });
  await assertFails(updateDoc(doc(db, 'alliances/real'), {
    leaderId: 'player-1', members: ['player-1'],
  }));
});

test('only alliance leader or promoted assistant can create a map battle', async () => {
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, 'alliances/attacker'), {
      leaderId: '1', members: ['1', '2', '3'], assistantLeaderIds: ['2'],
    });
    await setDoc(doc(db, 'alliances/defender'), { leaderId: '4', members: ['4'] });
    for (const id of ['1', '2', '3']) {
      await setDoc(doc(db, `players/${id}`), { allianceId: 'attacker' });
    }
  });

  const createBattle = (uid, playerId) => setDoc(
    doc(env.authenticatedContext(uid).firestore(), `battles/test-${playerId}`),
    {
      createdBy: playerId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      status: 'joining',
      eventSeq: 1,
      participantIds: [playerId],
      schemaVersion: 1,
      kind: 'alliance_map',
      attackerAllianceId: 'attacker',
      defenderAllianceId: 'defender',
      attackerAllianceName: 'A',
      defenderAllianceName: 'B',
      attackerPlayerIds: [playerId],
      defenderPlayerIds: [],
      attackerUids: [uid],
      defenderUids: [],
      joinDurationMs: 15000,
      attackerScore: 0,
      defenderScore: 0,
      scoreVersion: 0,
      lastScoreRequestId: null,
    },
  );

  await assertSucceeds(createBattle('leader-uid', '1'));
  await assertSucceeds(createBattle('assistant-uid', '2'));
  await assertFails(createBattle('member-uid', '3'));
});

test('authenticated clients can read alliance attacks but cannot write them directly', async () => {
  await env.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'alliance_attacks/attack-1'), {
      attackerAllianceId: 'alliance-1', defenderAllianceId: 'alliance-2', status: 'active',
    });
  });
  const db = env.authenticatedContext('player-1').firestore();
  await assertSucceeds(getDoc(doc(db, 'alliance_attacks/attack-1')));
  await assertFails(setDoc(doc(db, 'alliance_attacks/forged'), {
    attackerAllianceId: 'alliance-1', defenderAllianceId: 'alliance-2', damage: 999999,
  }));
  await assertFails(updateDoc(doc(db, 'alliance_attacks/attack-1'), { damage: 0 }));
  await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'alliance_attacks/attack-1')));
});

test('anonymous clients cannot read player records', async () => {
  const db = env.unauthenticatedContext().firestore();
  await assertFails(getDoc(doc(db, 'players/player-1')));
});

test('legacy Zego config with possible credentials is not readable; public config is', async () => {
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, 'app_config/zego'), { appId: 1347665418, serverSecret: 'must-not-be-public' });
    await setDoc(doc(db, 'app_config/zego_public'), { appId: 1347665418 });
  });
  const db = env.authenticatedContext('player-1').firestore();
  await assertFails(getDoc(doc(db, 'app_config/zego')));
  await assertSucceeds(getDoc(doc(db, 'app_config/zego_public')));
});

test('alliance chat is readable only while the Firebase UID is an alliance member', async () => {
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, 'users/player-1'), { firebaseUid: 'member-uid', id: 'player-1' });
    await setDoc(doc(db, 'players/player-1'), { firebaseUid: 'member-uid', allianceId: 'alliance-1' });
    await setDoc(doc(db, 'alliances/alliance-1'), { leaderId: 'player-1', members: ['player-1'] });
    await setDoc(doc(db, 'alliance_members/alliance-1/members/member-uid'), { playerId: 'player-1' });
    await setDoc(doc(db, 'alliance_chat/message-1'), {
      allianceId: 'alliance-1', userId: 'player-1', text: 'test',
    });
  });

  const memberDb = env.authenticatedContext('member-uid').firestore();
  const nonMemberDb = env.authenticatedContext('other-uid').firestore();
  await assertSucceeds(getDoc(doc(memberDb, 'alliance_chat/message-1')));
  await assertFails(getDoc(doc(nonMemberDb, 'alliance_chat/message-1')));
  await assertFails(getDoc(doc(memberDb, 'alliance_members/alliance-1/members/member-uid')));
});
