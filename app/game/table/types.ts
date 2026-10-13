export interface GameTableProps {
  open: boolean;
  onClose: () => void;
  matchId?: string | null;
  playerId?: string | null;
}
