/** Profil localStorage ID + Firebase auth ID birləşdirilməsi */
export function getLocalProfileUserId(expectedFirebaseUid?: string | null): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const saved = localStorage.getItem('app_current_user_v6');
    if (!saved) return null;
    const parsed = JSON.parse(saved) as { id?: string; firebaseUid?: string };
    // A cached numeric profile ID belongs only to the Firebase account that created it.
    if (expectedFirebaseUid && parsed?.firebaseUid !== expectedFirebaseUid) return null;
    return parsed?.id ? String(parsed.id) : null;
  } catch {
    return null;
  }
}

/** Zəng/mesaj üçün həmişə profil ID (1, 2, 3...) — Firebase UID yox */
export function getAppUserId(contextUserId?: string | null): string {
  // Prefer the identity resolved by UserContext. A stale local cache must never
  // override a different signed-in Firebase account.
  if (contextUserId && contextUserId !== 'anonim_user_id') return String(contextUserId).trim();
  const local = getLocalProfileUserId();
  if (local) return String(local).trim();
  return '';
}

export function getLocalProfileDisplayName(): string {
  if (typeof window === 'undefined') return 'İstifadəçi';
  try {
    const saved = localStorage.getItem('app_current_user_v6');
    if (!saved) return 'İstifadəçi';
    const parsed = JSON.parse(saved) as { name?: string; surname?: string };
    const full = [parsed.name, parsed.surname].filter(Boolean).join(' ').trim();
    return full || 'İstifadəçi';
  } catch {
    return 'İstifadəçi';
  }
}

export function notifyUserIdChanged() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('gesbx_user_updated'));
  }
}

/** Superadmin profilinin saxlanmış lokal metadata-sını yeniləyir. */
export function forceSuperAdminLocalProfile(displayName: string) {
  if (typeof window === 'undefined') return;
  const currentId = getLocalProfileUserId();
  if (currentId !== '92') return;
  try {
    const saved = localStorage.getItem('app_current_user_v6');
    const parsed = saved ? JSON.parse(saved) : {};
    const parts = displayName.split(' ');
    const updated = {
      ...parsed,
      id: '92',
      name: parts[0] || parsed.name || 'Admin',
      surname: parts.slice(1).join(' ') || parsed.surname || '',
      handle: parsed.handle || '@admin',
    };
    localStorage.setItem('app_current_user_v6', JSON.stringify(updated));
  } catch {
    /* ignore */
  }
}
