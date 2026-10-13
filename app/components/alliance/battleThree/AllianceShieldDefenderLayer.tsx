'use client';

import type { Map as LeafletMap } from 'leaflet';
import type { AllianceAttack } from '@/app/lib/allianceBattleService';

interface AllianceShieldDefenderLayerProps {
  map: LeafletMap | null;
  mapReady: boolean;
  alliances: { id: string; lat?: number; lng?: number; members?: string[] }[];
  attacks: AllianceAttack[];
}

/** Three.js çıxarıldı — Vercel üçün yüngül placeholder. */
export default function AllianceShieldDefenderLayer(_props: AllianceShieldDefenderLayerProps) {
  return <div aria-hidden />;
}
