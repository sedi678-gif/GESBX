/**
 * PeerJS pulsuz cloud server — Vercel üçün (xüsusi host/port yoxdur).
 * peer.call(peerId, stream) / peer.on('call')
 */
import Peer, { MediaConnection } from 'peerjs';
import { CallType } from './callService';
import { isActiveVideoTrack } from './callVideoUtils';

export type PeerCallStatus = 'connecting' | 'active' | 'ended';

export interface IncomingPeerCall {
  fromPeerId: string;
  connection: MediaConnection;
  callType: CallType;
}

function mediaConstraints(callType: CallType): MediaStreamConstraints {
  const constraints: MediaStreamConstraints = {
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  };
  if (callType === 'video') {
    constraints.video = { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } };
  }
  return constraints;
}

export class PeerCallManager {
  private peer: Peer | null = null;
  private userId: string | null = null;
  private localStream: MediaStream | null = null;
  private activeConnection: MediaConnection | null = null;
  private pendingIncoming: MediaConnection | null = null;
  private micMuted = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  onLocalStream?: (stream: MediaStream) => void;
  onRemoteStream?: (stream: MediaStream) => void;
  onIncomingCall?: (payload: IncomingPeerCall) => void;
  onStatus?: (status: PeerCallStatus) => void;
  onError?: (message: string) => void;
  onEnded?: () => void;
  onLocalVideoEnabled?: (enabled: boolean) => void;
  onRemoteVideoEnabled?: (enabled: boolean) => void;
  onPeerOpen?: (peerId: string) => void;
  onPeerConnectionChange?: (connected: boolean) => void;

  get isOpen(): boolean {
    return Boolean(this.peer?.open);
  }

  get hasPendingIncoming(): boolean {
    return Boolean(this.pendingIncoming);
  }

  /** Pulsuz PeerJS cloud — new Peer(id) */
  async init(userId: string): Promise<void> {
    const uid = String(userId).trim();
    if (!uid) throw new Error('Peer ID tapılmadı');

    if (this.peer && this.userId === uid && !this.peer.destroyed && this.peer.open) {
      return;
    }

    this.destroyPeerOnly();
    this.userId = uid;

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const finish = (fn: () => void) => {
        if (settled) return;
        settled = true;
        fn();
      };

      const peer = new Peer(uid);
      this.peer = peer;

      peer.on('open', (id) => {
        console.log('[PeerJS] ✅ cloud open', id);
        this.onPeerOpen?.(id);
        this.onPeerConnectionChange?.(true);
        finish(() => resolve());
      });

      peer.on('error', (err) => {
        console.error('[PeerJS] error', err.type, err.message);
        this.onPeerConnectionChange?.(false);

        if (err.type === 'unavailable-id') {
          finish(() => reject(new Error('Bu profil ID başqa cihazda aktivdir.')));
          return;
        }

        if (!peer.open) {
          this.scheduleReconnect();
          finish(() => reject(new Error(err.message || 'PeerJS cloud xətası')));
        } else {
          this.onError?.(err.message || 'PeerJS xətası');
        }
      });

      peer.on('disconnected', () => {
        console.warn('[PeerJS] disconnected — auto-reconnect');
        this.onPeerConnectionChange?.(false);
        this.scheduleReconnect();
      });

      peer.on('close', () => {
        console.log('[PeerJS] closed');
        this.onPeerConnectionChange?.(false);
      });

      peer.on('call', (connection) => {
        const meta = connection.metadata as { callType?: CallType } | undefined;
        const callType: CallType = meta?.callType === 'video' ? 'video' : 'voice';
        console.log('[PeerJS] ◀ incoming', connection.peer, callType);
        this.pendingIncoming = connection;
        this.onIncomingCall?.({ fromPeerId: connection.peer, connection, callType });
      });

      setTimeout(() => {
        finish(() => reject(new Error('PeerJS cloud-a qoşulmaq mümkün olmadı.')));
      }, 20000);
    });
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer || !this.peer || this.peer.destroyed) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      try {
        if (this.peer && !this.peer.destroyed && !this.peer.open) {
          console.log('[PeerJS] reconnect()');
          this.peer.reconnect();
        }
      } catch (err) {
        console.warn('[PeerJS] reconnect failed', err);
      }
    }, 2000);
  }

  private async acquireMedia(callType: CallType): Promise<MediaStream> {
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

  async placeCall(remotePeerId: string, callType: CallType): Promise<void> {
    if (!this.peer?.open) {
      await this.init(this.userId || remotePeerId);
    }
    if (!this.peer?.open) throw new Error('PeerJS hazır deyil');

    const stream = await this.acquireMedia(callType);
    console.log('[PeerJS] ▶ peer.call', remotePeerId);

    const connection = this.peer.call(remotePeerId, stream, { metadata: { callType } });
    if (!connection) throw new Error('peer.call uğursuz oldu');

    this.activeConnection = connection;
    this.wireConnection(connection);
    this.onStatus?.('connecting');
  }

  async answerPending(callType: CallType): Promise<void> {
    const connection = this.pendingIncoming;
    if (!connection) throw new Error('Gözləyən zəng yoxdur');

    const stream = await this.acquireMedia(callType);
    connection.answer(stream);
    this.activeConnection = connection;
    this.pendingIncoming = null;
    this.wireConnection(connection);
    this.onStatus?.('connecting');
  }

  rejectPending(): void {
    this.pendingIncoming?.close();
    this.pendingIncoming = null;
  }

  private wireConnection(connection: MediaConnection): void {
    connection.on('stream', (remoteStream) => {
      this.onRemoteStream?.(remoteStream);
      this.onRemoteVideoEnabled?.(isActiveVideoTrack(remoteStream));
      this.onStatus?.('active');
    });
    connection.on('close', () => this.onEnded?.());
    connection.on('error', (err) => this.onError?.(err.message || 'Zəng kəsildi'));
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
      throw new Error('Video zəngi deyil');
    }
    tracks.forEach((t) => {
      t.enabled = enabled;
    });
    this.onLocalVideoEnabled?.(enabled);
    if (this.localStream) this.onLocalStream?.(this.localStream);
  }

  endCall(): void {
    this.activeConnection?.close();
    this.cleanupMedia();
    this.activeConnection = null;
  }

  cleanupMedia(): void {
    this.localStream?.getTracks().forEach((t) => t.stop());
    this.localStream = null;
    this.micMuted = false;
  }

  destroyPeerOnly(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.activeConnection?.close();
    this.pendingIncoming?.close();
    this.cleanupMedia();
    this.activeConnection = null;
    this.pendingIncoming = null;
    if (this.peer && !this.peer.destroyed) this.peer.destroy();
    this.peer = null;
  }

  destroy(): void {
    this.destroyPeerOnly();
    this.userId = null;
  }
}
