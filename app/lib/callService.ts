import {

  collection,

  doc,

  setDoc,

  onSnapshot,

  updateDoc,

  arrayUnion,

  query,

  where,

  Unsubscribe,

  QuerySnapshot,

} from 'firebase/firestore';

import { db } from '@/firebase';

import { ensureFirebaseAuth } from './firebaseAuth';



export type CallType = 'voice' | 'video';

export type CallStatus = 'ringing' | 'connecting' | 'active' | 'ended' | 'rejected' | 'missed';



export interface CallSessionData {

  callId: string;

  chatId: string;

  callerId: string;

  calleeId: string;

  callType: CallType;

  status: CallStatus;

  participants?: string[];

  invitedUserIds?: string[];

  callerName?: string;

  callerAvatar?: string;

  createdAt: number;

  endedAt?: number;

}



export function normalizeUserId(id: string): string {

  return String(id).trim();

}



export function createCallId(callerId: string, calleeId: string): string {

  return `${normalizeUserId(callerId)}__${normalizeUserId(calleeId)}__${Date.now()}`;

}



export async function createCallSession(params: {

  callId: string;

  chatId: string;

  callerId: string;

  calleeId: string;

  callType: CallType;

  callerName?: string;

  callerAvatar?: string;

}): Promise<void> {

  await ensureFirebaseAuth();

  await setDoc(doc(db, 'call_sessions', params.callId), {

    callId: params.callId,

    chatId: params.chatId,

    callerId: normalizeUserId(params.callerId),

    calleeId: normalizeUserId(params.calleeId),

    callType: params.callType,

    callerName: params.callerName || '',

    callerAvatar: params.callerAvatar || '',

    status: 'ringing',

    participants: [normalizeUserId(params.callerId), normalizeUserId(params.calleeId)],

    invitedUserIds: [],

    createdAt: Date.now(),

  } satisfies CallSessionData);

}



export function listenCallSession(

  callId: string,

  callback: (session: CallSessionData | null) => void

): Unsubscribe {

  return onSnapshot(doc(db, 'call_sessions', callId), (snap) => {

    callback(snap.exists() ? (snap.data() as CallSessionData) : null);

  });

}



export async function updateCallSession(callId: string, patch: Partial<CallSessionData>) {

  await ensureFirebaseAuth();

  await updateDoc(doc(db, 'call_sessions', callId), patch);

}



export async function inviteParticipantToCall(callId: string, userId: string): Promise<void> {

  await ensureFirebaseAuth();

  await updateDoc(doc(db, 'call_sessions', callId), {

    invitedUserIds: arrayUnion(normalizeUserId(userId)),

    participants: arrayUnion(normalizeUserId(userId)),

  });

}



export async function rejectCall(callId: string) {

  await updateCallSession(callId, { status: 'rejected', endedAt: Date.now() });

}



export async function markCallMissed(callId: string) {

  await updateCallSession(callId, { status: 'missed', endedAt: Date.now() });

}


