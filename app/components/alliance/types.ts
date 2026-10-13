// components/alliance/types.ts
export interface MessageData {
  id: string;
  user: string;
  userId?: string;
  text: string;
  time: string;
  createdAt: number;
  allianceId?: string;
  kind?: 'system' | 'user';
}

export type ChatChannel = 'global' | 'alliance';

export interface AllianceData {
  id: string;
  name: string;
  region: string;
  lat: number;
  lng: number;
  leaderId: string;
  leader: string;
  score: number;
  members: string[];
  createdAt: number;
  flag?: AllianceFlagConfig;
  /** Qala binası səviyyəsi (1–6) */
  fortressLevel?: number;
  /** 5+ üzv eyni vaxtda onlayn olduqda yığılan millisaniyə */
  fortressQualifyingMs?: number;
  fortressLastTickAt?: number;
  fortressUpdatedAt?: number;
  fortressUpgradedAt?: number;
  fortressPurchasedAt?: number;
  previousName?: string;
  nameUpdatedAt?: number;
}

export type AllianceFlagPattern =
  | 'solid'
  | 'stripes-h'
  | 'stripes-v'
  | 'diagonal'
  | 'cross'
  | 'saltire'
  | 'chevron'
  | 'canton'
  | 'border'
  | 'tricolor-h'
  | 'tricolor-v'
  | 'checkered'
  | 'sunburst'
  | 'gradient'
  | 'split-h'
  | 'split-v'
  | 'triangle'
  | 'fess'
  | 'pale';

export type AllianceFlagShape = 'rect' | 'swallowtail' | 'banner' | 'shield';

export interface AllianceFlagConfig {
  backgroundColor: string;
  accentColor: string;
  emblem: string;
  pattern: AllianceFlagPattern;
  imageUrl?: string;
  imageUpdatedAt?: number;
  thirdColor?: string;
  shape?: AllianceFlagShape;
}

export type BattleCardId =
  | 'zombi'
  | 'yarasa'
  | 'duman'
  | 'mutant'
  | 'standing'
  | 'it';

export interface BattleCardsMap {
  zombi: number;
  yarasa: number;
  duman: number;
  mutant: number;
  standing: number;
  it: number;
}

export interface BattleCard {
  id: BattleCardId;
  name: string;
  count: number;
}

export interface ActiveShield {
  id: string;
  durationId: ShieldDurationId;
  name: string;
  expiresAt: number;
  protectsAgainst: DisasterType[];
  purchasedAt: number;
}

export type ShieldDurationId = '12h' | '1d' | '3d' | '7d';
export type DisasterType = 'earthquake' | 'tsunami' | 'fire';

export interface PlayerProfile {
  odId: string;
  displayName: string;
  allianceId: string | null;
  allianceName: string | null;
  isLeader: boolean;
  score: number;
  /** Oyun valyutası — manat (₼). Köhnə `coins` sahəsi migrate olunur. */
  manat: number;
  /** @deprecated Jeton — yalnız köhnə məlumat üçün */
  coins?: number;
  battleCards: BattleCardsMap;
  activeShields: ActiveShield[];
  cosmetics?: PlayerCosmetics;
  userPlan?: 'FREE' | 'PRO' | 'VIP_PRO';
  hasVipPass?: boolean;
  isVipLifetime?: boolean;
  proPanelActive?: boolean;
  updatedAt: number;
}

export interface AllianceWeeklyShop {
  weekId: string;
  cardPurchases: BattleCardsMap;
  updatedAt: number;
}

export interface HubStats {
  onlineCount: number;
  totalAlliances: number;
  totalPlayers: number;
}

/** Animasiyalı qala səhnəsi — mərkəzi beyin idarə edir */
export interface FortressHubState {
  level: number;
  markerUrl: string;
  onlineInAlliance: number;
  canManage: boolean;
  eligibilityProgressPct: number;
  nextLevelLabel: string | null;
}

export interface HubVisualState {
  sceneActive: boolean;
  animationsEnabled: boolean;
  allianceName: string;
  allianceLevel: number;
  fortressLevel: number;
  fortressMarkerUrl: string;
  allianceFlag: AllianceFlagConfig;
  canEditAllianceFlag: boolean;
  hubOnline: boolean;
  dogCount: number;
  guardCount: number;
  workerCount: number;
}

export type VipTier = 'none' | 'gold' | 'platinum';

export interface EquippedCosmetics {
  frameId?: string;
  bannerId?: string;
  nameStyleId?: string;
  badgeId?: string;
}

export interface VipStatus {
  tier: VipTier;
  expiresAt: number;
}

export interface PlayerCosmetics {
  owned: string[];
  equipped: EquippedCosmetics;
  vip: VipStatus;
}

export const EMPTY_PLAYER_COSMETICS: PlayerCosmetics = {
  owned: [],
  equipped: {},
  vip: { tier: 'none', expiresAt: 0 },
};
