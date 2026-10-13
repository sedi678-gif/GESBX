import { collection, doc, getDoc, getDocs, limit, orderBy, query, where } from 'firebase/firestore';
import { db } from '@/firebase';
import { requireFirebaseAuth } from '@/app/lib/firebaseAuth';
import { sanitizePlayerId } from '@/app/lib/battleEventLog/sanitizeBattleEventMeta';
import { ARENA_REWARD_COLLECTION, ARENA_REWARD_PAGE_SIZE } from './config';
import type {
  ArenaRewardPublic,
  ArenaRewardRecord,
  ArenaRewardRecipientType,
  ArenaRewardSecurityStatus,
  ArenaRewardStatus,
  ArenaRewardSourceType,
  ArenaRewardType,
  ArenaRewardPayoutCheckStatus,
} from './types';
import { toArenaRewardPublic } from './eligibility';

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function asInt(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : 0;
}

export function arenaRewardRef(rewardId: string) {
  return doc(db, ARENA_REWARD_COLLECTION, rewardId);
}

export function parseArenaReward(raw: Record<string, unknown> | undefined, fallbackId: string): ArenaRewardRecord | null {
  if (!raw) return null;
  const status = asString(raw.status);
  if (!['PENDING', 'SECURITY_CHECK', 'APPROVED', 'REJECTED', 'CANCELLED'].includes(status)) return null;
  const recipientType = asString(raw.recipientType);
  if (recipientType !== 'USER' && recipientType !== 'ALLIANCE') return null;
  const securityStatus = asString(raw.securityStatus) === 'BLOCKED' ? 'BLOCKED' : 'CLEAR';
  const sourceType = asString(raw.sourceType) || 'ARENA_MATCH';
  const rewardType = asString(raw.rewardType) || 'BATTLE_COMPLETION';
  if (sourceType !== 'ARENA_MATCH' && sourceType !== 'WEEKLY_RANKING') return null;
  if (rewardType !== 'BATTLE_COMPLETION' && rewardType !== 'WEEKLY_RANKING') return null;
  const payoutRaw = asString(raw.payoutCheckStatus);
  const payoutCheckStatus =
    payoutRaw === 'APPROVED' || payoutRaw === 'BLOCKED' || payoutRaw === 'REVIEW'
      ? (payoutRaw as ArenaRewardPayoutCheckStatus)
      : null;
  return {
    rewardId: asString(raw.rewardId) || fallbackId,
    periodId: asString(raw.periodId),
    sourceType: sourceType as ArenaRewardSourceType,
    sourceId: asString(raw.sourceId),
    matchId: asString(raw.matchId),
    rewardType: rewardType as ArenaRewardType,
    recipientType: recipientType as ArenaRewardRecipientType,
    recipientId: asString(raw.recipientId),
    countryCode: asString(raw.countryCode),
    rank: raw.rank == null ? null : asInt(raw.rank),
    amount: raw.amount == null ? null : asInt(raw.amount),
    currency: 'AZN',
    status: status as ArenaRewardStatus,
    createdAt: asInt(raw.createdAt),
    approvedAt: raw.approvedAt == null ? null : asInt(raw.approvedAt),
    rejectedAt: raw.rejectedAt == null ? null : asInt(raw.rejectedAt),
    securityStatus: securityStatus as ArenaRewardSecurityStatus,
    viewerIds: Array.isArray(raw.viewerIds)
      ? raw.viewerIds.filter((id): id is string => typeof id === 'string' && Boolean(id.trim()))
      : [],
    payoutCheckStatus,
    payoutCheckedAt: raw.payoutCheckedAt == null ? null : asInt(raw.payoutCheckedAt),
    payoutReady: raw.payoutReady === true,
  };
}

export function arenaRewardLedgerWrite(record: ArenaRewardRecord): Record<string, unknown> {
  return {
    rewardId: record.rewardId,
    periodId: record.periodId,
    sourceType: record.sourceType,
    sourceId: record.sourceId,
    matchId: record.matchId,
    rewardType: record.rewardType,
    recipientType: record.recipientType,
    recipientId: record.recipientId,
    countryCode: record.countryCode,
    rank: record.rank,
    amount: record.amount,
    currency: record.currency,
    status: record.status,
    createdAt: record.createdAt,
    approvedAt: record.approvedAt,
    rejectedAt: record.rejectedAt,
    securityStatus: record.securityStatus,
    viewerIds: record.viewerIds,
    schemaVersion: 1,
    walletCredited: false,
    payoutCheckStatus: record.payoutCheckStatus,
    payoutCheckedAt: record.payoutCheckedAt,
    payoutReady: record.payoutReady,
  };
}

export async function listArenaRewardsForPlayer(input: { playerId: string }): Promise<ArenaRewardPublic[]> {
  const playerId = sanitizePlayerId(input.playerId);
  await requireFirebaseAuth();
  const snap = await getDocs(
    query(
      collection(db, ARENA_REWARD_COLLECTION),
      where('viewerIds', 'array-contains', playerId),
      orderBy('createdAt', 'desc'),
      limit(ARENA_REWARD_PAGE_SIZE)
    )
  );
  return snap.docs
    .map((row) => parseArenaReward(row.data() as Record<string, unknown>, row.id))
    .filter((row): row is ArenaRewardRecord => Boolean(row))
    .filter((row) => row.viewerIds.includes(playerId) || row.recipientId === playerId)
    .map(toArenaRewardPublic);
}

export async function getArenaRewardPublic(input: {
  rewardId: string;
  playerId: string;
}): Promise<ArenaRewardPublic> {
  const playerId = sanitizePlayerId(input.playerId);
  const rewardId = asString(input.rewardId).slice(0, 120);
  if (!rewardId) throw new Error('Mükafat tapılmadı');
  await requireFirebaseAuth();
  const snap = await getDoc(arenaRewardRef(rewardId));
  const record = parseArenaReward(snap.data() as Record<string, unknown> | undefined, rewardId);
  if (!record) throw new Error('Mükafat tapılmadı');
  if (!record.viewerIds.includes(playerId) && record.recipientId !== playerId) {
    throw new Error('Bu mükafata baxmaq icazən yoxdur');
  }
  return toArenaRewardPublic(record);
}
