const {
  applyCors,
  getAdminFirestore,
  sendJson,
} = require('../services/apiSecurity');

const POST_ID_PATTERN = /^[A-Za-z0-9_-]{1,150}$/;
const MAX_MEDIA_CHUNKS = 64;
const MEDIA_CHUNK_BYTES = 700 * 1024;
const CONTENT_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/webp',
  'video/mp4', 'video/webm', 'video/quicktime',
]);

function isValidChunk(chunk, index, chunkCount, ownerId, contentType) {
  return Number(chunk.index) === index
    && Number(chunk.chunkCount) === chunkCount
    && chunk.contentType === contentType
    && chunk.ownerId === ownerId
    && typeof chunk.data === 'string';
}

module.exports = async function postMediaHandler(req, res) {
  if (applyCors(req, res, 'GET, OPTIONS')) return;
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, OPTIONS');
    return sendJson(res, 405, { error: 'METHOD_NOT_ALLOWED' });
  }

  const postId = String(req.query?.postId || '').trim();
  if (!POST_ID_PATTERN.test(postId)) return sendJson(res, 400, { error: 'INVALID_POST_ID' });

  try {
    const db = getAdminFirestore();
    const postSnap = await db.doc(`posts/${postId}`).get();
    if (!postSnap.exists || postSnap.data()?.moderationStatus !== 'approved') {
      return sendJson(res, 404, { error: 'MEDIA_NOT_FOUND' });
    }

    const ownerId = String(postSnap.data()?.userId || '');
    // Read only chunk metadata first. The old handler downloaded and joined every
    // video chunk even for a tiny browser Range request made for a preview frame.
    const chunksQuery = db.collection(`posts/${postId}/media`)
      .orderBy('index', 'asc')
      .select('index', 'chunkCount', 'contentType', 'ownerId');
    const metadataSnap = await chunksQuery.get();
    if (metadataSnap.empty || metadataSnap.size > MAX_MEDIA_CHUNKS) {
      return sendJson(res, 404, { error: 'MEDIA_NOT_FOUND' });
    }

    const firstMeta = metadataSnap.docs[0].data();
    const contentType = String(firstMeta.contentType || '');
    const chunkCount = Number(firstMeta.chunkCount);
    if (!CONTENT_TYPES.has(contentType)
      || !Number.isInteger(chunkCount)
      || chunkCount !== metadataSnap.size
      || chunkCount < 1
      || chunkCount > MAX_MEDIA_CHUNKS) {
      return sendJson(res, 500, { error: 'MEDIA_INVALID' });
    }

    for (let index = 0; index < metadataSnap.docs.length; index++) {
      const meta = metadataSnap.docs[index].data();
      if (!isValidChunk({ ...meta, data: 'metadata' }, index, chunkCount, ownerId, contentType)) {
        return sendJson(res, 500, { error: 'MEDIA_INVALID' });
      }
    }

    // Only the final chunk is needed to calculate the exact resource length.
    const chunkCollection = db.collection(`posts/${postId}/media`);
    const lastSnap = await chunkCollection.doc(String(chunkCount - 1).padStart(3, '0')).get();
    if (!lastSnap.exists) return sendJson(res, 500, { error: 'MEDIA_INVALID' });
    const lastChunk = lastSnap.data();
    if (!isValidChunk(lastChunk, chunkCount - 1, chunkCount, ownerId, contentType)) {
      return sendJson(res, 500, { error: 'MEDIA_INVALID' });
    }
    const lastBuffer = Buffer.from(lastChunk.data, 'base64');
    const totalBytes = (chunkCount - 1) * MEDIA_CHUNK_BYTES + lastBuffer.length;
    if (!Number.isSafeInteger(totalBytes) || totalBytes <= 0) {
      return sendJson(res, 500, { error: 'MEDIA_INVALID' });
    }

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', 'inline');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');

    const rangeHeader = String(req.headers.range || '');
    const rangeMatch = rangeHeader.match(/^bytes=(\d*)-(\d*)$/);
    let start = 0;
    let end = totalBytes - 1;
    if (rangeHeader) {
      if (!rangeMatch || (!rangeMatch[1] && !rangeMatch[2])) {
        res.setHeader('Content-Range', `bytes */${totalBytes}`);
        return res.status(416).end();
      }
      start = rangeMatch[1]
        ? Number(rangeMatch[1])
        : Math.max(0, totalBytes - Number(rangeMatch[2]));
      end = rangeMatch[2] && rangeMatch[1] ? Number(rangeMatch[2]) : totalBytes - 1;
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end)
        || start < 0 || end < start || start >= totalBytes) {
        res.setHeader('Content-Range', `bytes */${totalBytes}`);
        return res.status(416).end();
      }
      end = Math.min(end, totalBytes - 1);
    }

    const firstChunkIndex = Math.floor(start / MEDIA_CHUNK_BYTES);
    const lastChunkIndex = Math.floor(end / MEDIA_CHUNK_BYTES);
    const buffers = [];
    for (let index = firstChunkIndex; index <= lastChunkIndex; index++) {
      const chunkSnap = index === chunkCount - 1
        ? lastSnap
        : await chunkCollection.doc(String(index).padStart(3, '0')).get();
      if (!chunkSnap.exists) return sendJson(res, 500, { error: 'MEDIA_INVALID' });
      const chunk = chunkSnap.data();
      if (!isValidChunk(chunk, index, chunkCount, ownerId, contentType)) {
        return sendJson(res, 500, { error: 'MEDIA_INVALID' });
      }
      buffers.push(Buffer.from(chunk.data, 'base64'));
    }

    const joined = Buffer.concat(buffers);
    const localStart = start - firstChunkIndex * MEDIA_CHUNK_BYTES;
    const partial = joined.subarray(localStart, localStart + (end - start + 1));
    if (rangeHeader) {
      res.setHeader('Content-Length', String(partial.length));
      res.setHeader('Content-Range', `bytes ${start}-${end}/${totalBytes}`);
      return res.status(206).end(partial);
    }
    res.setHeader('Content-Length', String(totalBytes));
    return res.status(200).end(partial);
  } catch (error) {
    console.error('Post media read failed:', error?.message || error);
    sendJson(res, 500, { error: 'MEDIA_UNAVAILABLE' });
  }
};
