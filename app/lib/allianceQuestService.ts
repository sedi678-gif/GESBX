import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/firebase';
import { DAILY_ALLIANCE_QUESTS, getTodayKey, QuestType } from './allianceQuestConfig';
import { callSecureFunction } from './secureFunctions';
import { getLocalProfileUserId } from './userId';

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
  _type: QuestType,
  _amount = 1
): Promise<void> {
  const userId = getLocalProfileUserId();
  if (!userId) return;
  await callSecureFunction('refreshQuestProgress', { allianceId, userId });
}

export async function claimQuestReward(
  allianceId: string,
  userId: string,
  questId: string
): Promise<number> {
  const quest = DAILY_ALLIANCE_QUESTS.find((q) => q.id === questId);
  if (!quest) throw new Error('Tapşırıq tapılmadı');
  return callSecureFunction<
    { allianceId: string; userId: string; questId: string },
    number
  >('claimQuestReward', { allianceId, userId, questId });
}
