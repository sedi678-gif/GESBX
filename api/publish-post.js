const {
  ApiError,
  applyCors,
  getAdminFirestore,
  sendJson,
  verifySecureRequest,
} = require('../services/apiSecurity');

const POST_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const USER_ID_PATTERN = /^\d{1,20}$/;
const MAX_CHUNKS = 64;
const MAX_CHUNK_BYTES = 700 * 1024;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_VIDEO_BYTES = 25 * 1024 * 1024;
const CONTENT_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/webp',
  'video/mp4', 'video/webm', 'video/quicktime',
]);

function assertExactKeys(payload, expected) {
  const actual = Object.keys(payload).sort();
  const sorted = [...expected].sort();
  if (actual.length !== sorted.length || actual.some((key, index) => key !== sorted[index])) {
    throw new ApiError(400, 'INVALID_REQUEST');
  }
}

function validateCompleteMedia(post, chunkDocs) {
  if (!chunkDocs.length || chunkDocs.length > MAX_CHUNKS) {
    throw new ApiError(409, 'MEDIA_INCOMPLETE');
  }

  const first = chunkDocs[0].data() || {};
  const chunkCount = Number(first.chunkCount);
  const contentType = String(first.contentType || '');
  if (!Number.isInteger(chunkCount) || chunkCount < 1 || chunkCount > MAX_CHUNKS
    || chunkCount !== chunkDocs.length || !CONTENT_TYPES.has(contentType)) {
    throw new ApiError(409, 'MEDIA_INCOMPLETE');
  }

  const expectedType = contentType.startsWith('image/') ? 'image' : 'video';
  if (post.mediaType !== expectedType) throw new ApiError(409, 'MEDIA_INVALID');

  const parts = [];
  let totalBytes = 0;
  for (let index = 0; index < chunkDocs.length; index += 1) {
    const snapshot = chunkDocs[index];
    const chunk = snapshot.data() || {};
    if (snapshot.id !== String(index).padStart(3, '0')
      || Number(chunk.index) !== index
      || Number(chunk.chunkCount) !== chunkCount
      || chunk.contentType !== contentType
      || chunk.ownerId !== post.userId
      || typeof chunk.data !== 'string') {
      throw new ApiError(409, 'MEDIA_INVALID');
    }

    const bytes = Buffer.from(chunk.data, 'base64');
    if (!bytes.length || bytes.toString('base64') !== chunk.data || bytes.length > MAX_CHUNK_BYTES) {
      throw new ApiError(409, 'MEDIA_INVALID');
    }
    totalBytes += bytes.length;
    parts.push(bytes);
  }

  const maxBytes = expectedType === 'image' ? MAX_IMAGE_BYTES : MAX_VIDEO_BYTES;
  if (totalBytes <= 0 || totalBytes > maxBytes) throw new ApiError(409, 'MEDIA_TOO_LARGE');

  const header = Buffer.concat(parts).subarray(0, 12);
  const isJpeg = contentType === 'image/jpeg' && header.length >= 3
    && header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff;
  const isPng = contentType === 'image/png'
    && header.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const isWebp = contentType === 'image/webp'
    && header.toString('ascii', 0, 4) === 'RIFF'
    && header.toString('ascii', 8, 12) === 'WEBP';
  const isMp4 = ['video/mp4', 'video/quicktime'].includes(contentType)
    && header.toString('ascii', 4, 8) === 'ftyp';
  const isWebm = contentType === 'video/webm'
    && header.length >= 4 && header[0] === 0x1a && header[1] === 0x45
    && header[2] === 0xdf && header[3] === 0xa3;
  if (!(isJpeg || isPng || isWebp || isMp4 || isWebm)) {
    throw new ApiError(409, 'MEDIA_INVALID');
  }
}

module.exports = async function publishPostHandler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return sendJson(res, 405, { error: 'METHOD_NOT_ALLOWED' });
  }

  try {
    const payload = req.body && typeof req.body === 'object' && !Array.isArray(req.body)
      ? req.body : {};
    assertExactKeys(payload, ['postId', 'userId']);
    const postId = String(payload.postId || '');
    const userId = String(payload.userId || '');
    if (!POST_ID_PATTERN.test(postId) || !USER_ID_PATTERN.test(userId)) {
      throw new ApiError(400, 'INVALID_REQUEST');
    }

    const identity = await verifySecureRequest(req, 'publishPost', payload, {
      requireIdempotency: true,
      uidLimit: { max: 30, windowMs: 60_000 },
    });
    const db = getAdminFirestore();
    const userSnap = await db.doc(`users/${userId}`).get();
    if (!userSnap.exists || userSnap.data()?.firebaseUid !== identity.uid) {
      throw new ApiError(403, 'POST_OWNER_FORBIDDEN');
    }

    const postRef = db.doc(`posts/${postId}`);
    const mediaQuery = db.collection(`posts/${postId}/media`).orderBy('index', 'asc');
    const result = await db.runTransaction(async (transaction) => {
      const [postSnap, chunksSnap] = await Promise.all([
        transaction.get(postRef),
        transaction.get(mediaQuery),
      ]);
      if (!postSnap.exists) throw new ApiError(404, 'POST_NOT_FOUND');
      const post = postSnap.data() || {};
      if (post.userId !== userId) throw new ApiError(403, 'POST_OWNER_FORBIDDEN');
      if (post.moderationStatus === 'approved') return { id: postId, status: 'approved' };
      if (post.moderationStatus !== 'pending') throw new ApiError(409, 'POST_NOT_PENDING');

      validateCompleteMedia(post, chunksSnap.docs);
      transaction.update(postRef, {
        moderationStatus: 'approved',
        moderationProvider: 'verified-owner-publish',
        moderatedAt: Date.now(),
      });
      return { id: postId, status: 'approved' };
    });

    return sendJson(res, 200, result);
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 500;
    const known = new Set([
      'AUTH_HEADERS_REQUIRED', 'AUTH_TOKEN_INVALID', 'APP_CHECK_INVALID',
      'APP_CHECK_PROJECT_MISMATCH', 'AUTH_OR_APP_CHECK_REQUIRED',
      'FIREBASE_SERVICE_ACCOUNT_MISSING', 'FIREBASE_SERVICE_ACCOUNT_INVALID',
      'FIREBASE_SERVICE_ACCOUNT_PROJECT_MISMATCH', 'FIREBASE_AUTH_VERIFIER_UNAVAILABLE',
      'PLAY_INTEGRITY_REQUIRED', 'PLAY_INTEGRITY_NOT_CONFIGURED', 'PLAY_INTEGRITY_REJECTED',
      'PLAY_INTEGRITY_UNAVAILABLE', 'RATE_LIMITED', 'SECURITY_CONFIGURATION_MISSING',
      'INVALID_REQUEST', 'POST_OWNER_FORBIDDEN', 'POST_NOT_FOUND', 'POST_NOT_PENDING',
      'MEDIA_INCOMPLETE', 'MEDIA_INVALID', 'MEDIA_TOO_LARGE',
    ]);
    const code = known.has(error.code) ? error.code : 'POST_PUBLISH_UNAVAILABLE';
    if (status >= 500) console.error('publish-post failed:', error.message);
    return sendJson(res, status, { error: code });
  }
};
