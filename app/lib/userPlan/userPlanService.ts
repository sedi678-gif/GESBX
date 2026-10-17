import { callSecureFunction } from '@/app/lib/secureFunctions';
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
  return callSecureFunction<{ userId: string; active: boolean }, UserPlanState>(
    'setProPanelActive',
    { userId: id, active }
  );
}

export function planStateFromPlayer(raw?: Record<string, unknown> | null): UserPlanState {
  return raw ? normalizeUserPlanState(raw) : { ...DEFAULT_USER_PLAN_STATE };
}
