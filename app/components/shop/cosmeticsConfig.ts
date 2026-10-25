import { PlayerCosmetics, VipTier } from '../alliance/types';

export type CosmeticCategory = 'vip' | 'nameStyle' | 'frame' | 'banner' | 'badge';

export interface CosmeticProduct {
  id: string;
  category: CosmeticCategory;
  name: string;
  price: number;
  desc: string;
  previewEmoji?: string;
  /** CSS module class suffix in profile.module.css */
  styleClass?: string;
  /** Inline gradient for banners / frame rings */
  gradient?: string;
  vipOnly?: boolean;
  platinumOnly?: boolean;
  /** VIP paketi — müddət (ms) */
  vipDurationMs?: number;
  vipTier?: VipTier;
}

export const COSMETIC_PRODUCTS: CosmeticProduct[] = [
  // VIP paketlər
  {
    id: 'vip_gold_7d',
    category: 'vip',
    name: 'Gold VIP — 7 gün',
    price: 2500,
    desc: 'Rəngli ad stilləri, profil çərçivələri və arxa fon alışı. Profildə 👑 Gold nişanı.',
    previewEmoji: '👑',
    vipDurationMs: 7 * 24 * 60 * 60 * 1000,
    vipTier: 'gold',
  },
  {
    id: 'vip_platinum_30d',
    category: 'vip',
    name: 'Platinum VIP — 30 gün',
    price: 8000,
    desc: 'Bütün VIP kosmetikalar + ekskluziv çərçivə, parlaq effekt, 💎 Platinum nişanı və +2 həftəlik kart limiti.',
    previewEmoji: '💎',
    vipDurationMs: 30 * 24 * 60 * 60 * 1000,
    vipTier: 'platinum',
  },
  {
    id: 'vip_gold_30d',
    category: 'vip',
    name: 'Gold VIP — 30 gün',
    price: 6500,
    desc: 'Bir ay boyunca qızılı ad, profil çərçivələri və premium görünüş.',
    previewEmoji: '👑',
    vipDurationMs: 30 * 24 * 60 * 60 * 1000,
    vipTier: 'gold',
  },
  {
    id: 'vip_gold_90d',
    category: 'vip',
    name: 'Gold VIP — 90 gün',
    price: 16500,
    desc: 'Üç aylıq Gold VIP — uzun müddətli parlaq profil görünüşü.',
    previewEmoji: '🌟',
    vipDurationMs: 90 * 24 * 60 * 60 * 1000,
    vipTier: 'gold',
  },
  {
    id: 'vip_platinum_7d',
    category: 'vip',
    name: 'Platinum VIP — 7 gün',
    price: 4200,
    desc: 'Bir həftəlik Platinum sınağı: eksklüziv nişan və premium effektlər.',
    previewEmoji: '💠',
    vipDurationMs: 7 * 24 * 60 * 60 * 1000,
    vipTier: 'platinum',
  },
  {
    id: 'vip_platinum_90d',
    category: 'vip',
    name: 'Platinum VIP — 90 gün',
    price: 22000,
    desc: 'Üç ay tam Platinum parıltısı və eksklüziv profil üstünlükləri.',
    previewEmoji: '💎',
    vipDurationMs: 90 * 24 * 60 * 60 * 1000,
    vipTier: 'platinum',
  },
  {
    id: 'vip_platinum_365d',
    category: 'vip',
    name: 'Platinum VIP — 1 il',
    price: 78000,
    desc: 'Bir il boyunca əfsanəvi Platinum görünüşü və bütün premium effektlər.',
    previewEmoji: '👑',
    vipDurationMs: 365 * 24 * 60 * 60 * 1000,
    vipTier: 'platinum',
  },

  // Yazı stilləri
  {
    id: 'name_gold',
    category: 'nameStyle',
    name: 'Qızıl Parlaq Ad',
    price: 1200,
    desc: 'Adın qızıl shimmer effekti ilə parlasın.',
    previewEmoji: '✨',
    styleClass: 'nameGold',
    vipOnly: true,
  },
  {
    id: 'name_rainbow',
    category: 'nameStyle',
    name: 'Göyqurşağı Ad',
    price: 1800,
    desc: 'Rəngbərəng animasiyalı ad stili.',
    previewEmoji: '🌈',
    styleClass: 'nameRainbow',
    vipOnly: true,
  },
  {
    id: 'name_neon',
    category: 'nameStyle',
    name: 'Neon Cyber Ad',
    price: 1500,
    desc: 'Neon yaşıl cyberpunk yazı stili.',
    previewEmoji: '💚',
    styleClass: 'nameNeon',
    vipOnly: true,
  },
  {
    id: 'name_fire',
    category: 'nameStyle',
    name: 'Od Ad Stili',
    price: 1500,
    desc: 'Alov effektli qırmızı-narıncı ad.',
    previewEmoji: '🔥',
    styleClass: 'nameFire',
    vipOnly: true,
  },
  {
    id: 'name_ice',
    category: 'nameStyle',
    name: 'Buz Ad Stili',
    price: 1500,
    desc: 'Soyuq mavi buz parıltısı.',
    previewEmoji: '❄️',
    styleClass: 'nameIce',
    vipOnly: true,
  },
  {
    id: 'name_royal',
    category: 'nameStyle',
    name: 'Kral Ad Stili',
    price: 2200,
    desc: 'Bənövşəyi-qladiator royal effekt.',
    previewEmoji: '👸',
    styleClass: 'nameRoyal',
    vipOnly: true,
    platinumOnly: true,
  },
  {
    id: 'name_emerald',
    category: 'nameStyle',
    name: 'Zümrüd Aura',
    price: 1700,
    desc: 'Adının ətrafında sehrli yaşıl işıq parlasın.',
    previewEmoji: '💚',
    styleClass: 'nameEmerald',
    vipOnly: true,
  },
  {
    id: 'name_sakura',
    category: 'nameStyle',
    name: 'Sakura Xəyalı',
    price: 1900,
    desc: 'Çəhrayı-bənövşəyi, zərif və animasiyalı ad stili.',
    previewEmoji: '🌸',
    styleClass: 'nameSakura',
    vipOnly: true,
  },
  {
    id: 'name_comet',
    category: 'nameStyle',
    name: 'Kometa İzi',
    price: 2100,
    desc: 'Səma rəngləri adının üzərindən kometa kimi axır.',
    previewEmoji: '☄️',
    styleClass: 'nameComet',
    vipOnly: true,
  },
  {
    id: 'name_cyberwave',
    category: 'nameStyle',
    name: 'Cyber Dalğa',
    price: 2300,
    desc: 'Mavi-neon dalğa effektli futuristik yazı.',
    previewEmoji: '🌊',
    styleClass: 'nameCyberwave',
    vipOnly: true,
  },
  {
    id: 'name_void',
    category: 'nameStyle',
    name: 'Qaranlıq Maddə',
    price: 2700,
    desc: 'Platinum eksklüziv, kosmik bənövşəyi qaranlıq aura.',
    previewEmoji: '🌌',
    styleClass: 'nameVoid',
    vipOnly: true,
    platinumOnly: true,
  },

  // Profil çərçivələri
  {
    id: 'frame_gold',
    category: 'frame',
    name: 'Qızıl Çərçivə',
    price: 1500,
    desc: 'Avatar ətrafında qızıl halqa.',
    previewEmoji: '🟡',
    styleClass: 'frameGold',
    gradient: 'linear-gradient(135deg, #fbbf24, #f59e0b, #d97706)',
    vipOnly: true,
  },
  {
    id: 'frame_neon',
    category: 'frame',
    name: 'Neon Çərçivə',
    price: 1600,
    desc: 'Parlayan neon yaşıl-mavi halqa.',
    previewEmoji: '💫',
    styleClass: 'frameNeon',
    gradient: 'linear-gradient(135deg, #22d3ee, #a855f7, #ec4899)',
    vipOnly: true,
  },
  {
    id: 'frame_fire',
    category: 'frame',
    name: 'Od Çərçivəsi',
    price: 1800,
    desc: 'Alq-van alov halqası.',
    previewEmoji: '🔥',
    styleClass: 'frameFire',
    gradient: 'linear-gradient(135deg, #ef4444, #f97316, #fbbf24)',
    vipOnly: true,
  },
  {
    id: 'frame_galaxy',
    category: 'frame',
    name: 'Qalaktika Çərçivəsi',
    price: 2000,
    desc: 'Kosmik bənövşəyi ulduz halqası.',
    previewEmoji: '🌌',
    styleClass: 'frameGalaxy',
    gradient: 'linear-gradient(135deg, #6366f1, #8b5cf6, #ec4899, #06b6d4)',
    vipOnly: true,
  },
  {
    id: 'frame_diamond',
    category: 'frame',
    name: 'Almaz Çərçivə',
    price: 3000,
    desc: 'Platinum ekskluziv parlaq almaz halqa.',
    previewEmoji: '💎',
    styleClass: 'frameDiamond',
    gradient: 'linear-gradient(135deg, #e0f2fe, #38bdf8, #818cf8, #c084fc)',
    vipOnly: true,
    platinumOnly: true,
  },
  {
    id: 'frame_emerald',
    category: 'frame',
    name: 'Zümrüd Qoruyucu Halqa',
    price: 1700,
    desc: 'Avatarına meşə işığı kimi yaşıl aura verir.',
    previewEmoji: '🟢',
    gradient: 'linear-gradient(135deg, #052e16, #22c55e, #a3e635)',
    vipOnly: true,
  },
  {
    id: 'frame_sakura',
    category: 'frame',
    name: 'Sakura Halqası',
    price: 1800,
    desc: 'Çəhrayı ləçəklərdən ilhamlanan yumşaq neon çərçivə.',
    previewEmoji: '🌸',
    gradient: 'linear-gradient(135deg, #831843, #f472b6, #fda4af)',
    vipOnly: true,
  },
  {
    id: 'frame_comet',
    category: 'frame',
    name: 'Kometa Halqası',
    price: 2200,
    desc: 'Mavi və bənövşəyi ulduz izi ilə seçilən profil halqası.',
    previewEmoji: '☄️',
    gradient: 'linear-gradient(135deg, #0e7490, #6366f1, #c084fc)',
    vipOnly: true,
  },
  {
    id: 'frame_obsidian',
    category: 'frame',
    name: 'Obsidian Zirehi',
    price: 2500,
    desc: 'Tünd metal və gümüş işıqla ağır, elit görünüş.',
    previewEmoji: '🛡️',
    gradient: 'linear-gradient(135deg, #111827, #64748b, #e2e8f0)',
    vipOnly: true,
  },
  {
    id: 'frame_celestial',
    category: 'frame',
    name: 'Səmavi Almaz',
    price: 3400,
    desc: 'Platinum eksklüziv — buz mavisi və ulduz bənövşəyi.',
    previewEmoji: '💠',
    gradient: 'linear-gradient(135deg, #cffafe, #38bdf8, #818cf8, #f0abfc)',
    vipOnly: true,
    platinumOnly: true,
  },

  // Arxa fonlar
  {
    id: 'banner_sunset',
    category: 'banner',
    name: 'Gün Batımı Fonu',
    price: 1000,
    desc: 'İsti narıncı-bənövşəyi gradient banner.',
    previewEmoji: '🌅',
    gradient: 'linear-gradient(135deg, #f97316 0%, #ec4899 50%, #8b5cf6 100%)',
    vipOnly: true,
  },
  {
    id: 'banner_aurora',
    category: 'banner',
    name: 'Şimal işıqları',
    price: 1200,
    desc: 'Aurora borealis effekti.',
    previewEmoji: '🌌',
    gradient: 'linear-gradient(135deg, #06b6d4 0%, #8b5cf6 40%, #22c55e 100%)',
    vipOnly: true,
  },
  {
    id: 'banner_midnight',
    category: 'banner',
    name: 'Gecə Fonu',
    price: 1000,
    desc: 'Dərin gecə mavi-bənövşəyi.',
    previewEmoji: '🌙',
    gradient: 'linear-gradient(135deg, #0f172a 0%, #312e81 50%, #1e1b4b 100%)',
    vipOnly: true,
  },
  {
    id: 'banner_volcano',
    category: 'banner',
    name: 'Vulkan Fonu',
    price: 1400,
    desc: 'Qırmızı lava effekti.',
    previewEmoji: '🌋',
    gradient: 'linear-gradient(135deg, #450a0a 0%, #dc2626 45%, #f97316 100%)',
    vipOnly: true,
  },
  {
    id: 'banner_ocean',
    category: 'banner',
    name: 'Okean Fonu',
    price: 1000,
    desc: 'Dərin dəniz mavisi gradient.',
    previewEmoji: '🌊',
    gradient: 'linear-gradient(135deg, #0c4a6e 0%, #0284c7 50%, #06b6d4 100%)',
    vipOnly: true,
  },
  {
    id: 'banner_galaxy',
    category: 'banner',
    name: 'Qalaktika Fonu',
    price: 1800,
    desc: 'Platinum ekskluziv kosmik banner.',
    previewEmoji: '✨',
    gradient: 'linear-gradient(135deg, #020617 0%, #4c1d95 35%, #ec4899 70%, #06b6d4 100%)',
    vipOnly: true,
    platinumOnly: true,
  },
  {
    id: 'banner_royal',
    category: 'banner',
    name: 'Kral Sarayı',
    price: 1600,
    desc: 'Tünd bənövşəyi və qızılı saray işığı.',
    previewEmoji: '👑',
    gradient: 'linear-gradient(135deg, #312e81 0%, #7c3aed 48%, #fbbf24 100%)',
    vipOnly: true,
  },
  {
    id: 'banner_emerald',
    category: 'banner',
    name: 'Zümrüd Meşəsi',
    price: 1300,
    desc: 'Dərin meşə yaşılı və sehrli zümrüd işığı.',
    previewEmoji: '🌿',
    gradient: 'linear-gradient(135deg, #052e16 0%, #15803d 48%, #4ade80 100%)',
    vipOnly: true,
  },
  {
    id: 'banner_sakura',
    category: 'banner',
    name: 'Sakura Axşamı',
    price: 1500,
    desc: 'Gül ləçəyi rəngləri ilə romantik axşam fonu.',
    previewEmoji: '🌸',
    gradient: 'linear-gradient(135deg, #4a044e 0%, #db2777 52%, #fda4af 100%)',
    vipOnly: true,
  },
  {
    id: 'banner_nebula',
    category: 'banner',
    name: 'Dumanlıq Nebula',
    price: 2100,
    desc: 'Ulduz tozu və parlaq kosmik dumanlıq.',
    previewEmoji: '🪐',
    gradient: 'linear-gradient(135deg, #020617 0%, #4338ca 38%, #c026d3 72%, #22d3ee 100%)',
    vipOnly: true,
    platinumOnly: true,
  },
  {
    id: 'banner_sunforge',
    category: 'banner',
    name: 'Günəş Dəmirxanası',
    price: 1700,
    desc: 'Əridilmiş qızıl və alovlu günəş enerjisi.',
    previewEmoji: '☀️',
    gradient: 'linear-gradient(135deg, #7c2d12 0%, #f97316 45%, #fde047 100%)',
    vipOnly: true,
  },

  // Nişanlar
  {
    id: 'badge_star',
    category: 'badge',
    name: 'Ulduz Nişanı',
    price: 800,
    desc: 'Adın yanında parlayan ulduz.',
    previewEmoji: '⭐',
    styleClass: 'badgeStar',
    vipOnly: true,
  },
  {
    id: 'badge_crown',
    category: 'badge',
    name: 'Tac Nişanı',
    price: 1500,
    desc: 'VIP oyunçu tacı.',
    previewEmoji: '👑',
    styleClass: 'badgeCrown',
    vipOnly: true,
  },
  {
    id: 'badge_diamond',
    category: 'badge',
    name: 'Almaz Nişanı',
    price: 2000,
    desc: 'Platinum ekskluziv almaz.',
    previewEmoji: '💎',
    styleClass: 'badgeDiamond',
    vipOnly: true,
    platinumOnly: true,
  },
  {
    id: 'badge_phoenix',
    category: 'badge',
    name: 'Feniks Nişanı',
    price: 1300,
    desc: 'Yenilməzliyi və yenidən doğuluşu simvolizə edir.',
    previewEmoji: '🔥',
    vipOnly: true,
  },
  {
    id: 'badge_wolf',
    category: 'badge',
    name: 'Boz Qurd',
    price: 1200,
    desc: 'Sadiqlik və güc nişanı — ittifaq döyüşçüləri üçün.',
    previewEmoji: '🐺',
    vipOnly: true,
  },
  {
    id: 'badge_moon',
    category: 'badge',
    name: 'Ay Keşikçisi',
    price: 1400,
    desc: 'Gecə səmasının parlaq nişanı.',
    previewEmoji: '🌙',
    vipOnly: true,
  },
  {
    id: 'badge_lightning',
    category: 'badge',
    name: 'Şimşək Nişanı',
    price: 1600,
    desc: 'Sürət və cəsarətini profilində göstər.',
    previewEmoji: '⚡',
    vipOnly: true,
  },
  {
    id: 'badge_rose',
    category: 'badge',
    name: 'Qızıl Gül',
    price: 2400,
    desc: 'Platinum eksklüziv, parlayan qızılgül nişanı.',
    previewEmoji: '🌹',
    vipOnly: true,
    platinumOnly: true,
  },
];

export const COSMETIC_CATEGORIES: { id: CosmeticCategory | 'all'; label: string }[] = [
  { id: 'all', label: 'Hamısı' },
  { id: 'vip', label: '👑 VIP' },
  { id: 'nameStyle', label: '✍️ Yazı' },
  { id: 'frame', label: '🖼️ Çərçivə' },
  { id: 'banner', label: '🎨 Fon' },
  { id: 'badge', label: '🏅 Nişan' },
];

export function getCosmeticPreviewGradient(product: CosmeticProduct): string {
  if (product.gradient) return product.gradient;
  if (product.category === 'vip') {
    return product.vipTier === 'platinum'
      ? 'linear-gradient(135deg, #082f49 0%, #4338ca 52%, #a21caf 100%)'
      : 'linear-gradient(135deg, #713f12 0%, #b45309 48%, #fbbf24 100%)';
  }
  if (product.category === 'nameStyle') return 'linear-gradient(135deg, #0f172a 0%, #164e63 50%, #312e81 100%)';
  if (product.category === 'frame') return 'linear-gradient(135deg, #172554 0%, #6d28d9 52%, #0f172a 100%)';
  if (product.category === 'banner') return 'linear-gradient(135deg, #0f172a 0%, #0e7490 48%, #7c3aed 100%)';
  return 'linear-gradient(135deg, #1e1b4b 0%, #7e22ce 52%, #be185d 100%)';
}

export function getCosmeticProduct(id: string): CosmeticProduct | undefined {
  return COSMETIC_PRODUCTS.find((p) => p.id === id);
}

export function isVipActive(cosmetics: PlayerCosmetics | undefined | null): boolean {
  if (!cosmetics?.vip) return false;
  return cosmetics.vip.tier !== 'none' && cosmetics.vip.expiresAt > Date.now();
}

export function getActiveVipTier(cosmetics: PlayerCosmetics | undefined | null): VipTier {
  if (!isVipActive(cosmetics)) return 'none';
  return cosmetics!.vip.tier;
}

export function canPurchaseCosmetic(
  product: CosmeticProduct,
  cosmetics: PlayerCosmetics | undefined | null
): { ok: boolean; reason?: string } {
  if (product.category !== 'vip') {
    if (product.vipOnly && !isVipActive(cosmetics)) {
      return { ok: false, reason: 'VIP paketi tələb olunur' };
    }
    if (product.platinumOnly && getActiveVipTier(cosmetics) !== 'platinum') {
      return { ok: false, reason: 'Platinum VIP tələb olunur' };
    }
  }
  if (product.category !== 'vip' && cosmetics?.owned.includes(product.id)) {
    return { ok: false, reason: 'Artıq sahibsən' };
  }
  return { ok: true };
}

export function resolveBannerGradient(
  cosmetics: PlayerCosmetics | undefined | null,
  fallback: string
): string {
  const bannerId = cosmetics?.equipped?.bannerId;
  if (!bannerId) return fallback;
  const product = getCosmeticProduct(bannerId);
  return product?.gradient ?? fallback;
}

export function resolveFrameGradient(cosmetics: PlayerCosmetics | undefined | null): string | undefined {
  const frameId = cosmetics?.equipped?.frameId;
  if (!frameId) return undefined;
  return getCosmeticProduct(frameId)?.gradient;
}

export function resolveNameStyleClass(cosmetics: PlayerCosmetics | undefined | null): string | undefined {
  const id = cosmetics?.equipped?.nameStyleId;
  if (!id) return undefined;
  return getCosmeticProduct(id)?.styleClass;
}

export function resolveBadgeEmoji(cosmetics: PlayerCosmetics | undefined | null): string | null {
  const id = cosmetics?.equipped?.badgeId;
  if (id) {
    const p = getCosmeticProduct(id);
    if (p?.previewEmoji) return p.previewEmoji;
  }
  if (isVipActive(cosmetics)) {
    return cosmetics!.vip.tier === 'platinum' ? '💎' : '👑';
  }
  return null;
}

export function formatVipExpiry(expiresAt: number): string {
  if (!expiresAt || expiresAt <= Date.now()) return 'Bitib';
  const diff = expiresAt - Date.now();
  const days = Math.floor(diff / (24 * 60 * 60 * 1000));
  const hours = Math.floor((diff % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
  if (days > 0) return `${days} gün ${hours} saat`;
  return `${hours} saat`;
}

export const DEFAULT_BANNER =
  'linear-gradient(135deg, #ec4899 0%, #8b5cf6 45%, #06b6d4 100%)';
