import { addDoc, collection } from 'firebase/firestore';
import { db } from '../../firebase';

export const ALLIANCE_VIEW_NOTIFY_COOLDOWN_MS = 2 * 60 * 1000;

const lastSentAt = new Map<string, number>();

function debounceKey(allianceId: string, viewerId: string) {
  return `${allianceId}::${viewerId}`;
}

export function shouldNotifyAllianceView(allianceId: string, viewerId: string): boolean {
  const key = debounceKey(allianceId, viewerId);
  const now = Date.now();
  const memoryAt = lastSentAt.get(key) ?? 0;
  let storedAt = 0;
  try {
    storedAt = Number(sessionStorage.getItem(`alliance_view_notify_${key}`) || 0);
  } catch {
    /* ignore */
  }
  if (now - Math.max(memoryAt, storedAt) < ALLIANCE_VIEW_NOTIFY_COOLDOWN_MS) return false;
  lastSentAt.set(key, now);
  try {
    sessionStorage.setItem(`alliance_view_notify_${key}`, String(now));
  } catch {
    /* ignore */
  }
  return true;
}

export interface AllianceInfoViewPayload {
  allianceId: string;
  allianceName: string;
  members?: string[];
  leaderId?: string;
  viewerId: string;
  viewerName: string;
  viewerAllianceId?: string | null;
  viewerAllianceName?: string | null;
}

function buildViewText(payload: AllianceInfoViewPayload): string {
  const from = payload.viewerAllianceName
    ? `${payload.viewerName} (${payload.viewerAllianceName})`
    : payload.viewerName;
  return `👁 ${from} ittifaqınızın məlumatlarına baxdı`;
}

/** Başqa oyunçu ittifaq məlumatına baxanda üzvlərə çat + bildiriş yazır. */
export async function notifyAllianceInfoViewed(payload: AllianceInfoViewPayload): Promise<boolean> {
  const { allianceId, viewerId } = payload;
  if (!allianceId || !viewerId) return false;
  if (viewerId === 'guest' || viewerId === 'anonim_user_id') return false;
  if (payload.viewerAllianceId === allianceId) return false;
  if (payload.leaderId === viewerId) return false;
  if (payload.members?.includes(viewerId)) return false;
  if (!shouldNotifyAllianceView(allianceId, viewerId)) return false;

  const now = Date.now();
  const text = buildViewText(payload);
  const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  await Promise.all([
    addDoc(collection(db, 'alliance_chat'), {
      user: 'Sistem',
      userId: 'system',
      text,
      time,
      createdAt: now,
      allianceId,
      kind: 'system',
    }),
    addDoc(collection(db, 'alliance_notifications'), {
      kind: 'info_viewed',
      allianceId,
      allianceName: payload.allianceName,
      viewerId,
      viewerName: payload.viewerName,
      viewerAllianceId: payload.viewerAllianceId || null,
      viewerAllianceName: payload.viewerAllianceName || null,
      text,
      createdAt: now,
    }),
  ]);

  return true;
}
