import type { MapViewMode } from './allianceMapPixiOverlay';

export interface CastleMarkerOpts {
  name: string;
  score: number;
  region: string;
  viewMode: MapViewMode;
  isActive: boolean;
  isHighlighted: boolean;
  isAttackTarget: boolean;
  isUnderSiege: boolean;
}

/** Leaflet divIcon HTML — ölkə baxışında kompakt, yaxınlaşdıqda tam qala */
export function buildCastleMarkerHtml(opts: CastleMarkerOpts): string {
  const {
    name,
    score,
    region,
    viewMode,
    isActive,
    isHighlighted,
    isAttackTarget,
    isUnderSiege,
  } = opts;

  const classes = [
    'alliance-castle',
    viewMode === 'country' ? 'alliance-castle--country' : 'alliance-castle--region',
    isActive ? 'alliance-castle--mine' : '',
    isHighlighted ? 'alliance-castle--highlight' : '',
    isAttackTarget ? 'alliance-castle--target' : '',
    isUnderSiege ? 'alliance-castle--siege' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const shortName = name.length > 12 ? `${name.slice(0, 11)}…` : name;

  if (viewMode === 'country') {
    return `
      <div class="${classes}">
        <div class="alliance-castle__tower">🏰</div>
        <div class="alliance-castle__name">${shortName}</div>
        <div class="alliance-castle__score">⭐ ${score}</div>
        ${isAttackTarget ? '<div class="alliance-castle__siege-badge">🎯</div>' : ''}
        ${isUnderSiege ? '<div class="alliance-castle__siege-badge">⚔️</div>' : ''}
      </div>`;
  }

  return `
    <div class="${classes}">
      <div class="alliance-castle__tower alliance-castle__tower--lg">🏰</div>
      <div class="alliance-castle__label">${shortName}</div>
      <div class="alliance-castle__meta">${region} · ${score} xal</div>
      ${isAttackTarget ? '<div class="alliance-castle__target-ring" aria-hidden="true"></div>' : ''}
      ${isUnderSiege ? '<div class="alliance-castle__siege-badge">⚔️ HÜCUM</div>' : ''}
    </div>`;
}

export function castleIconSize(viewMode: MapViewMode): [number, number] {
  return viewMode === 'country' ? [80, 62] : [110, 78];
}

export function castleIconAnchor(viewMode: MapViewMode): [number, number] {
  return viewMode === 'country' ? [40, 54] : [55, 68];
}
