import { CallType } from './callService';

export type CallUiMode = 'incoming' | 'outgoing' | 'connecting' | 'active';

export type CallUiState = {
  mode: CallUiMode;
  callType: CallType;
  peerName: string;
  peerAvatar?: string;
  hint?: string;
  accept?: () => void;
  refuse?: () => void;
  cancel?: () => void;
} | null;

let current: CallUiState = null;
const listeners = new Set<(state: CallUiState) => void>();

export function getCallUiState(): CallUiState {
  return current;
}

export function setCallUiState(next: CallUiState) {
  current = next;
  listeners.forEach((listen) => listen(current));
}

export function patchCallUiState(partial: Partial<Exclude<CallUiState, null>>) {
  if (!current) return;
  setCallUiState({ ...current, ...partial });
}

export function listenCallUiState(callback: (state: CallUiState) => void): () => void {
  listeners.add(callback);
  callback(current);
  return () => {
    listeners.delete(callback);
  };
}

let inviteHandler: (() => void) | null = null;

export function setCallInviteHandler(handler: (() => void) | null) {
  inviteHandler = handler;
}

export function requestCallInvite() {
  inviteHandler?.();
}
