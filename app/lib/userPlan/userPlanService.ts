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
export async function setProPanelActive(
  playerId: string,
  active: boolean,
  displayName = '',
): Promise<UserPlanState> {
  const id = sanitizePlayerId(playerId);
  const updateMode = () => callSecureApi<{ active: boolean }, UserPlanState>(
    '/api/set-xp-mode',
    'setProPanelActive',
    { active },
  );

  try {
    return await updateMode();
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error
      ? String((error as { code?: unknown }).code || '')
      : '';
    if (id !== '92' || code !== 'PROFILE_NOT_FOUND') throw error;

    // Super admin ID 92 is reserved and has no normal user_id_allocations row.
    // The callable independently checks the UID against the server-side
    // ADMIN_UIDS allowlist before it can restore the profile/session binding.
    await callSecureFunction<{ displayName: string }, { userId: string; active: boolean }>(
      'bootstrapSuperAdmin',
      { displayName: displayName.trim() || 'Super admin' },
    );
    return updateMode();
  }
}

export function planStateFromPlayer(raw?: Record<string, unknown> | null): UserPlanState {
  return raw ? normalizeUserPlanState(raw) : { ...DEFAULT_USER_PLAN_STATE };
}
