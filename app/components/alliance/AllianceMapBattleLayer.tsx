'use client';

import React, { useEffect, useMemo, useState } from 'react';
import type { Map as LeafletMap } from 'leaflet';
import type { AllianceAttack } from '@/app/lib/allianceBattleService';
import { BATTLE_VISUAL_MS, enrichAttacksWithCoords } from '@/app/lib/allianceBattleService';
import { isClickRaidCard } from '@/app/lib/clickRaidLogic';
import type { BattleCardId } from './types';
import { TROOP_ATTACK_PHASE_RATIO } from './battleTroops/battleTroopAssets';
import styles from './alliance.module.css';

const BLOCK_PHASE_RATIO = 0.35;

const UNIT_OFFSETS: [number, number][] = [
  [0, 0],
  [-22, 14],
  [22, 14],
  [-14, -12],
  [14, -12],
];

const FALLBACK_EMOJI: Record<BattleCardId, string> = {
  zombi: '🧟',
  yarasa: '🦇',
  duman: '💨',
  mutant: '☢️',
  standing: '🧙',
  it: '🐕',
};

function getBlockMeta(
  attack: AllianceAttack,
  alliances: { id: string; members?: string[] }[]
) {
  const defender = alliances.find((a) => a.id === attack.defenderAllianceId);
  const members = defender?.members?.length ?? 1;
  return {
    blockedCount: attack.blockedCount ?? 0,
    breakthroughCount: attack.breakthroughCount ?? attack.cardCount,
    defenderGuardCount:
      attack.defenderGuardCount ?? Math.min(5, Math.max(1, Math.ceil(members / 3))),
  };
}

interface AllianceMapBattleLayerProps {
  map: LeafletMap | null;
  mapReady: boolean;
  attacks: AllianceAttack[];
  alliances: { id: string; lat?: number; lng?: number; members?: string[]; region?: string }[];
}

export default function AllianceMapBattleLayer({
  map,
  mapReady,
  attacks,
  alliances,
}: AllianceMapBattleLayerProps) {
  const [now, setNow] = useState(() => Date.now());
  const enriched = useMemo(
    () => enrichAttacksWithCoords(attacks, alliances),
    [attacks, alliances]
  );

  useEffect(() => {
    if (!mapReady) return;
    const timer = window.setInterval(() => setNow(Date.now()), 120);
    return () => window.clearInterval(timer);
  }, [mapReady]);

  if (!map || !mapReady) return null;

  return (
    <div className={styles.battleLayer} aria-hidden>
      {enriched.map((attack) => {
        if (isClickRaidCard(attack.cardId)) return null;

        const elapsed = now - attack.createdAt;
        if (elapsed < 0 || elapsed >= BATTLE_VISUAL_MS) return null;

        const lat = attack.defenderLat;
        const lng = attack.defenderLng;
        if (typeof lat !== 'number' || typeof lng !== 'number') return null;

        const blockMeta = getBlockMeta(attack, alliances);
        const t = elapsed / BATTLE_VISUAL_MS;
        const inBlockPhase = t < BLOCK_PHASE_RATIO;
        const afterBlock = t >= BLOCK_PHASE_RATIO;
        const attackT = afterBlock
          ? (t - BLOCK_PHASE_RATIO) / (TROOP_ATTACK_PHASE_RATIO - BLOCK_PHASE_RATIO)
          : 0;
        const inDeath = t >= TROOP_ATTACK_PHASE_RATIO;

        const from = map.latLngToContainerPoint([
          attack.attackerLat ?? lat,
          attack.attackerLng ?? lng,
        ]);
        const to = map.latLngToContainerPoint([lat, lng]);
        const unitCount = Math.min(5, Math.max(1, attack.cardCount));
        const emoji = FALLBACK_EMOJI[attack.cardId] ?? '⚔️';

        return (
          <React.Fragment key={attack.id}>
            {Array.from({ length: unitCount }).map((_, i) => {
              const isBlocked = i < blockMeta.blockedCount;
              const isBreakthrough =
                i >= blockMeta.blockedCount &&
                i < blockMeta.blockedCount + blockMeta.breakthroughCount;
              if (!isBlocked && !isBreakthrough) return null;

              const [ox, oy] = UNIT_OFFSETS[i % UNIT_OFFSETS.length];
              let x = to.x + ox;
              let y = to.y + oy;
              let opacity = 1;
              let scale = 1;

              if (isBlocked && inBlockPhase) {
                const startX = from.x + (to.x - from.x) * 0.35;
                const startY = from.y + (to.y - from.y) * 0.35;
                const p = Math.min(1, t / BLOCK_PHASE_RATIO);
                x = startX + (to.x + ox - startX) * p;
                y = startY + (to.y + oy - startY) * p;
                opacity = 1 - p * 0.3;
              } else if (isBlocked && afterBlock) {
                opacity = Math.max(0, 0.7 - (t - BLOCK_PHASE_RATIO) * 3);
                scale = 0.85;
              } else if (isBreakthrough) {
                const p = Math.min(1, Math.max(0, attackT));
                x = from.x + (to.x + ox - from.x) * p;
                y = from.y + (to.y + oy - from.y) * p;
                if (inDeath) opacity = Math.max(0, 1 - (t - TROOP_ATTACK_PHASE_RATIO) * 4);
              }

              if (opacity <= 0.05) return null;

              return (
                <div
                  key={`${attack.id}-${i}`}
                  className={`${styles.battleTroopSprite} ${isBlocked ? styles.battleTroopBlocked : ''}`}
                  style={{
                    left: x,
                    top: y,
                    opacity,
                    transform: `translate(-50%, -85%) scale(${scale})`,
                    fontSize: 32,
                  }}
                >
                  {emoji}
                </div>
              );
            })}
            {blockMeta.blockedCount > 0 && inBlockPhase && (
              <div className={styles.battleBlockFlash} style={{ left: to.x, top: to.y }}>
                🛡️ {blockMeta.blockedCount} blok
              </div>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}
