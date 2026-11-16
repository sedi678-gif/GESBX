'use client';

import { useState } from 'react';
import { activateFreeCreatorPanel } from '@/app/lib/userPlan';
import { useChannelStudio, formatStudioCount, formatStudioAge } from './useChannelStudio';
import { useAppStrings } from '@/app/lib/useAppStrings';
import styles from './studioDashboard.module.css';

export default function StudioSnapshot({ userId }: { userId?: string | null }) {
  const data = useChannelStudio(userId);
  const t = useAppStrings();
  const latest = data.latest;
  const [activationError, setActivationError] = useState('');
  const [activating, setActivating] = useState(false);

  const openStudio = async () => {
    if (!userId || activating) return;
    setActivationError('');
    setActivating(true);
    try {
      await activateFreeCreatorPanel(userId);
      window.location.href = '/dashboard/?creatorStatus=activated';
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      if (/already|istifadə olunub/i.test(message)) {
        window.location.href = '/dashboard/?creatorStatus=already';
        return;
      }
      setActivationError(message || 'Creator panelini aktivləşdirmək mümkün olmadı.');
      setActivating(false);
    }
  };

  return (
    <section className={styles.snapshot} aria-label={t.studio.panel}>
      <div className={styles.snapshotHead}>
        {data.avatar ? (
          <img className={styles.avatar} src={data.avatar} alt="" />
        ) : (
          <div className={styles.brandMark} aria-hidden>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="#fff">
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
        )}
        <div>
          <h2>{data.name || t.studio.channel}</h2>
          <p>
            {t.studio.kicker} · {t.studio.control}
          </p>
        </div>
      </div>
      <div className={styles.snapshotStats}>
        <div>
          <span>{t.studio.followers}</span>
          <b>{formatStudioCount(data.followers)}</b>
        </div>
        <div>
          <span>{t.studio.likes}</span>
          <b>{formatStudioCount(data.likesReceived)}</b>
        </div>
        <div>
          <span>{t.studio.posts}</span>
          <b>{formatStudioCount(data.posts.length)}</b>
        </div>
      </div>
      {latest ? (
        <div className={styles.snapshotLatest}>
          {latest.mediaType === 'video' ? (
            <video src={latest.mediaUrl} muted playsInline preload="metadata" />
          ) : (
            <img src={latest.mediaUrl} alt="" />
          )}
          <div>
            <p>{latest.title || t.studio.latestResult}</p>
            <span>
              {formatStudioCount(latest.likes)} {t.studio.likes} · {formatStudioAge(latest.createdAt)}
            </span>
          </div>
        </div>
      ) : (
        <p className={styles.empty} style={{ padding: '0 14px 8px' }}>
          {t.studio.snapshotEmpty}
        </p>
      )}
      {activationError ? <p role="alert" className={styles.error}>{activationError}</p> : null}
      <button type="button" className={styles.snapshotCta} onClick={() => void openStudio()} disabled={activating}>
        {activating ? t.studio.wait : t.studio.open}
      </button>
    </section>
  );
}
