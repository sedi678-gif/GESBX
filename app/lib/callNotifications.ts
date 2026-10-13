/** Brauzer zəng bildirişləri (Call Notification) */

export type CallNotificationKind = 'voice' | 'video';

const NOTIFICATION_ICON = '/favicon.ico';

export async function requestCallNotificationPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  if (Notification.permission === 'granted' || Notification.permission === 'denied') {
    return Notification.permission;
  }
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

export function showIncomingCallNotification(
  callerLabel: string,
  kind: CallNotificationKind
): void {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;
  if (typeof document !== 'undefined' && document.visibilityState === 'visible') return;

  const title = kind === 'video' ? 'Gələn video zəng' : 'Gələn səsli zəng';
  const body = `${callerLabel || 'İstifadəçi'} sizi zəng edir`;

  try {
    const notification = new Notification(title, {
      body,
      icon: NOTIFICATION_ICON,
      tag: 'yolustu-incoming-call',
      requireInteraction: true,
    });
    notification.onclick = () => {
      window.focus();
      notification.close();
    };
  } catch {
    /* brauzer bildirişi dəstəklənmirsə */
  }
}
