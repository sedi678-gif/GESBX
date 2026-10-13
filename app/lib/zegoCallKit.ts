'use client';

import { unlockCallAudio } from '@/app/lib/audioUnlock';
import { primeCallMedia, releaseMediaStream } from '@/app/lib/mediaPermissions';
import {
  ensureZegoConfig,
  getZegoAppId,
  getZegoServerSecret,
} from '@/app/lib/zegoConfig';
import {
  requestCallNotificationPermission,
  showIncomingCallNotification,
} from '@/app/lib/callNotifications';
import { toZegoRoomId, toZegoUserId, toZegoUserName } from '@/app/lib/zegoUserId';
import type { CallType } from '@/app/lib/callService';
import { listenCallSession, updateCallSession } from '@/app/lib/callService';
import {
  releaseCallMedia,
  releaseMicForZego,
  startMediaHarvest,
  muteLocalAudio,
  muteLocalVideo,
} from '@/app/lib/callMediaBridge';
import { stopRingtone } from '@/app/lib/callRingtone';
import { getCallUiState, patchCallUiState, setCallUiState } from '@/app/lib/callUiBridge';

type ZegoUIKitModule = typeof import('@zegocloud/zego-uikit-prebuilt');
type ZegoInstance = ReturnType<ZegoUIKitModule['ZegoUIKitPrebuilt']['create']>;

export interface ZegoCallKitOptions {
  canReceiveFrom?: (callerId: string, callType: CallType) => boolean;
  onCallInvitationEnded?: (reason: string) => void;
  onOutgoingAccepted?: (calleeId: string) => void;
}

const optionsRef: { current: ZegoCallKitOptions } = { current: {} };

let zpInstance: ZegoInstance | null = null;
let mediaZp: ZegoInstance | null = null;
let mediaRoomId: string | null = null;
let activeUserId: string | null = null;
let activeUserName: string | null = null;
let initPromise: Promise<ZegoInstance | null> | null = null;
let lastInitError: string | null = null;
let tableVoiceActive = false;
let joinWithCamera = false;
let zimBound = false;
let zimRef: ZimLike | null = null;
let pendingZimCallId = '';
let pendingCalleeZegoId = '';
let pendingRoomId = '';
let pendingSessionId = '';
let pendingCallType: CallType = 'voice';
let sessionUnsub: (() => void) | null = null;
let hangupInFlight = false;
let remoteZimUsers = new Set<string>();
let remoteRoomPeers = 0;

const TEST_TOKEN_TTL_SEC = 24 * 60 * 60;

type ZimUser = { userID: string; userName?: string };
type ZimLike = {
  callInvite: (
    invitees: string[],
    config: { timeout: number; extendedData: string; mode?: number }
  ) => Promise<{ callID: string; errorUserList?: ZimUser[]; errorInvitees?: ZimUser[] }>;
  callCancel: (callID: string, invitees: string[], config: { extendedData: string }) => Promise<unknown>;
  callAccept: (callID: string, config: { extendedData: string }) => Promise<unknown>;
  callReject: (callID: string, config: { extendedData: string }) => Promise<unknown>;
  callEnd?: (callID: string, config?: { extendedData: string }) => Promise<unknown>;
  callQuit?: (callID: string, config?: { extendedData: string }) => Promise<unknown>;
  callingInvite?: (
    invitees: string[],
    callID: string | { callID?: string; extendedData?: string; timeout?: number },
    config?: { extendedData: string }
  ) => Promise<{ errorUserList?: ZimUser[] }>;
  on: (event: string, cb: (zim: unknown, info: Record<string, unknown>) => void) => void;
};

type InvitePayload = {
  roomId: string;
  sessionId?: string;
  callType: CallType;
  peerName?: string;
  peerAvatar?: string;
};

function generateTestKitToken(
  ZegoUIKitPrebuilt: ZegoUIKitModule['ZegoUIKitPrebuilt'],
  roomID: string,
  userID: string,
  userName: string
): string {
  const appID = Number(getZegoAppId());
  const serverSecret = String(getZegoServerSecret() ?? '').trim();
  const rid = String(roomID ?? '');
  const uid = String(userID ?? '');
  if (!Number.isFinite(appID) || appID <= 0) {
    throw new Error('Zego appID etibarsızdır.');
  }
  if (!serverSecret) {
    throw new Error('Zego serverSecret yüklənməyib.');
  }
  if (!rid) {
    throw new Error('Zego roomID boşdur.');
  }
  if (!uid) {
    throw new Error('Zego userID boşdur.');
  }
  return ZegoUIKitPrebuilt.generateKitTokenForTest(
    appID,
    serverSecret,
    rid,
    uid,
    String(userName || uid),
    TEST_TOKEN_TTL_SEC
  );
}

function destroyPrebuilt(instance: ZegoInstance | null): void {
  if (!instance) return;
  try {
    instance.destroy();
  } catch {
    /* ignore */
  }
}

function parseInvitePayload(raw: unknown): InvitePayload | null {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  try {
    const data = JSON.parse(raw) as InvitePayload;
    if (!data?.roomId) return null;
    return {
      roomId: String(data.roomId),
      sessionId: data.sessionId ? String(data.sessionId) : undefined,
      callType: data.callType === 'video' ? 'video' : 'voice',
      peerName: data.peerName,
      peerAvatar: data.peerAvatar,
    };
  } catch {
    return null;
  }
}

/** Next.js 16 body-ni React root kimi istifadə edir — Zego-nu html altına, body-dən kənar qoy. */
function getOrCreateZegoStage(): HTMLElement {
  let el = document.getElementById('zego-call-stage');
  if (!el) {
    el = document.createElement('div');
    el.id = 'zego-call-stage';
    el.setAttribute('aria-hidden', 'true');
  }
  if (el.parentElement !== document.documentElement) {
    document.documentElement.appendChild(el);
  }
  applyLiveStageStyle(el);
  return el;
}

function applyLiveStageStyle(el: HTMLElement): void {
  el.style.cssText =
    'position:fixed;inset:0;width:100vw;height:100dvh;opacity:0;overflow:visible;pointer-events:none;z-index:2;display:block;';
}

function patchJoinRoom(zp: ZegoInstance): void {
  const kit = zp as ZegoInstance & { __yolustuJoinPatched?: boolean };
  if (kit.__yolustuJoinPatched) return;
  kit.__yolustuJoinPatched = true;
  const original = zp.joinRoom.bind(zp);
  zp.joinRoom = ((config: Record<string, unknown> = {}) => {
    const stage = getOrCreateZegoStage();
    const given = config.container;
    const container =
      given instanceof HTMLElement && given !== document.body && given !== document.documentElement
        ? given
        : stage;
    if (container.parentElement === document.body) {
      stage.appendChild(container);
    }
    return original({
      ...config,
      container,
      showPreJoinView: false,
      showLeavingView: false,
      sharedLinks: [],
    });
  }) as typeof zp.joinRoom;
}

let zegoDomGuarded = false;
let zegoImportGuard = false;

function installZegoBodyGuard(): void {
  if (zegoDomGuarded || typeof document === 'undefined' || !document.body) return;
  zegoDomGuarded = true;
  const body = document.body;
  const insertBefore = body.insertBefore.bind(body);
  const appendChild = body.appendChild.bind(body);

  body.insertBefore = function (node, child) {
    if (
      zegoImportGuard &&
      node instanceof HTMLElement &&
      node.tagName === 'DIV' &&
      !node.id &&
      (child === body.firstChild || child === body.firstElementChild)
    ) {
      node.id = 'zego-invite-host';
      return getOrCreateZegoStage().appendChild(node);
    }
    return insertBefore(node, child);
  } as typeof body.insertBefore;

  body.appendChild = function (node) {
    if (node instanceof HTMLElement && node.id === 'zego-container') {
      return getOrCreateZegoStage().appendChild(node);
    }
    return appendChild(node);
  } as typeof body.appendChild;
}

async function patchSharedReactRoot(): Promise<void> {
  try {
    const rd = await import('react-dom/client');
    const patched = rd as typeof rd & { __yolustuCreateRootPatched?: boolean };
    if (patched.__yolustuCreateRootPatched) return;
    patched.__yolustuCreateRootPatched = true;
    const original = rd.createRoot.bind(rd);
    rd.createRoot = ((container: Element | DocumentFragment, options?: Parameters<typeof rd.createRoot>[1]) => {
      let host = container;
      if (host === document.body || host === document.documentElement) {
        host = getOrCreateZegoStage();
      }
      return original(host as Element, options);
    }) as typeof rd.createRoot;
  } catch {
    /* Zego öz React-ını bundle edirsə bu patch toxunmur — ona görə invitation UI-ni çağırmırıq */
  }
}

let uikitPromise: Promise<ZegoUIKitModule> | null = null;

function loadZegoUIKit(): Promise<ZegoUIKitModule> {
  if (!uikitPromise) {
    uikitPromise = (async () => {
      installZegoBodyGuard();
      await patchSharedReactRoot();
      zegoImportGuard = true;
      try {
        return await import('@zegocloud/zego-uikit-prebuilt');
      } finally {
        zegoImportGuard = false;
      }
    })();
  }
  return uikitPromise;
}

export function hideZegoStage(): void {
  const el = document.getElementById('zego-call-stage');
  if (!el) return;
  el.style.cssText =
    'position:fixed;left:0;bottom:0;width:12px;height:12px;opacity:0.02;overflow:hidden;pointer-events:none;z-index:1;display:block;';
}

export function setJoinWithCamera(on: boolean): void {
  joinWithCamera = on;
}

function isZimLike(value: unknown): value is ZimLike {
  return Boolean(value && typeof (value as ZimLike).callInvite === 'function');
}

function pickZimFromKit(zp: unknown): ZimLike | null {
  if (!zp || typeof zp !== 'object') return null;
  const bag = zp as Record<string, unknown>;
  const nested = bag.express as Record<string, unknown> | undefined;
  const candidates = [bag.zim, bag._zim, nested?.zim, nested?._zim];
  for (const candidate of candidates) {
    if (isZimLike(candidate)) return candidate;
  }
  return null;
}

function getZim(): ZimLike | null {
  if (zimRef) return zimRef;
  const fromKit = pickZimFromKit(zpInstance);
  if (fromKit) {
    zimRef = fromKit;
    return fromKit;
  }
  try {
    const g = globalThis as unknown as { ZIM?: { getInstance?: () => ZimLike } };
    const zim = g.ZIM?.getInstance?.();
    if (isZimLike(zim)) {
      zimRef = zim;
      return zim;
    }
  } catch {
    /* ignore */
  }
  return null;
}

async function waitForZim(zp: ZegoInstance, ms = 5000): Promise<ZimLike | null> {
  const started = Date.now();
  while (Date.now() - started < ms) {
    const zim = pickZimFromKit(zp) || getZim();
    if (zim) {
      zimRef = zim;
      bindZimListeners(zim);
      return zim;
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  return getZim();
}

function unwatchSession() {
  sessionUnsub?.();
  sessionUnsub = null;
}

function watchSession(sessionId: string) {
  unwatchSession();
  if (!sessionId) return;
  pendingSessionId = sessionId;
  sessionUnsub = listenCallSession(sessionId, (session) => {
    if (!session) return;
    if (session.status === 'ended' || session.status === 'rejected' || session.status === 'missed') {
      stopCallUi('session_' + session.status);
    }
  });
}

function markSessionEnded() {
  const id = pendingSessionId;
  if (!id) return;
  void updateCallSession(id, { status: 'ended', endedAt: Date.now() }).catch(() => undefined);
}

function stopCallUi(reason: string) {
  if (hangupInFlight) return;
  hangupInFlight = true;
  markSessionEnded();
  pendingZimCallId = '';
  pendingCalleeZegoId = '';
  pendingRoomId = '';
  pendingSessionId = '';
  remoteZimUsers = new Set();
  remoteRoomPeers = 0;
  unwatchSession();
  leaveMediaRoom(true, true);
  setCallUiState(null);
  optionsRef.current.onCallInvitationEnded?.(reason);
  hangupInFlight = false;
}

function bindZimListeners(zim: ZimLike) {
  if (zimBound) return;
  zimBound = true;

  zim.on('callInvitationReceived', (_z, info) => {
    const inviter = (info.inviter || {}) as ZimUser;
    const callID = String(info.callID || '');
    const payload = parseInvitePayload(info.extendedData);
    const callType = payload?.callType || 'voice';
    if (optionsRef.current.canReceiveFrom && !optionsRef.current.canReceiveFrom(inviter.userID, callType)) {
      void zim.callReject(callID, { extendedData: '' });
      return;
    }
    pendingZimCallId = callID;
    pendingRoomId = payload?.roomId || toZegoRoomId(callID, 'c_');
    pendingSessionId = payload?.sessionId || '';
    pendingCallType = callType;
    if (pendingSessionId) watchSession(pendingSessionId);
    showIncomingCallNotification(inviter.userName || inviter.userID, callType);
    setCallUiState({
      mode: 'incoming',
      callType,
      peerName: payload?.peerName || inviter.userName || inviter.userID || 'İstifadəçi',
      peerAvatar: payload?.peerAvatar,
      accept: () => {
        void zim
          .callAccept(callID, { extendedData: '' })
          .then(() => joinMediaRoom(pendingRoomId, pendingCallType))
          .catch((err) => {
            console.error('[ZIM] callAccept', err);
            stopCallUi('accept_failed');
          });
      },
      refuse: () => {
        void zim.callReject(callID, { extendedData: '' });
        stopCallUi('refused');
      },
    });
  });

  zim.on('callUserStateChanged', (_z, info) => {
    const list = (info.callUserList || []) as { userID?: string; state?: number }[];
    const uiMode = getCallUiState()?.mode;
    const inLive = uiMode === 'active' || uiMode === 'connecting';
    for (const user of list) {
      if (!user?.userID || user.userID === activeUserId) continue;
      if (user.state === 1) {
        remoteZimUsers.add(user.userID);
        const prev = getCallUiState();
        if (prev && prev.mode !== 'active') setCallUiState({ ...prev, mode: 'connecting' });
        optionsRef.current.onOutgoingAccepted?.(user.userID);
        if (pendingRoomId) void joinMediaRoom(pendingRoomId, pendingCallType);
      }
      if (user.state === 2 || user.state === 4 || user.state === 6) {
        remoteZimUsers.delete(user.userID);
        if (!inLive) stopCallUi(`user_${user.state}`);
      }
      if (user.state === 3 || user.state === 7 || user.state === 8) {
        remoteZimUsers.delete(user.userID);
        if (inLive && remoteZimUsers.size === 0 && remoteRoomPeers <= 1) {
          stopCallUi('peer_quit');
        }
      }
    }
  });

  zim.on('callInvitationCancelled', () => stopCallUi('cancelled'));
  zim.on('callInvitationTimeout', () => stopCallUi('timeout'));
  zim.on('callInvitationEnded', () => stopCallUi('ended'));
}

function mediaRoomConfig(
  ZegoUIKitPrebuilt: ZegoUIKitModule['ZegoUIKitPrebuilt'],
  callType: CallType
) {
  return {
    container: getOrCreateZegoStage(),
    maxUsers: 9,
    scenario: {
      mode: ZegoUIKitPrebuilt.GroupCall,
      config: { role: ZegoUIKitPrebuilt.Host },
    },
    turnOnMicrophoneWhenJoining: true,
    turnOnCameraWhenJoining: callType === 'video' && joinWithCamera,
    showMyCameraToggleButton: false,
    showMyMicrophoneToggleButton: false,
    showAudioVideoSettingsButton: false,
    showLeaveRoomButton: false,
    showMoreButton: false,
    showTextChat: false,
    showUserList: false,
    showScreenSharingButton: false,
    showLayoutButton: false,
    showPinButton: false,
    showPreJoinView: false,
    showLeavingView: false,
    showRoomTimer: false,
    sharedLinks: [],
    onJoinRoom: () => {
      unmuteKit(mediaZp);
      void unlockCallAudio();
    },
  };
}

async function joinMediaRoom(roomId: string, callType: CallType): Promise<void> {
  const rid = String(roomId || '');
  const uid = String(activeUserId || '');
  if (!rid || !uid) return;
  if (mediaZp && mediaRoomId === rid) {
    unmuteKit(mediaZp);
    return;
  }

  stopRingtone();
  leaveMediaRoom(false, false);
  releaseMicForZego();
  void unlockCallAudio();
  await new Promise((r) => setTimeout(r, 120));

  /* Eyni user iki Express-ə login ola bilməz — siqnal instance-ı bağla, ZIM qalsın. */
  if (zpInstance) {
    destroyPrebuilt(zpInstance);
    zpInstance = null;
  }

  const { ZegoUIKitPrebuilt } = await loadZegoUIKit();
  const kitToken = generateTestKitToken(
    ZegoUIKitPrebuilt,
    rid,
    uid,
    String(activeUserName || uid)
  );
  const zp = ZegoUIKitPrebuilt.create(kitToken);
  patchJoinRoom(zp);
  applyLiveStageStyle(getOrCreateZegoStage());
  mediaZp = zp;
  zpInstance = zp;
  mediaRoomId = rid;
  zp.joinRoom(mediaRoomConfig(ZegoUIKitPrebuilt, callType));
  unmuteKit(zp);
  startMediaHarvest(pickExpress(zp));
  remoteRoomPeers = 0;

  void (async () => {
    for (let i = 0; i < 20; i += 1) {
      unmuteKit(zp);
      const express = pickExpress(zp);
      if (express) {
        startMediaHarvest(express);
        express.on?.('roomUserUpdate', (...args: unknown[]) => {
          const updateType = args[1];
          const users = (Array.isArray(args[2]) ? args[2] : []) as { userID?: string }[];
          const n = users.filter((u) => u.userID && u.userID !== activeUserId).length;
          const left = updateType === 1 || String(updateType).toUpperCase() === 'DELETE';
          const added = updateType === 0 || String(updateType).toUpperCase() === 'ADD';
          if (added) remoteRoomPeers += n;
          if (left) remoteRoomPeers = Math.max(0, remoteRoomPeers - n);
          if (
            left &&
            remoteRoomPeers === 0 &&
            getCallUiState()?.mode === 'active' &&
            !hangupInFlight
          ) {
            stopCallUi('peer_left');
          }
        });
        break;
      }
      await new Promise((r) => setTimeout(r, 200));
    }
  })();

  if (pendingSessionId) watchSession(pendingSessionId);

  const prev = getCallUiState();
  setCallUiState({
    mode: 'active',
    callType,
    peerName: prev?.peerName || 'İstifadəçi',
    peerAvatar: prev?.peerAvatar,
  });
}

function leaveMediaRoom(releasePreview = true, restoreKit = false): void {
  const shared = Boolean(mediaZp && mediaZp === zpInstance);
  destroyPrebuilt(mediaZp);
  mediaZp = null;
  mediaRoomId = null;
  if (shared) zpInstance = null;
  hideZegoStage();
  if (releasePreview) releaseCallMedia();
  if (restoreKit && activeUserId && !mediaZp && !zpInstance) {
    const uid = activeUserId;
    const name = activeUserName || uid;
    window.setTimeout(() => {
      if (!zpInstance && !mediaZp && activeUserId === uid) {
        void initZegoCallKit(uid, name, optionsRef.current);
      }
    }, 200);
  }
}

export function getZegoLastInitError(): string | null {
  return lastInitError;
}

export async function initZegoCallKit(
  userId: string,
  userName: string,
  options: ZegoCallKitOptions = {}
): Promise<ZegoInstance | null> {
  optionsRef.current = { ...optionsRef.current, ...options };

  const zegoUserId = String(toZegoUserId(userId));
  const zegoName = String(toZegoUserName(userName, userId));
  if (!zegoUserId) {
    lastInitError = 'Etibarlı istifadəçi ID-si yoxdur.';
    return null;
  }

  const configured = await ensureZegoConfig();
  if (!configured) {
    lastInitError = 'Zego konfiqurasiyası tapılmadı.';
    return null;
  }

  if (tableVoiceActive) {
    activeUserId = zegoUserId;
    activeUserName = zegoName;
    return zpInstance;
  }

  if (zpInstance && activeUserId === zegoUserId) {
    activeUserName = zegoName;
    return zpInstance;
  }

  if (zpInstance && activeUserId !== zegoUserId) {
    destroyZegoCallKit();
  }

  if (initPromise) return initPromise;

  initPromise = (async () => {
    lastInitError = null;
    try {
      const [{ ZegoUIKitPrebuilt }, { ZIM }] = await Promise.all([
        loadZegoUIKit(),
        import('zego-zim-web'),
      ]);

      if (tableVoiceActive) {
        activeUserId = zegoUserId;
        activeUserName = zegoName;
        return zpInstance;
      }

      await requestCallNotificationPermission();

      const inviteRoomId = toZegoRoomId(zegoUserId, 'sig_');
      const kitToken = generateTestKitToken(
        ZegoUIKitPrebuilt,
        inviteRoomId,
        zegoUserId,
        zegoName
      );

      const zp = ZegoUIKitPrebuilt.create(kitToken);
      zp.addPlugins({ ZIM });
      patchJoinRoom(zp);

      zimRef =
        (ZIM as unknown as { getInstance?: () => ZimLike }).getInstance?.() ||
        pickZimFromKit(zp) ||
        null;
      if (zimRef) bindZimListeners(zimRef);

      zpInstance = zp;
      activeUserId = zegoUserId;
      activeUserName = zegoName;
      return zp;
    } catch (err) {
      lastInitError = err instanceof Error ? err.message : 'Zego init xətası';
      console.error('[Zego] init failed:', err);
      zpInstance = null;
      return null;
    }
  })().finally(() => {
    initPromise = null;
  });

  return initPromise;
}

export async function sendZegoCallInvitation(
  zp: ZegoInstance,
  params: {
    calleeId: string;
    calleeName: string;
    calleeAvatar?: string;
    callType: CallType;
    timeout?: number;
    joinCamera?: boolean;
    roomId?: string;
    callerAvatar?: string;
  }
): Promise<{ errorInvitees: { userID: string }[] }> {
  setJoinWithCamera(Boolean(params.joinCamera));

  const calleeZegoId = toZegoUserId(params.calleeId);
  const roomId = toZegoRoomId(params.roomId || params.calleeId, 'c_');
  pendingCalleeZegoId = calleeZegoId;
  pendingRoomId = roomId;
  pendingSessionId = params.roomId || '';
  pendingCallType = params.callType;
  if (pendingSessionId) watchSession(pendingSessionId);

  const payload: InvitePayload = {
    roomId,
    sessionId: pendingSessionId || undefined,
    callType: params.callType,
    peerName: activeUserName || undefined,
    peerAvatar: params.callerAvatar,
  };

  const hangupOutgoing = () => {
    const zimNow = getZim();
    if (zimNow && pendingZimCallId) {
      void zimNow.callCancel(pendingZimCallId, [calleeZegoId], { extendedData: '' });
    }
    stopCallUi('cancelled');
  };

  const ui = getCallUiState();
  if (!ui || ui.mode !== 'outgoing') {
    setCallUiState({
      mode: 'outgoing',
      callType: params.callType,
      peerName: params.calleeName,
      peerAvatar: params.calleeAvatar,
      cancel: hangupOutgoing,
    });
  } else {
    patchCallUiState({ cancel: hangupOutgoing, hint: undefined });
  }

  const zim = await waitForZim(zp);
  if (!zim) {
    patchCallUiState({ hint: 'Zəng siqnalı hazır deyil. Səhifəni bağlayıb yenidən yoxlayın.' });
    return { errorInvitees: [] };
  }

  bindZimListeners(zim);

  const result = await zim.callInvite([calleeZegoId], {
    timeout: params.timeout ?? 60,
    mode: 1,
    extendedData: JSON.stringify(payload),
  });

  pendingZimCallId = result.callID;
  const errors = result.errorUserList?.length ? result.errorUserList : result.errorInvitees || [];
  if (errors.length) {
    patchCallUiState({
      hint: 'Qarşı tərəf hazırda cavab vermir. Gözləyin və ya zəngi bitirin.',
    });
  }
  return { errorInvitees: errors.map((u) => ({ userID: u.userID })) };
}

export function getZegoCallKitInstance(): ZegoInstance | null {
  return zpInstance;
}

export function isZegoCallKitReady(): boolean {
  return zpInstance !== null;
}

export function destroyZegoCallKit(): void {
  const hadInstance = zpInstance !== null || mediaZp !== null;
  leaveMediaRoom(true, false);
  destroyPrebuilt(zpInstance);
  zpInstance = null;
  zimRef = null;
  zimBound = false;
  activeUserId = null;
  activeUserName = null;
  initPromise = null;
  pendingZimCallId = '';
  pendingSessionId = '';
  unwatchSession();
  if (hadInstance) setCallUiState(null);
}

type ZegoExpressLike = {
  muteMicrophone?: (mute: boolean) => void;
  muteSpeaker?: (mute: boolean) => void;
  enableCamera?: (enable: boolean) => void;
  mutePublishStreamVideo?: (mute: boolean) => void;
  on?: (ev: string, cb: (...args: unknown[]) => void) => void;
  startPlayingStream?: (id: string, opts?: Record<string, unknown>) => Promise<unknown>;
};

type ZegoKitAudio = ZegoInstance & {
  muteMicrophone?: (mute: boolean) => void;
  muteSpeaker?: (mute: boolean) => void;
};

function pickExpress(zp: unknown): ZegoExpressLike | null {
  if (!zp || typeof zp !== 'object') return null;
  const bag = zp as Record<string, unknown>;
  const nested = bag.core as Record<string, unknown> | undefined;
  const candidates = [bag.express, bag._express, bag.zg, bag.zego, nested?.express, nested?.zg];
  for (const candidate of candidates) {
    if (candidate && typeof candidate === 'object') return candidate as ZegoExpressLike;
  }
  return null;
}

function getExpress(): ZegoExpressLike | null {
  return pickExpress(mediaZp) || pickExpress(zpInstance);
}

function unmuteKit(zp: ZegoInstance | null): void {
  if (!zp) return;
  const kit = zp as ZegoKitAudio;
  try {
    kit.muteMicrophone?.(false);
  } catch {
    /* */
  }
  try {
    kit.muteSpeaker?.(false);
  } catch {
    /* */
  }
  const express = pickExpress(zp);
  try {
    express?.muteMicrophone?.(false);
  } catch {
    /* */
  }
  try {
    express?.muteSpeaker?.(false);
  } catch {
    /* */
  }
}

export function zegoHangUp() {
  const zim = getZim();
  const id = pendingZimCallId;
  const callee = pendingCalleeZegoId;
  const ringing = getCallUiState()?.mode === 'outgoing' || getCallUiState()?.mode === 'incoming';
  if (zim && id) {
    const cfg = { extendedData: '' };
    if (ringing) {
      const isIncoming = getCallUiState()?.mode === 'incoming';
      if (isIncoming) void zim.callReject(id, cfg).catch(() => undefined);
      else void zim.callCancel(id, callee ? [callee] : [], cfg).catch(() => undefined);
    } else {
      const ender = zim.callEnd
        ? zim.callEnd(id, cfg)
        : zim.callQuit
          ? zim.callQuit(id, cfg)
          : Promise.resolve();
      void Promise.resolve(ender)
        .catch(() => zim.callQuit?.(id, cfg))
        .catch(() => undefined);
    }
  }
  try {
    mediaZp?.hangUp();
  } catch {
    /* ignore */
  }
  stopCallUi('hangup');
}

export function getActiveCallSessionId(): string {
  return pendingSessionId;
}

export async function inviteUserToActiveCall(appUserId: string, displayName: string): Promise<void> {
  const zim = getZim();
  if (!zim) throw new Error('Zəng siqnalı hazır deyil.');
  const roomId = pendingRoomId || mediaRoomId;
  if (!roomId) throw new Error('Aktiv zəng otağı yoxdur.');
  const zegoId = toZegoUserId(appUserId);
  if (!zegoId) throw new Error('İstifadəçi ID-si etibarsızdır.');
  const payload: InvitePayload = {
    roomId,
    sessionId: pendingSessionId || undefined,
    callType: pendingCallType,
    peerName: activeUserName || displayName,
  };
  const extra = JSON.stringify(payload);
  const callId = pendingZimCallId;
  if (callId && zim.callingInvite) {
    let res: { errorUserList?: ZimUser[] } | undefined;
    try {
      res = await zim.callingInvite([zegoId], callId, { extendedData: extra });
    } catch {
      res = await zim.callingInvite([zegoId], {
        callID: callId,
        extendedData: extra,
        timeout: 60,
      });
    }
    if (res?.errorUserList?.length) {
      throw new Error('İstifadəçi onlayn deyil və ya dəvəti ala bilmədi.');
    }
    return;
  }
  const res = await zim.callInvite([zegoId], {
    timeout: 60,
    mode: 1,
    extendedData: extra,
  });
  const errors = res.errorUserList?.length ? res.errorUserList : res.errorInvitees || [];
  if (errors.length) throw new Error('İstifadəçi onlayn deyil və ya dəvəti ala bilmədi.');
}

export function zegoMuteMicrophone(muted: boolean) {
  muteLocalAudio(muted);
  getExpress()?.muteMicrophone?.(muted);
}

export function zegoMuteSpeaker(muted: boolean) {
  const el = document.getElementById('yolustu-remote-audio') as HTMLAudioElement | null;
  if (el) {
    el.muted = false;
    el.volume = muted ? 0.4 : 1;
    if (!muted) void el.play().catch(() => undefined);
  }
  getExpress()?.muteSpeaker?.(false);
}

export function zegoEnableCamera(on: boolean) {
  muteLocalVideo(!on);
  const express = getExpress();
  if (!express) return;
  if (express.enableCamera) {
    express.enableCamera(on);
    return;
  }
  express.mutePublishStreamVideo?.(!on);
}

let tableZp: ZegoInstance | null = null;
let tableRoomId: string | null = null;

function arenaVoiceRoomId(matchId: string): string {
  return toZegoRoomId(String(matchId ?? ''), 'arena_');
}

function restoreCallKitAfterTable(): void {
  tableVoiceActive = false;
  const uid = activeUserId;
  const name = activeUserName;
  if (!uid) return;
  void initZegoCallKit(uid, name ?? uid, optionsRef.current);
}

export async function joinArenaVoiceRoom(input: {
  matchId: string;
  playerId: string;
  playerName: string;
  container: HTMLElement;
}): Promise<boolean> {
  const configured = await ensureZegoConfig();
  if (!configured) return false;
  const primed = await primeCallMedia(false);
  releaseMediaStream(primed.stream);
  if (!primed.audio) return false;

  const roomId = String(arenaVoiceRoomId(input.matchId));
  const zegoUserId = String(toZegoUserId(input.playerId));
  const zegoName = String(toZegoUserName(input.playerName, input.playerId));
  if (!roomId || !zegoUserId) return false;

  if (tableZp && tableRoomId === roomId) return true;

  if (!activeUserId) {
    activeUserId = zegoUserId;
    activeUserName = zegoName;
  }

  tableVoiceActive = true;
  if (initPromise) {
    try {
      await initPromise;
    } catch {
      /* ignore */
    }
  }
  leaveArenaVoiceRoom({ restoreCallKit: false });
  destroyPrebuilt(zpInstance);
  zpInstance = null;
  initPromise = null;

  try {
    const { ZegoUIKitPrebuilt } = await loadZegoUIKit();
    const kitToken = generateTestKitToken(
      ZegoUIKitPrebuilt,
      roomId,
      zegoUserId,
      zegoName
    );
    const zp = ZegoUIKitPrebuilt.create(kitToken);
    patchJoinRoom(zp);
    zp.joinRoom({
      container: input.container,
      showPreJoinView: false,
      turnOnMicrophoneWhenJoining: true,
      turnOnCameraWhenJoining: false,
      showMyCameraToggleButton: false,
      showMyMicrophoneToggleButton: true,
      showAudioVideoSettingsButton: false,
      showTextChat: false,
      showUserList: false,
      showScreenSharingButton: false,
      showLayoutButton: false,
      showPinButton: false,
      showRoomTimer: false,
      showLeavingView: false,
      maxUsers: 12,
      scenario: {
        mode: ZegoUIKitPrebuilt.GroupCall,
        config: { role: ZegoUIKitPrebuilt.Host },
      },
    });
    tableZp = zp;
    tableRoomId = roomId;
    return true;
  } catch (err) {
    console.error('[Zego] arena voice failed:', err);
    tableZp = null;
    tableRoomId = null;
    restoreCallKitAfterTable();
    return false;
  }
}

export function leaveArenaVoiceRoom(opts?: { restoreCallKit?: boolean }): void {
  const restore = opts?.restoreCallKit !== false;
  destroyPrebuilt(tableZp);
  tableZp = null;
  tableRoomId = null;
  if (restore) restoreCallKitAfterTable();
}

export function setArenaVoiceMuted(muted: boolean): void {
  const express = (tableZp as { express?: ZegoExpressLike } | null)?.express;
  express?.muteMicrophone?.(muted);
}
