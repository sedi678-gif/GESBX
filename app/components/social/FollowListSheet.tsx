"use client";

import React, { useEffect, useState } from 'react';
import AppLink from '@/app/components/AppLink';
import {
  listenFollowerIds,
  listenFollowingIds,
  getUserProfile,
} from '@/app/lib/socialService';
import { AppUserProfile } from '@/app/lib/socialTypes';
import styles from './social.module.css';

const DEFAULT_AVATAR = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' rx='50' fill='%23334155'/%3E%3Ccircle cx='50' cy='37' r='18' fill='%2394a3b8'/%3E%3Cpath d='M18 91c3-20 15-30 32-30s29 10 32 30' fill='%2394a3b8'/%3E%3C/svg%3E";

interface FollowListSheetProps {
  open: boolean;
  onClose: () => void;
  userId: string;
  mode: 'followers' | 'following';
  title: string;
  emptyText: string;
}

export default function FollowListSheet({
  open,
  onClose,
  userId,
  mode,
  title,
  emptyText,
}: FollowListSheetProps) {
  const [users, setUsers] = useState<AppUserProfile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!open || !userId) return;

    setLoading(true);
    const listen = mode === 'followers' ? listenFollowerIds : listenFollowingIds;

    let active = true;
    const unsubscribe = listen(userId, (ids) => {
      void (async () => {
        try {
          const profiles = await Promise.all(
            ids.map(async (id) => {
              try {
                const profile = await getUserProfile(id);
                if (profile) return profile;
              } catch (error) {
                console.warn('[FollowListSheet] profile lookup failed:', id, error);
              }
              return {
                id,
                name: 'İstifadəçi',
                handle: `@${id}`,
              } satisfies AppUserProfile;
            })
          );
          if (active) setUsers(profiles);
        } finally {
          if (active) setLoading(false);
        }
      })();
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [open, userId, mode]);

  if (!open) return null;

  return (
    <div className={styles.modalOverlay} onClick={onClose} role="presentation">
      <div className={styles.modalSheet} onClick={(e) => e.stopPropagation()} role="dialog" aria-label={title}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <h2 className={styles.modalTitle} style={{ margin: 0 }}>{title}</h2>
          <button type="button" className={styles.iconBtn} onClick={onClose} aria-label="Bağla">
            ✕
          </button>
        </div>

        {loading ? (
          <p style={{ color: '#94a3b8', textAlign: 'center', padding: '16px 0' }}>Yüklənir...</p>
        ) : users.length === 0 ? (
          <p style={{ color: '#94a3b8', textAlign: 'center', padding: '16px 0' }}>{emptyText}</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {users.map((user) => (
              <AppLink
                key={user.id}
                href={`/profile?user=${user.id}`}
                className={styles.userResult}
                style={{ textDecoration: 'none', color: 'inherit' }}
                onClick={onClose}
              >
                <img
                  src={user.avatar || DEFAULT_AVATAR}
                  alt=""
                  className={styles.avatar}
                  style={{ width: 44, height: 44, borderRadius: '50%', objectFit: 'cover' }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {user.name} {user.surname}
                  </div>
                  <div style={{ fontSize: 12, color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {user.handle || `@${user.id}`}
                  </div>
                </div>
                <span style={{ fontSize: 12, color: '#a78bfa', fontWeight: 700 }}>Profil →</span>
              </AppLink>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
