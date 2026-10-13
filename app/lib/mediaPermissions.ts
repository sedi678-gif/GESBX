import { mapGetUserMediaError } from '@/app/hooks/useMediaDevices';

export type MediaPermissionKind = 'microphone' | 'camera' | 'gallery';

export function getSupportedAudioMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return 'audio/webm';
  const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
  for (const t of types) {
    if (MediaRecorder.isTypeSupported(t)) return t;
  }
  return 'audio/webm';
}

export async function requestMicrophonePermission(): Promise<boolean> {
  const primed = await primeCallMedia(false);
  releaseMediaStream(primed.stream);
  return primed.audio;
}

export async function requestCameraPermission(): Promise<boolean> {
  const primed = await primeCallMedia(true);
  releaseMediaStream(primed.stream);
  return primed.video;
}

export function releaseMediaStream(stream: MediaStream | null | undefined): void {
  stream?.getTracks().forEach((track) => {
    try {
      track.stop();
    } catch {
      /* already stopped */
    }
  });
}

/** Klik jesti içində çağır — icazə prompt-u itməsin. Track-ləri Zego-dan əvvəl burax. */
export async function primeCallMedia(wantVideo: boolean): Promise<{
  stream: MediaStream | null;
  audio: boolean;
  video: boolean;
  error?: string;
}> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    return { stream: null, audio: false, video: false, error: 'Bu brauzer zəngi dəstəkləmir.' };
  }

  const audio = {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
  } as const;

  const tryGum = async (constraints: MediaStreamConstraints) =>
    navigator.mediaDevices.getUserMedia(constraints);

  if (wantVideo) {
    try {
      const stream = await tryGum({
        audio,
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      return { stream, audio: true, video: true };
    } catch (first) {
      try {
        const stream = await tryGum({ audio, video: true });
        return { stream, audio: true, video: true };
      } catch (second) {
        try {
          const stream = await tryGum({ audio, video: false });
          return { stream, audio: true, video: false, error: mapGetUserMediaError(second) };
        } catch (third) {
          return { stream: null, audio: false, video: false, error: mapGetUserMediaError(third) };
        }
      }
    }
  }

  try {
    const stream = await tryGum({ audio, video: false });
    return { stream, audio: true, video: false };
  } catch (err) {
    return { stream: null, audio: false, video: false, error: mapGetUserMediaError(err) };
  }
}

export async function requestGalleryPermission(): Promise<boolean> {
  return true;
}

export async function ensureMediaPermission(kind: MediaPermissionKind): Promise<boolean> {
  if (kind === 'microphone') return requestMicrophonePermission();
  if (kind === 'camera') return requestCameraPermission();
  return true;
}

const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const MAX_VIDEO_BYTES = 80 * 1024 * 1024;
const MAX_FILE_BYTES = 25 * 1024 * 1024;

export function validateMediaFile(file: File): { ok: boolean; error?: string; kind?: 'image' | 'video' | 'file' } {
  const isImage = file.type.startsWith('image/');
  const isVideo = file.type.startsWith('video/');

  if (isImage) {
    if (file.size > MAX_IMAGE_BYTES) return { ok: false, error: 'Şəkil çox böyükdür (max 12 MB).' };
    return { ok: true, kind: 'image' };
  }
  if (isVideo) {
    if (file.size > MAX_VIDEO_BYTES) return { ok: false, error: 'Video çox böyükdür (max 80 MB).' };
    return { ok: true, kind: 'video' };
  }
  if (file.type.startsWith('audio/')) {
    if (file.size > MAX_FILE_BYTES) return { ok: false, error: 'Səs faylı çox böyükdür (max 25 MB).' };
    return { ok: true, kind: 'file' };
  }
  if (file.size > MAX_FILE_BYTES) return { ok: false, error: 'Fayl çox böyükdür (max 25 MB).' };
  return { ok: true, kind: 'file' };
}

export function fileExtension(file: File): string {
  const fromName = file.name.split('.').pop()?.toLowerCase();
  if (fromName && fromName.length <= 8) return fromName;
  if (file.type.startsWith('image/')) return file.type.split('/')[1]?.replace('jpeg', 'jpg') || 'jpg';
  if (file.type.startsWith('video/')) return file.type.split('/')[1] || 'mp4';
  return 'bin';
}

export async function getCurrentLocation(): Promise<{ lat: number; lng: number; label: string }> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('GPS mövcud deyil'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          label: `${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`,
        });
      },
      () => reject(new Error('Konum icazəsi verilmədi')),
      { enableHighAccuracy: true, timeout: 15000 }
    );
  });
}
