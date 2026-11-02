const {
  ApiError,
  applyCors,
  getAdminFirestore,
  sha256,
  sendJson,
  verifySecureRequest,
} = require('../services/apiSecurity');

const ADMIN_PROFILE_ID = '92';
const POST_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const MAX_CHUNKS = 64;
const MAX_CHUNK_BASE64_CHARS = 980_000;
const MAX_REVIEW_CHUNKS_PER_REQUEST = 4;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_VIDEO_BYTES = 25 * 1024 * 1024;
const ALLOWED_CONTENT_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/webp',
  'video/mp4', 'video/webm', 'video/quicktime',
]);

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function assertExactKeys(payload, expected) {
  const actual = Object.keys(payload).sort();
  const sortedExpected = [...expected].sort();
  if (actual.length !== sortedExpected.length
    || actual.some((key, index) => key !== sortedExpected[index])) {
    throw new ApiError(400, 'INVALID_REQUEST');
  }
}

async function assertSuperAdmin(db, uid) {
  const adminSnap = await db.doc(`users/${ADMIN_PROFILE_ID}`).get();
  const admin = adminSnap.data() || {};
  if (!adminSnap.exists || admin.firebaseUid !== uid
    || (admin.role !== 'super_admin' && admin.isAdmin !== true)) {
    throw new ApiError(403, 'ADMIN_REVIEW_FORBIDDEN');
  }
}

function base64Bytes(value) {
  if (typeof value !== 'string' || !value.length || value.length > MAX_CHUNK_BASE64_CHARS
    || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    throw new ApiError(409, 'MEDIA_INVALID');
  }
  const bytes = Buffer.from(value, 'base64');
  if (bytes.toString('base64') !== value) throw new ApiError(409, 'MEDIA_INVALID');
  return bytes;
}

function validateCompleteMedia(post, chunkDocs) {
  if (!Array.isArray(chunkDocs) || !chunkDocs.length || chunkDocs.length > MAX_CHUNKS) {
    throw new ApiError(409, 'MEDIA_INCOMPLETE');
  }

  const first = chunkDocs[0].data();
  const chunkCount = Number(first.chunkCount);
  const contentType = String(first.contentType || '');
  if (!Number.isInteger(chunkCount) || chunkCount < 1 || chunkCount > MAX_CHUNKS
    || chunkCount !== chunkDocs.length || !ALLOWED_CONTENT_TYPES.has(contentType)) {
    throw new ApiError(409, 'MEDIA_INCOMPLETE');
  }

  const expectedMediaType = contentType.startsWith('image/') ? 'image' : 'video';
  if (post.mediaType !== expectedMediaType) throw new ApiError(409, 'MEDIA_INVALID');

  let totalBytes = 0;
  const parts = [];
  for (let index = 0; index < chunkDocs.length; index += 1) {
    const snapshot = chunkDocs[index];
    const chunk = snapshot.data() || {};
    if (snapshot.id !== String(index).padStart(3, '0')
      || Number(chunk.index) !== index
      || Number(chunk.chunkCount) !== chunkCount
      || chunk.contentType !== contentType
      || chunk.ownerId !== post.userId) {
      throw new ApiError(409, 'MEDIA_INVALID');
    }
    const bytes = base64Bytes(chunk.data);
    totalBytes += bytes.length;
    if (bytes.length > 700 * 1024) throw new ApiError(409, 'MEDIA_INVALID');
    parts.push(bytes);
  }

  const maxBytes = expectedMediaType === 'image' ? MAX_IMAGE_BYTES : MAX_VIDEO_BYTES;
  if (totalBytes <= 0 || totalBytes > maxBytes) throw new ApiError(409, 'MEDIA_TOO_LARGE');

  const header = Buffer.concat(parts).subarray(0, 12);
  const isJpeg = contentType === 'image/jpeg' && header.length >= 3
    && header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff;
  const isPng = contentType === 'image/png' && header.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const isWebp = contentType === 'image/webp' && header.toString('ascii', 0, 4) === 'RIFF'
    && header.toString('ascii', 8, 12) === 'WEBP';
  const isMp4 = ['video/mp4', 'video/quicktime'].includes(contentType)
    && header.toString('ascii', 4, 8) === 'ftyp';
  const isWebm = contentType === 'video/webm' && header.length >= 4
    && header[0] === 0x1a && header[1] === 0x45 && header[2] === 0xdf && header[3] === 0xa3;
  if (!(isJpeg || isPng || isWebp || isMp4 || isWebm)) {
    throw new ApiError(409, 'MEDIA_INVALID');
  }

  return { chunkCount, contentType, totalBytes };
}

function toPendingPost(snapshot, chunkCount) {
  const data = snapshot.data() || {};
  return {
    id: snapshot.id,
    userId: String(data.userId || ''),
    userName: String(data.userName || 'İstifadəçi'),
    title: String(data.title || ''),
    mediaType: data.mediaType === 'video' ? 'video' : 'image',
    createdAt: Number(data.createdAt) || 0,
    expiresAt: Number(data.expiresAt) || 0,
    chunkCount,
  };
}

async function listPendingPosts(db) {
  const snap = await db.collection('posts')
    .where('moderationStatus', '==', 'pending')
    .limit(100)
    .get();
  const now = Date.now();
  const rows = snap.docs
    .map((doc) => ({ doc, data: doc.data() || {} }))
    .filter(({ data }) => Number(data.expiresAt) > now)
    .sort((a, b) => Number(b.data.createdAt || 0) - Number(a.data.createdAt || 0))
    .slice(0, 50);

  return Promise.all(rows.map(async ({ doc }) => {
    const firstChunk = await db.doc(`posts/${doc.id}/media/000`).get();
    const chunkCount = firstChunk.exists ? Number(firstChunk.data()?.chunkCount) || 0 : 0;
    return toPendingPost(doc, chunkCount);
  }));
}

async function readPostMediaGroup(db, postId, startIndex, requestedCount) {
  const postRef = db.doc(`posts/${postId}`);
  const postSnap = await postRef.get();
  if (!postSnap.exists) throw new ApiError(404, 'POST_NOT_FOUND');
  const post = postSnap.data() || {};
  if (post.moderationStatus !== 'pending') throw new ApiError(409, 'POST_NOT_PENDING');

  const firstChunkSnap = await db.doc(`posts/${postId}/media/000`).get();
  if (!firstChunkSnap.exists) throw new ApiError(409, 'MEDIA_INCOMPLETE');
  const firstChunk = firstChunkSnap.data() || {};
  const chunkCount = Number(firstChunk.chunkCount);
  const contentType = String(firstChunk.contentType || '');
  if (!Number.isInteger(chunkCount) || chunkCount < 1 || chunkCount > MAX_CHUNKS
    || !ALLOWED_CONTENT_TYPES.has(contentType)
    || startIndex + requestedCount > chunkCount) {
    throw new ApiError(409, 'MEDIA_INCOMPLETE');
  }

  const indexes = Array.from({ length: requestedCount }, (_, offset) => startIndex + offset);
  const snapshots = await Promise.all(indexes.map((index) => db
    .doc(`posts/${postId}/media/${String(index).padStart(3, '0')}`).get()));
  const chunks = snapshots.map((snapshot, offset) => {
    if (!snapshot.exists) throw new ApiError(409, 'MEDIA_INCOMPLETE');
    const chunk = snapshot.data() || {};
    const index = indexes[offset];
    if (Number(chunk.index) !== index || Number(chunk.chunkCount) !== chunkCount
      || chunk.contentType !== contentType || chunk.ownerId !== post.userId) {
      throw new ApiError(409, 'MEDIA_INVALID');
    }
    base64Bytes(chunk.data);
    return { index, data: chunk.data };
  });
  return { contentType, chunkCount, chunks };
}

async function decidePost(db, postId, decision) {
  const postRef = db.doc(`posts/${postId}`);
  const mediaQuery = db.collection(`posts/${postId}/media`).orderBy('index', 'asc');
  return db.runTransaction(async (transaction) => {
    const [postSnap, chunksSnap] = await Promise.all([
      transaction.get(postRef),
      transaction.get(mediaQuery),
    ]);
    if (!postSnap.exists) throw new ApiError(404, 'POST_NOT_FOUND');
    const post = postSnap.data() || {};
    if (post.moderationStatus !== 'pending') throw new ApiError(409, 'POST_NOT_PENDING');
    const media = validateCompleteMedia(post, chunksSnap.docs);
    const now = Date.now();
    transaction.update(postRef, {
      moderationStatus: decision === 'approve' ? 'approved' : 'rejected',
      moderationProvider: 'manual-admin',
      moderationAdminId: ADMIN_PROFILE_ID,
      moderatedAt: now,
      mediaUrl: `/api/post-media?postId=${encodeURIComponent(postId)}`,
      mediaType: media.contentType.startsWith('video/') ? 'video' : 'image',
    });
    return { id: postId, status: decision === 'approve' ? 'approved' : 'rejected' };
  });
}

async function recordAdminSession(db, identity, displayName, active) {
  const operationId = sha256(`${identity.uid}:adminModeratePost:${identity.operationId}`).slice(0, 40);
  const operationRef = db.doc(`operation_ledger/${operationId}`);
  const commandRef = db.doc(`admin_commands/${operationId}`);
  const sessionRef = db.doc(`admin_sessions/${ADMIN_PROFILE_ID}`);
  const now = Date.now();
  const result = { active };
  await db.runTransaction(async (transaction) => {
    const [operationSnap, sessionSnap] = await Promise.all([
      transaction.get(operationRef),
      transaction.get(sessionRef),
    ]);
    if (operationSnap.exists) return;
    transaction.set(sessionRef, {
      adminId: ADMIN_PROFILE_ID,
      adminUid: identity.uid,
      displayName,
      active,
      ...(active ? { lastLoginAt: now } : { lastLogoutAt: now }),
    }, { merge: true });
    transaction.create(commandRef, {
      adminId: ADMIN_PROFILE_ID,
      adminUid: identity.uid,
      action: active ? 'admin_login' : 'admin_logout',
      details: { displayName },
      createdAt: now,
      wasActive: sessionSnap.exists && sessionSnap.data()?.active === true,
    });
    transaction.create(operationRef, {
      authUid: identity.uid,
      operationId: identity.operationId,
      action: 'recordAdminSession',
      result,
      createdAt: now,
    });
  });
  return result;
}

function isConfiguredAdminUid(uid) {
  const configured = [process.env.ADMIN_FIREBASE_UIDS, process.env.ADMIN_UIDS]
    .filter(Boolean)
    .join(',')
    .split(/[\s,]+/)
    .map((value) => value.trim())
    .filter(Boolean);
  return configured.includes(uid);
}

async function bootstrapOrRecordAdmin(db, identity, displayName) {
  const operationId = sha256(`${identity.uid}:bootstrapAdminPanel:${identity.operationId}`).slice(0, 40);
  const operationRef = db.doc(`operation_ledger/${operationId}`);
  const commandRef = db.doc(`admin_commands/${operationId}`);
  const userRef = db.doc(`users/${ADMIN_PROFILE_ID}`);
  const playerRef = db.doc(`players/${ADMIN_PROFILE_ID}`);
  const sessionRef = db.doc(`admin_sessions/${ADMIN_PROFILE_ID}`);
  const now = Date.now();
  const result = { userId: ADMIN_PROFILE_ID, active: true };

  await db.runTransaction(async (transaction) => {
    const [operationSnap, userSnap, playerSnap, sessionSnap] = await Promise.all([
      transaction.get(operationRef),
      transaction.get(userRef),
      transaction.get(playerRef),
      transaction.get(sessionRef),
    ]);
    if (operationSnap.exists) return;
    if (!userSnap.exists || userSnap.data()?.firebaseUid !== identity.uid) {
      throw new ApiError(403, 'ADMIN_PROFILE_NOT_BOUND');
    }
    const user = userSnap.data() || {};
    const alreadyAdmin = user.role === 'super_admin' || user.isAdmin === true;
    const player = playerSnap.data() || {};
    if (playerSnap.exists && player.firebaseUid && player.firebaseUid !== identity.uid) {
      throw new ApiError(403, 'ADMIN_PROFILE_NOT_BOUND');
    }
    if (!alreadyAdmin && !isConfiguredAdminUid(identity.uid)) {
      throw new ApiError(503, 'ADMIN_BOOTSTRAP_NOT_CONFIGURED');
    }

    if (!alreadyAdmin) {
      transaction.set(userRef, {
        id: ADMIN_PROFILE_ID,
        role: 'super_admin',
        isAdmin: true,
        isModerator: true,
        canViewReports: true,
        canAccessAdminPanel: true,
        firebaseUid: identity.uid,
        updatedAt: now,
      }, { merge: true });
      if (playerSnap.exists && !player.firebaseUid) {
        transaction.set(playerRef, { firebaseUid: identity.uid, updatedAt: now }, { merge: true });
      }
    }
    transaction.set(sessionRef, {
      adminId: ADMIN_PROFILE_ID,
      adminUid: identity.uid,
      displayName,
      active: true,
      lastLoginAt: now,
    }, { merge: true });
    transaction.create(commandRef, {
      adminId: ADMIN_PROFILE_ID,
      adminUid: identity.uid,
      action: alreadyAdmin ? 'admin_login' : 'bootstrap_super_admin',
      details: { displayName },
      createdAt: now,
      wasActive: sessionSnap.exists && sessionSnap.data()?.active === true,
    });
    transaction.create(operationRef, {
      authUid: identity.uid,
      operationId: identity.operationId,
      action: 'bootstrapAdminPanel',
      result,
      createdAt: now,
    });
  });
  return result;
}

module.exports = async function adminModeratePostHandler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return sendJson(res, 405, { error: 'METHOD_NOT_ALLOWED' });
  }

  try {
    const payload = isPlainObject(req.body) ? req.body : {};
    const identity = await verifySecureRequest(req, 'adminModeratePost', payload, {
      requireIdempotency: true,
      uidLimit: { max: 100, windowMs: 60_000 },
    });
    const db = getAdminFirestore();
    if (payload.action === 'bootstrap') {
      assertExactKeys(payload, ['action', 'displayName']);
      const displayName = String(payload.displayName || '').trim();
      if (!displayName || displayName.length > 100) throw new ApiError(400, 'INVALID_REQUEST');
      return sendJson(res, 200, await bootstrapOrRecordAdmin(db, identity, displayName));
    }
    await assertSuperAdmin(db, identity.uid);

    if (payload.action === 'session') {
      assertExactKeys(payload, ['action', 'displayName', 'active']);
      const displayName = String(payload.displayName || '').trim();
      if (typeof payload.active !== 'boolean' || !displayName || displayName.length > 100) {
        throw new ApiError(400, 'INVALID_REQUEST');
      }
      return sendJson(res, 200, await recordAdminSession(db, identity, displayName, payload.active));
    }
    if (payload.action === 'list') {
      assertExactKeys(payload, ['action']);
      return sendJson(res, 200, { posts: await listPendingPosts(db) });
    }
    if (payload.action === 'media') {
      assertExactKeys(payload, ['action', 'postId', 'startIndex', 'count']);
      const postId = String(payload.postId || '');
      const startIndex = Number(payload.startIndex);
      const count = Number(payload.count);
      if (!POST_ID_PATTERN.test(postId) || !Number.isInteger(startIndex) || startIndex < 0
        || !Number.isInteger(count) || count < 1 || count > MAX_REVIEW_CHUNKS_PER_REQUEST) {
        throw new ApiError(400, 'INVALID_REQUEST');
      }
      return sendJson(res, 200, await readPostMediaGroup(db, postId, startIndex, count));
    }
    if (payload.action === 'decide') {
      assertExactKeys(payload, ['action', 'postId', 'decision']);
      const postId = String(payload.postId || '');
      if (!POST_ID_PATTERN.test(postId) || !['approve', 'reject'].includes(payload.decision)) {
        throw new ApiError(400, 'INVALID_REQUEST');
      }
      return sendJson(res, 200, await decidePost(db, postId, payload.decision));
    }
    throw new ApiError(400, 'INVALID_REQUEST');
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 500;
    const knownCodes = new Set([
      'AUTH_HEADERS_REQUIRED', 'AUTH_TOKEN_INVALID', 'APP_CHECK_INVALID',
      'APP_CHECK_PROJECT_MISMATCH', 'AUTH_OR_APP_CHECK_REQUIRED',
      'FIREBASE_SERVICE_ACCOUNT_MISSING', 'FIREBASE_SERVICE_ACCOUNT_INVALID',
      'FIREBASE_SERVICE_ACCOUNT_PROJECT_MISMATCH', 'FIREBASE_AUTH_VERIFIER_UNAVAILABLE',
      'ADMIN_PROFILE_NOT_BOUND', 'ADMIN_BOOTSTRAP_NOT_CONFIGURED',
      'PLAY_INTEGRITY_REQUIRED', 'PLAY_INTEGRITY_NOT_CONFIGURED', 'PLAY_INTEGRITY_REJECTED',
      'PLAY_INTEGRITY_UNAVAILABLE', 'RATE_LIMITED', 'SECURITY_CONFIGURATION_MISSING',
      'INVALID_REQUEST', 'ADMIN_REVIEW_FORBIDDEN', 'POST_NOT_FOUND', 'POST_NOT_PENDING',
      'MEDIA_INCOMPLETE', 'MEDIA_INVALID', 'MEDIA_TOO_LARGE',
    ]);
    const code = knownCodes.has(error.code) ? error.code : 'POST_MODERATION_UNAVAILABLE';
    if (status >= 500) console.error('admin-moderate-post failed:', error.message);
    return sendJson(res, status, { error: code });
  }
};
