import { callSecureApi, callSecureFunction } from '@/app/lib/secureFunctions';
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
  sanitizePlayerId(playerId);
  return callSecureApi<{ active: boolean }, UserPlanState>(
    '/api/set-xp-mode',
    'setProPanelActive',
    { active },
  );
}

export function planStateFromPlayer(raw?: Record<string, unknown> | null): UserPlanState {
  return raw ? normalizeUserPlanState(raw) : { ...DEFAULT_USER_PLAN_STATE };
}
