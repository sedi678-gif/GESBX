"use client";

import React from 'react';
import { PostActionIconKind } from '@/app/lib/postActionIcons';
import styles from './social.module.css';

interface PostActionIconProps {
  kind: PostActionIconKind;
  alt: string;
  className?: string;
  size?: 'sm' | 'md';
}

export default function PostActionIcon({
  kind,
  alt,
  className = '',
  size = 'md',
}: PostActionIconProps) {
  const sizeClass = size === 'sm' ? styles.postActionIconSm : styles.postActionIconMd;
  const common = {
    width: '100%',
    height: '100%',
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-label': alt,
    role: 'img' as const,
  };

  return (
    <svg {...common} className={`${styles.postActionSvg} ${sizeClass} ${styles[`postAction${kind.replace(/(^|-)([a-z])/g, (_, __, c) => c.toUpperCase())}`] || ''} ${className}`}>
      {kind === 'like' || kind === 'like-active' ? (
        <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z" />
      ) : kind === 'comment' ? (
        <>
          <path d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5H7l-4 2v-6.5A7.5 7.5 0 0 1 10.5 7H12.5A7.5 7.5 0 0 1 20 14.5Z" />
          <path d="M8 13h.01M12 13h.01M16 13h.01" strokeWidth="2.8" />
        </>
      ) : kind === 'share' ? (
        <>
          <path d="M12 16V3m-5 5 5-5 5 5" />
          <path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" />
        </>
      ) : (
        <>
          <path d="M12 3 2.8 20h18.4L12 3Z" />
          <path d="M12 9v5m0 3h.01" />
        </>
      )}
    </svg>
  );
}
