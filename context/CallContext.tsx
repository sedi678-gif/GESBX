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
import { listenFollowingIds, searchUsers } from '@/app/lib/socialService';
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
  inviteQuery: string;
  setInviteQuery: (v: string) => void;
  inviteResults: Awaited<ReturnType<typeof searchUsers>>;
  runInviteSearch: (myId: string) => Promise<void>;
  inviteUser: (userId: string, userName: string) => Promise<void>;
  clearCallError: () => void;
}

const CallContext = createContext<CallContextType | null>(null);

function getMyProfileMeta(): { name: string; avatar: string } {
  if (typeof window === 'undefined') return { name: '', avatar: DEFAULT_AVATAR };
  try {
    const raw = localStorage.getItem('app_current_user_v6');
    if (!raw) return { name: getLocalProfileDisplayName(), avatar: DEFAULT_AVATAR };
    const u = JSON.parse(raw);
    return {
      name: [u.name, u.surname].filter(Boolean).join(' ') || getLocalProfileDisplayName(),
      avatar: u.avatar || DEFAULT_AVATAR,
    };
  } catch {
    return { name: getLocalProfileDisplayName(), avatar: DEFAULT_AVATAR };
  }
}

export function CallProvider({ children }: { children: React.ReactNode }) {
  const { userId } = useUser();
  const myId = normalizeUserId(getAppUserId(userId));

  const [activeCall, setActiveCall] = useState<ActiveCallState | null>(null);
  const [callError, setCallError] = useState<string | null>(null);
  const [zegoReady, setZegoReady] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteQuery, setInviteQuery] = useState('');
  const [inviteResults, setInviteResults] = useState<Awaited<ReturnType<typeof searchUsers>>>([]);
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

      setCallUiState({
        mode: 'outgoing',
        callType: params.callType,
        peerName: params.calleeName,
        peerAvatar: params.calleeAvatar,
        cancel: () => {
          zegoHangUp();
        },
      });

      let ready = await ensureZegoConfig();
      if (!ready) {
        await new Promise((r) => setTimeout(r, 1200));
        ready = await ensureZegoConfig();
      }
      if (!ready) {
        setCallError(getZegoConfigErrorMessage());
        return;
      }

      void createCallSession({
        callId,
        chatId: params.chatId,
        callerId: myId,
        calleeId,
        callType: params.callType,
        callerName: myMeta.name,
        callerAvatar: myMeta.avatar,
      }).catch((err) => console.warn('[Call] Firebase session:', err));

      try {
        let zp = getZegoCallKitInstance();
        if (!zp) {
          zp = await initZegoCallKit(myId, myMeta.name, buildKitOptions());
        }
        if (!zp) {
          setCallError(getZegoLastInitError() || 'Zego Call Kit işə salına bilmədi.');
          return;
        }

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
        const msg = err instanceof Error ? err.message : 'Zəng göndərilmədi.';
        setCallError(msg);
      }
    },
    [myId, buildKitOptions]
  );

  const endCall = useCallback(async () => {
    zegoHangUp();
    setActiveCall(null);
    activeCallRef.current = null;
  }, []);

  const runInviteSearch = useCallback(
    async (searchMyId: string) => {
      const results = await searchUsers(inviteQuery, searchMyId);
      setInviteResults(results.filter((u) => u.id !== searchMyId));
    },
    [inviteQuery]
  );

  const inviteUser = useCallback(async (userId: string, userName: string) => {
    try {
      await inviteUserToActiveCall(userId, userName);
      const sessionId = activeCallRef.current?.callId || getActiveCallSessionId();
      if (sessionId) {
        await inviteParticipantToCall(sessionId, userId).catch(() => undefined);
      }
      setCallError(null);
      patchCallUiState({ hint: undefined });
      setShowInvite(false);
    } catch (err) {
      console.error(err);
      const msg = err instanceof Error ? err.message : 'Dəvət göndərilmədi.';
      setCallError(msg);
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
        inviteQuery,
        setInviteQuery,
        inviteResults,
        runInviteSearch,
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
                <input
                  value={inviteQuery}
                  onChange={(e) => setInviteQuery(e.target.value)}
                  placeholder="Ad, @nickname..."
                  style={{ width: '100%', margin: '8px 0 12px', padding: '10px 12px', borderRadius: 10, border: '1px solid #334155', background: '#0f172a', color: '#fff' }}
                />
                <button
                  type="button"
                  className={styles.primaryBtn}
                  onClick={() => {
                    if (myId) void runInviteSearch(myId);
                  }}
                >
                  Axtar
                </button>
                <div style={{ marginTop: 12, maxHeight: 240, overflow: 'auto' }}>
                  {inviteResults.map((u) => (
                    <button
                      key={u.id}
                      type="button"
                      className={styles.primaryBtn}
                      style={{ width: '100%', marginBottom: 8 }}
                      onClick={() => void inviteUser(u.id, u.name || u.handle || u.id)}
                    >
                      {u.name || u.handle || u.id}
                    </button>
                  ))}
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
