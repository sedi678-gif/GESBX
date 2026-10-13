/** Overlay üçün lokal/remote MediaStream — Zego DOM-dan və getUserMedia-dan. */

import { releaseCallAudioUnlock, unlockCallAudio } from '@/app/lib/audioUnlock';

export type CallMediaState = {
  local: MediaStream | null;
  remote: MediaStream | null;
};

let local: MediaStream | null = null;
let remote: MediaStream | null = null;
const listeners = new Set<(state: CallMediaState) => void>();
let harvestTimer: ReturnType<typeof setInterval> | null = null;
let remoteAudioEl: HTMLAudioElement | null = null;
let pipedAudioKey = '';

function audioTrackKey(stream: MediaStream | null): string {
  if (!stream) return '';
  return stream
    .getAudioTracks()
    .filter((t) => t.readyState === 'live' && t.enabled)
    .map((t) => t.id)
    .sort()
    .join(',');
}

function ensureRemoteAudioEl(): HTMLAudioElement | null {
  if (typeof document === 'undefined') return null;
  const existing = document.getElementById('yolustu-remote-audio') as HTMLAudioElement | null;
  if (existing) {
    remoteAudioEl = existing;
    return existing;
  }
  if (remoteAudioEl && remoteAudioEl.isConnected) return remoteAudioEl;
  const el = document.createElement('audio');
  el.id = 'yolustu-remote-audio';
  el.autoplay = true;
  el.setAttribute('playsinline', 'true');
  el.setAttribute('webkit-playsinline', 'true');
  el.muted = false;
  el.volume = 1;
  el.style.cssText = 'position:fixed;width:2px;height:2px;opacity:0.02;pointer-events:none;z-index:3;';
  document.documentElement.appendChild(el);
  remoteAudioEl = el;
  return el;
}

function pipeRemoteAudio(stream: MediaStream | null) {
  const el = ensureRemoteAudioEl();
  if (!el) return;
  const key = audioTrackKey(stream);
  if (key !== pipedAudioKey) {
    pipedAudioKey = key;
    el.removeAttribute('src');
    el.srcObject = stream && key ? stream : null;
  }
  el.muted = false;
  el.volume = 1;
  void el.play().catch(() => undefined);
}

function emit() {
  const snapshot = { local, remote };
  listeners.forEach((fn) => fn(snapshot));
}

export function getCallMedia(): CallMediaState {
  return { local, remote };
}

export function listenCallMedia(fn: (state: CallMediaState) => void): () => void {
  listeners.add(fn);
  fn(getCallMedia());
  return () => {
    listeners.delete(fn);
  };
}

export function setCallLocalStream(stream: MediaStream | null | undefined) {
  if (local === stream) return;
  local = stream ?? null;
  emit();
}

export function setCallRemoteStream(stream: MediaStream | null | undefined) {
  if (remote === stream) return;
  remote = stream ?? null;
  pipeRemoteAudio(remote);
  emit();
}

export function muteLocalAudio(muted: boolean) {
  local?.getAudioTracks().forEach((t) => {
    t.enabled = !muted;
  });
}

export function muteLocalVideo(muted: boolean) {
  local?.getVideoTracks().forEach((t) => {
    t.enabled = !muted;
  });
}

/** Zego özü mikrofonu açıb yayımlamalıdır — overlay preview mic-i burax. */
export function releaseMicForZego(): void {
  const stopTracks = (stream: MediaStream | null) => {
    stream?.getAudioTracks().forEach((track) => {
      try {
        track.stop();
      } catch {
        /* */
      }
      stream.removeTrack(track);
    });
  };
  stopTracks(local);
  emit();
}

export async function ensureLocalPreview(wantVideo: boolean): Promise<MediaStream | null> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) return local;
  const hasAudio = Boolean(local?.getAudioTracks().some((t) => t.readyState === 'live'));
  const hasVideo = Boolean(local?.getVideoTracks().some((t) => t.readyState === 'live'));
  if (hasAudio && (!wantVideo || hasVideo)) return local;

  try {
    const next = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: wantVideo ? { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } } : false,
    });
    if (local) {
      local.getTracks().forEach((t) => t.stop());
    }
    local = next;
    emit();
    return local;
  } catch {
    if (wantVideo) {
      try {
        const audioOnly = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        if (!local) {
          local = audioOnly;
          emit();
        }
        return local;
      } catch {
        return local;
      }
    }
    return local;
  }
}

export async function flipLocalCamera(): Promise<void> {
  const video = local?.getVideoTracks()[0];
  const facing = video?.getSettings().facingMode === 'environment' ? 'user' : 'environment';
  try {
    const next = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { exact: facing } },
    });
    const newTrack = next.getVideoTracks()[0];
    if (!newTrack) return;
    video?.stop();
    if (local) {
      local.getVideoTracks().forEach((t) => local?.removeTrack(t));
      local.addTrack(newTrack);
    } else {
      local = next;
    }
    emit();
  } catch {
    try {
      const next = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: facing },
      });
      const newTrack = next.getVideoTracks()[0];
      if (!newTrack) return;
      video?.stop();
      local?.getVideoTracks().forEach((t) => local?.removeTrack(t));
      local?.addTrack(newTrack);
      emit();
    } catch {
      /* cihaz dəstəkləmir */
    }
  }
}

export function releaseCallMedia() {
  stopMediaHarvest();
  local?.getTracks().forEach((t) => {
    try {
      t.stop();
    } catch {
      /* */
    }
  });
  local = null;
  remote = null;
  pipedAudioKey = '';
  if (remoteAudioEl) {
    remoteAudioEl.srcObject = null;
    remoteAudioEl.removeAttribute('src');
    remoteAudioEl.remove();
    remoteAudioEl = null;
  }
  const leftover = document.getElementById('yolustu-remote-audio');
  leftover?.remove();
  releaseCallAudioUnlock();
  emit();
}

function asStream(value: unknown): MediaStream | null {
  if (value instanceof MediaStream) return value;
  if (value && typeof value === 'object') {
    const bag = value as { stream?: unknown; mediaStream?: unknown };
    if (bag.stream instanceof MediaStream) return bag.stream;
    if (bag.mediaStream instanceof MediaStream) return bag.mediaStream;
  }
  return null;
}

function looksLocalMedia(el: HTMLMediaElement): boolean {
  const s = `${el.id} ${el.className} ${el.getAttribute('data-local') || ''}`.toLowerCase();
  if (s.includes('remote')) return false;
  return s.includes('local') || s.includes('preview') || s.includes('self');
}

function collectFromStage(): { local: MediaStream | null; remote: MediaStream | null } {
  const stage = document.getElementById('zego-call-stage');
  if (!stage) return { local: null, remote: null };

  let foundLocal: MediaStream | null = null;
  const remoteTracks: MediaStreamTrack[] = [];
  const seen = new Set<string>();

  const addRemote = (stream: MediaStream | null) => {
    stream?.getAudioTracks().forEach((t) => {
      if (t.readyState !== 'live' || seen.has(t.id)) return;
      seen.add(t.id);
      remoteTracks.push(t);
    });
  };

  stage.querySelectorAll('video, audio').forEach((node) => {
    const el = node as HTMLMediaElement;
    if (el.id === 'yolustu-remote-audio') return;
    const stream = asStream(el.srcObject);
    if (!stream) return;
    if (looksLocalMedia(el)) {
      foundLocal = stream;
      return;
    }
    addRemote(stream);
    try {
      const cap = (el as HTMLVideoElement & { captureStream?: () => MediaStream }).captureStream?.();
      addRemote(asStream(cap));
    } catch {
      /* captureStream yalnız oynayan media üçün */
    }
  });

  if (!remoteTracks.length) {
    stage.querySelectorAll('video, audio').forEach((node) => {
      const el = node as HTMLMediaElement;
      if (el.id === 'yolustu-remote-audio' || looksLocalMedia(el)) return;
      addRemote(asStream(el.srcObject));
    });
  }

  return {
    local: foundLocal,
    remote: remoteTracks.length ? new MediaStream(remoteTracks) : null,
  };
}

function wakeStageMedia() {
  const stage = document.getElementById('zego-call-stage');
  if (!stage) return;
  stage.querySelectorAll('audio, video').forEach((node) => {
    const el = node as HTMLMediaElement;
    el.setAttribute('playsinline', 'true');
    el.setAttribute('webkit-playsinline', 'true');
    const localish = looksLocalMedia(el);
    if (!localish) {
      el.muted = false;
      el.volume = 1;
    }
    void el.play().catch(() => undefined);
  });
}

export function startMediaHarvest(express?: {
  on?: (ev: string, cb: (...args: unknown[]) => void) => void;
  startPlayingStream?: (id: string, opts?: Record<string, unknown>) => Promise<unknown>;
} | null): void {
  stopMediaHarvest();
  void unlockCallAudio();
  wakeStageMedia();

  const playStream = express?.startPlayingStream;
  if (express?.on && playStream) {
    express.on('roomStreamUpdate', (...args: unknown[]) => {
      const updateType = args[1];
      const list = (args[2] || []) as { streamID?: string; stream_id?: string }[];
      const added = updateType === 'ADD' || updateType === 0 || updateType === 'Added';
      if (!added) return;
      void Promise.all(
        list.map(async (item) => {
          const id = item.streamID || item.stream_id;
          if (!id) return;
          try {
            const played = await playStream(id, { audio: true, video: true });
            const ms = asStream(played);
            if (ms?.getAudioTracks().length) setCallRemoteStream(ms);
          } catch {
            /* Prebuilt artıq oxuyursa DOM harvest kifayətdir */
          }
        })
      );
    });
  }

  harvestTimer = setInterval(() => {
    wakeStageMedia();
    const found = collectFromStage();
    if (found.local && found.local !== local) setCallLocalStream(found.local);
    if (found.remote) {
      const nextKey = audioTrackKey(found.remote);
      if (nextKey && nextKey !== pipedAudioKey) setCallRemoteStream(found.remote);
      else pipeRemoteAudio(remote || found.remote);
    } else if (remote) {
      pipeRemoteAudio(remote);
    }
  }, 400);
}

export function stopMediaHarvest() {
  if (harvestTimer) {
    clearInterval(harvestTimer);
    harvestTimer = null;
  }
}
