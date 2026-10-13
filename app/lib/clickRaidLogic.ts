import type { BattleCardId } from '@/app/components/alliance/types';

export type ClickRaidCardId = 'mutant' | 'standing' | 'zombi' | 'it';
export type ClickRaidMode = 'damage' | 'steal';

export interface ClickRaidConfig {
  cardId: ClickRaidCardId;
  baseMemberCount: number;
  baseDamage: number;
  baseClicks: number;
  raidMs: number;
  minClicks: number;
  label: string;
  emoji: string;
  themeClass: 'mutant' | 'standing' | 'zombi' | 'it';
  mode: ClickRaidMode;
  amountLabel: string;
}

export const CLICK_RAID_CONFIGS: Record<ClickRaidCardId, ClickRaidConfig> = {
  mutant: {
    cardId: 'mutant',
    baseMemberCount: 50,
    baseDamage: 1500,
    baseClicks: 7,
    raidMs: 14_000,
    minClicks: 2,
    label: 'Mutant hücumu',
    emoji: '☢️',
    themeClass: 'mutant',
    mode: 'damage',
    amountLabel: 'Zərər',
  },
  standing: {
    cardId: 'standing',
    baseMemberCount: 50,
    baseDamage: 1000,
    baseClicks: 5,
    raidMs: 14_000,
    minClicks: 2,
    label: 'Standing hücumu',
    emoji: '🧙',
    themeClass: 'standing',
    mode: 'damage',
    amountLabel: 'Zərər',
  },
  zombi: {
    cardId: 'zombi',
    baseMemberCount: 50,
    baseDamage: 1500,
    baseClicks: 7,
    raidMs: 14_000,
    minClicks: 2,
    label: 'Zombi oğurluğu',
    emoji: '🧟',
    themeClass: 'zombi',
    mode: 'steal',
    amountLabel: 'Oğurluq',
  },
  it: {
    cardId: 'it',
    baseMemberCount: 50,
    baseDamage: 1000,
    baseClicks: 5,
    raidMs: 10_000,
    minClicks: 2,
    label: 'İt oğurluğu',
    emoji: '🐕',
    themeClass: 'it',
    mode: 'steal',
    amountLabel: 'Oğurluq',
  },
};

export function isClickRaidCard(cardId: BattleCardId): cardId is ClickRaidCardId {
  return cardId === 'mutant' || cardId === 'standing' || cardId === 'zombi' || cardId === 'it';
}

/** Oğurluq kartları üçün: stolenPoints = (1500 / 50) * memberCount */
export function computeClickRaidStolenPoints(cardId: ClickRaidCardId, memberCount: number): number {
  return computeClickRaidDamage(cardId, memberCount);
}

export function getClickRaidConfig(cardId: ClickRaidCardId): ClickRaidConfig {
  return CLICK_RAID_CONFIGS[cardId];
}

export function computeClickRaidDamage(cardId: ClickRaidCardId, memberCount: number): number {
  const cfg = getClickRaidConfig(cardId);
  const members = Math.max(1, memberCount);
  return Math.round((cfg.baseDamage / cfg.baseMemberCount) * members);
}

export function computeClickRaidClicksRequired(
  cardId: ClickRaidCardId,
  memberCount: number
): number {
  const cfg = getClickRaidConfig(cardId);
  const members = Math.max(1, memberCount);
  const scaled = Math.round((cfg.baseClicks * members) / cfg.baseMemberCount);
  return Math.max(cfg.minClicks, scaled);
}

function parseLegacyRaidStatus(
  status: string | undefined
): 'active' | 'killed' | 'hit' | undefined {
  if (!status) return undefined;
  if (status === 'active' || status === 'killed' || status === 'hit') return status;
  if (status.endsWith('_killed')) return 'killed';
  if (status.endsWith('_hit')) return 'hit';
  if (status.endsWith('_active')) return 'active';
  return undefined;
}

export function isClickRaidActive(attack: {
  cardId?: string;
  raidStatus?: string;
  mutantStatus?: string;
  status?: string;
  createdAt?: number;
  raidEndsAt?: number;
  mutantRaidEndsAt?: number;
}): boolean {
  if (!attack.cardId || !isClickRaidCard(attack.cardId as BattleCardId)) return false;
  const status =
    parseLegacyRaidStatus(attack.raidStatus) ??
    parseLegacyRaidStatus(attack.mutantStatus) ??
    parseLegacyRaidStatus(attack.status);
  if (status === 'killed' || status === 'hit') return false;
  const cfg = getClickRaidConfig(attack.cardId as ClickRaidCardId);
  const endsAt =
    attack.raidEndsAt ??
    attack.mutantRaidEndsAt ??
    (attack.createdAt ? attack.createdAt + cfg.raidMs : 0);
  if (!endsAt) return status === 'active' || status === undefined;
  return Date.now() < endsAt;
}

export function getActiveClickRaids<T extends Parameters<typeof isClickRaidActive>[0]>(
  attacks: T[]
): T[] {
  return attacks.filter((a) => isClickRaidActive(a));
}

/** Köhnə mutant sahələrindən oxuma */
export function readRaidDamage(attack: {
  cardId?: string;
  raidDamage?: number;
  mutantDamage?: number;
  damage?: number;
}): number {
  return Number(attack.raidDamage ?? attack.mutantDamage ?? attack.damage ?? 0);
}

export function readRaidClicksRequired(attack: {
  raidClicksRequired?: number;
  mutantClicksRequired?: number;
}): number | undefined {
  const v = attack.raidClicksRequired ?? attack.mutantClicksRequired;
  return v === undefined ? undefined : Number(v);
}

export function readRaidClicksRemaining(attack: {
  raidClicksRemaining?: number;
  mutantClicksRemaining?: number;
}): number | undefined {
  const v = attack.raidClicksRemaining ?? attack.mutantClicksRemaining;
  return v === undefined ? undefined : Number(v);
}

export function readRaidStatus(attack: {
  raidStatus?: string;
  mutantStatus?: string;
  status?: string;
}): 'active' | 'killed' | 'hit' | undefined {
  return (
    parseLegacyRaidStatus(attack.raidStatus) ??
    parseLegacyRaidStatus(attack.mutantStatus) ??
    parseLegacyRaidStatus(attack.status)
  );
}

export function readRaidEndsAt(attack: {
  cardId?: string;
  createdAt?: number;
  raidEndsAt?: number;
  mutantRaidEndsAt?: number;
}): number {
  if (attack.raidEndsAt) return attack.raidEndsAt;
  if (attack.mutantRaidEndsAt) return attack.mutantRaidEndsAt;
  if (attack.cardId && isClickRaidCard(attack.cardId as BattleCardId) && attack.createdAt) {
    return attack.createdAt + getClickRaidConfig(attack.cardId as ClickRaidCardId).raidMs;
  }
  return 0;
}
