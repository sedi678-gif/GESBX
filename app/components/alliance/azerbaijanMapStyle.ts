/** Azərbaycan xəritəsi — API key tələb etmir (OpenStreetMap) */

export const AZ_MAP_TILE = {
  url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  attribution: '© OpenStreetMap · 🇦🇿 Azərbaycan',
  maxZoom: 19,
} as const;
