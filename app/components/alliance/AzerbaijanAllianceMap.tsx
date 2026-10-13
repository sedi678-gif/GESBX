"use client";

import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { LeafletEvent, Map as LeafletMap, Marker as LeafletMarker } from 'leaflet';
import { AllianceData } from './types';
import { AZ_BOUNDS, AZ_CENTER } from './azerbaijanMapGeo';
import { AZ_MAP_TILE } from './azerbaijanMapStyle';
import {
  ALLIANCE_CASTLE_ICON_ANCHOR,
  ALLIANCE_CASTLE_ICON_SIZE,
  buildAllianceCastleMarkerHtml,
  applyCastleZoomToMap,
} from './allianceCastleMarkerImage';
import { withAllianceMapCoords } from './regionCoords';
import { useAllianceBrain } from './AllianceBrainContext';
import AllianceMapBattleLayer from './AllianceMapBattleLayer';
import AllianceShieldDefenderLayer from './battleThree/AllianceShieldDefenderLayer';
import ClickRaidMapLayer from './battleThree/ClickRaidMapLayer';
import {
  listenRecentAttacks,
  mergeAttackLists,
  type AllianceAttack,
} from '@/app/lib/allianceBattleService';
import { isClickRaidCard } from '@/app/lib/clickRaidLogic';
import styles from './alliance.module.css';

interface AzerbaijanAllianceMapProps {
  alliances: AllianceData[];
  activeAlliance: AllianceData | null;
  active?: boolean;
  onAllianceSelect?: (alliance: AllianceData) => void;
}

export default function AzerbaijanAllianceMap({
  alliances,
  activeAlliance,
  active = true,
  onAllianceSelect,
}: AzerbaijanAllianceMapProps) {
  const {
    attackTargetId,
    focusAllianceId,
    setFocusAllianceId,
    liveBattleAttacks,
    userId,
    notifyAllianceInfoViewed,
  } = useAllianceBrain();
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<LeafletMap | null>(null);
  const markersRef = useRef<Record<string, LeafletMarker>>({});
  const [leafletMap, setLeafletMap] = useState<LeafletMap | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [firebaseAttacks, setFirebaseAttacks] = useState<AllianceAttack[]>([]);
  const [liveSiegeIds, setLiveSiegeIds] = useState<Set<string>>(() => new Set());

  const mapAlliances = useMemo(() => withAllianceMapCoords(alliances), [alliances]);
  const previewAttacks = useMemo<AllianceAttack[]>(() => {
    if (typeof window === 'undefined') return [];
    if (!new URLSearchParams(window.location.search).has('raidPreview')) return [];
    const defender =
      mapAlliances.find((a) => a.id !== activeAlliance?.id) ?? mapAlliances[0];
    const attacker = mapAlliances.find((a) => a.id !== defender?.id) ?? defender;
    if (!defender?.lat || !defender?.lng) return [];
    const now = Date.now();
    const cards = ['mutant', 'standing', 'zombi', 'it'] as const;
    return cards.map((cardId, i) => ({
      id: `preview-${cardId}`,
      attackerAllianceId: attacker?.id ?? 'preview-atk',
      attackerAllianceName: attacker?.name ?? 'Hücum',
      defenderAllianceId: defender.id,
      defenderAllianceName: defender.name,
      attackerUserId: 'preview',
      attackerName: 'preview',
      cardId,
      cardCount: 2,
      damage: 0,
      createdAt: now - i * 350,
      attackerLat: attacker?.lat,
      attackerLng: attacker?.lng,
      defenderLat: defender.lat,
      defenderLng: defender.lng,
      raidStatus: 'active',
      raidEndsAt: now + 10 * 60_000,
      raidDamage: 100,
      raidClicksRequired: 5,
      raidClicksRemaining: 5,
    }));
  }, [mapAlliances, activeAlliance]);

  const allAttacks = useMemo(
    () => mergeAttackLists(firebaseAttacks, liveBattleAttacks, previewAttacks),
    [liveBattleAttacks, firebaseAttacks, previewAttacks]
  );
  const latestAttack = allAttacks[0] ?? null;
  const [battleToast, setBattleToast] = useState<string | null>(null);

  useEffect(() => {
    if (!latestAttack) return;
    const age = Date.now() - latestAttack.createdAt;
    if (age > 4000) return;

    const toast =
      latestAttack.cardId === 'mutant'
        ? `☢️ ${latestAttack.attackerAllianceName} mutant göndərdi → ${latestAttack.defenderAllianceName}`
        : latestAttack.cardId === 'standing'
          ? `🧙 ${latestAttack.attackerAllianceName} Standing göndərdi → ${latestAttack.defenderAllianceName}`
          : latestAttack.cardId === 'zombi'
            ? `🧟 ${latestAttack.attackerAllianceName} zombi göndərdi → ${latestAttack.defenderAllianceName}`
            : latestAttack.cardId === 'it'
              ? `🐕 ${latestAttack.attackerAllianceName} it göndərdi → ${latestAttack.defenderAllianceName}`
              : `⚔️ ${latestAttack.attackerAllianceName} → ${latestAttack.defenderAllianceName}: -${latestAttack.damage} zərər`;
    setBattleToast(toast);
    const timer = window.setTimeout(() => setBattleToast(null), 3500);
    return () => window.clearTimeout(timer);
  }, [latestAttack?.id, latestAttack?.createdAt]);

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    let cancelled = false;

    void import('leaflet/dist/leaflet.css');
    void import('leaflet').then((leafletModule) => {
      if (cancelled || !mapRef.current || mapInstanceRef.current) return;

      const L = leafletModule.default;
      const azBounds = L.latLngBounds(AZ_BOUNDS[0], AZ_BOUNDS[1]);
      const map = L.map(mapRef.current, {
        center: AZ_CENTER,
        zoom: 7,
        zoomControl: false,
        dragging: true,
        scrollWheelZoom: true,
        doubleClickZoom: true,
        touchZoom: true,
        boxZoom: false,
        keyboard: true,
        maxBounds: azBounds.pad(0.04),
        maxBoundsViscosity: 0.85,
        minZoom: 6,
        maxZoom: 18,
      });

      L.tileLayer(AZ_MAP_TILE.url, {
        attribution: AZ_MAP_TILE.attribution,
        maxZoom: AZ_MAP_TILE.maxZoom,
      }).addTo(map);

      map.fitBounds(azBounds, { padding: [16, 16], animate: false });
      mapInstanceRef.current = map;
      setLeafletMap(map);
      setMapReady(true);
    });

    return () => {
      cancelled = true;
      setMapReady(false);
      setLeafletMap(null);
      Object.values(markersRef.current).forEach((marker) => marker.remove());
      markersRef.current = {};
      mapInstanceRef.current?.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!mapReady) return;
    const unsub = listenRecentAttacks(setFirebaseAttacks);
    return unsub;
  }, [mapReady]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!active || !map || !mapReady) return;
    const frame = window.requestAnimationFrame(() => {
      map.invalidateSize();
      applyCastleZoomToMap(map.getContainer(), map.getZoom());
    });
    return () => window.cancelAnimationFrame(frame);
  }, [active, mapReady]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    const canvas = mapRef.current;
    if (!map || !canvas || !mapReady) return;

    const applyScale = (zoom: number) => {
      applyCastleZoomToMap(map.getContainer(), zoom);
      applyCastleZoomToMap(canvas, zoom);
    };
    const onZoom = () => applyScale(map.getZoom());
    const onZoomAnim = (ev: LeafletEvent) => {
      const z = (ev as LeafletEvent & { zoom?: number }).zoom;
      applyScale(typeof z === 'number' ? z : map.getZoom());
    };

    applyScale(map.getZoom());
    map.on('zoom', onZoom);
    map.on('zoomend', onZoom);
    map.on('zoomanim', onZoomAnim);

    return () => {
      map.off('zoom', onZoom);
      map.off('zoomend', onZoom);
      map.off('zoomanim', onZoomAnim);
    };
  }, [mapReady]);

  useEffect(() => {
    const now = Date.now();
    const siegeIds = new Set<string>();
    allAttacks.forEach((attack) => {
      if (now - attack.createdAt < 9000) {
        siegeIds.add(attack.defenderAllianceId);
      }
    });
    setLiveSiegeIds(siegeIds);
  }, [allAttacks]);

  const watchedRaidRef = useRef<string | null>(null);

  useEffect(() => {
    if (!mapReady) return;
    const live = allAttacks.find(
      (attack) => isClickRaidCard(attack.cardId) && Date.now() - attack.createdAt < 4000
    );
    if (!live || watchedRaidRef.current === live.id) return;
    const defender = mapAlliances.find((a) => a.id === live.defenderAllianceId);
    const map = mapInstanceRef.current;
    if (!map || !defender?.lat || !defender?.lng) return;
    watchedRaidRef.current = live.id;
    map.flyTo([defender.lat, defender.lng], Math.max(map.getZoom(), 10), { duration: 1.1 });
  }, [allAttacks, mapReady, mapAlliances]);

  useEffect(() => {
    if (!mapReady || !focusAllianceId) return;
    const target = mapAlliances.find((a) => a.id === focusAllianceId);
    const map = mapInstanceRef.current;
    if (!map || !target?.lat || !target?.lng) return;

    map.flyTo([target.lat, target.lng], Math.max(map.getZoom(), 9), { duration: 1.2 });
    const timer = setTimeout(() => {
      onAllianceSelect?.(target);
      notifyAllianceInfoViewed(target);
      setFocusAllianceId(null);
    }, 900);
    return () => clearTimeout(timer);
  }, [focusAllianceId, mapReady, mapAlliances, setFocusAllianceId, onAllianceSelect, notifyAllianceInfoViewed]);

  useEffect(() => {
    if (!mapReady || !attackTargetId) return;
    const defender = mapAlliances.find((a) => a.id === attackTargetId);
    const myPos = activeAlliance ? mapAlliances.find((a) => a.id === activeAlliance.id) : null;
    const map = mapInstanceRef.current;
    if (!map || !defender?.lat || !myPos?.lat) return;

    void import('leaflet').then((leafletModule) => {
      const L = leafletModule.default;
      const bounds = L.latLngBounds([myPos.lat, myPos.lng], [defender.lat, defender.lng]);
      map.flyToBounds(bounds.pad(0.4), { duration: 1, maxZoom: 10 });
    });
  }, [attackTargetId, mapReady, activeAlliance, mapAlliances]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !mapReady) return;

    void import('leaflet').then((leafletModule) => {
      const L = leafletModule.default;

      Object.values(markersRef.current).forEach((marker) => marker.remove());
      markersRef.current = {};

      mapAlliances.forEach((item) => {
        if (!item.lat || !item.lng) return;

        const isActive = activeAlliance?.id === item.id;
        const isAttackTarget = attackTargetId === item.id;
        const isUnderSiege = liveSiegeIds.has(item.id);

        const html = buildAllianceCastleMarkerHtml({
          name: item.name,
          region: item.region,
          score: item.score || 50,
          isActive,
          fortressLevel: item.fortressLevel ?? 1,
        });

        const icon = L.divIcon({
          className: 'alliance-map-pin',
          html,
          iconSize: ALLIANCE_CASTLE_ICON_SIZE,
          iconAnchor: ALLIANCE_CASTLE_ICON_ANCHOR,
        });

        const marker = L.marker([item.lat, item.lng], {
          icon,
          zIndexOffset: isUnderSiege ? 1000 : isAttackTarget ? 800 : isActive ? 600 : 0,
        }).addTo(map);

        marker.on('click', () => {
          onAllianceSelect?.(item);
          notifyAllianceInfoViewed(item);
        });

        markersRef.current[item.id] = marker;
      });
      applyCastleZoomToMap(map.getContainer(), map.getZoom());
    });
  }, [mapAlliances, activeAlliance, attackTargetId, liveSiegeIds, mapReady, notifyAllianceInfoViewed, onAllianceSelect]);

  return (
    <div className={styles.allianceMapShell}>
      <div ref={mapRef} className={styles.allianceMapCanvas} />
      <AllianceShieldDefenderLayer
        map={leafletMap}
        mapReady={mapReady}
        alliances={mapAlliances}
        attacks={allAttacks}
      />
      <AllianceMapBattleLayer
        map={leafletMap}
        mapReady={mapReady}
        attacks={allAttacks}
        alliances={mapAlliances}
      />
      <ClickRaidMapLayer
        map={leafletMap}
        mapReady={mapReady}
        attacks={allAttacks}
        alliances={mapAlliances}
        userId={userId}
        myAllianceId={activeAlliance?.id ?? null}
      />
      <div className={styles.mapCountryBadge}>
        🇦🇿 {mapAlliances.length} qala
        <span className={styles.mapCountryHint}>⚔️ Kart atılan kimi Mixamo qəhrəman qala ətrafında hücum edir</span>
      </div>
      {battleToast && <div className={styles.battleToast}>{battleToast}</div>}
    </div>
  );
}
