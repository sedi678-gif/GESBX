export const SUPER_ADMIN_ID = '1';
export const ADMIN_ACCESS_CODE = '17051992sedi';
export const ADMIN_SESSION_KEY = 'yolustu_admin_unlocked';

export function isSuperAdmin(userId: string): boolean {
  return String(userId).trim() === SUPER_ADMIN_ID;
}

export function canAccessAdminPanel(userId: string): boolean {
  return isSuperAdmin(userId);
}

export function isAdminSessionUnlocked(): boolean {
  if (typeof window === 'undefined') return false;
  return sessionStorage.getItem(ADMIN_SESSION_KEY) === '1';
}

export function unlockAdminSession(code: string): boolean {
  if (code.trim() !== ADMIN_ACCESS_CODE) return false;
  sessionStorage.setItem(ADMIN_SESSION_KEY, '1');
  return true;
}

export function lockAdminSession() {
  sessionStorage.removeItem(ADMIN_SESSION_KEY);
}
