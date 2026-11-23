"use client";

import React, { useEffect, useRef, useState } from 'react';

type VideoPostPreviewProps = {
  src: string;
  thumbnailUrl?: string;
  overlayClassName?: string;
  overlayStyle?: React.CSSProperties;
  priority?: boolean;
};

/**
 * Profil şəbəkəsində görünən video kartları səssiz, qısa canlı önizləmə göstərir.
 * Videolar yalnız görünən karta yaxınlaşanda yüklənir ki, profil səhifəsi ağırlaşmasın.
 */
export default function VideoPostPreview({
  src,
  thumbnailUrl,
  overlayClassName,
  overlayStyle,
  priority = false,
}: VideoPostPreviewProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [shouldLoad, setShouldLoad] = useState(priority);

  useEffect(() => {
    if (shouldLoad) return;
    const video = videoRef.current;
    if (!video) return;
    if (typeof IntersectionObserver === 'undefined') {
      setShouldLoad(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setShouldLoad(true);
          observer.disconnect();
        }
      },
      { rootMargin: '180px 0px', threshold: 0.1 }
    );
    observer.observe(video);
    return () => observer.disconnect();
  }, [shouldLoad]);

  useEffect(() => {
    const video = videoRef.current;
    if (!shouldLoad || !video) return;
    video.muted = true;
    video.defaultMuted = true;
    const playPreview = () => {
      void video.play().catch((error) => {
        // Some mobile browsers defer autoplay until the preview is visible again.
        console.debug('[VideoPostPreview] muted preview autoplay deferred:', error);
      });
    };
    if (video.readyState >= 2) playPreview();
    else video.addEventListener('canplay', playPreview, { once: true });
    return () => video.removeEventListener('canplay', playPreview);
  }, [shouldLoad, src]);

  return (
    <span
      aria-label="Video paylaşımı"
      className={overlayClassName}
      style={{
        display: 'block',
        position: 'relative',
        width: '100%',
        height: '100%',
        minHeight: 0,
        overflow: 'hidden',
        background: '#000',
        ...overlayStyle,
      }}
    >
      <video
        ref={videoRef}
        src={shouldLoad ? src : undefined}
        poster={thumbnailUrl || undefined}
        aria-hidden="true"
        muted
        playsInline
        loop
        autoPlay={shouldLoad}
        controls={false}
        disablePictureInPicture
        preload={shouldLoad ? 'auto' : 'none'}
        onCanPlay={(event) => {
          const video = event.currentTarget;
          video.muted = true;
          if (video.paused) {
            void video.play().catch((error) => console.debug('[VideoPostPreview] preview play deferred:', error));
          }
        }}
        style={{
          display: 'block',
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          pointerEvents: 'none',
        }}
      />
    </span>
  );
}
