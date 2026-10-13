import type { GameMode } from '../modes/types';
import type { EnergyState } from './types';
import { energyLimitForMode } from './limits';

export function createEnergyState(mode: GameMode): EnergyState {
  const max = energyLimitForMode(mode);
  return { current: max, max };
}
