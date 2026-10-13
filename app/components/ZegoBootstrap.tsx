'use client';

import { useEffect, useRef } from 'react';
import { useUser } from '@/context/UserContext';
import { getAppUserId, getLocalProfileDisplayName } from '@/app/lib/userId';
import { normalizeUserId } from '@/app/lib/callService';
import { ensureZegoConfig } from '@/app/lib/zegoConfig';
import { initZegoCallKit } from '@/app/lib/zegoCallKit';
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

    void (async () => {
      const ready = await ensureZegoConfig();
      if (!ready || cancelled) return;

      const name = getLocalProfileDisplayName();
      await initZegoCallKit(myId, name, { canReceiveFrom });
    })();

    return () => {
      cancelled = true;
    };
  }, [myId]);

  return null;
}
