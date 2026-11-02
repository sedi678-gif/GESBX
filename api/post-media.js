const {
  applyCors,
  getAdminFirestore,
  sendJson,
} = require('../services/apiSecurity');

const POST_ID_PATTERN = /^[A-Za-z0-9_-]{1,150}$/;
const MAX_MEDIA_CHUNKS = 64;
const CONTENT_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/webp',
  'video/mp4', 'video/webm', 'video/quicktime',
]);

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

    const chunksSnap = await db.collection(`posts/${postId}/media`).orderBy('index', 'asc').get();
    if (chunksSnap.empty || chunksSnap.size > MAX_MEDIA_CHUNKS) {
      return sendJson(res, 404, { error: 'MEDIA_NOT_FOUND' });
    }

    const first = chunksSnap.docs[0].data();
    const contentType = String(first.contentType || '');
    const chunkCount = Number(first.chunkCount);
    if (!CONTENT_TYPES.has(contentType) || chunkCount !== chunksSnap.size) {
      return sendJson(res, 500, { error: 'MEDIA_INVALID' });
    }

    const buffers = [];
    let totalBytes = 0;
    for (let index = 0; index < chunksSnap.docs.length; index++) {
      const chunk = chunksSnap.docs[index].data();
      if (Number(chunk.index) !== index
        || Number(chunk.chunkCount) !== chunkCount
        || chunk.contentType !== contentType
        || chunk.ownerId !== postSnap.data()?.userId
        || typeof chunk.data !== 'string') {
        return sendJson(res, 500, { error: 'MEDIA_INVALID' });
      }
      const buffer = Buffer.from(chunk.data, 'base64');
      buffers.push(buffer);
      totalBytes += buffer.length;
    }

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', 'inline');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
    const media = Buffer.concat(buffers, totalBytes);
    const rangeHeader = String(req.headers.range || '');
    const rangeMatch = rangeHeader.match(/^bytes=(\d*)-(\d*)$/);
    if (!rangeHeader) {
      res.setHeader('Content-Length', String(totalBytes));
      return res.status(200).end(media);
    }
    if (!rangeMatch || (!rangeMatch[1] && !rangeMatch[2])) {
      res.setHeader('Content-Range', `bytes */${totalBytes}`);
      return res.status(416).end();
    }
    let start = rangeMatch[1] ? Number(rangeMatch[1]) : Math.max(0, totalBytes - Number(rangeMatch[2]));
    let end = rangeMatch[2] && rangeMatch[1] ? Number(rangeMatch[2]) : totalBytes - 1;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start || start >= totalBytes) {
      res.setHeader('Content-Range', `bytes */${totalBytes}`);
      return res.status(416).end();
    }
    end = Math.min(end, totalBytes - 1);
    const partial = media.subarray(start, end + 1);
    res.setHeader('Content-Length', String(partial.length));
    res.setHeader('Content-Range', `bytes ${start}-${end}/${totalBytes}`);
    res.status(206).end(partial);
  } catch (error) {
    console.error('Post media read failed:', error?.message || error);
    sendJson(res, 500, { error: 'MEDIA_UNAVAILABLE' });
  }
};
