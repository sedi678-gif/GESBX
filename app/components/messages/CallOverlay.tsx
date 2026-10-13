"use client";

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  IconCallHangup,
  IconCallInvite,
  IconCallLock,
  IconCallMic,
  IconCallMicOff,
  IconCallMinimize,
  IconCallMore,
  IconCallPhone,
  IconCallShare,
  IconCallSpeaker,
  IconCallSpeakerOff,
  IconCallVideo,
  IconCallVideoOff,
} from './CallControlIcons';
import { unlockCallAudio } from '@/app/lib/audioUnlock';
import { getAppStrings } from '@/app/lib/appI18n';
import { readStoredLanguage } from '@/app/lib/appLanguage';
import { CallType } from '@/app/lib/callService';
import { watchVideoTrackActivity } from '@/app/lib/callVideoUtils';
import styles from './callOverlay.module.css';

interface CallOverlayProps {
  mode: 'outgoing' | 'incoming' | 'connecting' | 'active';
  callType: CallType;
  peerName: string;
  peerAvatar?: string;
  localStream?: MediaStream | null;
  remoteStream?: MediaStream | null;
  onAccept?: () => void;
  onReject?: () => void;
  onEnd?: () => void;
  onToggleMute?: () => void;
  onToggleSpeaker?: () => void;
  onToggleCamera?: () => Promise<void> | void;
  onOpenInvite?: () => void;
  onShare?: () => void;
  onFlipCamera?: () => void;
  micMuted?: boolean;
  speakerOn?: boolean;
  cameraOn?: boolean;
  errorMessage?: string | null;
  minimized?: boolean;
  onToggleMinimize?: () => void;
}

const DEFAULT_AVATAR =
  'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=200&q=80';

function formatTimer(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

async function playMedia(el: HTMLMediaElement | null, stream: MediaStream | null, muted: boolean) {
  if (!el) return;
  if (!stream) {
    el.srcObject = null;
    return;
  }
  if (el.srcObject !== stream) el.srcObject = stream;
  el.muted = muted;
  el.volume = 1;
  try {
    await el.play();
  } catch {
    /* user gesture / autoplay */
  }
}

function PadBtn({
  label,
  onClick,
  on: isOn = false,
  danger = false,
  children,
}: {
  label: string;
  onClick?: () => void;
  on?: boolean;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button type="button" className={styles.controlBtn} aria-label={label} onClick={onClick}>
      <span
        className={[
          styles.circle,
          isOn ? styles.circleOn : '',
          danger ? styles.circleDanger : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {children}
      </span>
      <span className={styles.label}>{label}</span>
    </button>
  );
}

export default function CallOverlay({
  mode,
  callType,
  peerName,
  peerAvatar,
  localStream,
  remoteStream,
  onAccept,
  onReject,
  onEnd,
  onToggleMute,
  onToggleSpeaker,
  onToggleCamera,
  onOpenInvite,
  onShare,
  onFlipCamera,
  micMuted = false,
  speakerOn = true,
  cameraOn = false,
  errorMessage = null,
  minimized = false,
  onToggleMinimize,
}: CallOverlayProps) {
  const t = getAppStrings(readStoredLanguage() ?? 'az');
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const [elapsed, setElapsed] = useState(0);
  const [remoteVideoLive, setRemoteVideoLive] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  const avatar = peerAvatar || DEFAULT_AVATAR;
  const showVideo = (callType === 'video' || cameraOn || remoteVideoLive) && Boolean(remoteStream || (cameraOn && localStream));
  const statusText =
    mode === 'incoming'
      ? t.messages.callIncoming
      : mode === 'outgoing'
        ? t.messages.callOutgoing
        : mode === 'connecting'
          ? t.messages.callConnecting
          : t.messages.callInProgress;

  const bind = useCallback(async () => {
    await unlockCallAudio();
    await playMedia(remoteAudioRef.current, remoteStream ?? null, false);
    if (remoteAudioRef.current) {
      remoteAudioRef.current.muted = false;
      remoteAudioRef.current.volume = speakerOn ? 1 : 0.45;
    }
    await playMedia(remoteVideoRef.current, remoteStream ?? null, true);
    await playMedia(localVideoRef.current, cameraOn ? localStream ?? null : null, true);
  }, [remoteStream, localStream, cameraOn, speakerOn]);

  useEffect(() => watchVideoTrackActivity(remoteStream, setRemoteVideoLive), [remoteStream]);
  useEffect(() => {
    void bind();
  }, [bind]);

  useEffect(() => {
    if (mode !== 'active') {
      setElapsed(0);
      return;
    }
    const startedAt = Date.now();
    const tick = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 1000);
    return () => clearInterval(tick);
  }, [mode]);

  if (minimized) {
    return (
      <div className={`${styles.overlay} ${styles.minimized}`} role="dialog" aria-label={peerName}>
        <button type="button" className={styles.chromeHit} onClick={onToggleMinimize} aria-label={statusText} />
        <div className={styles.miniRow}>
          <img src={avatar} alt="" className={styles.miniAvatar} />
          <div className={styles.miniMeta}>
            <p className={styles.miniName}>{peerName}</p>
            <p className={styles.miniStatus}>{mode === 'active' ? formatTimer(elapsed) : statusText}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-label={`${peerName} — ${statusText}`}>
      <audio
        ref={remoteAudioRef}
        autoPlay
        playsInline
        style={{ position: 'fixed', width: 1, height: 1, opacity: 0.01, pointerEvents: 'none' }}
      />

      {showVideo ? (
        <div className={styles.videoStage}>
          {remoteStream ? <video ref={remoteVideoRef} autoPlay playsInline className={styles.remoteVideo} /> : null}
          {cameraOn && localStream ? (
            <video ref={localVideoRef} autoPlay playsInline muted className={styles.localPip} />
          ) : null}
        </div>
      ) : cameraOn && localStream ? (
        <div className={styles.videoStage}>
          <video ref={localVideoRef} autoPlay playsInline muted className={styles.remoteVideo} />
        </div>
      ) : null}

      <header className={styles.topBar}>
        <button type="button" className={styles.roundIcon} aria-label={t.messages.callMinimize} onClick={onToggleMinimize}>
          <IconCallMinimize />
        </button>
        <div className={styles.encryptWrap}>
          <span className={styles.hearts} aria-hidden>
            💙❤️💚
          </span>
          <p className={styles.encrypt}>
            <IconCallLock /> {t.messages.callEncrypt}
          </p>
        </div>
        <button type="button" className={styles.roundIcon} aria-label={t.messages.callAdd} onClick={onOpenInvite}>
          <IconCallInvite size={22} />
        </button>
      </header>

      <main className={styles.main}>
        {!showVideo && !(cameraOn && localStream) ? <img src={avatar} alt="" className={styles.avatar} /> : null}
        <h2 className={styles.peerName}>{peerName}</h2>
        <p className={styles.status}>{statusText}</p>
        {mode === 'active' ? <p className={styles.timer}>{formatTimer(elapsed)}</p> : null}
        {errorMessage ? <p className={styles.hint}>{errorMessage}</p> : null}
      </main>

      {moreOpen ? (
        <div className={styles.moreSheet}>
          <button
            type="button"
            className={styles.moreItem}
            onClick={() => {
              setMoreOpen(false);
              onFlipCamera?.();
            }}
          >
            {t.messages.callFlip}
          </button>
        </div>
      ) : null}

      <footer className={styles.footer}>
        {mode === 'incoming' ? (
          <div className={styles.incomingRow}>
            <PadBtn label={t.messages.callDecline} danger onClick={onReject}>
              <IconCallHangup size={26} />
            </PadBtn>
            <button type="button" className={styles.controlBtn} onClick={onAccept} aria-label={t.messages.callAccept}>
              <span className={`${styles.circle} ${styles.circleAccept}`}>
                {callType === 'video' ? <IconCallVideo size={26} /> : <IconCallPhone size={26} />}
              </span>
              <span className={styles.label}>{t.messages.callAccept}</span>
            </button>
          </div>
        ) : (
          <div className={styles.pad}>
            <PadBtn
              label={speakerOn ? t.messages.callSpeaker : t.messages.callSpeakerOff}
              on={speakerOn}
              onClick={onToggleSpeaker}
            >
              {speakerOn ? <IconCallSpeaker /> : <IconCallSpeakerOff />}
            </PadBtn>
            <PadBtn
              label={t.messages.callCamera}
              on={cameraOn}
              onClick={() => void onToggleCamera?.()}
            >
              {cameraOn ? <IconCallVideo /> : <IconCallVideoOff />}
            </PadBtn>
            <PadBtn
              label={micMuted ? t.messages.callMuted : t.messages.callMute}
              on={micMuted}
              onClick={onToggleMute}
            >
              {micMuted ? <IconCallMicOff /> : <IconCallMic />}
            </PadBtn>
            <PadBtn label={t.messages.callMore} onClick={() => setMoreOpen((v) => !v)}>
              <IconCallMore />
            </PadBtn>
            <PadBtn label={t.messages.callShare} onClick={onShare}>
              <IconCallShare />
            </PadBtn>
            <PadBtn label={t.messages.callEnd} danger onClick={onEnd}>
              <IconCallHangup size={26} />
            </PadBtn>
          </div>
        )}
      </footer>
    </div>
  );
}
