import { PlayerCosmetics, VipTier } from '../alliance/types';

export type CosmeticCategory = 'vip' | 'nameStyle' | 'frame' | 'banner';

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
  /** In-game scene used as a cosmetic banner */
  image?: string;
  /** CC0 portrait frame overlay */
  frameImage?: string;
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
    desc: 'Gold üzvlük: yazı stilləri, profil çərçivələri və bütün fonlar.',
    previewEmoji: '👑',
    vipDurationMs: 7 * 24 * 60 * 60 * 1000,
    vipTier: 'gold',
    image: '/images/vip-art/aurora.jpg',
  },
  {
    id: 'vip_platinum_30d',
    category: 'vip',
    name: 'Platinum VIP — 30 gün',
    price: 8000,
    desc: 'Platinum üzvlük: bütün kosmetikalar, xüsusi effektlər və +2 həftəlik kart limiti.',
    previewEmoji: '💎',
    vipDurationMs: 30 * 24 * 60 * 60 * 1000,
    vipTier: 'platinum',
    image: '/images/vip-art/nebula.jpg',
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
    image: '/images/vip-art/dunes.jpg',
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
    image: '/images/vip-art/forest.jpg',
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
    image: '/images/vip-art/starmountain.jpg',
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
    image: '/images/vip-art/ice.jpg',
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
    image: '/images/vip-art/volcano.jpg',
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
    name: 'Qədim Rune Çərçivəsi',
    price: 1500,
    desc: 'Ağır oyma və metal detallı qədim portret halqası.',
    previewEmoji: '🟡',
    styleClass: 'frameGold',
    gradient: 'linear-gradient(135deg, #fbbf24, #f59e0b, #d97706)',
    frameImage: '/images/vip-art/frame-gold.png',
    vipOnly: true,
  },
  {
    id: 'frame_neon',
    category: 'frame',
    name: 'Meşə Medalyonu',
    price: 1600,
    desc: 'Tünd ağac və oyma naxışlı dairəvi portret halqası.',
    previewEmoji: '💫',
    styleClass: 'frameNeon',
    gradient: 'linear-gradient(135deg, #22d3ee, #a855f7, #ec4899)',
    frameImage: '/images/vip-art/frame-neon.png',
    vipOnly: true,
  },
  {
    id: 'frame_fire',
    category: 'frame',
    name: 'Kral Medalyonu',
    price: 1800,
    desc: 'Klassik oyma naxışlı, qızılı işıqlı dairəvi çərçivə.',
    previewEmoji: '🔥',
    styleClass: 'frameFire',
    gradient: 'linear-gradient(135deg, #ef4444, #f97316, #fbbf24)',
    frameImage: '/images/vip-art/frame-fire.png',
    vipOnly: true,
  },
  {
    id: 'frame_diamond',
    category: 'frame',
    name: 'Səmavi Medalyon',
    price: 3000,
    desc: 'Fil sümüyü rəngli həndəsi oyma ilə premium portret halqası.',
    previewEmoji: '💎',
    styleClass: 'frameDiamond',
    gradient: 'linear-gradient(135deg, #e0f2fe, #38bdf8, #818cf8, #c084fc)',
    frameImage: '/images/vip-art/frame-diamond.png',
    vipOnly: true,
    platinumOnly: true,
  },

  // Arxa fonlar
  {
    id: 'banner_sunset',
    category: 'banner',
    name: 'Qızılı Qum Təpələri',
    price: 1000,
    desc: 'Omanın gün batımında narıncı qum təpələri.',
    previewEmoji: '',
    image: '/images/vip-art/dunes.jpg',
    gradient: 'linear-gradient(135deg, #f97316 0%, #ec4899 50%, #8b5cf6 100%)',
    vipOnly: true,
  },
  {
    id: 'banner_aurora',
    category: 'banner',
    name: 'Buzlu Aurora',
    price: 1200,
    desc: 'Aurora borealis effekti.',
    previewEmoji: '',
    image: '/images/vip-art/frost.jpg',
    gradient: 'linear-gradient(135deg, #06b6d4 0%, #8b5cf6 40%, #22c55e 100%)',
    vipOnly: true,
  },
  {
    id: 'banner_midnight',
    category: 'banner',
    name: 'Ulduzlu Alp Dağları',
    price: 1000,
    desc: 'Dolomit dağlarının üstündə ulduzlu gecə.',
    previewEmoji: '',
    image: '/images/vip-art/starmountain.jpg',
    gradient: 'linear-gradient(135deg, #0f172a 0%, #312e81 50%, #1e1b4b 100%)',
    vipOnly: true,
  },
  {
    id: 'banner_volcano',
    category: 'banner',
    name: 'Vulkan Alovu',
    price: 1400,
    desc: 'Qırmızı lava effekti.',
    previewEmoji: '',
    image: '/images/vip-art/volcano.jpg',
    gradient: 'linear-gradient(135deg, #450a0a 0%, #dc2626 45%, #f97316 100%)',
    vipOnly: true,
  },
  {
    id: 'banner_ocean',
    category: 'banner',
    name: 'Biolüminessent Okean',
    price: 1000,
    desc: 'Gecə parlayan mavi okean dalğaları.',
    previewEmoji: '',
    image: '/images/vip-art/ocean.jpg',
    gradient: 'linear-gradient(135deg, #0c4a6e 0%, #0284c7 50%, #06b6d4 100%)',
    vipOnly: true,
  },
  {
    id: 'banner_galaxy',
    category: 'banner',
    name: 'Kosmik Dumanlıq',
    price: 1800,
    desc: 'Platinum ekskluziv kosmik banner.',
    previewEmoji: '',
    image: '/images/vip-art/nebula.jpg',
    gradient: 'linear-gradient(135deg, #020617 0%, #4c1d95 35%, #ec4899 70%, #06b6d4 100%)',
    vipOnly: true,
    platinumOnly: true,
  },
  {
    id: 'banner_royal',
    category: 'banner',
    name: 'Səhra Alatoranı',
    price: 1600,
    desc: 'Wadi Rum qayaları üzərində bənövşəyi gün batımı.',
    previewEmoji: '',
    image: '/images/vip-art/desert.jpg',
    gradient: 'linear-gradient(135deg, #312e81 0%, #7c3aed 48%, #fbbf24 100%)',
    vipOnly: true,
  },
  {
    id: 'banner_emerald',
    category: 'banner',
    name: 'Dumanlı Meşə',
    price: 1300,
    desc: 'Ağacların arasından süzülən günəş və duman.',
    previewEmoji: '',
    image: '/images/vip-art/forest.jpg',
    gradient: 'linear-gradient(135deg, #052e16 0%, #15803d 48%, #4ade80 100%)',
    vipOnly: true,
  },
  {
    id: 'banner_sakura',
    category: 'banner',
    name: 'Bahar Çiçəkləri',
    price: 1500,
    desc: 'Yumşaq günəş işığında çəhrayı çiçəklər.',
    previewEmoji: '',
    image: '/images/vip-art/blossom.jpg',
    gradient: 'linear-gradient(135deg, #4a044e 0%, #db2777 52%, #fda4af 100%)',
    vipOnly: true,
  },
  {
    id: 'banner_nebula',
    category: 'banner',
    name: 'Buz Mağarası',
    price: 2100,
    desc: 'İslandiyanın buzlağındakı mavi mağara teksturası.',
    previewEmoji: '',
    image: '/images/vip-art/ice.jpg',
    gradient: 'linear-gradient(135deg, #020617 0%, #4338ca 38%, #c026d3 72%, #22d3ee 100%)',
    vipOnly: true,
    platinumOnly: true,
  },
  {
    id: 'banner_sunforge',
    category: 'banner',
    name: 'Sakura Gecəsi',
    price: 1700,
    desc: 'Gecə işığında çiçək açan sakura ağacları.',
    previewEmoji: '',
    image: '/images/vip-art/sakura.jpg',
    gradient: 'linear-gradient(135deg, #7c2d12 0%, #f97316 45%, #fde047 100%)',
    vipOnly: true,
  },

];

export const COSMETIC_CATEGORIES: { id: CosmeticCategory | 'all'; label: string }[] = [
  { id: 'all', label: 'Hamısı' },
  { id: 'vip', label: '👑 VIP' },
  { id: 'nameStyle', label: '✍️ Yazı' },
  { id: 'frame', label: '🖼️ Çərçivə' },
  { id: 'banner', label: '🎨 Fon' },
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

export function resolveBannerImage(cosmetics: PlayerCosmetics | undefined | null): string | undefined {
  const bannerId = cosmetics?.equipped?.bannerId;
  return bannerId ? getCosmeticProduct(bannerId)?.image : undefined;
}

export function resolveFrameGradient(cosmetics: PlayerCosmetics | undefined | null): string | undefined {
  const frameId = cosmetics?.equipped?.frameId;
  if (!frameId) return undefined;
  return getCosmeticProduct(frameId)?.gradient;
}

export function resolveFrameImage(cosmetics: PlayerCosmetics | undefined | null): string | undefined {
  const frameId = cosmetics?.equipped?.frameId;
  if (!frameId) return undefined;
  return getCosmeticProduct(frameId)?.frameImage;
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
