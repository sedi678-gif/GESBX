"use client";

import { io, Socket } from 'socket.io-client';
import { ALLIANCE_SOCKET_URL } from './battleCardsConfig';

let socket: Socket | null = null;

export function getAllianceSocket(): Socket {
  if (!socket) {
    socket = io(ALLIANCE_SOCKET_URL, {
      autoConnect: false,
      transports: ['websocket', 'polling'],
    });
  }
  return socket;
}

export function emitAllianceHubEvent(
  event:
    | 'alliance_created'
    | 'alliance_joined'
    | 'alliance_left'
    | 'alliance_flag_updated'
    | 'alliance_renamed'
    | 'chat_message'
    | 'cards_updated'
    | 'fortress_updated'
    | 'ad_xp_reward'
    | 'alliance_info_viewed',
  payload: Record<string, unknown>
) {
  const s = getAllianceSocket();
  if (s.connected) {
    s.emit('alliance_hub_event', { event, payload, at: Date.now() });
  }
}
