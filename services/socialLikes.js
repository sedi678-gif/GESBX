const {
  ApiError,
  applyCors,
  getAdminAuth,
  getAdminFirestore,
  header,
  sendJson,
} = require('./apiSecurity');

module.exports = async function socialLikes(req, res) {
  if (applyCors(req, res, 'GET, POST, OPTIONS')) return;

  if (req.method === 'GET') {
    try {
      const match = header(req, 'authorization').match(/^Bearer\s+(.+)$/i);
      if (!match) throw new ApiError(401, 'AUTH_REQUIRED');
      let identity;
      try {
        identity = await getAdminAuth().verifyIdToken(match[1], true);
      } catch (error) {
        const code = error?.code || '';
        if (code === 'FIREBASE_SERVICE_ACCOUNT_MISSING'
          || code === 'FIREBASE_SERVICE_ACCOUNT_INVALID'
          || code === 'FIREBASE_SERVICE_ACCOUNT_PROJECT_MISMATCH') throw new ApiError(503, code);
        throw new ApiError(401, 'AUTH_TOKEN_INVALID');
      }
      const publicProfileId = String(req.query?.profileId || '').trim();
      if (!identity?.uid || (identity.firebase?.sign_in_provider === 'anonymous' && !publicProfileId)) {
        throw new ApiError(401, 'REGISTERED_ACCOUNT_REQUIRED');
      }
      const db = getAdminFirestore();
      if (publicProfileId) {
        const [publicProfileSnap, playerProfileSnap] = await Promise.all([
          db.doc(`users/${publicProfileId}`).get(),
          db.doc(`players/${publicProfileId}`).get(),
        ]);
        if (!publicProfileSnap.exists && !playerProfileSnap.exists) throw new ApiError(404, 'PROFILE_NOT_FOUND');
        const raw = publicProfileSnap.exists ? (publicProfileSnap.data() || {}) : {};
        const playerRaw = playerProfileSnap.exists ? (playerProfileSnap.data() || {}) : {};
        const profile = {
          name: String(raw.name || playerRaw.name || ''),
          surname: String(raw.surname || playerRaw.surname || ''),
          handle: String(raw.handle || playerRaw.handle || ''),
          gender: String(raw.gender || playerRaw.gender || ''),
          avatar: String(raw.avatar || raw.photoURL || raw.photoUrl || playerRaw.avatar || playerRaw.photoURL || playerRaw.photoUrl || playerRaw.userAvatar || ''),
          region: String(raw.region || ''),
          bio: String(raw.bio || ''),
          bannerGradient: String(raw.bannerGradient || ''),
          bannerImage: String(raw.bannerImage || ''),
          vipTier: ['gold', 'platinum'].includes(raw.vipTier) ? raw.vipTier : 'none',
          vipExpiresAt: Number(raw.vipExpiresAt) || 0,
          equippedCosmetics: raw.equippedCosmetics || null,
          frozen: Boolean(raw.frozen),
          banned: Boolean(raw.banned),
          likesReceived: Math.max(0, Math.floor(Number(raw.likesReceived) || 0)),
          viewsReceived: Math.max(0, Math.floor(Number(raw.viewsReceived) || 0)),
        };
        return sendJson(res, 200, { profile });
      }

      const profileId = String(req.query?.userId || '').trim();
      const postId = String(req.query?.postId || '').trim();
      if (!profileId || !postId) throw new ApiError(400, 'LIKE_FIELDS_INVALID');
      const profile = await db.doc(`users/${profileId}`).get();
      if (!profile.exists || profile.data().firebaseUid !== identity.uid) {
        throw new ApiError(403, 'PROFILE_ACCOUNT_MISMATCH');
      }
      // Return an explicit zero-state for every comment. This prevents the
      // client from treating a missing map entry as an authoritative unlike
      // when a comment currently has no likes.
      const [commentsSnap, likesSnap] = await Promise.all([
        db.collection('post_comments').where('postId', '==', postId).get(),
        db.collection('post_comment_likes').where('postId', '==', postId).get(),
      ]);
      const likes = {};
      commentsSnap.forEach((item) => {
        likes[item.id] = { count: 0, liked: false };
      });
      likesSnap.forEach((item) => {
        const data = item.data();
        const commentId = String(data.commentId || '');
        if (!commentId) return;
        const entry = likes[commentId] || { count: 0, liked: false };
        entry.count += 1;
        if (data.userId === profileId) entry.liked = true;
        likes[commentId] = entry;
      });
      return sendJson(res, 200, { likes });
    } catch (error) {
      const status = error instanceof ApiError ? error.status : 500;
      const code = error instanceof ApiError ? error.code : 'SOCIAL_LIKE_FAILED';
      if (status >= 500) console.error('Social like read API failed:', error?.message || error);
      return sendJson(res, status, { error: code });
    }
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST, OPTIONS');
    return sendJson(res, 405, { error: 'METHOD_NOT_ALLOWED' });
  }

  try {
    const match = header(req, 'authorization').match(/^Bearer\s+(.+)$/i);
    if (!match) throw new ApiError(401, 'AUTH_REQUIRED');

    let identity;
    try {
      identity = await getAdminAuth().verifyIdToken(match[1], true);
    } catch (error) {
      const code = error?.code || '';
      if (code === 'FIREBASE_SERVICE_ACCOUNT_MISSING'
        || code === 'FIREBASE_SERVICE_ACCOUNT_INVALID'
        || code === 'FIREBASE_SERVICE_ACCOUNT_PROJECT_MISMATCH') {
        throw new ApiError(503, code);
      }
      throw new ApiError(401, 'AUTH_TOKEN_INVALID');
    }
    if (!identity?.uid || identity.firebase?.sign_in_provider === 'anonymous') {
      throw new ApiError(401, 'REGISTERED_ACCOUNT_REQUIRED');
    }

    const body = req.body || {};
    const profileId = String(body.userId || '').trim();
    const kind = String(body.kind || '');
    const targetId = String(body.targetId || '').trim();
    if (!profileId || !['post', 'comment', 'comment-create', 'post-delete', 'comment-edit', 'comment-delete', 'comment-report'].includes(kind)
      || (kind !== 'comment-create' && !targetId)) {
      throw new ApiError(400, 'LIKE_FIELDS_INVALID');
    }

    const db = getAdminFirestore();
    const profile = await db.doc(`users/${profileId}`).get();
    if (!profile.exists || profile.data().firebaseUid !== identity.uid) {
      throw new ApiError(403, 'PROFILE_ACCOUNT_MISMATCH');
    }

    if (kind === 'post-delete') {
      const postRef = db.doc(`posts/${targetId}`);
      const postSnap = await postRef.get();
      if (!postSnap.exists) throw new ApiError(404, 'POST_NOT_FOUND');
      if (String(postSnap.data().userId || '') !== profileId) throw new ApiError(403, 'POST_OWNER_REQUIRED');

      const [commentsSnap, postLikesSnap, commentLikesSnap, mediaSnap] = await Promise.all([
        db.collection('post_comments').where('postId', '==', targetId).get(),
        db.collection('post_likes').where('postId', '==', targetId).get(),
        db.collection('post_comment_likes').where('postId', '==', targetId).get(),
        postRef.collection('media').get(),
      ]);
      const refs = [
        ...commentsSnap.docs.map((item) => item.ref),
        ...postLikesSnap.docs.map((item) => item.ref),
        ...commentLikesSnap.docs.map((item) => item.ref),
        ...mediaSnap.docs.map((item) => item.ref),
        postRef,
      ];
      for (let offset = 0; offset < refs.length; offset += 450) {
        const batch = db.batch();
        refs.slice(offset, offset + 450).forEach((ref) => batch.delete(ref));
        await batch.commit();
      }
      return sendJson(res, 200, { success: true });
    }

    if (kind === 'comment-edit' || kind === 'comment-delete') {
      const commentRef = db.doc(`post_comments/${targetId}`);
      const commentSnap = await commentRef.get();
      if (!commentSnap.exists) throw new ApiError(404, 'COMMENT_NOT_FOUND');
      if (String(commentSnap.data().userId || '') !== profileId) throw new ApiError(403, 'COMMENT_OWNER_REQUIRED');
      if (kind === 'comment-edit') {
        const text = String(body.text || '').trim();
        if (!text || text.length > 500) throw new ApiError(400, 'COMMENT_FIELDS_INVALID');
        await commentRef.update({ text, editedAt: Date.now() });
      } else {
        const [likesSnap, repliesSnap] = await Promise.all([
          db.collection('post_comment_likes').where('commentId', '==', targetId).get(),
          db.collection('post_comments').where('parentCommentId', '==', targetId).get(),
        ]);
        const refs = [...likesSnap.docs.map((item) => item.ref), ...repliesSnap.docs.map((item) => item.ref), commentRef];
        const batch = db.batch();
        refs.forEach((ref) => batch.delete(ref));
        await batch.commit();
      }
      return sendJson(res, 200, { success: true });
    }

    if (kind === 'comment-report') {
      const commentRef = db.doc(`post_comments/${targetId}`);
      const commentSnap = await commentRef.get();
      if (!commentSnap.exists) throw new ApiError(404, 'COMMENT_NOT_FOUND');
      const reason = String(body.reason || '').trim();
      if (!reason || reason.length > 500) throw new ApiError(400, 'REPORT_FIELDS_INVALID');
      await db.collection('reports').add({
        reporterId: profileId,
        targetUserId: String(commentSnap.data().userId || ''),
        targetPostId: String(commentSnap.data().postId || ''),
        targetCommentId: targetId,
        reason,
        type: 'comment',
        createdAt: Date.now(),
        status: 'pending',
      });
      return sendJson(res, 200, { success: true });
    }

    // Şərh və cavabları Admin SDK ilə yaz: mobil/web klientin Firestore
    // yazma icazəsi və köhnə sessiya uyğunsuzluğu şərh göndərilməsini bloklamasın.
    if (kind === 'comment-create') {
      const postId = String(body.postId || '').trim();
      const commentText = String(body.text || '').trim();
      const parentCommentId = String(body.parentCommentId || '').trim();
      if (!postId || !commentText || commentText.length > 500) {
        throw new ApiError(400, 'COMMENT_FIELDS_INVALID');
      }
      const postRef = db.doc(`posts/${postId}`);
      const parentRef = parentCommentId ? db.doc(`post_comments/${parentCommentId}`) : null;
      const commentRef = db.collection('post_comments').doc();
      await db.runTransaction(async (tx) => {
        const postSnap = await tx.get(postRef);
        if (!postSnap.exists) throw new ApiError(404, 'POST_NOT_FOUND');
        if (parentRef) {
          const parentSnap = await tx.get(parentRef);
          if (!parentSnap.exists || String(parentSnap.data().postId || '') !== postId) {
            throw new ApiError(404, 'PARENT_COMMENT_NOT_FOUND');
          }
        }
        tx.create(commentRef, {
          postId,
          userId: profileId,
          userName: String(body.userName || profile.data().name || 'İstifadəçi').trim().slice(0, 100) || 'İstifadəçi',
          userAvatar: String(body.userAvatar || profile.data().avatar || '').slice(0, 2000),
          text: commentText,
          ...(parentCommentId ? { parentCommentId } : {}),
          createdAt: Date.now(),
        });
      });
      return sendJson(res, 200, { success: true, commentId: commentRef.id });
    }

    if (kind === 'post') {
      const result = await db.runTransaction(async (tx) => {
        const postRef = db.doc(`posts/${targetId}`);
        const likeRef = db.doc(`post_likes/${targetId}_${profileId}`);
        const [postSnap, likeSnap] = await Promise.all([tx.get(postRef), tx.get(likeRef)]);
        if (!postSnap.exists) throw new ApiError(404, 'POST_NOT_FOUND');
        const likes = Math.max(0, Number(postSnap.data().likes) || 0);
        if (likeSnap.exists) return { liked: true, likes, alreadyLiked: true };
        tx.create(likeRef, {
          postId: targetId,
          userId: profileId,
          ownerId: String(postSnap.data().userId || ''),
          createdAt: Date.now(),
        });
        tx.update(postRef, { likes: likes + 1, lastLikedBy: profileId });
        return { liked: true, likes: likes + 1, alreadyLiked: false };
      });
      return sendJson(res, 200, result);
    }

    const result = await db.runTransaction(async (tx) => {
      const commentRef = db.doc(`post_comments/${targetId}`);
      const likeRef = db.doc(`post_comment_likes/${targetId}_${profileId}`);
      const [commentSnap, likeSnap] = await Promise.all([tx.get(commentRef), tx.get(likeRef)]);
      if (!commentSnap.exists) throw new ApiError(404, 'COMMENT_NOT_FOUND');
      const comment = commentSnap.data();
      if (likeSnap.exists) {
        tx.delete(likeRef);
        return { liked: false };
      }
      tx.create(likeRef, {
        commentId: targetId,
        postId: String(comment.postId || ''),
        userId: profileId,
        createdAt: Date.now(),
      });
      return { liked: true };
    });
    return sendJson(res, 200, result);
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 500;
    const code = error instanceof ApiError ? error.code : 'SOCIAL_LIKE_FAILED';
    if (status >= 500) console.error('Social like API failed:', error?.message || error);
    return sendJson(res, status, { error: code });
  }
};
