import { FOR_YOU_PAGE_SIZE_DEFAULT, FOR_YOU_PAGE_SIZE_MAX } from './config';
import type { ForYouCursor, ForYouQuery } from './types';

function utf8ToBase64Url(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let bin = '';
  bytes.forEach((b) => {
    bin += String.fromCharCode(b);
  });
  const b64 = typeof btoa === 'function' ? btoa(bin) : Buffer.from(value, 'utf8').toString('base64');
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlToUtf8(value: string): string {
  const b64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
  const raw = b64 + pad;
  if (typeof atob === 'function') {
    const bin = atob(raw);
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }
  return Buffer.from(raw, 'base64').toString('utf8');
}

export function parseForYouLimit(raw: unknown): number {
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n) || n <= 0) return FOR_YOU_PAGE_SIZE_DEFAULT;
  return Math.min(FOR_YOU_PAGE_SIZE_MAX, Math.trunc(n));
}

export function encodeForYouCursor(cursor: ForYouCursor): string {
  return utf8ToBase64Url(JSON.stringify({ s: cursor.score, t: cursor.createdAt, id: cursor.videoId }));
}

export function decodeForYouCursor(raw: unknown): ForYouCursor | null {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  try {
    const parsed = JSON.parse(base64UrlToUtf8(raw.trim())) as { s?: unknown; t?: unknown; id?: unknown };
    const score = Number(parsed.s);
    const createdAt = Number(parsed.t);
    const videoId = typeof parsed.id === 'string' ? parsed.id : '';
    if (!Number.isFinite(score) || !Number.isFinite(createdAt) || !videoId) return null;
    return { score, createdAt, videoId };
  } catch {
    return null;
  }
}

export function parseForYouQuery(query: ForYouQuery): { cursor: ForYouCursor | null; limit: number } {
  return {
    cursor: decodeForYouCursor(query.cursor),
    limit: parseForYouLimit(query.limit),
  };
}

export function isAfterForYouCursor(item: ForYouCursor, cursor: ForYouCursor | null): boolean {
  if (!cursor) return true;
  if (item.score !== cursor.score) return item.score < cursor.score;
  if (item.createdAt !== cursor.createdAt) return item.createdAt < cursor.createdAt;
  return item.videoId < cursor.videoId;
}
