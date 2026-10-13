/** Sword & Shield müdafiəçiləri — birinci dalğa bloklama məntiqi */

/** Hər qoruyucu əsgər neçə hücumçunu saxlaya bilər */
export const BLOCK_PER_GUARD = 1;

/** İttifaq üzv sayına görə əlavə blok əmsalı (0.2 = hər 5 üzv +1 virtual blok) */
export const MEMBER_BLOCK_RATIO = 0.2;

export interface BlockWaveResult {
  totalAttackers: number;
  defenderGuardCount: number;
  defenderCapacity: number;
  blockedCount: number;
  breakthroughCount: number;
  blockedUnitIndices: number[];
  breakthroughUnitIndices: number[];
  damageMultiplier: number;
}

/** İttifaq üzv sayından qoruyucu əsgər sayı (maks 5) */
export function computeDefenderGuardCount(memberCount: number): number {
  const members = Math.max(1, memberCount);
  return Math.min(5, Math.max(1, Math.ceil(members / 3)));
}

/** Müdafiəçilərin ümumi blok tutumu */
export function computeDefenderBlockCapacity(
  memberCount: number,
  guardCount?: number
): number {
  const guards = guardCount ?? computeDefenderGuardCount(memberCount);
  const memberBonus = Math.floor(Math.max(0, memberCount) * MEMBER_BLOCK_RATIO);
  return guards * BLOCK_PER_GUARD + memberBonus;
}

/**
 * Düşmən birinci dalğasını həll edir.
 * Bloklananlar zərərsizləşir; yalnız breakthrough hücumçuları hədəfə gedir.
 */
export function resolveFirstWaveBlock(
  attackerCount: number,
  defenderMemberCount: number,
  guardCount?: number
): BlockWaveResult {
  const total = Math.max(1, Math.min(10, attackerCount));
  const guards = guardCount ?? computeDefenderGuardCount(defenderMemberCount);
  const capacity = computeDefenderBlockCapacity(defenderMemberCount, guards);
  const blockedCount = Math.min(total, capacity);
  const breakthroughCount = Math.max(0, total - blockedCount);

  const blockedUnitIndices: number[] = [];
  const breakthroughUnitIndices: number[] = [];

  for (let i = 0; i < total; i += 1) {
    if (i < blockedCount) blockedUnitIndices.push(i);
    else breakthroughUnitIndices.push(i);
  }

  return {
    totalAttackers: total,
    defenderGuardCount: guards,
    defenderCapacity: capacity,
    blockedCount,
    breakthroughCount,
    blockedUnitIndices,
    breakthroughUnitIndices,
    damageMultiplier: breakthroughCount / total,
  };
}

export function scaleDamageByBlock(rawDamage: number, block: BlockWaveResult): number {
  if (block.totalAttackers <= 0) return 0;
  return Math.max(0, Math.round(rawDamage * block.damageMultiplier));
}
