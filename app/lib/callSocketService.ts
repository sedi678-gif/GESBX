import { connectAppSocket, getAppSocket, waitForAppSocket, isSocketConfigured } from './appSocketHub';

import { CallType } from './callService';



export { connectAppSocket as connectCallSocket, getAppSocket as getCallSocket, waitForAppSocket } from './appSocketHub';



export interface CallInvitePayload {

  callId: string;

  from: string;

  fromName?: string;

  fromAvatar?: string;

  chatId?: string;

  callType: CallType;

}



export interface CallSignalPayload {

  callId: string;

  from: string;

}



async function emitWhenReady(userId: string, emit: () => void, timeoutMs = 8000): Promise<boolean> {

  if (!isSocketConfigured()) return false;

  const s = await waitForAppSocket(userId, timeoutMs);

  if (!s) return false;

  emit();

  return true;

}



export async function emitCallInvite(payload: CallInvitePayload & { to: string }): Promise<boolean> {

  return emitWhenReady(payload.from, () => {

    getAppSocket()?.emit('call:invite', {

      to: payload.to,

      userToCall: payload.to,

      from: payload.from,

      callId: payload.callId,

      callType: payload.callType,

      isVideo: payload.callType === 'video',

      chatId: payload.chatId || '',

      fromName: payload.fromName || '',

      fromAvatar: payload.fromAvatar || '',

    });

  });

}



export async function emitCallAccept(payload: { to: string; from: string; callId: string }): Promise<boolean> {

  return emitWhenReady(payload.from, () => {

    getAppSocket()?.emit('call:accept', payload);

  });

}



export async function emitCallReject(payload: { to: string; from: string; callId: string }): Promise<boolean> {

  return emitWhenReady(payload.from, () => {

    getAppSocket()?.emit('call:reject', payload);

  });

}



export async function emitCallEnd(payload: { to: string; from: string; callId: string }): Promise<boolean> {

  return emitWhenReady(payload.from, () => {

    getAppSocket()?.emit('call:end', payload);

  });

}



export async function emitCallBusy(payload: { to: string; from: string; callId: string }): Promise<boolean> {

  return emitWhenReady(payload.from, () => {

    getAppSocket()?.emit('call:busy', payload);

  });

}



export function ensureGlobalCallSignalListeners(): void {

  /* PeerJS cloud zəng media-sını idarə edir */

}



function bindSocketEvent<T>(event: string, handler: (data: T) => void): () => void {

  const s = getAppSocket();

  if (!s) return () => undefined;

  const fn = (data: T) => handler(data);

  s.on(event, fn);

  return () => s.off(event, fn);

}



export function onIncomingCall(handler: (payload: CallInvitePayload) => void): () => void {

  return bindSocketEvent('incoming_call', handler);

}



export function onCallRejected(handler: (payload: CallSignalPayload) => void): () => void {

  return bindSocketEvent('call:rejected', handler);

}



export function onCallEnded(handler: (payload: CallSignalPayload) => void): () => void {

  return bindSocketEvent('call:ended', handler);

}



export function onCallBusy(handler: (payload: CallSignalPayload) => void): () => void {

  return bindSocketEvent('call:busy', handler);

}



export function onCallError(handler: (payload: { message: string; callId?: string }) => void): () => void {

  return bindSocketEvent('call:error', handler);

}



export function onCallOffline(handler: (payload: { callId?: string; to?: string; message?: string }) => void): () => void {

  return bindSocketEvent('call:offline', handler);

}


