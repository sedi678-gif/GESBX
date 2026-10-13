"use client";

import React, { useState } from 'react';
import {
  PostActionIconKind,
  POST_ACTION_ICON_PATHS,
  POST_ACTION_ICON_FALLBACK,
} from '@/app/lib/postActionIcons';
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
  const [useFallback, setUseFallback] = useState(false);
  const sizeClass = size === 'sm' ? styles.postActionIconSm : styles.postActionIconMd;

  if (useFallback) {
    return (
      <span className={`${styles.postActionEmoji} ${sizeClass} ${className}`} aria-hidden="true">
        {POST_ACTION_ICON_FALLBACK[kind]}
      </span>
    );
  }

  return (
    <img
      src={POST_ACTION_ICON_PATHS[kind]}
      alt={alt}
      className={`${styles.postActionIconImg} ${sizeClass} ${className}`}
      draggable={false}
      onError={() => setUseFallback(true)}
    />
  );
}
