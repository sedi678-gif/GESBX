import { io, Socket } from 'socket.io-client';

import { getAppUserId } from './userId';

import { isSocketConfigured, resolveSocketUrl } from './realtimeConfig';



let socket: Socket | null = null;

let connectedUserId: string | null = null;

let lifecycleBound = false;

let visibilityBound = false;



type SocketStatusListener = (connected: boolean) => void;

const statusListeners = new Set<SocketStatusListener>();



function notifySocketStatus(connected: boolean) {

  statusListeners.forEach((fn) => fn(connected));

}



export function subscribeAppSocketStatus(listener: SocketStatusListener): () => void {

  statusListeners.add(listener);

  listener(Boolean(socket?.connected));

  return () => statusListeners.delete(listener);

}



function bindVisibilityReconnect() {

  if (visibilityBound || typeof document === 'undefined') return;

  visibilityBound = true;

  document.addEventListener('visibilitychange', () => {

    if (document.visibilityState === 'visible') {

      reconnectAppSocket();

    }

  });

}



function bindSocketLifecycle(s: Socket) {

  if (lifecycleBound) return;

  lifecycleBound = true;



  s.io.on('reconnect', (attempt) => {

    console.log('[Socket] 🔄 reconnect attempt', attempt);

  });



  s.io.on('reconnect_failed', () => {

    console.warn('[Socket] reconnect failed — yenidən cəhd edilir');

    setTimeout(() => reconnectAppSocket(), 5000);

  });



  s.on('connect', () => {

    console.log('[Socket] ✅ Qoşuldu:', resolveSocketUrl());

    notifySocketStatus(true);

    if (connectedUserId) {

      s.emit('user_connected', connectedUserId);

    }

    void import('./callSocketService').then((m) => m.ensureGlobalCallSignalListeners());

  });



  s.on('disconnect', (reason) => {

    console.warn('[Socket] ❌ Ayrıldı:', reason);

    notifySocketStatus(false);

    if (reason === 'io server disconnect') {

      s.connect();

    }

  });



  s.on('connect_error', (err) => {

    console.warn('[Socket] Qoşulma xətası (auto-reconnect aktiv):', err.message);

    notifySocketStatus(false);

  });

}



export function getAppSocket(): Socket | null {

  const url = resolveSocketUrl();

  if (!url) return null;



  if (!socket) {

    socket = io(url, {

      autoConnect: false,

      transports: ['polling', 'websocket'],

      reconnection: true,

      reconnectionAttempts: Infinity,

      reconnectionDelay: 1000,

      reconnectionDelayMax: 10000,

      randomizationFactor: 0.4,

      timeout: 20000,

      secure: url.startsWith('https://'),

    });

    bindSocketLifecycle(socket);

    bindVisibilityReconnect();

  }

  return socket;

}



export function resolveSocketUserId(userId?: string | null): string {

  return getAppUserId(userId) || String(userId || '').trim();

}



export function connectAppSocket(userId: string): Socket | null {

  const s = getAppSocket();

  if (!s) return null;



  const uid = resolveSocketUserId(userId);

  if (!uid || uid === 'guest' || uid === 'anonim_user_id') return s;



  connectedUserId = uid;



  if (s.connected) {

    s.emit('user_connected', uid);

  } else {

    s.connect();

  }



  return s;

}



export function reconnectAppSocket(userId?: string | null): void {

  const s = getAppSocket();

  if (!s) return;



  const uid = resolveSocketUserId(userId) || connectedUserId;

  if (uid && uid !== 'guest' && uid !== 'anonim_user_id') {

    connectedUserId = uid;

  }



  if (s.connected) {

    if (connectedUserId) s.emit('user_connected', connectedUserId);

  } else {

    s.connect();

  }

}



export function rejoinAppSocketRoom(userId?: string | null): void {

  reconnectAppSocket(userId);

}



/** Socket konfiqurasiya olunmayıbsa (Vercel) dərhal null qaytarır — çökmür */

export function waitForAppSocket(userId?: string, timeoutMs = 12_000): Promise<Socket | null> {

  const s = getAppSocket();

  if (!s) return Promise.resolve(null);



  const uid = userId ? resolveSocketUserId(userId) : connectedUserId;

  if (uid) connectAppSocket(uid);



  if (s.connected) return Promise.resolve(s);



  return new Promise((resolve) => {

    const timer = setTimeout(() => {

      s.off('connect', onConnect);

      resolve(null);

    }, timeoutMs);



    const onConnect = () => {

      clearTimeout(timer);

      resolve(s);

    };



    s.once('connect', onConnect);

    if (!s.connected) s.connect();

  });

}



export function isAppSocketConnected(): boolean {

  return Boolean(socket?.connected);

}



export function getConnectedAppUserId(): string | null {

  return connectedUserId;

}



export function disconnectAppSocket(): void {

  if (socket?.connected) socket.disconnect();

  connectedUserId = null;

}



export { isSocketConfigured, resolveSocketUrl as APP_SOCKET_URL };


