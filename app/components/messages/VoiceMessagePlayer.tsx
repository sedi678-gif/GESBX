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
  waveform?: number[];
}

export default function VoiceMessagePlayer({ src, durationMs, waveform: savedWaveform }: VoiceMessagePlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentSec, setCurrentSec] = useState(0);
  const [playbackRate, setPlaybackRate] = useState<1 | 1.5 | 2>(1);
  const [waveform, setWaveform] = useState<number[]>(() => savedWaveform?.length ? savedWaveform : Array(36).fill(5));

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
    setPlaybackRate(1);
  }, [src]);

  useEffect(() => {
    if (savedWaveform && savedWaveform.length > 0) {
      setWaveform(savedWaveform);
      return;
    }
    let cancelled = false;
    let audioContext: AudioContext | null = null;

    const loadWaveform = async () => {
      try {
        const response = await fetch(src);
        if (!response.ok) throw new Error(`Audio waveform fetch failed: ${response.status}`);
        const bytes = await response.arrayBuffer();
        const AudioContextClass = window.AudioContext ||
          (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AudioContextClass) throw new Error('AudioContext is unavailable');

        audioContext = new AudioContextClass();
        const decoded = await audioContext.decodeAudioData(bytes);
        if (cancelled) return;

        const channel = decoded.getChannelData(0);
        const bars = 36;
        const blockSize = Math.max(1, Math.floor(channel.length / bars));
        const peaks = Array.from({ length: bars }, (_, index) => {
          const start = index * blockSize;
          const end = Math.min(channel.length, start + blockSize);
          let sum = 0;
          for (let i = start; i < end; i += 1) sum += channel[i] * channel[i];
          const rms = Math.sqrt(sum / Math.max(1, end - start));
          return rms;
        });
        const maxPeak = Math.max(...peaks, 0.0001);
        setWaveform(peaks.map((peak) => Math.max(5, Math.round((peak / maxPeak) * 100))));
      } catch (error) {
        console.warn('[VoiceMessage] Real waveform unavailable; using visual fallback.', error);
        if (!cancelled) {
          setWaveform(Array(36).fill(5));
        }
      } finally {
        if (audioContext && audioContext.state !== 'closed') {
          void audioContext.close().catch(() => undefined);
        }
      }
    };

    setWaveform(Array(36).fill(5));
    void loadWaveform();
    return () => {
      cancelled = true;
      if (audioContext && audioContext.state !== 'closed') {
        void audioContext.close().catch(() => undefined);
      }
    };
  }, [src, savedWaveform]);



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

  useEffect(() => {
    const el = audioRef.current;
    if (el) el.playbackRate = playbackRate;
  }, [playbackRate, src]);

  const cyclePlaybackRate = () => {
    setPlaybackRate((current) => current === 1 ? 1.5 : current === 1.5 ? 2 : 1);
  };

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
      <div className={styles.voiceMsgWaveform} aria-hidden>
        {waveform.map((height, index) => {
          const played = index / waveform.length <= progress;
          return (
            <span
              key={index}
              className={`${styles.voiceMsgWaveBar} ${played ? styles.voiceMsgWaveBarPlayed : ''}`}
              style={{ height: `${height}%` }}
            />
          );
        })}
      </div>
      <span className={styles.voiceMsgDuration}>
        {playing ? formatClock(currentSec) : totalLabel}
      </span>
      <button
        type="button"
        className={styles.voiceMsgSpeedBtn}
        onClick={cyclePlaybackRate}
        aria-label={`Dinləmə sürəti ${playbackRate}x. Dəyişmək üçün toxunun.`}
        title="Dinləmə sürətini dəyiş"
      >
        {playbackRate}x
      </button>
    </div>
  );
}
