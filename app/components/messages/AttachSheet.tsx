"use client";

import React from 'react';
import styles from '../social/social.module.css';

interface AttachSheetProps {
  onGallery: () => void;
  onCamera: () => void;
  onDocument: () => void;
  onLocation: () => void;
  onClose: () => void;
}

const OPTIONS = [
  { key: 'gallery', icon: '🖼️', label: 'Qalereya', color: '#8b5cf6' },
  { key: 'camera', icon: '📷', label: 'Kamera', color: '#ec4899' },
  { key: 'document', icon: '📄', label: 'Sənəd', color: '#6366f1' },
  { key: 'location', icon: '📍', label: 'Konum', color: '#22c55e' },
] as const;

export default function AttachSheet({ onGallery, onCamera, onDocument, onLocation, onClose }: AttachSheetProps) {
  const handlers: Record<string, () => void> = {
    gallery: onGallery,
    camera: onCamera,
    document: onDocument,
    location: onLocation,
  };

  return (
    <div className={styles.waAttachOverlay} onClick={onClose}>
      <div className={styles.waAttachSheet} onClick={(e) => e.stopPropagation()}>
        <div className={styles.waAttachGrid}>
          {OPTIONS.map((opt) => (
            <button
              key={opt.key}
              type="button"
              className={styles.waAttachItem}
              onClick={() => {
                handlers[opt.key]();
                onClose();
              }}
            >
              <span className={styles.waAttachIcon} style={{ background: opt.color }}>
                {opt.icon}
              </span>
              <span className={styles.waAttachLabel}>{opt.label}</span>
            </button>
          ))}
        </div>
        <button type="button" className={styles.waAttachCancel} onClick={onClose}>
          Ləğv et
        </button>
      </div>
    </div>
  );
}
