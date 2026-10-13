import {
  collection,
  doc,
  onSnapshot,
  setDoc,
  Unsubscribe,
} from 'firebase/firestore';
import { db } from '@/firebase';
import { ensureFirebaseAuth } from '@/app/lib/firebaseAuth';
import {
  DISCOVER_BOOST_COLLECTION,
  DISCOVER_BOOST_MS,
} from './discoverBoostConfig';

export function remainingDiscoverBoostMs(until: number, now = Date.now()): number {
  if (!Number.isFinite(until) || until <= now) return 0;
  return until - now;
}

export function isDiscoverBoostActive(until: number, now = Date.now()): boolean {
  return remainingDiscoverBoostMs(until, now) > 0;
}

export async function activateDiscoverBoost(userId: string, now = Date.now()): Promise<number> {
  if (!userId || userId === 'anonim_user_id') {
    throw new Error('Kəşf boostu üçün profil tələb olunur.');
  }

  await ensureFirebaseAuth();
  const until = now + DISCOVER_BOOST_MS;
  await setDoc(doc(db, DISCOVER_BOOST_COLLECTION, userId), {
    userId,
    until,
    updatedAt: now,
  });
  return until;
}

function mapBoostUntil(raw: Record<string, unknown> | undefined): number {
  const until = Number(raw?.until);
  return Number.isFinite(until) ? until : 0;
}

export function listenDiscoverBoostMap(
  callback: (boosts: Map<string, number>) => void
): Unsubscribe {
  return onSnapshot(
    collection(db, DISCOVER_BOOST_COLLECTION),
    (snap) => {
      const boosts = new Map<string, number>();
      snap.forEach((d) => {
        const until = mapBoostUntil(d.data() as Record<string, unknown>);
        if (until > 0) boosts.set(d.id, until);
      });
      callback(boosts);
    },
    (err) => {
      console.error('Kəşf boost oxunmadı:', err);
      callback(new Map());
    }
  );
}

export function listenUserDiscoverBoost(
  userId: string,
  callback: (until: number) => void
): Unsubscribe {
  if (!userId || userId === 'anonim_user_id') {
    callback(0);
    return () => {};
  }

  return onSnapshot(
    doc(db, DISCOVER_BOOST_COLLECTION, userId),
    (snap) => {
      callback(mapBoostUntil(snap.data() as Record<string, unknown> | undefined));
    },
    (err) => {
      console.error('Kəşf boost oxunmadı:', err);
      callback(0);
    }
  );
}
