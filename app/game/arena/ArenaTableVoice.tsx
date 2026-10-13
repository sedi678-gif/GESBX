"use client";

import { useEffect, useRef, useState } from 'react';
import { joinArenaVoiceRoom, leaveArenaVoiceRoom, setArenaVoiceMuted } from '@/app/lib/zegoCallKit';
import styles from '../table/gameTable.module.css';

export default function ArenaTableVoice({
  matchId,
  playerId,
  playerName,
}: {
  matchId: string;
  playerId: string;
  playerName: string;
}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [muted, setMuted] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const el = mountRef.current;
    if (!el || !matchId || !playerId) return undefined;
    let cancelled = false;
    void joinArenaVoiceRoom({
      matchId,
      playerId,
      playerName,
      container: el,
    }).then((ok) => {
      if (!cancelled) setReady(ok);
    });
    return () => {
      cancelled = true;
      leaveArenaVoiceRoom();
    };
  }, [matchId, playerId, playerName]);

  return (
    <div className={styles.voiceBar}>
      <div ref={mountRef} className={styles.voiceHidden} aria-hidden="true" />
      <button
        type="button"
        className={styles.voiceBtn}
        disabled={!ready}
        onClick={() => {
          const next = !muted;
          setMuted(next);
          setArenaVoiceMuted(next);
        }}
      >
        {muted ? 'Mikrofon bağlı' : 'Masa səsi açıq'}
      </button>
    </div>
  );
}
