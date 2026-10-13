import { doc, getDoc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '@/firebase';
import { requireFirebaseAuth } from '@/app/lib/firebaseAuth';
import { timestampToMs } from '@/app/lib/battleEventLog/battleEventLog';

export const SERVER_CLOCK_COLLECTION = 'server_clock';

type ClockListener = (serverNow: number) => void;

let originServerMs = 0;
let originMonoMs = 0;
let syncing: Promise<number> | null = null;

const listeners = new Set<ClockListener>();
let sharedUnsubSnap: (() => void) | null = null;
let sharedTick: number | null = null;
let sharedResync: number | null = null;
let sharedStarted = false;
let clockAuthCancelled = false;

/** Telefon saatından asılı deyil — performance.now() + server timestamp. */
export function serverNowMs(): number {
  if (originServerMs <= 0) return 0;
  return originServerMs + (performance.now() - originMonoMs);
}

export function hasServerClock(): boolean {
  return originServerMs > 0;
}

function clockRef(uid: string) {
  return doc(db, SERVER_CLOCK_COLLECTION, uid);
}

function applyServerSample(serverMs: number) {
  if (serverMs <= 0) return;
  originServerMs = serverMs;
  originMonoMs = performance.now();
}

function emitClock() {
  if (originServerMs <= 0) return;
  const now = serverNowMs();
  listeners.forEach((fn) => fn(now));
}

function onVisible() {
  if (document.visibilityState !== 'visible') return;
  void syncServerClock().catch(() => {});
}

function onOnline() {
  void syncServerClock().catch(() => {});
}

function startSharedClock() {
  if (sharedStarted) return;
  sharedStarted = true;
  clockAuthCancelled = false;

  void requireFirebaseAuth()
    .then((user) => {
      if (clockAuthCancelled) return;
      sharedUnsubSnap = onSnapshot(clockRef(user.uid), (snap) => {
        if (!snap.exists()) return;
        applyServerSample(timestampToMs(snap.data().t));
        emitClock();
      });
      void syncServerClock().catch(() => {});
    })
    .catch(() => {});

  sharedTick = window.setInterval(emitClock, 500);

  sharedResync = window.setInterval(() => {
    void syncServerClock().catch(() => {});
  }, 20_000);

  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener('online', onOnline);
}

function stopSharedClock() {
  clockAuthCancelled = true;
  sharedUnsubSnap?.();
  sharedUnsubSnap = null;
  if (sharedTick != null) window.clearInterval(sharedTick);
  if (sharedResync != null) window.clearInterval(sharedResync);
  sharedTick = null;
  sharedResync = null;
  document.removeEventListener('visibilitychange', onVisible);
  window.removeEventListener('online', onOnline);
  sharedStarted = false;
}

export async function syncServerClock(): Promise<number> {
  if (syncing) return syncing;
  syncing = (async () => {
    const user = await requireFirebaseAuth();
    const ref = clockRef(user.uid);
    await setDoc(ref, {
      t: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const snap = await getDoc(ref);
      const ms = timestampToMs(snap.data()?.t);
      if (ms > 0) {
        applyServerSample(ms);
        emitClock();
        return serverNowMs();
      }
      await new Promise((resolve) => setTimeout(resolve, 40));
    }
    return serverNowMs();
  })().finally(() => {
    syncing = null;
  });
  return syncing;
}

/** Bütün arena panelləri eyni 500ms interval + bir Firestore saat sənədini paylaşır. */
export function listenServerClock(onTick: ClockListener): () => void {
  listeners.add(onTick);
  startSharedClock();
  if (originServerMs > 0) onTick(serverNowMs());
  return () => {
    listeners.delete(onTick);
    if (listeners.size === 0) stopSharedClock();
  };
}
