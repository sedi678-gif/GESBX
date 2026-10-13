/** Profil localStorage ID + Firebase auth ID birləşdirilməsi */
export function getLocalProfileUserId(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const saved = localStorage.getItem('app_current_user_v6');
    if (!saved) return null;
    const parsed = JSON.parse(saved) as { id?: string };
    return parsed?.id ? String(parsed.id) : null;
  } catch {
    return null;
  }
}

/** Zəng/mesaj üçün həmişə profil ID (1, 2, 3...) — Firebase UID yox */
export function getAppUserId(contextUserId?: string | null): string {
  const local = getLocalProfileUserId();
  if (local) return String(local).trim();
  if (contextUserId && contextUserId !== 'anonim_user_id') return String(contextUserId).trim();
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
    window.dispatchEvent(new CustomEvent('yolustu_user_updated'));
  }
}

/** Yalnız artıq ID 1 olan profil üçün metadata yeniləyir — ID dəyişmir */
export function forceSuperAdminLocalProfile(displayName: string) {
  if (typeof window === 'undefined') return;
  const currentId = getLocalProfileUserId();
  if (currentId !== '1') return;
  try {
    const saved = localStorage.getItem('app_current_user_v6');
    const parsed = saved ? JSON.parse(saved) : {};
    const parts = displayName.split(' ');
    const updated = {
      ...parsed,
      id: '1',
      name: parts[0] || parsed.name || 'Admin',
      surname: parts.slice(1).join(' ') || parsed.surname || '',
      handle: parsed.handle || '@admin',
    };
    localStorage.setItem('app_current_user_v6', JSON.stringify(updated));
  } catch {
    /* ignore */
  }
}
