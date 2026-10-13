import type { GameMode } from '../modes/types';
import { MODE_SETTINGS } from '../modes/settings';

export function energyLimitForMode(mode: GameMode): number {
  if (mode === '1v1') return MODE_SETTINGS['1v1'].energyMax;
  return 0;
}
