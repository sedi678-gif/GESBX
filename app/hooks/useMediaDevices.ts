"use client";

import { useCallback, useEffect, useRef, useState } from 'react';

export type MediaDevicePermission = 'granted' | 'denied' | 'prompt' | 'unknown';

export interface MediaStreamOptions {
  video?: boolean;
  facingMode?: 'user' | 'environment';
}

export function mapGetUserMediaError(err: unknown): string {
  if (!err || typeof err !== 'object') return 'Media cihazına çıxış alınmadı.';
  const name = (err as DOMException).name;
  switch (name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
      return 'Mikrofon icazəsi rədd edildi. Brauzer parametrlərindən icazə verin.';
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return 'Mikrofon tapılmadı. Cihazınızı yoxlayın.';
    case 'NotReadableError':
    case 'TrackStartError':
      return 'Mikrofon başqa proqram tərəfindən istifadə olunur.';
    case 'OverconstrainedError':
      return 'Tələb olunan media parametrləri dəstəklənmir.';
    case 'SecurityError':
      return 'Təhlükəsizlik səbəbindən media icazəsi verilmədi (HTTPS lazımdır).';
    case 'AbortError':
      return 'Media sorğusu ləğv edildi.';
    default:
      return (err as Error).message || 'Media cihazına çıxış alınmadı.';
  }
}

/** Mikrofon/kamera icazələrini idarə edən hook */
export function useMediaDevices() {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [permission, setPermission] = useState<MediaDevicePermission>('unknown');
  const [loading, setLoading] = useState(false);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    streamRef.current = stream;
  }, [stream]);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    setStream(null);
  }, []);

  useEffect(() => () => stopStream(), [stopStream]);

  const requestMedia = useCallback(async (options: MediaStreamOptions = {}): Promise<MediaStream> => {
    setLoading(true);
    setError(null);

    try {
      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        throw new Error('Bu brauzer səsli zəngi dəstəkləmir.');
      }

      const media = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: options.video
          ? {
              facingMode: options.facingMode ?? 'user',
              width: { ideal: 640 },
              height: { ideal: 480 },
            }
          : false,
      });

      stopStream();
      setStream(media);
      setPermission('granted');
      return media;
    } catch (err) {
      const message = mapGetUserMediaError(err);
      setError(message);
      setPermission('denied');
      throw new Error(message);
    } finally {
      setLoading(false);
    }
  }, [stopStream]);

  const requestMicrophone = useCallback(
    () => requestMedia({ video: false }),
    [requestMedia]
  );

  const requestCamera = useCallback(
    () => requestMedia({ video: true }),
    [requestMedia]
  );

  const clearError = useCallback(() => setError(null), []);

  return {
    stream,
    error,
    permission,
    loading,
    requestMedia,
    requestMicrophone,
    requestCamera,
    stopStream,
    clearError,
  };
}
