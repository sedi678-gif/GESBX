import { NextRequest, NextResponse } from 'next/server';
import { randomBytes, randomInt, createCipheriv } from 'node:crypto';
import { getAdminAuth, getAdminFirestore } from '@/services/firebaseAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TOKEN_TTL_SEC = 3600;
const PROJECT_APP_ID = Number(process.env.ZEGO_APP_ID || process.env.NEXT_PUBLIC_ZEGO_APP_ID || 0);
const SERVER_SECRET = String(process.env.ZEGO_SERVER_SECRET || '').trim();

function strictZegoUserId(raw: string): string {
  const source = String(raw || '').trim();
  let value = source.replace(/[^a-zA-Z0-9_]/g, '');
  if (!value) {
    let hash = 5381;
    for (const char of source || 'u') hash = (Math.imul(hash, 33) ^ char.charCodeAt(0)) >>> 0;
    value = `u${hash.toString(16)}`;
  }
  return value.slice(0, 32);
}

function pack(value: Buffer): Buffer {
  const length = Buffer.alloc(2);
  length.writeUInt16BE(value.length);
  return Buffer.concat([length, value]);
}

function makeZegoToken(userId: string, roomId: string): string {
  if (Buffer.byteLength(SERVER_SECRET, 'utf8') !== 32) {
    throw new Error('ZEGO_SERVER_SECRET must be exactly 32 bytes.');
  }
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + TOKEN_TTL_SEC;
  const payload = {
    app_id: PROJECT_APP_ID,
    user_id: userId,
    nonce: randomInt(1, 2147483647),
    ctime: now,
    expire: expiresAt,
    payload: JSON.stringify({ room_id: roomId }),
  };
  const iv = randomBytes(16);
  const cipher = createCipheriv('aes-256-cbc', Buffer.from(SERVER_SECRET, 'utf8'), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final()]);
  const expiry = Buffer.alloc(8);
  expiry.writeBigInt64BE(BigInt(expiresAt));
  return `04${Buffer.concat([expiry, pack(iv), pack(encrypted)]).toString('base64')}`;
}

export async function POST(request: NextRequest) {
  try {
    if (!Number.isInteger(PROJECT_APP_ID) || PROJECT_APP_ID <= 0 || PROJECT_APP_ID > 0xffffffff) {
      return NextResponse.json({ error: 'zego_app_id_not_configured' }, { status: 503 });
    }
    if (Buffer.byteLength(SERVER_SECRET, 'utf8') !== 32) {
      return NextResponse.json({ error: 'zego_server_secret_not_configured' }, { status: 503 });
    }

    const authorization = request.headers.get('authorization') || '';
    const match = authorization.match(/^Bearer\\s+(.+)$/i);
    if (!match) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

    const decoded = await getAdminAuth().verifyIdToken(match[1]);
    const body = await request.json().catch(() => ({}));
    const requestedUserId = String(body?.userId || '').trim();
    const roomId = String(body?.roomId || '').trim();
    if (!requestedUserId || requestedUserId.length > 120 || !roomId || roomId.length > 64) {
      return NextResponse.json({ error: 'invalid_user_or_room' }, { status: 400 });
    }

    const allowedIds = new Set([strictZegoUserId(decoded.uid)]);
    const profiles = await getAdminFirestore()
      .collection('users')
      .where('firebaseUid', '==', decoded.uid)
      .limit(10)
      .get();
    profiles.forEach((profile) => allowedIds.add(strictZegoUserId(profile.id)));
    if (!allowedIds.has(strictZegoUserId(requestedUserId))) {
      return NextResponse.json({ error: 'user_id_not_linked_to_account' }, { status: 403 });
    }

    const token = makeZegoToken(strictZegoUserId(requestedUserId), roomId);
    return NextResponse.json({ token, appId: PROJECT_APP_ID, expireSec: TOKEN_TTL_SEC }, {
      headers: { 'Cache-Control': 'no-store, private' },
    });
  } catch (error) {
    console.error('[ZEGO token API]', error);
    const message = error instanceof Error ? error.message : 'token_generation_failed';
    const status = /auth|token|credential/i.test(message) ? 401 : 500;
    return NextResponse.json({ error: status === 401 ? 'unauthorized' : 'token_generation_failed' }, { status });
  }
}
