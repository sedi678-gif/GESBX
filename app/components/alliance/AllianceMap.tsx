"use client";

import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { AllianceData } from './types';
import type { Map as LeafletMap, Marker as LeafletMarker, Polygon as LeafletPolygon } from 'leaflet';
import {
  AZ_BOUNDS,
  AZ_CENTER,
  AZ_COUNTRY_POLYGON,
} from './azerbaijanMapGeo';
import {
  AllianceMapPixiOverlay,
  getViewModeFromZoom,
  type MapViewMode,
} from './allianceMapPixiOverlay';
import {
  buildCastleMarkerHtml,
  castleIconAnchor,
  castleIconSize,
} from './allianceMapCastleIcon';
import {
  listenRecentAttacks,
  enrichAttacksWithCoords,
  type AllianceAttack,
} from '@/app/lib/allianceBattleService';
import { withAllianceMapCoords } from './regionCoords';
import { useAllianceBrain } from './AllianceBrainContext';
import styles from './alliance.module.css';
export interface AllianceMapHandle {
  flyToAlliance: (alliance: AllianceData) => void;
  isReady: () => boolean;
  resetToCountryView: () => void;
  focusAttackRoute: (attacker: AllianceData, defender: AllianceData) => void;
}

interface AllianceMapProps {
  alliances: AllianceData[];
  activeAlliance: AllianceData | null;
  fullScreen?: boolean;
  highlightedAllianceId?: string | null;
  flyToTarget?: AllianceData | null;
  /** Hücum modalında seçilmiş hədəf qala */
  attackTargetId?: string | null;
  /** Hazırda hücum altında olan qala */
  underAttackId?: string | null;
}

const AllianceMap = forwardRef<AllianceMapHandle, AllianceMapProps>(function AllianceMap(
  {
    alliances,
    activeAlliance,
    fullScreen = false,
    highlightedAllianceId = null,
    flyToTarget = null,
    attackTargetId = null,
    underAttackId = null,
  },
  ref
) {
  const mapRef = useRef<HTMLDivElement>(null);
  const pixiRef = useRef<HTMLDivElement>(null);
  const leafletMapRef = useRef<LeafletMap | null>(null);
  const markersRef = useRef<Record<string, LeafletMarker>>({});
  const countryPolygonRef = useRef<LeafletPolygon | null>(null);
  const pixiOverlayRef = useRef<AllianceMapPixiOverlay | null>(null);
  const attacksRef = useRef<AllianceAttack[]>([]);
  const viewModeRef = useRef<MapViewMode>('country');
  const [mapReady, setMapReady] = useState(false);
  const [viewMode, setViewMode] = useState<MapViewMode>('country');
  const [liveSiegeIds, setLiveSiegeIds] = useState<Set<string>>(() => new Set());

  const { notifyAllianceInfoViewed } = useAllianceBrain();
  const mapAlliances = useMemo(() => withAllianceMapCoords(alliances), [alliances]);

  useImperativeHandle(ref, () => ({
    flyToAlliance(alliance: AllianceData) {
      const map = leafletMapRef.current;
      const pos = withAllianceMapCoords([alliance])[0];
      if (!map || !pos.lat || !pos.lng) return;
      map.flyTo([pos.lat, pos.lng], Math.max(map.getZoom(), 9), { duration: 1.2 });
      markersRef.current[alliance.id]?.openPopup();
    },
    isReady() {
      return mapReady;
    },
    resetToCountryView() {
      const map = leafletMapRef.current;
      if (!map) return;
      void import('leaflet').then((leafletModule) => {
        const L = leafletModule.default;
        map.fitBounds(L.latLngBounds(AZ_BOUNDS[0], AZ_BOUNDS[1]), { padding: [24, 24], animate: true });
      });
    },
    focusAttackRoute(attacker: AllianceData, defender: AllianceData) {
      const map = leafletMapRef.current;
      const atk = withAllianceMapCoords([attacker])[0];
      const def = withAllianceMapCoords([defender])[0];
      if (!map || !atk.lat || !def.lat) return;
      void import('leaflet').then((leafletModule) => {
        const L = leafletModule.default;
        const bounds = L.latLngBounds(
          [atk.lat, atk.lng],
          [def.lat, def.lng]
        );
        map.flyToBounds(bounds.pad(0.35), { duration: 1.4, maxZoom: 9 });
      });
    },
  }));

  useEffect(() => {
    if (!mapRef.current || leafletMapRef.current) return;
    let cancelled = false;

    void import('leaflet/dist/leaflet.css');
    void import('leaflet').then((leafletModule) => {
      if (cancelled || !mapRef.current || leafletMapRef.current) return;

      const L = leafletModule.default;
      const azBounds = L.latLngBounds(AZ_BOUNDS[0], AZ_BOUNDS[1]);

      const map = L.map(mapRef.current, {
        center: AZ_CENTER,
        zoom: 7,
        zoomControl: false,
        dragging: true,
        scrollWheelZoom: fullScreen,
        doubleClickZoom: fullScreen,
        touchZoom: fullScreen,
        boxZoom: false,
        keyboard: false,
        maxBounds: fullScreen ? azBounds.pad(0.05) : undefined,
        maxBoundsViscosity: fullScreen ? 0.85 : 0,
        minZoom: 6,
        maxZoom: 12,
        zoomAnimation: true,
        markerZoomAnimation: false,
      });

      L.tileLayer(
        'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
        {
          attribution: '© OpenStreetMap · 🇦🇿 Azərbaycan',
          subdomains: 'abcd',
          maxZoom: 20,
        }
      ).addTo(map);

      countryPolygonRef.current = L.polygon(AZ_COUNTRY_POLYGON, {
        color: '#2563eb',
        weight: 2.5,
        fillColor: '#16a34a',
        fillOpacity: 0.14,
        dashArray: '8 5',
        interactive: false,
      }).addTo(map);

      if (fullScreen) {
        map.fitBounds(azBounds, { padding: [20, 20], animate: false });
      }

      const updateViewMode = () => {
        const mode = getViewModeFromZoom(map.getZoom());
        viewModeRef.current = mode;
        setViewMode(mode);
        if (countryPolygonRef.current) {
          countryPolygonRef.current.setStyle({
            fillOpacity: mode === 'country' ? 0.28 : 0.08,
            weight: mode === 'country' ? 3 : 1.5,
            fillColor: mode === 'country' ? '#22c55e' : '#16a34a',
          });
        }
      };

      map.on('zoomend', updateViewMode);
      updateViewMode();

      leafletMapRef.current = map;
      setMapReady(true);
    });

    return () => {
      cancelled = true;
      setMapReady(false);
      pixiOverlayRef.current?.destroy();
      pixiOverlayRef.current = null;
      leafletMapRef.current?.remove();
      leafletMapRef.current = null;
      countryPolygonRef.current = null;
    };
  }, [fullScreen]);

  useEffect(() => {
    const map = leafletMapRef.current;
    const pixiEl = pixiRef.current;
    if (!map || !pixiEl || !mapReady) return;

    const overlay = new AllianceMapPixiOverlay();
    pixiOverlayRef.current = overlay;

    void overlay.mount(pixiEl, map).then(() => {
      if (attacksRef.current.length) {
        overlay.syncAttacks(enrichAttacksWithCoords(attacksRef.current, mapAlliances));
      }
    });

    return () => {
      overlay.destroy();
      if (pixiOverlayRef.current === overlay) pixiOverlayRef.current = null;
    };
  }, [mapReady]);

  useEffect(() => {
    if (!mapReady) return;
    const unsub = listenRecentAttacks((attacks) => {
      attacksRef.current = attacks;
      const enriched = enrichAttacksWithCoords(attacks, mapAlliances);
      pixiOverlayRef.current?.syncAttacks(enriched);

      const now = Date.now();
      const siegeIds = new Set<string>();
      enriched.forEach((attack) => {
        if (now - attack.createdAt < 9000) {
          siegeIds.add(attack.defenderAllianceId);
        }
      });
      setLiveSiegeIds(siegeIds);
    });
    return unsub;
  }, [mapReady, mapAlliances]);

  // Hücum önizləməsi — modalda hədəf seçiləndə xətt göstər
  useEffect(() => {
    if (!mapReady || !activeAlliance || !attackTargetId) {
      pixiOverlayRef.current?.setPreviewAttack(null);
      return;
    }
    const myPos = mapAlliances.find((a) => a.id === activeAlliance.id);
    const defender = mapAlliances.find((a) => a.id === attackTargetId);
    if (!defender?.lat || !myPos?.lat) return;

    pixiOverlayRef.current?.setPreviewAttack({
      attackerLat: myPos.lat,
      attackerLng: myPos.lng,
      defenderLat: defender.lat,
      defenderLng: defender.lng,
      defenderAllianceName: defender.name,
    });
  }, [mapReady, attackTargetId, activeAlliance, mapAlliances]);

  // Hücum hədəfini xəritədə göstər
  useEffect(() => {
    if (!mapReady || !activeAlliance || !attackTargetId) return;
    const myPos = mapAlliances.find((a) => a.id === activeAlliance.id);
    const defender = mapAlliances.find((a) => a.id === attackTargetId);
    if (!defender?.lat || !myPos?.lat) return;
    const map = leafletMapRef.current;
    if (!map) return;

    void import('leaflet').then((leafletModule) => {
      const L = leafletModule.default;
      const bounds = L.latLngBounds(
        [myPos.lat, myPos.lng],
        [defender.lat, defender.lng]
      );
      map.flyToBounds(bounds.pad(0.4), { duration: 1, maxZoom: viewModeRef.current === 'country' ? 8 : 10 });
    });
  }, [attackTargetId, mapReady, activeAlliance, mapAlliances]);

  useEffect(() => {
    const map = leafletMapRef.current;
    if (!map || !mapReady) return;

    void import('leaflet').then((leafletModule) => {
      const L = leafletModule.default;
      const mode = viewModeRef.current;

      Object.values(markersRef.current).forEach((m) => m.remove());
      markersRef.current = {};

      mapAlliances.forEach((item) => {
        if (!item.lat || !item.lng) return;

        const isActive = activeAlliance?.id === item.id;
        const isHighlighted = highlightedAllianceId === item.id;
        const isAttackTarget = attackTargetId === item.id;
        const isUnderSiege = underAttackId === item.id || liveSiegeIds.has(item.id);

        const html = buildCastleMarkerHtml({
          name: item.name,
          score: item.score || 50,
          region: item.region,
          viewMode: mode,
          isActive,
          isHighlighted,
          isAttackTarget,
          isUnderSiege,
        });

        const customIcon = L.divIcon({
          className: 'alliance-map-pin',
          html,
          iconSize: castleIconSize(mode),
          iconAnchor: castleIconAnchor(mode),
        });

        const marker = L.marker([item.lat, item.lng], { icon: customIcon, zIndexOffset: isUnderSiege ? 1000 : isAttackTarget ? 800 : isActive ? 600 : 0 }).addTo(map);
        marker.bindPopup(
          `<div style="min-width:140px"><b>🏰 ${item.name}</b><br>📍 ${item.region}<br>👑 ${item.leader}<br>⭐ ${item.score || 50} xal${isUnderSiege ? '<br><span style="color:#ef4444;font-weight:700">⚔️ Hücum altında!</span>' : ''}</div>`
        );
        marker.on('popupopen', () => {
          notifyAllianceInfoViewed(item);
        });
        markersRef.current[item.id] = marker;
      });
    });
  }, [mapAlliances, activeAlliance, highlightedAllianceId, attackTargetId, underAttackId, liveSiegeIds, mapReady, viewMode, notifyAllianceInfoViewed]);

  useEffect(() => {
    if (!flyToTarget?.lat || !flyToTarget?.lng || !mapReady) return;
    const map = leafletMapRef.current;
    if (!map) return;
    const pos = mapAlliances.find((a) => a.id === flyToTarget.id) ?? flyToTarget;
    if (!pos.lat || !pos.lng) return;
    map.flyTo([pos.lat, pos.lng], Math.max(map.getZoom(), 9), { duration: 1.2 });
    const timer = setTimeout(() => markersRef.current[flyToTarget.id]?.openPopup(), 900);
    return () => clearTimeout(timer);
  }, [flyToTarget, mapReady, mapAlliances]);

  const allianceCount = mapAlliances.length;

  const mapShell = (
    <>
      <div ref={mapRef} className={fullScreen ? styles.mapLayerInner : styles.mapWidgetInner} />
      <div ref={pixiRef} className={styles.mapPixiOverlay} aria-hidden />
      {viewMode === 'country' && (
        <div className={styles.mapCountryBadge}>
          🇦🇿 Azərbaycan xəritəsi · {allianceCount} ittifaq qalası
          <span className={styles.mapCountryHint}>Barmaqla uzaqlaşdır / yaxınlaşdır · 🏰 qalalar</span>
        </div>
      )}
      {viewMode === 'region' && activeAlliance && (
        <div className={styles.mapRegionBadge}>
          🏰 {activeAlliance.name} qalası · Canlı hücumlar
        </div>
      )}
      {viewMode === 'region' && !activeAlliance && (
        <div className={styles.mapRegionBadge}>🏰 Regional baxış · İttifaq seç</div>
      )}
    </>
  );

  if (fullScreen) {
    return <div className={styles.mapLayer}>{mapShell}</div>;
  }

  return <div className={styles.mapWidget}>{mapShell}</div>;
});

export default AllianceMap;
