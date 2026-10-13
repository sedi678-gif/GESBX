import type { GameMode } from '../modes/types';
import type { GameSnapshot } from './types';
import { createEnergyState } from '../energy/createEnergyState';

export function createGame(mode: GameMode): GameSnapshot {
  return {
    id: '',
    mode,
    status: 'idle',
    players: [],
    tableCardIds: [],
    energy: createEnergyState(mode),
  };
}
