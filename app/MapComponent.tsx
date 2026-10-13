'use client';

import React from 'react';
import { GoogleMap, useJsApiLoader } from '@react-google-maps/api';

const containerStyle = {
  width: '100%',
  height: '400px'
};

const center = {
  lat: 40.4093,
  lng: 49.8671
};

export default function MapComponent() {
  const { isLoaded } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: "AIzaSyB3zhGDf5oTnjulEBuKHo6UJgZPsQXiiD4"
  });

  return isLoaded ? (
    <GoogleMap
      mapContainerStyle={containerStyle}
      center={center}
      zoom={10}
    >
      {/* Əlavə marker və ya elementlər buraya gələ bilər */}
    </GoogleMap>
  ) : <p>Xəritə yüklənir...</p>;
}