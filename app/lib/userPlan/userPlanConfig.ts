export const USER_PLANS = ['FREE', 'PRO', 'VIP_PRO'] as const;
export type UserPlan = (typeof USER_PLANS)[number];

export const VIP_PRO_PRICE_AZN = 30;

export interface UserPlanState {
  userPlan: UserPlan;
  hasVipPass: boolean;
  isVipLifetime: boolean;
  proPanelActive: boolean;
  creatorPanelExpiresAt: number;
  adFreeUntil: number;
  freeCreatorPanelClaimedAt: number;
}

export const DEFAULT_USER_PLAN_STATE: UserPlanState = {
  userPlan: 'FREE',
  hasVipPass: false,
  isVipLifetime: false,
  proPanelActive: false,
  creatorPanelExpiresAt: 0,
  adFreeUntil: 0,
  freeCreatorPanelClaimedAt: 0,
};

export function isUserPlan(value: unknown): value is UserPlan {
  return value === 'FREE' || value === 'PRO' || value === 'VIP_PRO';
}

export function normalizeUserPlanState(raw?: Partial<UserPlanState> | Record<string, unknown> | null): UserPlanState {
  const userPlan = isUserPlan(raw?.userPlan) ? raw.userPlan : 'FREE';
  const hasVipPass = raw?.hasVipPass === true;
  const isVipLifetime = raw?.isVipLifetime === true;
  return {
    userPlan,
    hasVipPass,
    isVipLifetime,
    proPanelActive: raw?.proPanelActive === true,
    creatorPanelExpiresAt: Math.max(0, Number(raw?.creatorPanelExpiresAt) || 0),
    adFreeUntil: Math.max(0, Number(raw?.adFreeUntil) || 0),
    freeCreatorPanelClaimedAt: Math.max(0, Number(raw?.freeCreatorPanelClaimedAt) || 0),
  };
}

export function hasActiveCreatorAccess(user: Pick<UserPlanState, 'userPlan' | 'creatorPanelExpiresAt' | 'isVipLifetime'> | null | undefined, now = Date.now()): boolean {
  return user?.isVipLifetime === true || ((user?.userPlan === 'PRO' || user?.userPlan === 'VIP_PRO') && Number(user?.creatorPanelExpiresAt) > now);
}

export function canViewAnalytics(user: Pick<UserPlanState, 'userPlan' | 'creatorPanelExpiresAt' | 'isVipLifetime'> | null | undefined): boolean {
  return hasActiveCreatorAccess(user);
}

export function canAccessAllFeatures(user: Pick<UserPlanState, 'userPlan' | 'creatorPanelExpiresAt' | 'isVipLifetime'> | null | undefined): boolean {
  return user?.isVipLifetime === true || (user?.userPlan === 'VIP_PRO' && Number(user.creatorPanelExpiresAt) > Date.now());
}

export function shouldShowAds(
  user: Pick<UserPlanState, 'userPlan' | 'isVipLifetime' | 'adFreeUntil'> | null | undefined
): boolean {
  if (user?.isVipLifetime === true || Number(user?.adFreeUntil) > Date.now()) return false;
  return true;
}

/** Sosial rejim açıq olanda oyun və izləmə XP-si verilmir. */
export function canEarnXp(user: Pick<UserPlanState, 'proPanelActive'> | null | undefined): boolean {
  return user?.proPanelActive !== true;
}

export const USER_PLAN_LABELS: Record<UserPlan, string> = {
  FREE: 'Adi Creator Panel',
  PRO: 'Adi Creator Panel',
  VIP_PRO: 'VIP Creator Panel',
};
