export const RAID_MAX_UNITS = 5;

/** Qala şəkli 40×44 px — qəhrəman hündürlüyü buna yaxın olsun */
export const CASTLE_HERO_TARGET_PX = 38;

/** Qala pin-i ətrafında dairə */
export const RAID_SPAWN_RADIUS = 36;

export function raidUnitCount(cardCount: number | undefined): number {
  return Math.min(RAID_MAX_UNITS, Math.max(1, Math.round(cardCount || 1)));
}

export interface RaidSpawnPoint {
  x: number;
  z: number;
}

export function computeRaidSpawnPoint(
  castleX: number,
  castleZ: number,
  ringIndex: number,
  ringTotal: number,
  zoomScale = 1
): RaidSpawnPoint {
  const n = Math.max(1, ringTotal);
  const s = Math.max(0.5, zoomScale);
  // Qalanın sol/sağından başla — üz qalaya yan baxsın, yuxarıda arxası görünməsin
  const angle = (2 * Math.PI * ringIndex) / n + Math.PI;
  const radius = (RAID_SPAWN_RADIUS + (ringIndex % 3) * 5) * s;
  return {
    x: castleX + Math.cos(angle) * radius,
    z: castleZ - 6 * s + Math.sin(angle) * radius * 0.45,
  };
}

export interface RaidHeroMotion {
  x: number;
  y: number;
  rotationY: number;
  radius: number;
  approaching: boolean;
}

export function computeRaidHeroMotion(
  castleX: number,
  castleY: number,
  ringIndex: number,
  ringTotal: number,
  zoomScale = 1
): RaidHeroMotion {
  const spawn = computeRaidSpawnPoint(castleX, castleY, ringIndex, ringTotal, zoomScale);
  const dx = castleX - spawn.x;
  return {
    x: spawn.x,
    y: spawn.z,
    rotationY: Math.atan2(dx, castleY - spawn.z),
    radius: RAID_SPAWN_RADIUS * Math.max(0.5, zoomScale),
    approaching: false,
  };
}
