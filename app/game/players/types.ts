export type GamePlayerId = string;

export type GameRole = 'LIDER' | 'HELP_LIDER' | 'CLICKER' | 'MEMBER';

export interface GamePlayer {
  id: GamePlayerId;
  name: string;
  role: GameRole | null;
  side: 'home' | 'away';
}
