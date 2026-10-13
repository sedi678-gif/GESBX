/** Kəndli spritesheet — image_6.png (4 sətir × 12 sütun, 64×64 px kadrlar) */

export const PEASANT_SHEET_URL = '/images/alliance-sprites/image_6.png';

export const PEASANT_FRAME_W = 64;
export const PEASANT_FRAME_H = 64;
export const PEASANT_COLS = 12;
export const PEASANT_ROWS = 4;

/** Sətir indeksləri (0 = yuxarı): Right, Up-mix, Down-mix, Left */
export const PEASANT_ROW_RIGHT = 0;
export const PEASANT_ROW_LEFT = 3;

/** Ekranda göstərilən ölçü — çadır miqyası */
export const PEASANT_DISPLAY_SIZE = 48;

/** Qala fonu istinad ölçüsü (patrul koordinatları bu canvasa nisbətən) */
export const CASTLE_REF_W = 800;
export const CASTLE_REF_H = 600;

/** Həyət torpaq yolu — çadır/bina üstünə çıxmır */
export const PEASANT_PATROL = {
  startX: 300,
  startY: 450,
  endX: 550,
  endY: 450,
  /** Bir istiqamətə gediş müddəti (ms) — 5–7 saniyə */
  walkMs: 6000,
  pauseMs: 450,
} as const;

export type PeasantDirection = 'right' | 'left';

export interface ImageLayoutRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** object-fit: contain ilə render olunmuş fon qutusunu hesablayır */
export function getContainedImageRect(
  containerW: number,
  containerH: number,
  imageW: number,
  imageH: number
): ImageLayoutRect {
  if (containerW <= 0 || containerH <= 0 || imageW <= 0 || imageH <= 0) {
    return { x: 0, y: 0, width: containerW, height: containerH };
  }

  const scale = Math.min(containerW / imageW, containerH / imageH);
  const width = imageW * scale;
  const height = imageH * scale;

  return {
    x: (containerW - width) / 2,
    y: (containerH - height) / 2,
    width,
    height,
  };
}

/** İstinad canvas koordinatını ekran pikselinə çevirir */
export function refPointToScreen(
  refX: number,
  refY: number,
  layout: ImageLayoutRect
): { x: number; y: number } {
  return {
    x: layout.x + (refX / CASTLE_REF_W) * layout.width,
    y: layout.y + (refY / CASTLE_REF_H) * layout.height,
  };
}
