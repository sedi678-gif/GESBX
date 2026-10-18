import { callSecureFunction } from '@/app/lib/secureFunctions';
import { db } from '@/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { ensureFirebaseAuth } from '@/app/lib/firebaseAuth';
import { sanitizePlayerId } from '@/app/lib/battleEventLog/sanitizeBattleEventMeta';
import {
  DEFAULT_USER_PLAN_STATE,
  normalizeUserPlanState,
  type UserPlanState,
} from './userPlanConfig';

/** 30 AZN birdəfəlik VIP Professional — həmişəlik VIP Pass. */
export async function purchaseVipProPlan(playerId: string): Promise<UserPlanState> {
  const id = sanitizePlayerId(playerId);
  return callSecureFunction<{ userId: string }, UserPlanState>('purchaseVipProPlan', { userId: id });
}

/** Profil düyməsi — sosial rejim. Açıq olanda XP verilmir, paket dəyişmir. */
export async function setProPanelActive(playerId: string, active: boolean): Promise<UserPlanState> {
  const id = sanitizePlayerId(playerId);
  // Auth restoration and the context's background identity bind can race the
  // profile toggle. Wait for auth and finish binding before the secured write.
  const user = await ensureFirebaseAuth();
  if (!user) throw new Error('XP rejimini dəyişmək üçün hesabınıza yenidən daxil olun.');
  const playerSnap = await getDoc(doc(db, 'players', id));
  if (playerSnap.exists()) {
    const player = playerSnap.data();
    if (player.firebaseUid !== user.uid || !player.identityVerifiedAt) {
      await callSecureFunction('bindPlayerIdentity', { userId: id });
    }
  }
  return callSecureFunction<{ userId: string; active: boolean }, UserPlanState>(
    'setProPanelActive',
    { userId: id, active }
  );
}

export function planStateFromPlayer(raw?: Record<string, unknown> | null): UserPlanState {
  return raw ? normalizeUserPlanState(raw) : { ...DEFAULT_USER_PLAN_STATE };
}
