import {
  collection,
  onSnapshot,
  query,
  where,
  Unsubscribe,
} from 'firebase/firestore';
import { db } from '@/firebase';

export interface CallHistoryItem {
  callId: string;
  peerId: string;
  peerName: string;
  callType: 'voice' | 'video';
  direction: 'incoming' | 'outgoing';
  status: string;
  createdAt: number;
}

export function listenCallHistory(
  userId: string,
  callback: (items: CallHistoryItem[]) => void
): Unsubscribe {
  const map = new Map<string, CallHistoryItem>();

  const merge = () => {
    const items = Array.from(map.values()).sort((a, b) => b.createdAt - a.createdAt);
    callback(items.slice(0, 50));
  };

  const ingest = (data: Record<string, unknown>, id: string) => {
    const callerId = String(data.callerId || '');
    const calleeId = String(data.calleeId || '');
    if (callerId !== userId && calleeId !== userId) return;

    const direction = callerId === userId ? 'outgoing' : 'incoming';
    const peerId = direction === 'outgoing' ? calleeId : callerId;
    const peerName =
      direction === 'outgoing'
        ? String(data.calleeName || 'İstifadəçi')
        : String(data.callerName || 'İstifadəçi');

    map.set(id, {
      callId: String(data.callId || id),
      peerId,
      peerName,
      callType: (data.callType as 'voice' | 'video') || 'voice',
      direction,
      status: String(data.status || 'ended'),
      createdAt: (data.createdAt as number) || 0,
    });
    merge();
  };

  const unsub1 = onSnapshot(
    query(collection(db, 'call_sessions'), where('callerId', '==', userId)),
    (snap) => {
      snap.forEach((d) => ingest(d.data(), d.id));
    }
  );

  const unsub2 = onSnapshot(
    query(collection(db, 'call_sessions'), where('calleeId', '==', userId)),
    (snap) => {
      snap.forEach((d) => ingest(d.data(), d.id));
    }
  );

  return () => {
    unsub1();
    unsub2();
  };
}
