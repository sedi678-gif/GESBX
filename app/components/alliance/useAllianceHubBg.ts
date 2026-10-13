'use client';

import { useLayoutEffect, useState } from 'react';
import { useAllianceBrain } from './AllianceBrainContext';
import {
  getFortressHubBgUrl,
  resolveAllianceHubLevel,
} from '@/app/lib/allianceFortressConfig';

/** Firebase gələnə qədər Lv.1 göstərmir — keş və ya real səviyyə, şəkil yüklənəndən sonra. */
export function useAllianceHubBgSrc(): string | null {
  const { activeAlliance, alliancesReady } = useAllianceBrain();
  const [src, setSrc] = useState<string | null>(null);

  useLayoutEffect(() => {
    const level = resolveAllianceHubLevel({
      alliancesReady,
      hasAlliance: Boolean(activeAlliance),
      fortressLevel: activeAlliance?.fortressLevel,
    });
    if (level == null) return;

    const next = getFortressHubBgUrl(level);
    const img = new Image();
    const commit = () => {
      setSrc((prev) => (prev === next ? prev : next));
    };
    img.onload = commit;
    img.src = next;
    if (img.complete) commit();
    return () => {
      img.onload = null;
    };
  }, [alliancesReady, activeAlliance, activeAlliance?.fortressLevel]);

  return src;
}
