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

const DEFAULT_AVATAR =
  'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=100&q=80';

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

    return listen(userId, (ids) => {
      void (async () => {
        const profiles = await Promise.all(
          ids.map(async (id) => {
            const profile = await getUserProfile(id);
            if (profile) return profile;
            return {
              id,
              name: 'İstifadəçi',
              handle: `@${id}`,
            } satisfies AppUserProfile;
          })
        );
        setUsers(profiles);
        setLoading(false);
      })();
    });
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
