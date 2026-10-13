import { doc, onSnapshot, type Unsubscribe } from 'firebase/firestore';
import { db } from '@/firebase';
import { BATTLE_SCORE_COLLECTION, BATTLE_SCORE_MAX, readBoundedScore } from './battleScoreConfig';

export interface BattlePlayerScore {
  battleId: string;
  playerId: string;
  score: number;
  maxScore: number;
  lastRequestId: string | null;
}

export function battleScoreRef(battleId: string, playerId: string) {
  return doc(db, 'battles', battleId, BATTLE_SCORE_COLLECTION, playerId);
}

export function viewPlayerBattleScore(
  battleId: string,
  playerId: string,
  raw?: Record<string, unknown> | null
): BattlePlayerScore {
  return {
    battleId,
    playerId,
    score: readBoundedScore(raw?.score),
    maxScore: BATTLE_SCORE_MAX,
    lastRequestId: typeof raw?.lastRequestId === 'string' ? raw.lastRequestId : null,
  };
}

export function listenPlayerBattleScore(
  battleId: string,
  playerId: string,
  onChange: (score: BattlePlayerScore | null) => void
): Unsubscribe {
  return onSnapshot(battleScoreRef(battleId, playerId), (snap) => {
    onChange(snap.exists() ? viewPlayerBattleScore(battleId, playerId, snap.data() as Record<string, unknown>) : null);
  });
}
