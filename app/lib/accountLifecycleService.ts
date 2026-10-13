import {
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  setDoc,
  Unsubscribe,
} from 'firebase/firestore';
import { deleteUser, signOut } from 'firebase/auth';
import { auth, db } from '@/firebase';
import { SUPER_ADMIN_ID } from './adminConfig';
import { notifyUserIdChanged } from './userId';

export type AccountStatus = {
  exists: boolean;
  frozen: boolean;
  banned: boolean;
};

const GUEST_IDS = new Set(['', 'anonim_user_id', 'guest']);

export function isRealAccountId(userId: string | null | undefined): boolean {
  const id = String(userId || '').trim();
  if (!id || GUEST_IDS.has(id)) return false;
  return /^\d+$/.test(id);
}

function authMeta() {
  const current = auth.currentUser;
  return {
    firebaseUid: current?.uid ?? null,
    email: current?.email ?? null,
    updatedAt: Date.now(),
  };
}

export async function getAccountStatus(userId: string): Promise<AccountStatus> {
  if (!isRealAccountId(userId)) {
    return { exists: false, frozen: false, banned: false };
  }
  const snap = await getDoc(doc(db, 'users', userId));
  if (!snap.exists()) return { exists: false, frozen: false, banned: false };
  const data = snap.data() as Record<string, unknown>;
  return {
    exists: true,
    frozen: Boolean(data.frozen),
    banned: Boolean(data.banned),
  };
}

export function listenAccountStatus(
  userId: string,
  callback: (status: AccountStatus) => void
): Unsubscribe {
  if (!isRealAccountId(userId)) {
    callback({ exists: false, frozen: false, banned: false });
    return () => {};
  }

  return onSnapshot(
    doc(db, 'users', userId),
    (snap) => {
      if (!snap.exists()) {
        callback({ exists: false, frozen: false, banned: false });
        return;
      }
      const data = snap.data() as Record<string, unknown>;
      callback({
        exists: true,
        frozen: Boolean(data.frozen),
        banned: Boolean(data.banned),
      });
    },
    () => callback({ exists: false, frozen: false, banned: false })
  );
}

export async function freezeOwnAccount(userId: string): Promise<void> {
  if (!isRealAccountId(userId)) throw new Error('Hesab tapılmadı');
  const now = Date.now();
  const extra = authMeta();
  await setDoc(
    doc(db, 'users', userId),
    { frozen: true, frozenAt: now, frozenBy: 'self', ...extra },
    { merge: true }
  );
  await setDoc(doc(db, 'players', userId), { frozen: true, updatedAt: now }, { merge: true });
}

export async function unfreezeOwnAccount(userId: string): Promise<void> {
  if (!isRealAccountId(userId)) throw new Error('Hesab tapılmadı');
  const now = Date.now();
  const extra = authMeta();
  await setDoc(
    doc(db, 'users', userId),
    { frozen: false, frozenAt: null, unfrozenAt: now, ...extra },
    { merge: true }
  );
  await setDoc(doc(db, 'players', userId), { frozen: false, updatedAt: now }, { merge: true });
}

export function clearLocalAccountSession() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem('app_current_user_v6');
  localStorage.removeItem('app_user_alliance_name');
  localStorage.removeItem('app_user_alliance_fortress_level');
  notifyUserIdChanged();
}

export async function deleteOwnAccount(userId: string): Promise<void> {
  if (!isRealAccountId(userId)) throw new Error('Hesab tapılmadı');
  if (String(userId).trim() === SUPER_ADMIN_ID) {
    throw new Error('Admin hesabı silinə bilməz');
  }

  await Promise.allSettled([
    deleteDoc(doc(db, 'users', userId)),
    deleteDoc(doc(db, 'players', userId)),
    deleteDoc(doc(db, 'user_settings', userId)),
  ]);

  clearLocalAccountSession();

  const current = auth.currentUser;
  if (current && !current.isAnonymous) {
    try {
      await deleteUser(current);
    } catch {
      try {
        await signOut(auth);
      } catch {
        /* ignore */
      }
    }
  }
}
