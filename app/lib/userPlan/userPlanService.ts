import { doc, runTransaction } from 'firebase/firestore';
import { db } from '@/firebase';
import { requireFirebaseAuth } from '@/app/lib/firebaseAuth';
import { resolvePlayerManat, manatWritePatch } from '@/app/lib/manat';
import { sanitizePlayerId } from '@/app/lib/battleEventLog/sanitizeBattleEventMeta';
import {
  DEFAULT_USER_PLAN_STATE,
  VIP_PRO_PRICE_AZN,
  normalizeUserPlanState,
  type UserPlanState,
} from './userPlanConfig';

const WRITE_MS = 12_000;

function playerRef(playerId: string) {
  return doc(db, 'players', playerId);
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

/** 30 AZN birdəfəlik VIP Professional — həmişəlik VIP Pass. */
export async function purchaseVipProPlan(playerId: string): Promise<UserPlanState> {
  await requireFirebaseAuth();
  const id = sanitizePlayerId(playerId);

  return withTimeout(
    runTransaction(db, async (tx) => {
      const ref = playerRef(id);
      const snap = await tx.get(ref);
      if (!snap.exists()) throw new Error('Oyunçu tapılmadı');

      const data = snap.data() as Record<string, unknown>;
      const current = normalizeUserPlanState(data);
      if (current.userPlan === 'VIP_PRO' && current.hasVipPass && current.isVipLifetime) {
        return current;
      }

      const balance = resolvePlayerManat(data);
      if (balance < VIP_PRO_PRICE_AZN) {
        throw new Error(`VIP Professional üçün ${VIP_PRO_PRICE_AZN} AZN lazımdır`);
      }

      const next: UserPlanState = {
        userPlan: 'VIP_PRO',
        hasVipPass: true,
        isVipLifetime: true,
        proPanelActive: true,
      };

      tx.set(
        ref,
        {
          ...manatWritePatch(balance - VIP_PRO_PRICE_AZN),
          ...next,
          updatedAt: Date.now(),
        },
        { merge: true }
      );
      return next;
    }),
    WRITE_MS,
    'VIP plan yazılmadı.'
  );
}

/** Profil düyməsi — sosial rejim. Açıq olanda XP verilmir, paket dəyişmir. */
export async function setProPanelActive(playerId: string, active: boolean): Promise<UserPlanState> {
  await requireFirebaseAuth();
  const id = sanitizePlayerId(playerId);

  return withTimeout(
    runTransaction(db, async (tx) => {
      const ref = playerRef(id);
      const snap = await tx.get(ref);
      if (!snap.exists()) throw new Error('Oyunçu tapılmadı');

      const data = snap.data() as Record<string, unknown>;
      const current = normalizeUserPlanState(data);
      const next: UserPlanState = {
        ...current,
        proPanelActive: active,
      };

      tx.set(
        ref,
        {
          proPanelActive: active,
          updatedAt: Date.now(),
        },
        { merge: true }
      );
      return next;
    }),
    WRITE_MS,
    'Sosial rejim yazılmadı.'
  );
}

export function planStateFromPlayer(raw?: Record<string, unknown> | null): UserPlanState {
  return raw ? normalizeUserPlanState(raw) : { ...DEFAULT_USER_PLAN_STATE };
}
