"use client";

import React, { useCallback, useEffect, useRef, useState } from 'react';
import styles from '@/app/components/social/social.module.css';

function formatDuration(ms: number): string {
  const sec = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, '0')}`;
}

interface VoiceMessagePlayerProps {
  src: string;
  durationMs?: number;
}

export default function VoiceMessagePlayer({ src, durationMs }: VoiceMessagePlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentSec, setCurrentSec] = useState(0);

  const syncProgress = useCallback(() => {
    const el = audioRef.current;
    if (!el || !Number.isFinite(el.duration) || el.duration <= 0) return;
    setProgress(el.currentTime / el.duration);
    setCurrentSec(el.currentTime);
  }, []);

  useEffect(() => {
    setPlaying(false);
    setProgress(0);
    setCurrentSec(0);
  }, [src]);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;

    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onEnded = () => {
      setPlaying(false);
      setProgress(0);
      setCurrentSec(0);
    };
    const onError = () => {
      console.error('[VoiceMessage] Audio playback error:', src);
      setPlaying(false);
    };

    el.addEventListener('play', onPlay);
    el.addEventListener('pause', onPause);
    el.addEventListener('timeupdate', syncProgress);
    el.addEventListener('ended', onEnded);
    el.addEventListener('error', onError);

    return () => {
      el.removeEventListener('play', onPlay);
      el.removeEventListener('pause', onPause);
      el.removeEventListener('timeupdate', syncProgress);
      el.removeEventListener('ended', onEnded);
      el.removeEventListener('error', onError);
    };
  }, [src, syncProgress]);

  const togglePlay = () => {
    const el = audioRef.current;
    if (!el) return;
    if (playing) {
      el.pause();
      return;
    }
    void el.play().catch((err) => {
      console.error('[VoiceMessage] play() failed:', err);
    });
  };

  const totalLabel = durationMs ? formatDuration(durationMs) : formatClock(currentSec || 0);

  return (
    <div className={styles.voiceMsgPlayer}>
      <audio ref={audioRef} src={src} preload="metadata" className={styles.voiceMsgAudioHidden} />
      <button
        type="button"
        className={styles.voiceMsgPlayBtn}
        onClick={togglePlay}
        aria-label={playing ? 'Pauza' : 'Oxut'}
      >
        {playing ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <rect x="6" y="5" width="4" height="14" rx="1" />
            <rect x="14" y="5" width="4" height="14" rx="1" />
          </svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M8 5v14l11-7z" />
          </svg>
        )}
      </button>
      <div className={styles.voiceMsgTrack} aria-hidden>
        <div className={styles.voiceMsgFill} style={{ width: `${Math.min(100, progress * 100)}%` }} />
      </div>
      <span className={styles.voiceMsgDuration}>
        {playing ? formatClock(currentSec) : totalLabel}
      </span>
    </div>
  );
}
