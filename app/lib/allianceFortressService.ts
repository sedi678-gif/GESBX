import { db } from '../../firebase';
import { doc, runTransaction } from 'firebase/firestore';
import {
  ALLIANCE_FORTRESS_MIN_MEMBERS,
  ALLIANCE_FORTRESS_MIN_ONLINE,
  FORTRESS_SHOP_PRODUCTS,
  FORTRESS_UPGRADE_REQUIRED_MS,
  normalizeFortressLevel,
  type AllianceFortressLevel,
} from './allianceFortressConfig';
import { resolvePlayerManat, manatWritePatch } from './manat';

const TICK_MS = 60_000;

export interface FortressEligibility {
  currentLevel: AllianceFortressLevel;
  nextLevel: AllianceFortressLevel | null;
  memberCount: number;
  onlineCount: number;
  qualifyingMs: number;
  requiredMs: number;
  membersOk: boolean;
  onlineOk: boolean;
  timeOk: boolean;
  canUpgradeFree: boolean;
  progressLabel: string;
}

export function evaluateFortressEligibility(
  alliance: {
    fortressLevel?: number;
    fortressQualifyingMs?: number;
    members?: string[];
  },
  onlineMemberCount: number
): FortressEligibility {
  const currentLevel = normalizeFortressLevel(alliance.fortressLevel);
  const memberCount = alliance.members?.length ?? 0;
  const qualifyingMs = alliance.fortressQualifyingMs ?? 0;

  if (currentLevel >= 6) {
    return {
      currentLevel,
      nextLevel: null,
      memberCount,
      onlineCount: onlineMemberCount,
      qualifyingMs,
      requiredMs: 0,
      membersOk: memberCount >= ALLIANCE_FORTRESS_MIN_MEMBERS,
      onlineOk: onlineMemberCount >= ALLIANCE_FORTRESS_MIN_ONLINE,
      timeOk: true,
      canUpgradeFree: false,
      progressLabel: 'Maksimum səviyyə',
    };
  }

  const req = FORTRESS_UPGRADE_REQUIRED_MS[currentLevel as 1 | 2 | 3 | 4 | 5];
  const membersOk = memberCount >= ALLIANCE_FORTRESS_MIN_MEMBERS;
  const onlineOk = onlineMemberCount >= ALLIANCE_FORTRESS_MIN_ONLINE;
  const timeOk = qualifyingMs >= req.ms;
  const canUpgradeFree = membersOk && timeOk;

  return {
    currentLevel,
    nextLevel: (currentLevel + 1) as AllianceFortressLevel,
    memberCount,
    onlineCount: onlineMemberCount,
    qualifyingMs,
    requiredMs: req.ms,
    membersOk,
    onlineOk,
    timeOk,
    canUpgradeFree,
    progressLabel: `${Math.min(100, Math.round((qualifyingMs / req.ms) * 100))}% · ${req.label}`,
  };
}

/** Hər dəqiqə: 5+ üzv onlayndırsa vaxt yığılır */
export async function tickFortressAllianceActivity(
  allianceId: string,
  onlineMemberCount: number,
  memberCount: number
): Promise<void> {
  if (memberCount < ALLIANCE_FORTRESS_MIN_MEMBERS) return;
  if (onlineMemberCount < ALLIANCE_FORTRESS_MIN_ONLINE) return;

  const ref = doc(db, 'alliances', allianceId);
  const now = Date.now();

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) return;

    const data = snap.data();
    const level = normalizeFortressLevel(data.fortressLevel);
    if (level >= 6) return;

    const lastTick = data.fortressLastTickAt ?? 0;
    if (now - lastTick < TICK_MS - 5000) return;

    const qualifyingMs = (data.fortressQualifyingMs ?? 0) + TICK_MS;

    tx.update(ref, {
      fortressQualifyingMs: qualifyingMs,
      fortressLastTickAt: now,
      fortressUpdatedAt: now,
    });
  });
}

export async function upgradeFortressByActivity(
  leaderUserId: string,
  allianceId: string
): Promise<AllianceFortressLevel> {
  const ref = doc(db, 'alliances', allianceId);

  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('İttifaq tapılmadı');

    const data = snap.data();
    if (data.leaderId !== leaderUserId) {
      throw new Error('Yalnız ittifaq lideri qala səviyyəsini yüksəldə bilər');
    }

    const level = normalizeFortressLevel(data.fortressLevel);
    if (level >= 6) throw new Error('Maksimum səviyyəyə çatılıb');

    const members: string[] = data.members ?? [];
    if (members.length < ALLIANCE_FORTRESS_MIN_MEMBERS) {
      throw new Error(`Ən azı ${ALLIANCE_FORTRESS_MIN_MEMBERS} üzv lazımdır`);
    }

    const req = FORTRESS_UPGRADE_REQUIRED_MS[level as 1 | 2 | 3 | 4 | 5];
    const qualifyingMs = data.fortressQualifyingMs ?? 0;
    if (qualifyingMs < req.ms) {
      throw new Error('Vaxt şərti hələ tamamlanmayıb');
    }

    const next = (level + 1) as AllianceFortressLevel;
    tx.update(ref, {
      fortressLevel: next,
      fortressQualifyingMs: 0,
      fortressLastTickAt: Date.now(),
      fortressUpdatedAt: Date.now(),
      fortressUpgradedAt: Date.now(),
    });

    return next;
  });
}

export async function purchaseFortressLevel(
  leaderUserId: string,
  allianceId: string,
  targetLevel: AllianceFortressLevel
): Promise<void> {
  if (targetLevel < 2 || targetLevel > 6) throw new Error('Yanlış səviyyə');

  const product = FORTRESS_SHOP_PRODUCTS.find((p) => p.level === targetLevel);
  if (!product) throw new Error('Məhsul tapılmadı');

  const playerRef = doc(db, 'players', leaderUserId);
  const allianceRef = doc(db, 'alliances', allianceId);

  await runTransaction(db, async (tx) => {
    const [playerSnap, allianceSnap] = await Promise.all([
      tx.get(playerRef),
      tx.get(allianceRef),
    ]);

    if (!playerSnap.exists()) throw new Error('Oyunçu profili tapılmadı');
    if (!allianceSnap.exists()) throw new Error('İttifaq tapılmadı');

    const alliance = allianceSnap.data();
    if (alliance.leaderId !== leaderUserId) {
      throw new Error('Yalnız ittifaq lideri mağazadan qala ala bilər');
    }

    const current = normalizeFortressLevel(alliance.fortressLevel);
    if (targetLevel <= current) {
      throw new Error('Artıq bu və ya daha yüksək səviyyədəsiz');
    }

    const player = playerSnap.data();
    const balance = resolvePlayerManat(player);
    if (balance < product.price) throw new Error('Balansda kifayət qədər manat yoxdur');

    tx.set(
      playerRef,
      {
        ...manatWritePatch(balance - product.price),
        updatedAt: Date.now(),
      },
      { merge: true }
    );

    tx.update(allianceRef, {
      fortressLevel: targetLevel,
      fortressQualifyingMs: 0,
      fortressPurchasedAt: Date.now(),
      fortressUpdatedAt: Date.now(),
    });
  });
}
