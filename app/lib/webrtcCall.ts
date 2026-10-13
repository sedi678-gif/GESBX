/**
 * WhatsApp tipli zəng — simple-peer + Socket.io siqnallaşdırması.
 * Axın: invite → ring → accept → WebRTC connect → aktiv
 */
import SimplePeer from 'simple-peer';
import { CallType } from './callService';
import { isActiveVideoTrack } from './callVideoUtils';

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

function mediaConstraints(callType: CallType): MediaStreamConstraints {
  const constraints: MediaStreamConstraints = {
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  };
  if (callType === 'video') {
    constraints.video = { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } };
  }
  return constraints;
}

export class WebRtcCallEngine {
  private peer: SimplePeer.Instance | null = null;
  private localStream: MediaStream | null = null;
  private micMuted = false;

  onLocalStream?: (stream: MediaStream) => void;
  onRemoteStream?: (stream: MediaStream) => void;
  onConnected?: () => void;
  onClosed?: () => void;
  onError?: (message: string) => void;
  onLocalVideoEnabled?: (enabled: boolean) => void;
  onRemoteVideoEnabled?: (enabled: boolean) => void;
  /** Hər signal paketi socket vasitəsilə göndərilir */
  onSignal?: (signal: SimplePeer.SignalData) => void;

  async acquireMedia(callType: CallType): Promise<MediaStream> {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('Bu cihaz zəngi dəstəkləmir');
    }
    const stream = await navigator.mediaDevices.getUserMedia(mediaConstraints(callType));
    const cameraOn = callType === 'video';
    stream.getVideoTracks().forEach((t) => {
      t.enabled = cameraOn;
    });
    this.localStream = stream;
    this.onLocalVideoEnabled?.(cameraOn);
    this.onLocalStream?.(stream);
    return stream;
  }

  startAsCaller(stream: MediaStream): void {
    this.startPeer(true, stream);
  }

  startAsCallee(stream: MediaStream): void {
    this.startPeer(false, stream);
  }

  private startPeer(initiator: boolean, stream: MediaStream): void {
    this.destroyPeer();
    this.localStream = stream;

    const peer = new SimplePeer({
      initiator,
      trickle: true,
      stream,
      config: { iceServers: ICE_SERVERS },
    });

    this.peer = peer;

    peer.on('signal', (data) => {
      this.onSignal?.(data);
    });

    peer.on('stream', (remoteStream) => {
      console.log('[WebRTC] remote stream alındı');
      this.onRemoteStream?.(remoteStream);
      this.onRemoteVideoEnabled?.(isActiveVideoTrack(remoteStream));
    });

    peer.on('connect', () => {
      console.log('[WebRTC] ✅ qoşuldu');
      this.onConnected?.();
    });

    peer.on('close', () => {
      console.log('[WebRTC] bağlandı');
      this.onClosed?.();
    });

    peer.on('error', (err) => {
      console.error('[WebRTC] xəta', err);
      this.onError?.(err.message || 'Bağlantı xətası');
    });
  }

  handleRemoteSignal(data: SimplePeer.SignalData): void {
    if (!this.peer) {
      console.warn('[WebRTC] signal gəldi, peer yoxdur');
      return;
    }
    try {
      this.peer.signal(data);
    } catch (err) {
      console.error('[WebRTC] signal xətası', err);
    }
  }

  setMicMuted(muted: boolean): void {
    this.micMuted = muted;
    this.localStream?.getAudioTracks().forEach((t) => {
      t.enabled = !muted;
    });
  }

  async setCameraEnabled(enabled: boolean): Promise<void> {
    const tracks = this.localStream?.getVideoTracks() ?? [];
    if (tracks.length === 0 && enabled) {
      throw new Error('Video zəngi deyil — kamera aktiv deyil');
    }
    tracks.forEach((t) => {
      t.enabled = enabled;
    });
    this.onLocalVideoEnabled?.(enabled);
    if (this.localStream) this.onLocalStream?.(this.localStream);
  }

  hangUp(): void {
    this.destroyPeer();
    this.stopMedia();
  }

  private destroyPeer(): void {
    if (this.peer) {
      try {
        this.peer.destroy();
      } catch {
        /* ignore */
      }
      this.peer = null;
    }
  }

  stopMedia(): void {
    this.localStream?.getTracks().forEach((t) => t.stop());
    this.localStream = null;
    this.micMuted = false;
  }

  destroy(): void {
    this.destroyPeer();
    this.stopMedia();
  }
}
