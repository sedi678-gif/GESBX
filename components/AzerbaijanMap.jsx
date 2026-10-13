"use client";

import React, { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Xəritəni mərkəzləşdirmək və həmin nöqtəyə zoom etmək üçün köməkçi komponent
function MapController({ center }) {
  const map = useMap();
  useEffect(() => {
    if (center && center.lat && center.lng) {
      // Xəritəni həmin koordinata aparırıq və yaxınlaşdırırıq (zoom: 13)
      map.setView([center.lat, center.lng], 13, {
        animate: true,
        duration: 1.5
      });
    }
  }, [center, map]);
  return null;
}

export default function AzerbaijanMap({ caves, center, selectedCaveId, onMarkerClick }) {
  // Standart marker ikonları
  const defaultIcon = L.icon({
    iconUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png',
    iconRetinaUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
  });

  // Seçilmiş (qaralmış / aktiv) hədəf nöqtəsi üçün xüsusi tünd/qara ikon
  const selectedIcon = L.icon({
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-black.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
  });

  return (
    <MapContainer 
      center={[center.lat, center.lng]} 
      zoom={7} 
      style={{ height: '450px', width: '100%', borderRadius: '14px', zIndex: 1 }}
    >
      <MapController center={center} />
      
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      {caves.map((cave) => {
        const isSelected = selectedCaveId === cave.id;

        return (
          <Marker 
            key={cave.id}
            position={[cave.lat, cave.lng]}
            icon={isSelected ? selectedIcon : defaultIcon}
            eventHandlers={{
              click: () => {
                if (onMarkerClick) onMarkerClick(cave);
              }
            }}
          >
            <Popup>
              <div style={{ textAlign: 'center', fontFamily: 'sans-serif' }}>
                <strong style={{ color: isSelected ? '#000' : '#4f46e5' }}>{cave.name}</strong>
                <p style={{ margin: '4px 0', fontSize: '12px' }}>İstehsal: {cave.spawns}</p>
                <span style={{ fontSize: '10px', background: isSelected ? '#000' : '#10b981', color: '#fff', padding: '2px 6px', borderRadius: '4px' }}>
                  {isSelected ? '🎯 Hədəf Seçildi (Qaraldı)' : 'Aktiv Nöqtə'}
                </span>
              </div>
            </Popup>
          </Marker>
        );
      })}
    </MapContainer>
  );
}