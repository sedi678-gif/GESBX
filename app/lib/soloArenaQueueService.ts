import { doc, onSnapshot, type Unsubscribe } from 'firebase/firestore';
import { auth, db } from '@/firebase';
import { callSecureFunction } from './secureFunctions';

export type SoloArenaQueueState = {
  state: 'waiting' | 'matched' | 'ineligible' | 'idle';
  matchId?: string | null;
  opponentName?: string | null;
  updatedAt?: number;
};

export async function queueSoloArenaMatch(userId: string): Promise<SoloArenaQueueState> {
  return callSecureFunction<{ userId: string }, SoloArenaQueueState>('queueSoloArenaMatch', { userId });
}

export async function cancelSoloArenaQueue(userId: string): Promise<{ cancelled: boolean }> {
  return callSecureFunction<{ userId: string }, { cancelled: boolean }>('cancelSoloArenaQueue', { userId });
}

export function listenSoloArenaQueue(
  onChange: (state: SoloArenaQueueState) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  const uid = auth.currentUser?.uid;
  if (!uid) {
    onChange({ state: 'idle', matchId: null, opponentName: null, updatedAt: 0 });
    return () => undefined;
  }
  return onSnapshot(doc(db, 'solo_arena_queue', uid), (snapshot) => {
    if (!snapshot.exists()) {
      onChange({ state: 'idle', matchId: null, opponentName: null, updatedAt: 0 });
      return;
    }
    const data = snapshot.data();
    const state = data.state === 'waiting' || data.state === 'matched' || data.state === 'ineligible'
      ? data.state
      : 'idle';
    onChange({
      state,
      matchId: typeof data.matchId === 'string' ? data.matchId : null,
      opponentName: typeof data.opponentName === 'string' ? data.opponentName : null,
      updatedAt: typeof data.updatedAt === 'number' ? data.updatedAt : 0,
    });
  }, (error) => onError?.(error));
}
