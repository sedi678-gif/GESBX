/**

 * Zəng vəziyyəti sinxronizasiyası (Firebase)

 */

import {

  createCallSession,

  updateCallSession,

  markCallMissed,

  rejectCall as firebaseRejectCall,

  CallType,

} from './callService';



export async function syncCallActive(callId: string): Promise<void> {

  await updateCallSession(callId, { status: 'active' });

}



export async function syncCallEnded(callId: string, status: 'ended' | 'rejected' | 'missed' = 'ended'): Promise<void> {

  await updateCallSession(callId, { status, endedAt: Date.now() });

}



export async function bootstrapCallSession(params: {

  callId: string;

  chatId: string;

  callerId: string;

  calleeId: string;

  callType: CallType;

  callerName?: string;

  callerAvatar?: string;

}): Promise<void> {

  await createCallSession(params);

}



export { markCallMissed, firebaseRejectCall as rejectCallSession };


