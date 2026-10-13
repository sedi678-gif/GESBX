export type QuestType = 'chat' | 'attack' | 'join_member' | 'shop_buy';

export interface DailyQuestDef {
  id: string;
  title: string;
  desc: string;
  type: QuestType;
  target: number;
  rewardManat: number;
}

/** Gündəlik tapşırıqlar — sonra əlavə edilə bilər */
export const DAILY_ALLIANCE_QUESTS: DailyQuestDef[] = [
  {
    id: 'daily_chat_5',
    title: '5 ittifaq mesajı',
    desc: 'İttifaq çatında 5 mesaj yaz',
    type: 'chat',
    target: 5,
    rewardManat: 80,
  },
  {
    id: 'daily_attack_1',
    title: '1 hücum',
    desc: 'Başqa ittifaqə 1 hücum et',
    type: 'attack',
    target: 1,
    rewardManat: 150,
  },
  {
    id: 'daily_attack_3',
    title: '3 hücum',
    desc: 'Gün ərzində 3 hücum et',
    type: 'attack',
    target: 3,
    rewardManat: 350,
  },
  {
    id: 'daily_shop_1',
    title: 'Mağazadan alış',
    desc: 'Mağazadan 1 kart və ya qalxan al',
    type: 'shop_buy',
    target: 1,
    rewardManat: 100,
  },
];

export function getTodayKey(): string {
  return new Date().toISOString().slice(0, 10);
}
