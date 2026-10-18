import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  orderBy,
  limit,
  Unsubscribe,
} from 'firebase/firestore';
import { db } from '@/firebase';
import { ensureFirebaseAuth } from '@/app/lib/firebaseAuth';
import { callSecureFunction } from '@/app/lib/secureFunctions';
import { resolvePlayerManat } from '@/app/lib/manat';
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

/** Counter-i Firebase-dəki real son ID-yə uyğunlaşdırır */
export async function syncUserIdCounterFromFirebase(): Promise<number> {
  return scanMaxNumericUserId();
}

export async function allocateNextUserId(): Promise<string> {
  await ensureFirebaseAuth();
  const result = await callSecureFunction<Record<string, never>, { userId: string }>('allocateUserId', {});
  return result.userId;
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
  if (typeof window === 'undefined') return 'offline_server';
  const id = globalThis.crypto?.randomUUID?.();
  if (id) return `offline_${id}`;
  const random = Array.from(globalThis.crypto.getRandomValues(new Uint8Array(16)))
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
  return `offline_${random}`;
}

export async function recordAdminSession(adminId: string, displayName: string, active: boolean) {
  assertSuperAdmin(adminId);
  await callSecureFunction('recordAdminSession', { displayName, active });
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
  await callSecureFunction('adminResolveReport', { reportId, status });
}

export async function punishUser(adminId: string, userId: string, days: number, reason: string) {
  assertSuperAdmin(adminId);
  await callSecureFunction('adminPunishUser', { targetUserId: userId, days, reason });
}

export async function banUser(adminId: string, userId: string, banned: boolean) {
  assertSuperAdmin(adminId);
  await callSecureFunction('adminBanUser', { targetUserId: userId, banned });
}

export async function deleteUserAccount(adminId: string, userId: string) {
  assertSuperAdmin(adminId);
  if (userId === SUPER_ADMIN_ID) throw new Error('Super admin silinə bilməz');
  await callSecureFunction('adminDeleteUser', { targetUserId: userId });
}

export async function grantModerator(adminId: string, userId: string, grant: boolean) {
  assertSuperAdmin(adminId);
  await callSecureFunction('adminGrantModerator', { targetUserId: userId, grant });
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

  return callSecureFunction<
    { targetUserId: string; amount: number; reason?: string },
    { previousBalance: number; newBalance: number }
  >('adminGrantManat', {
    targetUserId: targetId,
    amount: normalizedAmount,
    reason: reason?.trim(),
  });
}

export async function bootstrapSuperAdmin(displayName: string) {
  return callSecureFunction('bootstrapSuperAdmin', { displayName });
}
