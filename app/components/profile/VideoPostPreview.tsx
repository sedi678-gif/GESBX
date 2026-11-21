"use client";

import React, { useEffect, useRef, useState } from 'react';

type VideoPostPreviewProps = {
  src: string;
  overlayClassName?: string;
  overlayStyle?: React.CSSProperties;
  priority?: boolean;
};

export default function VideoPostPreview({
  src,
  overlayClassName,
  overlayStyle,
  priority = false,
}: VideoPostPreviewProps) {
  const containerRef = useRef<HTMLSpanElement>(null);
  const [shouldLoad, setShouldLoad] = useState(false);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    if (priority || typeof IntersectionObserver === 'undefined') {
      setShouldLoad(true);
      return;
    }

    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setShouldLoad(true);
        observer.disconnect();
      }
    }, { rootMargin: '600px 0px' });

    observer.observe(element);
    return () => observer.disconnect();
  }, [priority]);

  return (
    <span ref={containerRef} style={{ display: 'contents' }}>
      <video
        src={shouldLoad ? src : undefined}
        muted
        playsInline
        preload={shouldLoad ? 'auto' : 'none'}
        fetchPriority={priority ? 'high' : 'auto'}
        onLoadedData={(event) => event.currentTarget.pause()}
      />
      <span
        aria-hidden="true"
        className={overlayClassName}
        style={overlayStyle ?? { position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', pointerEvents: 'none', color: '#fff', fontSize: 24, textShadow: '0 2px 10px rgba(0,0,0,.8)' }}
      >
        ▶
      </span>
    </span>
  );
}
