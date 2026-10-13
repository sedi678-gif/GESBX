import type { GameMode } from '../modes/types';
import type { GamePlayer } from '../players/types';
import type { GameCardId } from '../cards/types';
import type { EnergyState } from '../energy/types';

export type GameId = string;

export type GameStatus = 'idle' | 'lobby' | 'active' | 'finished';

export interface GameSnapshot {
  id: GameId;
  mode: GameMode;
  status: GameStatus;
  players: GamePlayer[];
  tableCardIds: GameCardId[];
  energy: EnergyState;
}
