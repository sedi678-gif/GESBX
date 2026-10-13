/** Zego userID / roomID: yalnız ASCII hərf, rəqəm və `_`, userID max 32 byte. */

const STRICT_ID = /[^a-zA-Z0-9_]/g;
const USER_ID_MAX = 32;
const ROOM_ID_MAX = 64;

function hashAscii(input: string): string {
  let h = 5381;
  for (let i = 0; i < input.length; i += 1) {
    h = (Math.imul(h, 33) ^ input.charCodeAt(i)) >>> 0;
  }
  return h.toString(16);
}

function toStrictId(raw: string, fallbackPrefix: 'u' | 'r', max: number): string {
  const src = String(raw ?? '').trim();
  const cleaned = src.replace(STRICT_ID, '');
  const body = cleaned || `${fallbackPrefix}${hashAscii(src || fallbackPrefix)}`;
  const id = body.replace(STRICT_ID, '');
  if (!id) return `${fallbackPrefix}unknown`.slice(0, max);
  return id.slice(0, max);
}

export function toZegoUserId(appUserId: string): string {
  return toStrictId(appUserId, 'u', USER_ID_MAX);
}

export function toZegoRoomId(rawRoomId: string, prefix = ''): string {
  const p = String(prefix ?? '').replace(STRICT_ID, '');
  const body = toStrictId(rawRoomId, 'r', ROOM_ID_MAX);
  return `${p}${body}`.replace(STRICT_ID, '').slice(0, ROOM_ID_MAX);
}

export function toZegoUserName(displayName: string, userId: string): string {
  const name = String(displayName ?? '').trim();
  if (name) return name.slice(0, 256);
  return `user_${toZegoUserId(userId)}`;
}
