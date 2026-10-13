import { CallType } from './callService';

/** Video track-in canlı və aktiv olub-olmadığını yoxlayır */
export function isActiveVideoTrack(stream: MediaStream | null | undefined): boolean {
  if (!stream) return false;
  return stream.getVideoTracks().some(
    (t) => t.readyState === 'live' && t.enabled && !t.muted
  );
}

/** Stream-dəki video track dəyişikliklərini izləyir */
export function watchVideoTrackActivity(
  stream: MediaStream | null | undefined,
  onChange: (active: boolean) => void
): () => void {
  if (!stream) {
    onChange(false);
    return () => undefined;
  }

  const update = () => onChange(isActiveVideoTrack(stream));

  const bindTrack = (track: MediaStreamTrack) => {
    if (track.kind !== 'video') return;
    track.addEventListener('mute', update);
    track.addEventListener('unmute', update);
    track.addEventListener('ended', update);
  };

  stream.getVideoTracks().forEach(bindTrack);

  const onAddTrack = (ev: MediaStreamTrackEvent) => {
    bindTrack(ev.track);
    update();
  };
  const onRemoveTrack = () => update();

  stream.addEventListener('addtrack', onAddTrack);
  stream.addEventListener('removetrack', onRemoveTrack);
  update();

  return () => {
    stream.getVideoTracks().forEach((track) => {
      track.removeEventListener('mute', update);
      track.removeEventListener('unmute', update);
      track.removeEventListener('ended', update);
    });
    stream.removeEventListener('addtrack', onAddTrack);
    stream.removeEventListener('removetrack', onRemoveTrack);
  };
}

export function shouldStartWithCameraOn(callType: CallType): boolean {
  return callType === 'video';
}
