"use client";

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useUser } from '@/context/UserContext';
import { getAppUserId, getLocalProfileDisplayName } from '@/app/lib/userId';
import { sendCallLogMessage } from '@/app/lib/messageService';
import {
  createCallId,
  createCallSession,
  inviteParticipantToCall,
  normalizeUserId,
  CallType,
} from '@/app/lib/callService';
import { getCallSettings } from '@/app/lib/callSettings';
import { listenFollowingIds } from '@/app/lib/socialService';
import { getFollowerProfiles, getFollowingProfiles } from '@/app/lib/suggestedProfiles';
import type { AppUserProfile } from '@/app/lib/socialTypes';
import { ensureZegoConfig, getZegoConfigErrorMessage } from '@/app/lib/zegoConfig';
import { patchCallUiState, setCallInviteHandler, setCallUiState } from '@/app/lib/callUiBridge';
import {
  destroyZegoCallKit,
  getActiveCallSessionId,
  getZegoCallKitInstance,
  getZegoLastInitError,
  initZegoCallKit,
  inviteUserToActiveCall,
  sendZegoCallInvitation,
  zegoHangUp,
} from '@/app/lib/zegoCallKit';
import { toZegoUserId } from '@/app/lib/zegoUserId';
import styles from '@/app/components/social/social.module.css';
import CallUiHost from '@/app/components/messages/CallUiHost';

const DEFAULT_AVATAR =
  'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=100&q=80';

function describeCallError(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === 'object') {
    const value = error as Record<string, unknown>;
    const message = value.message || value.errorMessage || value.reason || value.error;
    const code = value.code || value.errorCode;
    if (message && code) return `${String(message)} (kod: ${String(code)})`;
    if (message) return String(message);
    if (code) return `ZEGO xəta kodu: ${String(code)}`;
    try {
      const details = JSON.stringify(error);
      if (details && details !== '{}') return `ZEGO cavabı: ${details.slice(0, 400)}`;
    } catch {
      // Use the safe fallback below.
    }
  }
  return 'Zəng xidməti cavab vermədi. İnternet bağlantısını yoxlayıb yenidən cəhd edin.';
}

interface ActiveCallState {
  callId: string;
  callType: CallType;
  peerId: string;
  peerName: string;
  chatId?: string;
}

interface StartCallParams {
  calleeId: string;
  calleeName: string;
  calleeAvatar: string;
  chatId: string;
  callType: CallType;
  joinCamera?: boolean;
}

interface CallContextType {
  activeCall: ActiveCallState | null;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  micMuted: boolean;
  speakerMuted: boolean;
  callParticipants: string[];
  callError: string | null;
  zegoReady: boolean;
  startCall: (params: StartCallParams) => Promise<void>;
  endCall: () => Promise<void>;
  toggleMic: () => void;
  toggleSpeaker: () => void;
  cameraOn: boolean;
  remoteVideoOn: boolean;
  toggleCamera: () => Promise<void>;
  showInvite: boolean;
  setShowInvite: (v: boolean) => void;
  inviteFollowers: AppUserProfile[];
  inviteFollowing: AppUserProfile[];
  inviteUser: (userId: string, userName: string) => Promise<void>;
  clearCallError: () => void;
}

const CallContext = createContext<CallContextType | null>(null);

function getMyProfileMeta(): { name: string; avatar: string } {
  if (typeof window === 'undefined') return { name: '', avatar: '' };
  try {
    const raw = localStorage.getItem('app_current_user_v6');
    if (!raw) return { name: getLocalProfileDisplayName(), avatar: '' };
    const u = JSON.parse(raw);
    const avatar = u.avatar || u.photoURL || u.photoUrl || u.userAvatar || u.avatarUrl || u.profileImage || u.profilePhoto || '';
    return {
      name: [u.name, u.surname].filter(Boolean).join(' ') || getLocalProfileDisplayName(),
      avatar: typeof avatar === 'string' && !avatar.includes('photo-1535713875002-d1d0cf377fde') ? avatar : '',
    };
  } catch {
    return { name: getLocalProfileDisplayName(), avatar: '' };
  }
}

export function CallProvider({ children }: { children: React.ReactNode }) {
  const { userId } = useUser();
  const myId = normalizeUserId(getAppUserId(userId));

  const [activeCall, setActiveCall] = useState<ActiveCallState | null>(null);
  const [callError, setCallError] = useState<string | null>(null);
  const [zegoReady, setZegoReady] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteFollowers, setInviteFollowers] = useState<AppUserProfile[]>([]);
  const [inviteFollowing, setInviteFollowing] = useState<AppUserProfile[]>([]);
  const [inviteError, setInviteError] = useState('');
  const [followingIds, setFollowingIds] = useState<string[]>([]);

  const activeCallRef = useRef<ActiveCallState | null>(null);
  const followingIdsRef = useRef<string[]>([]);
  const myIdRef = useRef(myId);

  useEffect(() => {
    activeCallRef.current = activeCall;
  }, [activeCall]);

  useEffect(() => {
    followingIdsRef.current = followingIds;
  }, [followingIds]);

  useEffect(() => {
    myIdRef.current = myId;
  }, [myId]);

  useEffect(() => {
    if (!myId) return;
    return listenFollowingIds(myId, setFollowingIds);
  }, [myId]);

  useEffect(() => {
    let alive = true;
    if (!myId || myId === 'guest' || myId === 'anonim_user_id') {
      setInviteFollowers([]);
      setInviteFollowing([]);
      return;
    }
    void Promise.all([getFollowerProfiles(myId, 60), getFollowingProfiles(myId, 60)])
      .then(([followers, following]) => {
        if (!alive) return;
        setInviteFollowers(followers.filter((profile) => profile.id !== myId));
        setInviteFollowing(following.filter((profile) => profile.id !== myId));
      })
      .catch((error) => {
        console.warn('[Call] invite contacts unavailable:', error);
        if (alive) setInviteError('İzləyici siyahısı yüklənmədi. İnternet bağlantısını yoxla.');
      });
    return () => { alive = false; };
  }, [myId]);

  const canReceiveFrom = useCallback((callerId: string, callType: CallType) => {
    const settings = getCallSettings();
    if (settings.allowCallsFrom === 'nobody') return false;
    if (
      settings.allowCallsFrom === 'following' &&
      !followingIdsRef.current.includes(normalizeUserId(callerId))
    ) {
      return false;
    }
    if (callType === 'video' && !settings.videoCallsEnabled) return false;
    return true;
  }, []);

  const buildKitOptions = useCallback(
    () => ({
      canReceiveFrom,
      onCallInvitationEnded: () => {
        const call = activeCallRef.current;
        const id = myIdRef.current;
        if (call && id) {
          void sendCallLogMessage({
            senderId: id,
            recipientId: call.peerId,
            callType: call.callType,
            callStatus: 'bitdi',
            senderName: getMyProfileMeta().name,
            recipientName: call.peerName,
          });
        }
        setActiveCall(null);
        activeCallRef.current = null;
      },
    }),
    [canReceiveFrom]
  );

  useEffect(() => {
    if (!myId || myId === 'guest' || myId === 'anonim_user_id') {
      setZegoReady(false);
      destroyZegoCallKit();
      return;
    }

    let cancelled = false;
    const meta = getMyProfileMeta();

    void (async () => {
      const ready = await ensureZegoConfig();
      if (!ready || cancelled) {
        if (!cancelled) setZegoReady(false);
        return;
      }
      const zp = await initZegoCallKit(myId, meta.name, buildKitOptions());
      if (!cancelled) setZegoReady(Boolean(zp));
    })();

    return () => {
      cancelled = true;
    };
  }, [myId, buildKitOptions]);

  useEffect(() => {
    return () => {
      destroyZegoCallKit();
    };
  }, []);

  useEffect(() => {
    setCallInviteHandler(() => setShowInvite(true));
    return () => setCallInviteHandler(null);
  }, []);

  const clearCallError = useCallback(() => setCallError(null), []);

  const startCall = useCallback(
    async (params: StartCallParams) => {
      if (!myId) {
        setCallError('Zəng etmək üçün profil qeydiyyatından keçin (/profile).');
        return;
      }

      const calleeId = normalizeUserId(params.calleeId);
      const calleeZegoId = toZegoUserId(calleeId);
      if (!calleeId || calleeId === myId || !calleeZegoId || calleeZegoId === 'user_unknown') {
        setCallError('Zəng ediləcək istifadəçi tapılmadı.');
        return;
      }

      const settings = getCallSettings();
      if (params.callType === 'video' && !settings.videoCallsEnabled) {
        setCallError('Video zəng parametrlərdə söndürülüb.');
        return;
      }

      const myMeta = getMyProfileMeta();
      const callId = createCallId(myId, calleeId);

      setCallError(null);
      const nextCall: ActiveCallState = {
        callId,
        callType: params.callType,
        peerId: calleeId,
        peerName: params.calleeName,
        chatId: params.chatId,
      };
      activeCallRef.current = nextCall;
      setActiveCall(nextCall);

      const clearFailedCall = () => {
        activeCallRef.current = null;
        setActiveCall(null);
        setCallUiState(null);
      };

      setCallUiState({
        mode: 'outgoing',
        callType: params.callType,
        peerName: params.calleeName,
        peerAvatar: params.calleeAvatar,
        cancel: () => {
          zegoHangUp();
        },
      });

      try {
        let ready = await ensureZegoConfig();
        if (!ready) {
          await new Promise((r) => setTimeout(r, 1200));
          ready = await ensureZegoConfig();
        }
        if (!ready) {
          clearFailedCall();
          setCallError(getZegoConfigErrorMessage());
          return;
        }

        // Start session creation while ZEGO initializes, but wait for it before
        // sending the invitation so the recipient never watches a missing session.
        const sessionPromise = createCallSession({
          callId,
          chatId: params.chatId,
          callerId: myId,
          calleeId,
          callType: params.callType,
          callerName: myMeta.name,
          callerAvatar: myMeta.avatar,
        });

        let zp = getZegoCallKitInstance();
        if (!zp) {
          zp = await initZegoCallKit(myId, myMeta.name, buildKitOptions());
        }
        if (!zp) {
          await sessionPromise.catch((err) => console.warn('[Call] Firebase session:', err));
          clearFailedCall();
          setCallError(getZegoLastInitError() || 'Zego Call Kit işə salına bilmədi.');
          return;
        }

        await sessionPromise.catch((err) => console.warn('[Call] Firebase session unavailable; continuing with ZEGO invitation:', err));
        await sendZegoCallInvitation(zp, {
          calleeId,
          calleeName: params.calleeName,
          calleeAvatar: params.calleeAvatar,
          callType: params.callType,
          joinCamera: params.joinCamera,
          roomId: callId,
          callerAvatar: myMeta.avatar,
        });
      } catch (err) {
        console.error('[Zego] sendCallInvitation failed:', err);
        clearFailedCall();
        setCallError(describeCallError(err));
      }
    },
    [myId, buildKitOptions]
  );

  const endCall = useCallback(async () => {
    zegoHangUp();
    setActiveCall(null);
    activeCallRef.current = null;
  }, []);

  const inviteUser = useCallback(async (userId: string, userName: string) => {
    try {
      await inviteUserToActiveCall(userId, userName);
      const sessionId = activeCallRef.current?.callId || getActiveCallSessionId();
      if (sessionId) {
        void inviteParticipantToCall(sessionId, userId).catch((error) => {
          console.warn('[Call] dəvət olunan iştirakçı sessiyaya yazılmadı:', error);
        });
      }
      setCallError(null);
      patchCallUiState({ hint: 'Dəvət göndərildi.' });
      setShowInvite(false);
    } catch (err) {
      console.error('[Call] participant invitation failed:', err);
      const msg = err instanceof Error ? err.message : 'Dəvət göndərilmədi.';
      setInviteError(msg);
      patchCallUiState({ hint: msg });
    }
  }, []);

  return (
    <CallContext.Provider
      value={{
        activeCall,
        localStream: null,
        remoteStream: null,
        micMuted: false,
        speakerMuted: false,
        cameraOn: false,
        remoteVideoOn: false,
        callParticipants: activeCall ? [myId, activeCall.peerId] : [],
        callError,
        zegoReady,
        startCall,
        endCall,
        toggleMic: () => undefined,
        toggleSpeaker: () => undefined,
        toggleCamera: async () => undefined,
        showInvite,
        setShowInvite,
        inviteFollowers,
        inviteFollowing,
        inviteUser,
        clearCallError,
      }}
    >
      {children}
      <CallUiHost />
      {showInvite && typeof document !== 'undefined'
        ? createPortal(
            <div className={styles.modalOverlay} style={{ zIndex: 2147483647 }} onClick={() => setShowInvite(false)}>
              <div className={styles.modalSheet} onClick={(e) => e.stopPropagation()}>
                <h2 className={styles.modalTitle}>Zəngə əlavə et</h2>
                <div style={{ marginTop: 12, maxHeight: 340, overflowY: 'auto' }}>
                  {inviteError ? <p role="status" style={{ color: '#fca5a5', fontSize: 13, marginBottom: 8 }}>{inviteError}</p> : null}
                  <h3 style={{ color: '#e2e8f0', fontSize: 14, fontWeight: 700, margin: '8px 0' }}>Səni izləyənlər</h3>
                  {inviteFollowers.length ? inviteFollowers.map((u) => (
                    <div key={'follower-' + u.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 2px', borderBottom: '1px solid rgba(148,163,184,.16)' }}>
                      <img src={u.avatar || DEFAULT_AVATAR} alt="" style={{ width: 38, height: 38, borderRadius: '50%', objectFit: 'cover' }} />
                      <div style={{ minWidth: 0, flex: 1, color: '#fff', textAlign: 'left' }}>
                        <strong style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{[u.name, u.surname].filter(Boolean).join(' ') || u.handle || 'İstifadəçi'}</strong>
                        <small style={{ color: '#94a3b8' }}>{u.handle ? '@' + u.handle : 'Səni izləyir'}</small>
                      </div>
                      <button type="button" className={styles.primaryBtn} style={{ flexShrink: 0 }} onClick={() => void inviteUser(u.id, [u.name, u.surname].filter(Boolean).join(' ') || u.handle || u.id)}>Qoş</button>
                    </div>
                  )) : <p style={{ color: '#94a3b8', fontSize: 13 }}>Hələ səni izləyən yoxdur.</p>}
                  <h3 style={{ color: '#e2e8f0', fontSize: 14, fontWeight: 700, margin: '16px 0 8px' }}>Sənin izlədiklərin</h3>
                  {inviteFollowing.length ? inviteFollowing.map((u) => (
                    <div key={'following-' + u.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 2px', borderBottom: '1px solid rgba(148,163,184,.16)' }}>
                      <img src={u.avatar || DEFAULT_AVATAR} alt="" style={{ width: 38, height: 38, borderRadius: '50%', objectFit: 'cover' }} />
                      <div style={{ minWidth: 0, flex: 1, color: '#fff', textAlign: 'left' }}>
                        <strong style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{[u.name, u.surname].filter(Boolean).join(' ') || u.handle || 'İstifadəçi'}</strong>
                        <small style={{ color: '#94a3b8' }}>{u.handle ? '@' + u.handle : 'Sənin izlədiyin'}</small>
                      </div>
                      <button type="button" className={styles.primaryBtn} style={{ flexShrink: 0 }} onClick={() => void inviteUser(u.id, [u.name, u.surname].filter(Boolean).join(' ') || u.handle || u.id)}>Qoş</button>
                    </div>
                  )) : <p style={{ color: '#94a3b8', fontSize: 13 }}>Sənin izlədiyin profil yoxdur.</p>}
                </div>
                <button type="button" className={styles.primaryBtn} onClick={() => setShowInvite(false)}>
                  Bağla
                </button>
              </div>
            </div>,
            document.body
          )
        : null}

      {callError && typeof document !== 'undefined'
        ? createPortal(
            <div className={styles.modalOverlay} style={{ zIndex: 2147483647 }} onClick={clearCallError}>
              <div className={styles.modalSheet} onClick={(e) => e.stopPropagation()}>
                <h2 className={styles.modalTitle}>Zəng xətası</h2>
                <p style={{ marginBottom: 16 }}>{callError}</p>
                <button type="button" className={styles.primaryBtn} onClick={clearCallError}>
                  Bağla
                </button>
              </div>
            </div>,
            document.body
          )
        : null}
    </CallContext.Provider>
  );
}

export function useCall() {
  const ctx = useContext(CallContext);
  if (!ctx) throw new Error('useCall must be used within CallProvider');
  return ctx;
}
