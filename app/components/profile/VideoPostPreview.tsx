"use client";

import React from 'react';

type VideoPostPreviewProps = {
  src: string;
  thumbnailUrl?: string;
  overlayClassName?: string;
  overlayStyle?: React.CSSProperties;
  priority?: boolean;
};

/**
 * Profil şəbəkəsində video kartları həmişə qara saxlanılır.
 * Videonun özü yalnız karta toxunub paylaşım pəncərəsi açılanda göstərilir.
 */
export default function VideoPostPreview(_props: VideoPostPreviewProps) {
  return (
    <span
      aria-label="Video paylaşımı"
      style={{
        display: 'block',
        position: 'relative',
        width: '100%',
        height: '100%',
        minHeight: 0,
        background: '#000',
      }}
    />
  );
}
