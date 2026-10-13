import { doc, getDoc, setDoc, runTransaction } from 'firebase/firestore';
import { db } from '@/firebase';
import { DAILY_ALLIANCE_QUESTS, getTodayKey, QuestType } from './allianceQuestConfig';
import { resolvePlayerManat, manatWritePatch } from './manat';

export interface AllianceQuestProgress {
  dateKey: string;
  progress: Record<string, number>;
  claimed: Record<string, boolean>;
}

function docId(allianceId: string, dateKey: string) {
  return `${allianceId}_${dateKey}`;
}

export async function getQuestProgress(allianceId: string): Promise<AllianceQuestProgress> {
  const dateKey = getTodayKey();
  const ref = doc(db, 'alliance_quests', docId(allianceId, dateKey));
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    return { dateKey, progress: {}, claimed: {} };
  }
  const data = snap.data();
  return {
    dateKey,
    progress: (data.progress as Record<string, number>) || {},
    claimed: (data.claimed as Record<string, boolean>) || {},
  };
}

export async function incrementQuestProgress(
  allianceId: string,
  type: QuestType,
  amount = 1
): Promise<void> {
  const dateKey = getTodayKey();
  const ref = doc(db, 'alliance_quests', docId(allianceId, dateKey));
  const matching = DAILY_ALLIANCE_QUESTS.filter((q) => q.type === type);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const progress: Record<string, number> = snap.exists()
      ? { ...(snap.data()?.progress as Record<string, number>) }
      : {};
    const claimed: Record<string, boolean> = snap.exists()
      ? { ...(snap.data()?.claimed as Record<string, boolean>) }
      : {};

    for (const q of matching) {
      progress[q.id] = (progress[q.id] ?? 0) + amount;
    }

    tx.set(ref, { allianceId, dateKey, progress, claimed, updatedAt: Date.now() }, { merge: true });
  });
}

export async function claimQuestReward(
  allianceId: string,
  userId: string,
  questId: string
): Promise<number> {
  const quest = DAILY_ALLIANCE_QUESTS.find((q) => q.id === questId);
  if (!quest) throw new Error('Tapşırıq tapılmadı');

  const dateKey = getTodayKey();
  const questRef = doc(db, 'alliance_quests', docId(allianceId, dateKey));
  const playerRef = doc(db, 'players', userId);

  let reward = 0;

  await runTransaction(db, async (tx) => {
    const qSnap = await tx.get(questRef);
    const progress: Record<string, number> = qSnap.exists()
      ? { ...(qSnap.data()?.progress as Record<string, number>) }
      : {};
    const claimed: Record<string, boolean> = qSnap.exists()
      ? { ...(qSnap.data()?.claimed as Record<string, boolean>) }
      : {};

    if (claimed[questId]) throw new Error('Artıq götürülüb');
    if ((progress[questId] ?? 0) < quest.target) throw new Error('Tapşırıq tamamlanmayıb');

    claimed[questId] = true;
    reward = quest.rewardManat;

    const pSnap = await tx.get(playerRef);
    const balance = pSnap.exists() ? resolvePlayerManat(pSnap.data()) : 0;

    tx.set(questRef, { progress, claimed, updatedAt: Date.now() }, { merge: true });
    tx.set(
      playerRef,
      { ...manatWritePatch(balance + reward), updatedAt: Date.now() },
      { merge: true }
    );
  });

  return reward;
}
