export const USER_PLANS = ['FREE', 'PRO', 'VIP_PRO'] as const;
export type UserPlan = (typeof USER_PLANS)[number];

export const VIP_PRO_PRICE_AZN = 30;

export interface UserPlanState {
  userPlan: UserPlan;
  hasVipPass: boolean;
  isVipLifetime: boolean;
  proPanelActive: boolean;
}

export const DEFAULT_USER_PLAN_STATE: UserPlanState = {
  userPlan: 'FREE',
  hasVipPass: false,
  isVipLifetime: false,
  proPanelActive: false,
};

export function isUserPlan(value: unknown): value is UserPlan {
  return value === 'FREE' || value === 'PRO' || value === 'VIP_PRO';
}

export function normalizeUserPlanState(raw?: Partial<UserPlanState> | Record<string, unknown> | null): UserPlanState {
  const userPlan = isUserPlan(raw?.userPlan) ? raw.userPlan : 'FREE';
  const hasVipPass = raw?.hasVipPass === true || userPlan === 'VIP_PRO';
  const isVipLifetime = raw?.isVipLifetime === true || userPlan === 'VIP_PRO';
  return {
    userPlan,
    hasVipPass,
    isVipLifetime,
    proPanelActive: raw?.proPanelActive === true,
  };
}

export function canViewAnalytics(user: Pick<UserPlanState, 'userPlan'> | null | undefined): boolean {
  const plan = user?.userPlan ?? 'FREE';
  return plan === 'PRO' || plan === 'VIP_PRO';
}

export function canAccessAllFeatures(user: Pick<UserPlanState, 'userPlan'> | null | undefined): boolean {
  return user?.userPlan === 'VIP_PRO';
}

export function shouldShowAds(
  user: Pick<UserPlanState, 'userPlan' | 'hasVipPass'> | null | undefined
): boolean {
  if (user?.hasVipPass === true) return false;
  if (user?.userPlan === 'VIP_PRO') return false;
  return true;
}

/** Sosial rejim açıq olanda oyun və izləmə XP-si verilmir. */
export function canEarnXp(user: Pick<UserPlanState, 'proPanelActive'> | null | undefined): boolean {
  return user?.proPanelActive !== true;
}

export const USER_PLAN_LABELS: Record<UserPlan, string> = {
  FREE: 'Adi Pano',
  PRO: 'Adi Professional Pano',
  VIP_PRO: 'VIP Professional Pano',
};
