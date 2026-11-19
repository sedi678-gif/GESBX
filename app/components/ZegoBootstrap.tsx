'use client';

import { useEffect, useRef } from 'react';
import { useUser } from '@/context/UserContext';
import { getAppUserId, getLocalProfileDisplayName } from '@/app/lib/userId';
import { normalizeUserId } from '@/app/lib/callService';
import { ensureZegoConfig } from '@/app/lib/zegoConfig';

import { getCallSettings } from '@/app/lib/callSettings';
import { listenFollowingIds } from '@/app/lib/socialService';
import type { CallType } from '@/app/lib/callService';

/** Tətbiq açılan kimi Zego konfiqurasiyasını və Call Kit-i əvvəlcədən yükləyir */
export default function ZegoBootstrap() {
  const { userId } = useUser();
  const myId = normalizeUserId(getAppUserId(userId));
  const followingRef = useRef<string[]>([]);

  useEffect(() => {
    if (!myId || myId === 'guest' || myId === 'anonim_user_id') return;
    return listenFollowingIds(myId, (ids) => {
      followingRef.current = ids;
    });
  }, [myId]);

  useEffect(() => {
    if (!myId || myId === 'guest' || myId === 'anonim_user_id') return;

    let cancelled = false;

    const canReceiveFrom = (callerId: string, callType: CallType) => {
      const settings = getCallSettings();
      if (settings.allowCallsFrom === 'nobody') return false;
      if (
        settings.allowCallsFrom === 'following' &&
        !followingRef.current.includes(normalizeUserId(callerId))
      ) {
        return false;
      }
      if (callType === 'video' && !settings.videoCallsEnabled) return false;
      return true;
    };

    let idleHandle: number | undefined;
    let fallbackTimer: ReturnType<typeof globalThis.setTimeout> | undefined;
    const idleWindow = window as Window & {
      requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number;
      cancelIdleCallback?: (handle: number) => void;
    };
    const startCalls = async () => {
      const ready = await ensureZegoConfig();
      if (!ready || cancelled) return;

      // Load the comparatively heavy calling SDK after the first screen is interactive.
      const { initZegoCallKit } = await import('@/app/lib/zegoCallKit');
      if (cancelled) return;
      const name = getLocalProfileDisplayName();
      await initZegoCallKit(myId, name, { canReceiveFrom });
    };

    const runWhenIdle = () => {
      void startCalls().catch((error) => {
        console.warn('[GESBX] Zəng xidməti gecikdirilmiş başladılmadı:', error);
      });
    };

    if (typeof idleWindow.requestIdleCallback === 'function') {
      idleHandle = idleWindow.requestIdleCallback(runWhenIdle, { timeout: 5000 });
    } else {
      fallbackTimer = globalThis.setTimeout(runWhenIdle, 1800);
    }

    return () => {
      cancelled = true;
      if (idleHandle !== undefined && typeof idleWindow.cancelIdleCallback === 'function') {
        idleWindow.cancelIdleCallback(idleHandle);
      }
      if (fallbackTimer !== undefined) globalThis.clearTimeout(fallbackTimer);
    };
  }, [myId]);

  return null;
}
