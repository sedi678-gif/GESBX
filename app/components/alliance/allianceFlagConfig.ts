import {
  AllianceFlagConfig,
  AllianceFlagPattern,
  AllianceFlagShape,
} from './types';

export const DEFAULT_ALLIANCE_FLAG: AllianceFlagConfig = {
  backgroundColor: '#7f1d1d',
  accentColor: '#fbbf24',
  thirdColor: '#f8fafc',
  emblem: '🦁',
  pattern: 'canton',
  shape: 'rect',
};

export const FLAG_BG_PRESETS = [
  '#7f1d1d',
  '#991b1b',
  '#9a3412',
  '#854d0e',
  '#3f6212',
  '#14532d',
  '#115e59',
  '#1e3a8a',
  '#1d4ed8',
  '#4c1d95',
  '#701a75',
  '#9d174d',
  '#0f172a',
  '#334155',
  '#44403c',
  '#171717',
] as const;

export const FLAG_ACCENT_PRESETS = [
  '#fbbf24',
  '#f59e0b',
  '#fef08a',
  '#ffffff',
  '#e2e8f0',
  '#fca5a5',
  '#fb7185',
  '#c084fc',
  '#93c5fd',
  '#67e8f9',
  '#86efac',
  '#bef264',
] as const;

export const FLAG_THIRD_PRESETS = [
  '#f8fafc',
  '#0f172a',
  '#fbbf24',
  '#dc2626',
  '#2563eb',
  '#16a34a',
] as const;

export const FLAG_EMBLEM_PRESETS = [
  '🦁', '🐺', '🦅', '🐉', '🦊', '🐻', '🐗', '🦂',
  '⚔️', '🛡️', '🏰', '👑', '🔱', '🏹', '🪓', '☠️',
  '🔥', '❄️', '⚡', '🌙', '☀️', '⭐', '💎', '🔮',
  '🌹', '🌲', '🌊', '🏔️', '⚜️', '🎯', '🧿', '💀',
] as const;

export const FLAG_PATTERN_OPTIONS: { id: AllianceFlagPattern; label: string }[] = [
  { id: 'solid', label: 'Düz' },
  { id: 'split-h', label: 'Yarı üfüqi' },
  { id: 'split-v', label: 'Yarı şaquli' },
  { id: 'stripes-h', label: 'Üfüqi zolaq' },
  { id: 'stripes-v', label: 'Şaquli zolaq' },
  { id: 'tricolor-h', label: 'Üç zolaq' },
  { id: 'tricolor-v', label: 'Üç sütun' },
  { id: 'diagonal', label: 'Diaqonal' },
  { id: 'cross', label: 'Xaç' },
  { id: 'saltire', label: 'Çarpaz' },
  { id: 'chevron', label: 'Ox' },
  { id: 'canton', label: 'Kanton' },
  { id: 'border', label: 'Haşiyə' },
  { id: 'checkered', label: 'Şahmat' },
  { id: 'sunburst', label: 'Günəş' },
  { id: 'gradient', label: 'Qradient' },
  { id: 'triangle', label: 'Üçbucaq' },
  { id: 'fess', label: 'Kəmər' },
  { id: 'pale', label: 'Sütun' },
];

export const FLAG_SHAPE_OPTIONS: { id: AllianceFlagShape; label: string }[] = [
  { id: 'rect', label: 'Düzbucaq' },
  { id: 'swallowtail', label: 'Qırlangıc' },
  { id: 'banner', label: 'Bayraq' },
  { id: 'shield', label: 'Qalxan' },
];

const PATTERN_IDS = new Set(FLAG_PATTERN_OPTIONS.map((p) => p.id));
const SHAPE_IDS = new Set(FLAG_SHAPE_OPTIONS.map((s) => s.id));

export function normalizeAllianceFlag(flag?: Partial<AllianceFlagConfig> | null): AllianceFlagConfig {
  const pattern = flag?.pattern && PATTERN_IDS.has(flag.pattern) ? flag.pattern : DEFAULT_ALLIANCE_FLAG.pattern;
  const shape = flag?.shape && SHAPE_IDS.has(flag.shape) ? flag.shape : 'rect';

  const normalized: AllianceFlagConfig = {
    backgroundColor: flag?.backgroundColor || DEFAULT_ALLIANCE_FLAG.backgroundColor,
    accentColor: flag?.accentColor || DEFAULT_ALLIANCE_FLAG.accentColor,
    thirdColor: flag?.thirdColor || DEFAULT_ALLIANCE_FLAG.thirdColor,
    emblem: flag?.emblem || DEFAULT_ALLIANCE_FLAG.emblem,
    pattern,
    shape,
  };

  if (typeof flag?.imageUrl === 'string' && flag.imageUrl.trim()) {
    normalized.imageUrl = flag.imageUrl.trim();
    if (typeof flag.imageUpdatedAt === 'number') {
      normalized.imageUpdatedAt = flag.imageUpdatedAt;
    }
  }

  return normalized;
}
