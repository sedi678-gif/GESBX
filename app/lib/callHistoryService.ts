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
      createdAt: (() => {
        const raw = data.createdAt ?? data.startedAt ?? data.startTime ?? data.timestamp;
        if (typeof raw === 'number' && Number.isFinite(raw)) {
          return raw > 0 && raw < 100_000_000_000 ? raw * 1000 : raw;
        }
        if (raw && typeof raw === 'object') {
          const timestamp = raw as { toMillis?: () => number; seconds?: number; _seconds?: number };
          if (typeof timestamp.toMillis === 'function') return timestamp.toMillis();
          const seconds = Number(timestamp.seconds ?? timestamp._seconds);
          if (Number.isFinite(seconds) && seconds > 0) return seconds * 1000;
        }
        if (typeof raw === 'string') {
          const parsed = Date.parse(raw);
          if (Number.isFinite(parsed)) return parsed;
        }
        return 0;
      })(),
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
