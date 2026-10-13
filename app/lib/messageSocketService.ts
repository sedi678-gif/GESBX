import { connectAppSocket, getAppSocket, isAppSocketConnected } from './appSocketHub';



export {

  connectAppSocket,

  getAppSocket as getMessageSocket,

  isAppSocketConnected,

  getAppSocket,

  connectAppSocket as connectMessageSocket,

} from './appSocketHub';



import type { StoredMessage } from './messageService';



export function emitChatMessage(recipientId: string, message: StoredMessage): void {

  const s = getAppSocket();

  if (!s) return;

  s.emit('chat:message', { recipientId: String(recipientId), message });

  s.emit('send_message', { recipientId: String(recipientId), message });

}



function bindEvent<T>(event: string, handler: (payload: T) => void): () => void {

  const s = getAppSocket();

  if (!s) return () => undefined;

  const fn = (payload: T) => handler(payload);

  s.on(event, fn);

  return () => s.off(event, fn);

}



export function onChatMessage(handler: (message: StoredMessage) => void): () => void {

  return bindEvent('chat:message', handler);

}



export function onChatError(handler: (payload: { message: string }) => void): () => void {

  return bindEvent('error_message', handler);

}



export function onUserStatusChange(

  handler: (payload: { userId: string; isOnline: boolean }) => void

): () => void {

  return bindEvent('user_status_change', handler);

}



export function emitChatDelete(

  recipientId: string,

  payload: { chatId: string; messageId: string }

): void {

  getAppSocket()?.emit('chat:delete', { recipientId: String(recipientId), ...payload });

}



export function onChatDelete(

  handler: (payload: { chatId: string; messageId: string }) => void

): () => void {

  return bindEvent('chat:delete', handler);

}



export function emitChatClear(recipientId: string, payload: { chatId: string }): void {

  getAppSocket()?.emit('chat:clear', { recipientId: String(recipientId), ...payload });

}



export function onChatClear(handler: (payload: { chatId: string }) => void): () => void {

  return bindEvent('chat:clear', handler);

}



export function emitChatEdit(

  recipientId: string,

  payload: { chatId: string; messageId: string; text: string; editedAt: number }

): void {

  getAppSocket()?.emit('chat:edit', { recipientId: String(recipientId), ...payload });

}



export function onChatEdit(

  handler: (payload: { chatId: string; messageId: string; text: string; editedAt: number }) => void

): () => void {

  return bindEvent('chat:edit', handler);

}


