"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
  type QuerySnapshot,
} from 'firebase/firestore';
import { db } from '../../../firebase';
import {
  createAlliance,
  joinAlliance,
  leaveOrDeleteAlliance,
  sendChatMessage,
  ensurePlayerProfile,
  resetBattleCards,
  updateAllianceFlag,
  updateAllianceName,
} from './allianceService';
import { getAllianceSocket, emitAllianceHubEvent } from './allianceSocket';
import {
  AllianceData,
  AllianceFlagConfig,
  MessageData,
  PlayerProfile,
  HubStats,
  HubVisualState,
  FortressHubState,
  BattleCard,
  ChatChannel,
} from './types';
import { battleCardsMapToList, totalBattleCards, resolveBattleCardsForUser } from './battleCardsConfig';
import { incrementQuestProgress } from '@/app/lib/allianceQuestService';
import { DEFAULT_ALLIANCE_FLAG, normalizeAllianceFlag } from './allianceFlagConfig';
import { isAllianceLeader } from './allianceLeader';
import type { AllianceAttack } from '@/app/lib/allianceBattleService';
import { APP_BRAIN_FEATURES, EMPTY_REALTIME_HUB, type AppBrainFeatures, type RealtimeHubState } from '@/app/lib/appBrainConfig';
import { resolvePlayerManat } from '@/app/lib/manat';
import {
  getFortressMarkerUrl,
  normalizeFortressLevel,
  writeCachedFortressLevel,
} from '@/app/lib/allianceFortressConfig';
import {
  evaluateFortressEligibility,
  tickFortressAllianceActivity,
  upgradeFortressByActivity,
} from '@/app/lib/allianceFortressService';
import { connectAppSocket, isAppSocketConnected, rejoinAppSocketRoom } from '@/app/lib/appSocketHub';
import { getAppUserId } from '@/app/lib/userId';
import { emitChatMessage, onChatMessage, onChatError, onUserStatusChange } from '@/app/lib/messageSocketService';
import type { StoredMessage } from '@/app/lib/messageService';
import { notifyAllianceInfoViewed as persistAllianceInfoView } from '@/app/lib/allianceViewNotifyService';

interface AllianceBrainContextValue {
  userId: string;
  alliances: AllianceData[];
  players: PlayerProfile[];
  activeAlliance: AllianceData | null;
  myProfile: PlayerProfile | null;
  myManat: number;
  globalMessages: MessageData[];
  allianceMessages: MessageData[];
  battleCards: BattleCard[];
  battleCardTotal: number;
  hubStats: HubStats;
  hubVisuals: HubVisualState;
  fortressHub: FortressHubState;
  features: AppBrainFeatures;
  realtimeHub: RealtimeHubState;
  connected: boolean;
  relayPrivateMessage: (recipientId: string, message: StoredMessage) => void;
  subscribePrivateMessages: (handler: (message: StoredMessage) => void) => () => void;
  isUserOnline: (userId: string) => boolean;
  ensureAppSocket: () => void;
  setActiveAlliance: (a: AllianceData | null) => void;
  handleCreateAlliance: (name: string, region: string) => Promise<void>;
  handleJoinAlliance: (alliance: AllianceData) => Promise<void>;
  handleLeaveAlliance: () => Promise<void>;
  handleSendMessage: (text: string, channel: ChatChannel) => Promise<void>;
  handleUpdateAllianceFlag: (flag: AllianceFlagConfig) => Promise<void>;
  handleRenameAlliance: (name: string) => Promise<void>;
  handleUpgradeFortress: () => Promise<void>;
  attackTargetId: string | null;
  setAttackTargetId: (id: string | null) => void;
  focusAllianceId: string | null;
  setFocusAllianceId: (id: string | null) => void;
  liveBattleAttacks: AllianceAttack[];
  registerBattleAttack: (attack: AllianceAttack) => void;
  alliancesReady: boolean;
  notifyAllianceInfoViewed: (alliance: Pick<AllianceData, 'id' | 'name' | 'members' | 'leaderId'>) => void;
  allianceNotifyToast: string | null;
}

const AllianceBrainContext = createContext<AllianceBrainContextValue | null>(null);

interface ProviderProps {
  userId: string;
  userName: string;
  firebaseUid?: string | null;
  children: React.ReactNode;
}

export function AllianceBrainProvider({ userId, userName, firebaseUid = null, children }: ProviderProps) {
  const [alliances, setAlliances] = useState<AllianceData[]>([]);
  const [players, setPlayers] = useState<PlayerProfile[]>([]);
  const [activeAlliance, setActiveAlliance] = useState<AllianceData | null>(null);
  const [myProfile, setMyProfile] = useState<PlayerProfile | null>(null);
  const [globalMessages, setGlobalMessages] = useState<MessageData[]>([]);
  const [allianceMessages, setAllianceMessages] = useState<MessageData[]>([]);
  const [connected, setConnected] = useState(false);
  const [onlineCount, setOnlineCount] = useState(0);
  const [attackTargetId, setAttackTargetId] = useState<string | null>(null);
  const [focusAllianceId, setFocusAllianceId] = useState<string | null>(null);
  const [liveBattleAttacks, setLiveBattleAttacks] = useState<AllianceAttack[]>([]);
  const [realtimeHub, setRealtimeHub] = useState<RealtimeHubState>(EMPTY_REALTIME_HUB);
  const [alliancesReady, setAlliancesReady] = useState(false);
  const [allianceNotifyToast, setAllianceNotifyToast] = useState<string | null>(null);

  const privateMessageListenersRef = useRef(new Set<(message: StoredMessage) => void>());

  const registerBattleAttack = useCallback((attack: AllianceAttack) => {
    setLiveBattleAttacks((prev) => {
      const next = [attack, ...prev.filter((a) => a.id !== attack.id)];
      return next.slice(0, 20);
    });
  }, []);

  // Firebase: ittifaqlar
  useEffect(() => {
    const unsub = onSnapshot(query(collection(db, 'alliances')), (snapshot) => {
      const list: AllianceData[] = [];
      snapshot.forEach((docSnap) => {
        list.push({ id: docSnap.id, ...docSnap.data() } as AllianceData);
      });
      setAlliances(list);

      const mine = list.find(
        (item) =>
          item.leaderId === userId || (item.members && item.members.includes(userId))
      );
      setActiveAlliance(mine || null);
      setAlliancesReady(true);

      if (mine) {
        localStorage.setItem('app_user_alliance_name', mine.name);
        writeCachedFortressLevel(mine.fortressLevel ?? 1);
      } else {
        localStorage.removeItem('app_user_alliance_name');
        writeCachedFortressLevel(null);
      }
    });
    return () => unsub();
  }, [userId]);

  // Yalnız öz profil + aktiv ittifaq üzvləri (bütün players kolleksiyası donma yaradır)
  useEffect(() => {
    if (!userId) return;
    const unsubMe = onSnapshot(doc(db, 'players', userId), (snap) => {
      if (!snap.exists()) {
        setMyProfile(null);
        return;
      }
      const me = { odId: snap.id, ...snap.data() } as PlayerProfile;
      setMyProfile({
        ...me,
        manat: resolvePlayerManat(me as unknown as Record<string, unknown>),
      });
      setPlayers((prev) => {
        const others = prev.filter((p) => p.odId !== userId);
        return [me, ...others];
      });
    });
    return () => unsubMe();
  }, [userId]);

  useEffect(() => {
    if (!activeAlliance?.id) return;
    const allianceId = activeAlliance.id;
    const unsub = onSnapshot(
      query(collection(db, 'players'), where('allianceId', '==', allianceId)),
      (snapshot) => {
        const list: PlayerProfile[] = [];
        snapshot.forEach((docSnap) => {
          list.push({ odId: docSnap.id, ...docSnap.data() } as PlayerProfile);
        });
        setPlayers(list);
      }
    );
    return () => unsub();
  }, [activeAlliance?.id]);

  // Firebase: qlobal çat (hamı görür/yazar)
  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, 'global_chat'), orderBy('createdAt', 'desc'), limit(80)),
      (snapshot) => {
      const msgList: MessageData[] = [];
      snapshot.forEach((docSnap) => {
        msgList.push({ id: docSnap.id, ...docSnap.data() } as MessageData);
      });
      msgList.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
      setGlobalMessages(
        msgList.length > 0
          ? msgList
          : [
              {
                id: 'welcome-global',
                user: 'Sistem',
                text: 'Qlobal söhbətə xoş gəldiniz! Bütün oyunçular burada yazışa bilər. 🇦🇿',
                time: 'İndi',
                createdAt: Date.now(),
                kind: 'system',
              },
            ]
      );
    });
    return () => unsub();
  }, []);

  // Firebase: ittifaq daxili çat (yalnız həmin ittifaq üzvləri)
  useEffect(() => {
    if (!activeAlliance?.id) {
      setAllianceMessages([]);
      return;
    }

    const allianceId = activeAlliance.id;
    const welcome: MessageData[] = [
      {
        id: 'welcome-alliance',
        user: 'Sistem',
        text: `${activeAlliance.name} ittifaqının gizli söhbətinə xoş gəldiniz! Yalnız ittifaq üzvləri görür.`,
        time: 'İndi',
        createdAt: Date.now(),
        allianceId,
        kind: 'system',
      },
    ];
    const applySnap = (snapshot: QuerySnapshot) => {
      const msgList: MessageData[] = [];
      snapshot.forEach((docSnap) => {
        msgList.push({ id: docSnap.id, ...docSnap.data() } as MessageData);
      });
      msgList.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
      setAllianceMessages(msgList.length > 0 ? msgList.slice(-80) : welcome);
    };

    const scoped = query(
      collection(db, 'alliance_chat'),
      where('allianceId', '==', allianceId),
      orderBy('createdAt', 'desc'),
      limit(80)
    );
    let fallbackUnsub: (() => void) | null = null;
    const unsub = onSnapshot(scoped, applySnap, () => {
      fallbackUnsub = onSnapshot(
        query(collection(db, 'alliance_chat'), where('allianceId', '==', allianceId)),
        applySnap
      );
    });
    return () => {
      unsub();
      fallbackUnsub?.();
    };
  }, [activeAlliance?.id, activeAlliance?.name]);

  useEffect(() => {
    if (!activeAlliance?.id) return;

    const allianceId = activeAlliance.id;
    let primed = false;
    const onNotifySnap = (snapshot: QuerySnapshot) => {
      if (!primed) {
        primed = true;
        return;
      }
      snapshot.docChanges().forEach((change) => {
        if (change.type !== 'added') return;
        const data = change.doc.data();
        if (data.kind !== 'info_viewed' && data.kind !== 'battle_finished') return;
        if (data.kind === 'info_viewed' && data.viewerId === userId) return;
        if (data.createdAt && Date.now() - data.createdAt > 20_000) return;
        setAllianceNotifyToast(
          data.kind === 'battle_finished'
            ? data.text || 'Döyüş bitdi'
            : data.text || '👁 Kimsə ittifaqınızın məlumatlarına baxdı'
        );
      });
    };

    const scoped = query(
      collection(db, 'alliance_notifications'),
      where('allianceId', '==', allianceId),
      orderBy('createdAt', 'desc'),
      limit(40)
    );
    let fallbackUnsub: (() => void) | null = null;
    const unsub = onSnapshot(scoped, onNotifySnap, () => {
      fallbackUnsub = onSnapshot(
        query(collection(db, 'alliance_notifications'), where('allianceId', '==', allianceId)),
        onNotifySnap
      );
    });
    return () => {
      unsub();
      fallbackUnsub?.();
    };
  }, [activeAlliance?.id, userId]);

  useEffect(() => {
    if (!allianceNotifyToast) return;
    const timer = window.setTimeout(() => setAllianceNotifyToast(null), 4200);
    return () => window.clearTimeout(timer);
  }, [allianceNotifyToast]);

  // Socket.IO: mərkəzi beyin sinxronizasiyası
  useEffect(() => {
    const socket = getAllianceSocket();

    const onConnect = () => {
      setConnected(true);
      setOnlineCount((c) => Math.max(c, 1));
      socket.emit('join_alliance_hub', { userId, userName });
    };

    const onDisconnect = () => {
      setConnected(false);
    };

    const onHubOnline = (data: { count: number }) => {
      setOnlineCount(data.count);
    };

    const onHubRefresh = () => {
      // Firebase onSnapshot avtomatik yeniləyir; socket siqnalı gecikməni azaldır
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('hub_online_count', onHubOnline);
    socket.on('hub_stats_updated', onHubRefresh);

    if (!socket.connected) socket.connect();

    if (typeof navigator !== 'undefined' && navigator.onLine) {
      setOnlineCount((c) => Math.max(c, 1));
    }

    void ensurePlayerProfile(userId, userName, firebaseUid);

    try {
      localStorage.removeItem('alliance_battle_cards');
    } catch {
      /* ignore */
    }

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('hub_online_count', onHubOnline);
      socket.off('hub_stats_updated', onHubRefresh);
      socket.emit('leave_alliance_hub', { userId });
    };
  }, [userId, userName]);

  // Tətbiq Socket.io — mesaj, zəng, onlayn status (vahid hub)
  useEffect(() => {
    const profileId = getAppUserId(userId);
    if (!profileId || profileId === 'guest' || profileId === 'anonim_user_id') return;

    const appSocket = connectAppSocket(profileId);
    if (!appSocket) return;

    const syncConnected = () => {
      setRealtimeHub((prev) => ({
        ...prev,
        appSocketConnected: isAppSocketConnected(),
      }));
    };

    const onConnect = () => syncConnected();
    const onDisconnect = () => syncConnected();

    appSocket.on('connect', onConnect);
    appSocket.on('disconnect', onDisconnect);
    syncConnected();

    const unsubs = [
      onChatMessage((message) => {
        setRealtimeHub((prev) => ({
          ...prev,
          lastPrivateMessageAt: message.createdAt || Date.now(),
        }));
        privateMessageListenersRef.current.forEach((fn) => fn(message));
      }),
      onChatError((payload) => {
        if (payload.message) console.warn('[Brain] chat error:', payload.message);
      }),
      onUserStatusChange(({ userId: uid, isOnline }) => {
        setRealtimeHub((prev) => ({
          ...prev,
          onlineUserIds: { ...prev.onlineUserIds, [uid]: isOnline },
        }));
      }),
    ];

    return () => {
      appSocket.off('connect', onConnect);
      appSocket.off('disconnect', onDisconnect);
      unsubs.forEach((u) => u());
    };
  }, [userId]);

  const ensureAppSocket = useCallback(() => {
    const profileId = getAppUserId(userId);
    if (!profileId || profileId === 'guest' || profileId === 'anonim_user_id') return;
    rejoinAppSocketRoom(profileId);
    setRealtimeHub((prev) => ({ ...prev, appSocketConnected: isAppSocketConnected() }));
  }, [userId]);

  const relayPrivateMessage = useCallback((recipientId: string, message: StoredMessage) => {
    ensureAppSocket();
    emitChatMessage(recipientId, message);
  }, [ensureAppSocket]);

  const subscribePrivateMessages = useCallback((handler: (message: StoredMessage) => void) => {
    privateMessageListenersRef.current.add(handler);
    return () => {
      privateMessageListenersRef.current.delete(handler);
    };
  }, []);

  const isUserOnline = useCallback(
    (uid: string) => Boolean(realtimeHub.onlineUserIds[uid]),
    [realtimeHub.onlineUserIds]
  );

  const resolvedCards = useMemo(
    () => resolveBattleCardsForUser(userId, myProfile?.battleCards),
    [userId, myProfile]
  );

  const battleCards = useMemo(
    () => battleCardsMapToList(resolvedCards),
    [resolvedCards]
  );

  const battleCardTotal = useMemo(
    () => totalBattleCards(resolvedCards),
    [resolvedCards]
  );

  const myManat = useMemo(
    () => resolvePlayerManat(myProfile as unknown as Record<string, unknown> | null),
    [myProfile]
  );

  const hubStats: HubStats = useMemo(
    () => ({
      onlineCount,
      totalAlliances: alliances.length,
      totalPlayers: players.length,
    }),
    [onlineCount, alliances.length, players.length]
  );

  const onlineInAlliance = useMemo(() => {
    if (!activeAlliance?.members?.length) return 0;
    return activeAlliance.members.filter((m) => Boolean(realtimeHub.onlineUserIds[m])).length;
  }, [activeAlliance?.members, realtimeHub.onlineUserIds]);

  const fortressLevel = normalizeFortressLevel(activeAlliance?.fortressLevel ?? 1);
  const fortressMarkerUrl = getFortressMarkerUrl(fortressLevel);

  const fortressEligibility = useMemo(() => {
    if (!activeAlliance) return null;
    return evaluateFortressEligibility(activeAlliance, onlineInAlliance);
  }, [activeAlliance, onlineInAlliance]);

  const canManageFortress = isAllianceLeader(activeAlliance, userId, {
    firebaseUid,
    isLeaderProfile: myProfile?.isLeader,
    displayName: userName,
  });

  const fortressHub: FortressHubState = useMemo(
    () => ({
      level: fortressLevel,
      markerUrl: fortressMarkerUrl,
      onlineInAlliance,
      canManage: canManageFortress,
      eligibilityProgressPct:
        fortressEligibility && fortressEligibility.requiredMs > 0
          ? Math.min(
              100,
              Math.round(
                (fortressEligibility.qualifyingMs / fortressEligibility.requiredMs) * 100
              )
            )
          : 100,
      nextLevelLabel: fortressEligibility?.nextLevel
        ? `Lv.${fortressEligibility.nextLevel}`
        : null,
    }),
    [
      fortressLevel,
      fortressMarkerUrl,
      onlineInAlliance,
      canManageFortress,
      fortressEligibility,
    ]
  );

  const hubVisuals: HubVisualState = useMemo(() => {
    const inAlliance = Boolean(activeAlliance);
    const memberCount = activeAlliance?.members?.length ?? 0;
    const allianceFlag = normalizeAllianceFlag(activeAlliance?.flag ?? DEFAULT_ALLIANCE_FLAG);
    const canEditAllianceFlag = canManageFortress;
    const hubOnline =
      connected ||
      (typeof navigator !== 'undefined' && navigator.onLine !== false) ||
      onlineCount > 0;

    return {
      sceneActive: true,
      animationsEnabled: true,
      allianceName: activeAlliance?.name ?? 'YOL ÜSTÜ',
      allianceLevel: fortressLevel,
      fortressLevel,
      fortressMarkerUrl,
      allianceFlag,
      canEditAllianceFlag,
      hubOnline,
      dogCount: inAlliance
        ? Math.max(2, Math.min(5, Math.ceil(memberCount / 4) + 1))
        : 2,
      guardCount: inAlliance ? Math.min(3, Math.max(1, Math.ceil(memberCount / 3))) : 1,
      workerCount: inAlliance ? 2 : 1,
    };
  }, [
    activeAlliance,
    canManageFortress,
    connected,
    fortressLevel,
    fortressMarkerUrl,
    onlineCount,
  ]);

  useEffect(() => {
    if (!activeAlliance?.id || !activeAlliance.members?.length) return;

    const countOnlineInAlliance = () =>
      activeAlliance.members.filter((m) => Boolean(realtimeHub.onlineUserIds[m])).length;

    const runTick = () => {
      const onlineInAlliance = countOnlineInAlliance();
      void tickFortressAllianceActivity(
        activeAlliance.id,
        onlineInAlliance,
        activeAlliance.members.length
      ).catch(() => {});
    };

    runTick();
    const timer = window.setInterval(runTick, 60_000);
    return () => window.clearInterval(timer);
  }, [activeAlliance?.id, activeAlliance?.members, realtimeHub.onlineUserIds]);

  const handleCreateAlliance = useCallback(
    async (name: string, region: string) => {
      const created = await createAlliance(name, region, userId, userName);
      setActiveAlliance(created);
      emitAllianceHubEvent('alliance_created', { allianceId: created.id, userId });
    },
    [userId, userName]
  );

  const handleJoinAlliance = useCallback(
    async (alliance: AllianceData) => {
      const updated = await joinAlliance(alliance, userId, userName);
      setActiveAlliance(updated);
      emitAllianceHubEvent('alliance_joined', { allianceId: updated.id, userId });
    },
    [userId, userName]
  );

  const handleLeaveAlliance = useCallback(async () => {
    if (!activeAlliance) return;
    await leaveOrDeleteAlliance(activeAlliance, userId, userName);
    setActiveAlliance(null);
    emitAllianceHubEvent('alliance_left', { allianceId: activeAlliance.id, userId });
  }, [activeAlliance, userId, userName]);

  const handleSendMessage = useCallback(
    async (text: string, channel: ChatChannel) => {
      if (channel === 'alliance' && !activeAlliance?.id) {
        throw new Error('İttifaq çatı üçün ittifaqda olmalısan');
      }
      await sendChatMessage(text, userName, channel, {
        userId,
        allianceId: activeAlliance?.id,
      });
      if (channel === 'alliance' && activeAlliance?.id) {
        void incrementQuestProgress(activeAlliance.id, 'chat', 1);
      }
      emitAllianceHubEvent('chat_message', { userId, channel });
    },
    [userId, userName, activeAlliance?.id]
  );

  const handleUpdateAllianceFlag = useCallback(
    async (flag: AllianceFlagConfig) => {
      if (!activeAlliance) throw new Error('İttifaq seçilməyib');
      const saved = await updateAllianceFlag(activeAlliance.id, flag, userId, {
        firebaseUid,
        isLeaderProfile: myProfile?.isLeader,
        displayName: userName,
      });
      setActiveAlliance({ ...activeAlliance, flag: saved, leaderId: userId });
      emitAllianceHubEvent('alliance_flag_updated', {
        allianceId: activeAlliance.id,
        userId,
      });
    },
    [activeAlliance, userId, userName, firebaseUid, myProfile?.isLeader]
  );

  const handleRenameAlliance = useCallback(
    async (name: string) => {
      if (!activeAlliance) throw new Error('İttifaq seçilməyib');
      const saved = await updateAllianceName(activeAlliance.id, name, userId, {
        firebaseUid,
        isLeaderProfile: myProfile?.isLeader,
        displayName: userName,
      });
      setActiveAlliance({
        ...activeAlliance,
        name: saved,
        previousName: activeAlliance.name,
        nameUpdatedAt: Date.now(),
      });
      localStorage.setItem('app_user_alliance_name', saved);
      emitAllianceHubEvent('alliance_renamed', {
        allianceId: activeAlliance.id,
        userId,
        name: saved,
      });
    },
    [activeAlliance, userId, userName, firebaseUid, myProfile?.isLeader]
  );

  const notifyAllianceInfoViewed = useCallback(
    (alliance: Pick<AllianceData, 'id' | 'name' | 'members' | 'leaderId'>) => {
      void persistAllianceInfoView({
        allianceId: alliance.id,
        allianceName: alliance.name,
        members: alliance.members,
        leaderId: alliance.leaderId,
        viewerId: userId,
        viewerName: userName,
        viewerAllianceId: activeAlliance?.id,
        viewerAllianceName: activeAlliance?.name,
      })
        .then((sent) => {
          if (sent) {
            emitAllianceHubEvent('alliance_info_viewed', {
              allianceId: alliance.id,
              viewerId: userId,
            });
          }
        })
        .catch(() => {});
    },
    [userId, userName, activeAlliance?.id, activeAlliance?.name]
  );

  const handleUpgradeFortress = useCallback(async () => {
    if (!activeAlliance) throw new Error('İttifaq seçilməyib');
    if (!canManageFortress) throw new Error('Yalnız lider yüksəldə bilər');
    const next = await upgradeFortressByActivity(userId, activeAlliance.id);
    emitAllianceHubEvent('fortress_updated', {
      allianceId: activeAlliance.id,
      userId,
      level: next,
    });
  }, [activeAlliance, canManageFortress, userId]);

  const value: AllianceBrainContextValue = {
    userId,
    alliances,
    players,
    activeAlliance,
    myProfile,
    myManat,
    globalMessages,
    allianceMessages,
    battleCards,
    battleCardTotal,
    hubStats,
    hubVisuals,
    fortressHub,
    features: APP_BRAIN_FEATURES,
    realtimeHub,
    connected,
    relayPrivateMessage,
    subscribePrivateMessages,
    isUserOnline,
    ensureAppSocket,
    setActiveAlliance,
    handleCreateAlliance,
    handleJoinAlliance,
    handleLeaveAlliance,
    handleSendMessage,
    handleUpdateAllianceFlag,
    handleRenameAlliance,
    handleUpgradeFortress,
    attackTargetId,
    setAttackTargetId,
    focusAllianceId,
    setFocusAllianceId,
    liveBattleAttacks,
    registerBattleAttack,
    alliancesReady,
    notifyAllianceInfoViewed,
    allianceNotifyToast,
  };

  return (
    <AllianceBrainContext.Provider value={value}>{children}</AllianceBrainContext.Provider>
  );
}

export function useAllianceBrain() {
  const ctx = useContext(AllianceBrainContext);
  if (!ctx) {
    throw new Error('useAllianceBrain yalnız AllianceBrainProvider daxilində işləyir');
  }
  return ctx;
}

/** Mərkəzi beyin — useAllianceBrain alias */
export const useAppBrain = useAllianceBrain;
