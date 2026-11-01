import { callSecureFunction } from '@/app/lib/secureFunctions';
import { requireFirebaseAuth } from '@/app/lib/firebaseAuth';
import { sanitizePlayerId } from '@/app/lib/battleEventLog/sanitizeBattleEventMeta';
import {
  DEFAULT_USER_PLAN_STATE,
  normalizeUserPlanState,
  type UserPlanState,
} from './userPlanConfig';

/** 30 AZN VIP Creator: one month tools/ad-free plus six-month shop pass. */
export async function purchaseVipProPlan(playerId: string): Promise<UserPlanState> {
  const id = sanitizePlayerId(playerId);
  return callSecureFunction<{ userId: string }, UserPlanState>('purchaseVipProPlan', { userId: id });
}

export async function activateFreeCreatorPanel(playerId: string): Promise<UserPlanState> {
  const id = sanitizePlayerId(playerId);
  return callSecureFunction<{ userId: string }, UserPlanState>('activateFreeCreatorPanel', { userId: id });
}

/** Profil düyməsi — sosial rejim. Açıq olanda XP verilmir, paket dəyişmir. */
export async function setProPanelActive(playerId: string, active: boolean): Promise<UserPlanState> {
  const id = sanitizePlayerId(playerId);
  // Player documents intentionally reject client reads until the server has
  // bound the account. Let the authenticated callable verify and bind it;
  // reading the document here fails with Firestore permission-denied first.
  await requireFirebaseAuth();
  await callSecureFunction('bindPlayerIdentity', { userId: id });
  return callSecureFunction<{ userId: string; active: boolean }, UserPlanState>(
    'setProPanelActive',
    { userId: id, active }
  );
}

export function planStateFromPlayer(raw?: Record<string, unknown> | null): UserPlanState {
  return raw ? normalizeUserPlanState(raw) : { ...DEFAULT_USER_PLAN_STATE };
}
