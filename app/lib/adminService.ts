import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  limit,
  runTransaction,
  Unsubscribe,
} from 'firebase/firestore';
import { db } from '@/firebase';
import { ensureFirebaseAuth } from '@/app/lib/firebaseAuth';
import { manatWritePatch, readStoredManat, resolvePlayerManat, ADMIN_START_MANAT } from '@/app/lib/manat';
import { SUPER_ADMIN_ID } from './adminConfig';

export interface AdminConfigDoc {
  superAdminId: string;
  minNewUserId: number;
  updatedAt: number;
}

export interface AdminUserRow {
  id: string;
  name: string;
  handle: string;
  banned?: boolean;
  frozen?: boolean;
  punishedUntil?: number;
  isModerator?: boolean;
  manat?: number;
}

export interface AdminReportRow {
  id: string;
  reporterId: string;
  targetUserId: string;
  targetPostId?: string;
  reason: string;
  type: string;
  status: string;
  createdAt: number;
}

export interface AdminMessageRow {
  id: string;
  senderId: string;
  recipientId: string;
  text?: string;
  createdAt: number;
}

export interface AdminCommandRow {
  id: string;
  adminId: string;
  action: string;
  targetUserId?: string;
  targetReportId?: string;
  details?: Record<string, unknown>;
  createdAt: number;
}

function assertSuperAdmin(adminId: string) {
  if (String(adminId).trim() !== SUPER_ADMIN_ID) {
    throw new Error('Admin icazəsi yoxdur');
  }
}

export async function ensureAdminConfig(): Promise<AdminConfigDoc> {
  const ref = doc(db, 'app_config', 'admin');
  const snap = await getDoc(ref);
  if (snap.exists()) {
    return snap.data() as AdminConfigDoc;
  }
  const config: AdminConfigDoc = {
    superAdminId: SUPER_ADMIN_ID,
    minNewUserId: 2,
    updatedAt: Date.now(),
  };
  await setDoc(ref, config);
  return config;
}

export async function verifySuperAdminInFirebase(userId: string): Promise<boolean> {
  if (String(userId).trim() !== SUPER_ADMIN_ID) return false;
  const snap = await getDoc(doc(db, 'users', SUPER_ADMIN_ID));
  if (!snap.exists()) return false;
  const data = snap.data() as Record<string, unknown>;
  return data.role === 'super_admin' || data.isAdmin === true;
}

export function listenSuperAdminAccess(
  userId: string,
  callback: (allowed: boolean) => void
): Unsubscribe {
  if (String(userId).trim() !== SUPER_ADMIN_ID) {
    callback(false);
    return () => {};
  }
  return onSnapshot(
    doc(db, 'users', SUPER_ADMIN_ID),
    (snap) => {
      if (!snap.exists()) {
        callback(true);
        return;
      }
      const data = snap.data() as Record<string, unknown>;
      callback(data.role === 'super_admin' || data.isAdmin === true);
    },
    () => callback(true)
  );
}

function parseNumericUserId(raw: unknown): number | null {
  if (raw == null) return null;
  const n = parseInt(String(raw).trim(), 10);
  return Number.isNaN(n) || n < 1 ? null : n;
}

function bumpMax(maxId: number, raw: unknown): number {
  const n = parseNumericUserId(raw);
  return n != null && n > maxId ? n : maxId;
}

/** Firebase bazasından ən böyük rəqəmsal istifadəçi ID-sini oxuyur */
export async function scanMaxNumericUserId(): Promise<number> {
  await ensureFirebaseAuth();

  let maxId = 1;

  try {
    const [usersSnap, playersSnap] = await Promise.all([
      getDocs(collection(db, 'users')),
      getDocs(collection(db, 'players')),
    ]);

    usersSnap.forEach((d) => {
      const data = d.data() as Record<string, unknown>;
      maxId = bumpMax(maxId, d.id);
      maxId = bumpMax(maxId, data.id);
    });

    playersSnap.forEach((d) => {
      const data = d.data() as Record<string, unknown>;
      maxId = bumpMax(maxId, d.id);
      maxId = bumpMax(maxId, data.odId);
    });
  } catch (err) {
    console.warn('[scanMaxNumericUserId] Firebase oxuma xətası:', err);
  }

  return maxId;
}

async function userProfileExists(userId: string): Promise<boolean> {
  const snap = await getDoc(doc(db, 'users', userId));
  return snap.exists();
}

/** Counter-i Firebase-dəki real son ID-yə uyğunlaşdırır */
export async function syncUserIdCounterFromFirebase(): Promise<number> {
  const maxId = await scanMaxNumericUserId();
  await setDoc(
    doc(db, 'counters', 'userIdCounter'),
    { currentId: maxId, reservedAdminId: SUPER_ADMIN_ID, updatedAt: Date.now() },
    { merge: true }
  );
  return maxId;
}

export async function allocateNextUserId(): Promise<string> {
  const config = await ensureAdminConfig();
  const minId = Math.max(2, config.minNewUserId || 2);
  const counterRef = doc(db, 'counters', 'userIdCounter');

  await ensureFirebaseAuth();

  const scannedMax = await scanMaxNumericUserId();
  let nextIdNum = Math.max(minId, scannedMax + 1);

  await runTransaction(db, async (transaction) => {
    const counterDoc = await transaction.get(counterRef);
    const counterCurrent = counterDoc.exists()
      ? Number(counterDoc.data().currentId) || 1
      : scannedMax;
    nextIdNum = Math.max(minId, scannedMax + 1, counterCurrent + 1);
    transaction.set(
      counterRef,
      { currentId: nextIdNum, reservedAdminId: SUPER_ADMIN_ID, updatedAt: Date.now() },
      { merge: true }
    );
  });

  while (await userProfileExists(String(nextIdNum))) {
    nextIdNum += 1;
    await setDoc(
      counterRef,
      { currentId: nextIdNum, reservedAdminId: SUPER_ADMIN_ID, updatedAt: Date.now() },
      { merge: true }
    );
  }

  return `${nextIdNum}`;
}

/** Firebase işləmirsə — əvvəl bazadan skan, sonra lokal counter */
export async function allocateNextUserIdFallback(): Promise<string> {
  try {
    await ensureFirebaseAuth();
    return await allocateNextUserId();
  } catch (err) {
    console.warn('[allocateNextUserIdFallback] Firebase uğursuz, lokal ID:', err);
    return allocateNextUserIdLocal();
  }
}

/** Yalnız brauzer counter (offline) */
export function allocateNextUserIdLocal(): string {
  if (typeof window === 'undefined') return '2';
  const stored = parseInt(localStorage.getItem('app_last_id_num_v6') || '1', 10);
  const next = Math.max(stored, 1) + 1;
  const finalId = Math.max(2, next);
  localStorage.setItem('app_last_id_num_v6', String(finalId));
  return String(finalId);
}

export async function logAdminCommand(payload: {
  adminId: string;
  action: string;
  targetUserId?: string;
  targetReportId?: string;
  details?: Record<string, unknown>;
}) {
  assertSuperAdmin(payload.adminId);
  await addDoc(collection(db, 'admin_commands'), {
    adminId: payload.adminId,
    action: payload.action,
    targetUserId: payload.targetUserId ?? null,
    targetReportId: payload.targetReportId ?? null,
    details: payload.details ?? {},
    createdAt: Date.now(),
  });
}

export async function recordAdminSession(adminId: string, displayName: string, active: boolean) {
  assertSuperAdmin(adminId);
  const ref = doc(db, 'admin_sessions', adminId);
  if (active) {
    await setDoc(ref, { adminId, displayName, active: true, lastLoginAt: Date.now() }, { merge: true });
    await logAdminCommand({ adminId, action: 'admin_login', details: { displayName } });
  } else {
    await setDoc(ref, { active: false, lastLogoutAt: Date.now() }, { merge: true });
    await logAdminCommand({ adminId, action: 'admin_logout' });
  }
}

export function listenAdminCommands(callback: (rows: AdminCommandRow[]) => void): Unsubscribe {
  const q = query(collection(db, 'admin_commands'), orderBy('createdAt', 'desc'), limit(100));
  return onSnapshot(q, (snap) => {
    const rows: AdminCommandRow[] = [];
    snap.forEach((d) => rows.push({ id: d.id, ...(d.data() as Omit<AdminCommandRow, 'id'>) }));
    callback(rows);
  });
}

export async function listAllUsers(): Promise<AdminUserRow[]> {
  const [usersSnap, playersSnap] = await Promise.all([
    getDocs(collection(db, 'users')),
    getDocs(collection(db, 'players')),
  ]);

  const manatById = new Map<string, number>();
  playersSnap.forEach((d) => {
    manatById.set(d.id, resolvePlayerManat(d.data() as Record<string, unknown>));
  });

  const rows: AdminUserRow[] = [];
  usersSnap.forEach((d) => {
    const data = d.data() as Record<string, unknown>;
    const id = (data.id as string) || d.id;
    rows.push({
      id,
      name: [data.name, data.surname].filter(Boolean).join(' ') || '—',
      handle: (data.handle as string) || '',
      banned: data.banned as boolean | undefined,
      frozen: data.frozen as boolean | undefined,
      punishedUntil: data.punishedUntil as number | undefined,
      isModerator: data.isModerator as boolean | undefined,
      manat: manatById.get(id) ?? 0,
    });
  });
  return rows.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
}

export function listenReports(
  callback: (rows: AdminReportRow[]) => void,
  onError?: (message: string) => void
): Unsubscribe {
  const q = query(collection(db, 'reports'), limit(200));
  return onSnapshot(
    q,
    (snap) => {
      const rows: AdminReportRow[] = [];
      snap.forEach((d) => rows.push({ id: d.id, ...(d.data() as Omit<AdminReportRow, 'id'>) }));
      rows.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      callback(rows.slice(0, 100));
    },
    (err) => {
      console.error('Admin reports xətası:', err);
      onError?.('Şikayətlər yüklənmədi.');
      callback([]);
    }
  );
}

export function listenPrivateMessages(callback: (rows: AdminMessageRow[]) => void): Unsubscribe {
  const q = query(collection(db, 'private_messages'), orderBy('createdAt', 'desc'), limit(200));
  return onSnapshot(q, (snap) => {
    const rows: AdminMessageRow[] = [];
    snap.forEach((d) => rows.push({ id: d.id, ...(d.data() as Omit<AdminMessageRow, 'id'>) }));
    callback(rows);
  });
}

export function listenGlobalChat(callback: (rows: { id: string; user: string; text: string; createdAt: number }[]) => void): Unsubscribe {
  const q = query(collection(db, 'global_chat'), orderBy('createdAt', 'desc'), limit(100));
  return onSnapshot(q, (snap) => {
    const rows: { id: string; user: string; text: string; createdAt: number }[] = [];
    snap.forEach((d) => {
      const data = d.data();
      rows.push({
        id: d.id,
        user: data.user || '?',
        text: data.text || '',
        createdAt: data.createdAt || 0,
      });
    });
    callback(rows);
  });
}

export function listenAllianceChat(callback: (rows: { id: string; user: string; text: string; createdAt: number; allianceId?: string }[]) => void): Unsubscribe {
  const q = query(collection(db, 'alliance_chat'), orderBy('createdAt', 'desc'), limit(200));
  return onSnapshot(q, (snap) => {
    const rows: { id: string; user: string; text: string; createdAt: number; allianceId?: string }[] = [];
    snap.forEach((d) => {
      const data = d.data();
      rows.push({
        id: d.id,
        user: data.user || '?',
        text: data.text || '',
        createdAt: data.createdAt || 0,
        allianceId: data.allianceId,
      });
    });
    callback(rows);
  });
}

export async function resolveReport(adminId: string, reportId: string, status: 'resolved' | 'dismissed') {
  assertSuperAdmin(adminId);
  await updateDoc(doc(db, 'reports', reportId), {
    status,
    resolvedAt: Date.now(),
    resolvedBy: adminId,
  });
  await logAdminCommand({ adminId, action: 'resolve_report', targetReportId: reportId, details: { status } });
}

export async function punishUser(adminId: string, userId: string, days: number, reason: string) {
  assertSuperAdmin(adminId);
  const until = Date.now() + days * 24 * 60 * 60 * 1000;
  await setDoc(
    doc(db, 'users', userId),
    { punishedUntil: until, punishReason: reason, updatedAt: Date.now(), punishedBy: adminId },
    { merge: true }
  );
  await setDoc(
    doc(db, 'players', userId),
    { punishedUntil: until, updatedAt: Date.now() },
    { merge: true }
  );
  await logAdminCommand({ adminId, action: 'punish_user', targetUserId: userId, details: { days, reason, until } });
}

export async function banUser(adminId: string, userId: string, banned: boolean) {
  assertSuperAdmin(adminId);
  await setDoc(
    doc(db, 'users', userId),
    { banned, updatedAt: Date.now(), bannedBy: banned ? adminId : null },
    { merge: true }
  );
  await setDoc(doc(db, 'players', userId), { banned, updatedAt: Date.now() }, { merge: true });
  await logAdminCommand({ adminId, action: banned ? 'ban_user' : 'unban_user', targetUserId: userId });
}

export async function deleteUserAccount(adminId: string, userId: string) {
  assertSuperAdmin(adminId);
  if (userId === SUPER_ADMIN_ID) throw new Error('Super admin silinə bilməz');
  await deleteDoc(doc(db, 'users', userId));
  await deleteDoc(doc(db, 'players', userId));
  await logAdminCommand({ adminId, action: 'delete_user', targetUserId: userId });
}

export async function grantModerator(adminId: string, userId: string, grant: boolean) {
  assertSuperAdmin(adminId);
  await setDoc(
    doc(db, 'users', userId),
    { isModerator: grant, canViewReports: grant, updatedAt: Date.now(), moderatorBy: grant ? adminId : null },
    { merge: true }
  );
  await logAdminCommand({ adminId, action: grant ? 'grant_moderator' : 'revoke_moderator', targetUserId: userId });
}

const MAX_GRANT_MANAT = 1_000_000;

export async function grantManatToUser(
  adminId: string,
  targetUserId: string,
  amount: number,
  reason?: string
): Promise<{ previousBalance: number; newBalance: number }> {
  assertSuperAdmin(adminId);

  const targetId = String(targetUserId).trim();
  if (!targetId) throw new Error('İstifadəçi ID-si düzgün deyil');

  const normalizedAmount = Math.floor(amount);
  if (normalizedAmount <= 0) throw new Error('Miqdar 0-dan böyük olmalıdır');
  if (normalizedAmount > MAX_GRANT_MANAT) {
    throw new Error(`Maksimum ${MAX_GRANT_MANAT.toLocaleString('az-AZ')} manat verilə bilər`);
  }

  const userSnap = await getDoc(doc(db, 'users', targetId));
  if (!userSnap.exists()) throw new Error('İstifadəçi tapılmadı');

  const ref = doc(db, 'players', targetId);
  let previousBalance = 0;
  let newBalance = 0;

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    previousBalance = snap.exists()
      ? resolvePlayerManat(snap.data() as Record<string, unknown>)
      : 0;
    newBalance = previousBalance + normalizedAmount;
    tx.set(
      ref,
      { odId: targetId, ...manatWritePatch(newBalance), updatedAt: Date.now() },
      { merge: true }
    );
  });

  await logAdminCommand({
    adminId,
    action: 'grant_manat',
    targetUserId: targetId,
    details: {
      amount: normalizedAmount,
      previousBalance,
      newBalance,
      reason: reason?.trim() || null,
    },
  });

  return { previousBalance, newBalance };
}

export async function bootstrapSuperAdmin(displayName: string) {
  const profile = {
    id: SUPER_ADMIN_ID,
    name: displayName.split(' ')[0] || 'Admin',
    surname: displayName.split(' ').slice(1).join(' ') || '',
    handle: '@admin',
    role: 'super_admin',
    isAdmin: true,
    isModerator: true,
    canViewReports: true,
    canAccessAdminPanel: true,
    updatedAt: Date.now(),
  };
  await setDoc(doc(db, 'users', SUPER_ADMIN_ID), profile, { merge: true });

  const playerRef = doc(db, 'players', SUPER_ADMIN_ID);
  const playerSnap = await getDoc(playerRef);
  const existingManat = playerSnap.exists()
    ? readStoredManat(playerSnap.data() as Record<string, unknown>)
    : null;

  await setDoc(
    playerRef,
    {
      odId: SUPER_ADMIN_ID,
      displayName,
      ...(existingManat != null ? manatWritePatch(existingManat) : manatWritePatch(ADMIN_START_MANAT)),
      isAdmin: true,
      role: 'super_admin',
      updatedAt: Date.now(),
    },
    { merge: true }
  );
  await ensureAdminConfig();

  const counterRef = doc(db, 'counters', 'userIdCounter');
  const counterSnap = await getDoc(counterRef);
  if (!counterSnap.exists()) {
    await syncUserIdCounterFromFirebase();
  }
}
