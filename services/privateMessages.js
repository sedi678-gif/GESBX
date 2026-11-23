const {
  ApiError,
  applyCors,
  getAdminAuth,
  getAdminFirestore,
  header,
  sendJson,
} = require('./apiSecurity');

const MESSAGE_TYPES = new Set(['text', 'audio', 'call', 'image', 'video', 'file', 'location']);
const ID_PATTERN = /^[A-Za-z0-9_-]{1,180}$/;

function text(value, max = 2000) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function messagePreview(message) {
  if (message.type === 'audio') return '🎤 Səs mesajı';
  if (message.type === 'image') return '📷 Şəkil';
  if (message.type === 'video') return '🎬 Video';
  if (message.type === 'file') return `📁 ${message.fileName || 'Fayl'}`;
  if (message.type === 'location') return '📍 Məkan';
  return text(message.text, 2000) || 'Mesaj';
}

function chatIdFor(a, b) {
  return [String(a), String(b)].sort().join('__');
}

async function authenticate(req, db, profileId) {
  const match = header(req, 'authorization').match(/^Bearer\s+(.+)$/i);
  if (!match) throw new ApiError(401, 'AUTH_REQUIRED');
  let identity;
  try {
    identity = await getAdminAuth().verifyIdToken(match[1], true);
  } catch {
    throw new ApiError(401, 'AUTH_TOKEN_INVALID');
  }
  if (!identity?.uid || identity.firebase?.sign_in_provider === 'anonymous') {
    throw new ApiError(401, 'REGISTERED_ACCOUNT_REQUIRED');
  }
  if (!/^\d{1,20}$/.test(profileId)) throw new ApiError(400, 'PROFILE_ID_INVALID');
  const profile = await db.doc(`users/${profileId}`).get();
  if (!profile.exists || profile.data()?.firebaseUid !== identity.uid) {
    throw new ApiError(403, 'PROFILE_ACCOUNT_MISMATCH');
  }
  if (profile.data()?.banned === true || profile.data()?.frozen === true) {
    throw new ApiError(403, 'ACCOUNT_RESTRICTED');
  }
  return identity;
}

function profileMeta(data = {}) {
  return {
    name: text(data.name, 100),
    handle: text(data.handle, 80),
    avatar: text(data.avatar, 1500),
  };
}

async function requireChat(db, chatId, profileId) {
  if (!ID_PATTERN.test(chatId)) throw new ApiError(400, 'CHAT_ID_INVALID');
  const ref = db.doc(`private_chats/${chatId}`);
  const snap = await ref.get();
  if (!snap.exists) throw new ApiError(404, 'CHAT_NOT_FOUND');
  const data = snap.data() || {};
  const participants = Array.isArray(data.participants) ? data.participants.map(String) : [];
  if (participants.length !== 2 || !participants.includes(profileId)) {
    throw new ApiError(403, 'CHAT_ACCESS_DENIED');
  }
  return { ref, data, participants };
}

async function updateChat(db, senderId, recipientId, meta, preview, at, existingData = {}) {
  const chatId = chatIdFor(senderId, recipientId);
  const participants = [String(senderId), String(recipientId)].sort();
  const oldMeta = existingData.participantMeta && typeof existingData.participantMeta === 'object'
    ? existingData.participantMeta : {};
  const sender = profileMeta({
    name: meta.senderName || oldMeta[senderId]?.name,
    handle: meta.senderHandle || oldMeta[senderId]?.handle,
    avatar: meta.senderAvatar || oldMeta[senderId]?.avatar,
  });
  const recipient = profileMeta({
    name: meta.recipientName || oldMeta[recipientId]?.name,
    handle: meta.recipientHandle || oldMeta[recipientId]?.handle,
    avatar: meta.recipientAvatar || oldMeta[recipientId]?.avatar,
  });
  const data = {
    chatId,
    participants,
    participantMeta: { ...oldMeta, [senderId]: sender, [recipientId]: recipient },
    lastMessage: preview,
    lastMessageAt: at,
    updatedAt: at,
  };
  await db.doc(`private_chats/${chatId}`).set(data, { merge: true });
  return chatId;
}

async function listChats(db, profileId) {
  const snap = await db.collection('private_chats')
    .where('participants', 'array-contains', profileId).get();
  const result = [];
  snap.forEach((doc) => {
    const data = doc.data() || {};
    const participants = Array.isArray(data.participants) ? data.participants.map(String) : [];
    const otherId = participants.find((id) => id !== profileId) || '';
    if (!otherId) return;
    const meta = data.participantMeta?.[otherId] || {};
    result.push({
      chatId: String(data.chatId || doc.id),
      otherUserId: otherId,
      otherUserName: text(meta.name, 100) || 'İstifadəçi',
      otherUserHandle: text(meta.handle, 80),
      otherUserAvatar: text(meta.avatar, 1500),
      lastMessage: text(data.lastMessage, 2000),
      lastMessageAt: Number(data.lastMessageAt) || 0,
    });
  });
  result.sort((a, b) => b.lastMessageAt - a.lastMessageAt);
  return result;
}

async function listMessages(db, chatId) {
  const snap = await db.collection('private_messages')
    .where('chatId', '==', chatId).get();
  return snap.docs.map((doc) => ({ ...doc.data(), id: String(doc.data()?.id || doc.id) }))
    .sort((a, b) => (Number(a.createdAt) || 0) - (Number(b.createdAt) || 0));
}

async function handleGet(req, res, db, profileId, action) {
  await authenticate(req, db, profileId);
  if (action === 'chats') {
    return sendJson(res, 200, { chats: await listChats(db, profileId) });
  }
  if (action === 'messages') {
    const chatId = text(req.query?.chatId, 180);
    await requireChat(db, chatId, profileId);
    return sendJson(res, 200, { messages: await listMessages(db, chatId) });
  }
  if (action === 'search-users') {
    const query = text(req.query?.q, 80).toLowerCase();
    if (query.length < 1) return sendJson(res, 200, { users: [] });
    const snap = await db.collection('users').limit(1500).get();
    const users = [];
    snap.forEach((doc) => {
      if (doc.id === profileId) return;
      const data = doc.data() || {};
      if (data.banned === true || data.frozen === true) return;
      const name = text(data.name, 100);
      const surname = text(data.surname, 100);
      const handle = text(data.handle, 80);
      if (![name, surname, handle, doc.id].join(' ').toLowerCase().includes(query)) return;
      users.push({
        id: doc.id, name, surname, handle,
        avatar: text(data.avatar, 1500),
        region: text(data.region, 80),
        gender: text(data.gender, 40),
      });
    });
    return sendJson(res, 200, { users: users.slice(0, 30) });
  }
  throw new ApiError(400, 'MESSAGE_ACTION_INVALID');
}

async function handlePost(req, res, db, profileId, action) {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  if (action === 'ensure-chat' || action === 'send') {
    const senderId = text(body.senderId, 20);
    const recipientId = text(body.recipientId, 20);
    if (senderId !== profileId || !/^\d{1,20}$/.test(recipientId) || recipientId === senderId) {
      throw new ApiError(403, 'CHAT_PARTICIPANTS_INVALID');
    }
    const recipientSnap = await db.doc(`users/${recipientId}`).get();
    if (!recipientSnap.exists || recipientSnap.data()?.banned === true || recipientSnap.data()?.frozen === true) {
      throw new ApiError(404, 'RECIPIENT_NOT_AVAILABLE');
    }
    const chatId = chatIdFor(senderId, recipientId);
    const chatRef = db.doc(`private_chats/${chatId}`);
    const existing = await chatRef.get();
    if (existing.exists) {
      const participants = (existing.data()?.participants || []).map(String);
      if (participants.length !== 2 || !participants.includes(senderId) || !participants.includes(recipientId)) {
        throw new ApiError(403, 'CHAT_PARTICIPANTS_INVALID');
      }
    }
    const now = Date.now();
    const meta = {
      senderName: text(body.senderName, 100),
      senderHandle: text(body.senderHandle, 80),
      senderAvatar: text(body.senderAvatar, 1500),
      recipientName: text(body.recipientName, 100),
      recipientHandle: text(body.recipientHandle, 80),
      recipientAvatar: text(body.recipientAvatar, 1500),
    };
    if (action === 'ensure-chat') {
      const previous = existing.exists ? existing.data() : {};
      await updateChat(db, senderId, recipientId, meta,
        text(body.lastMessage, 2000) || text(previous.lastMessage, 2000) || 'Yeni söhbət',
        Number(body.lastMessageAt) || Number(previous.lastMessageAt) || now,
        previous);
      return sendJson(res, 200, { chatId, created: !existing.exists });
    }

    const input = body.message && typeof body.message === 'object' ? body.message : {};
    const type = String(input.type || 'text');
    if (!MESSAGE_TYPES.has(type)) throw new ApiError(400, 'MESSAGE_TYPE_INVALID');
    const id = text(input.id, 180);
    if (id && !ID_PATTERN.test(id)) throw new ApiError(400, 'MESSAGE_ID_INVALID');
    const messageRef = id ? db.doc(`private_messages/${id}`) : db.collection('private_messages').doc();
    const messageId = messageRef.id;
    const message = {
      id: messageId,
      chatId,
      senderId,
      recipientId,
      type,
      createdAt: Number(input.createdAt) || now,
    };
    for (const field of ['text', 'audioUrl', 'mediaUrl', 'mediaMime', 'fileName', 'callStatus']) {
      if (typeof input[field] === 'string' && input[field].length <= (field === 'text' ? 2000 : 900000)) {
        message[field] = input[field];
      }
    }
    if (Number.isFinite(Number(input.audioDurationMs))) message.audioDurationMs = Math.max(0, Math.min(600000, Number(input.audioDurationMs)));
    if (Number.isFinite(Number(input.locationLat)) && Number(input.locationLat) >= -90 && Number(input.locationLat) <= 90) message.locationLat = Number(input.locationLat);
    if (Number.isFinite(Number(input.locationLng)) && Number(input.locationLng) >= -180 && Number(input.locationLng) <= 180) message.locationLng = Number(input.locationLng);
    if (['voice', 'video'].includes(input.callType)) message.callType = input.callType;
    const batch = db.batch();
    const previousMeta = existing.exists ? (existing.data()?.participantMeta || {}) : {};
    const senderMeta = previousMeta[senderId] || {};
    const recipientMeta = previousMeta[recipientId] || {};
    batch.set(chatRef, {
      chatId,
      participants: [senderId, recipientId].sort(),
      participantMeta: {
        ...previousMeta,
        [senderId]: profileMeta({
          name: meta.senderName || senderMeta.name,
          handle: meta.senderHandle || senderMeta.handle,
          avatar: meta.senderAvatar || senderMeta.avatar,
        }),
        [recipientId]: profileMeta({
          name: meta.recipientName || recipientMeta.name,
          handle: meta.recipientHandle || recipientMeta.handle,
          avatar: meta.recipientAvatar || recipientMeta.avatar,
        }),
      },
      lastMessage: messagePreview(message),
      lastMessageAt: message.createdAt,
      updatedAt: now,
    }, { merge: true });
    batch.create(messageRef, message);
    await batch.commit();
    return sendJson(res, 200, { message });
  }

  if (action === 'edit') {
    const messageId = text(body.messageId, 180);
    const nextText = text(body.text, 2000);
    if (!ID_PATTERN.test(messageId) || !nextText) throw new ApiError(400, 'MESSAGE_EDIT_INVALID');
    const ref = db.doc(`private_messages/${messageId}`);
    const snap = await ref.get();
    if (!snap.exists) throw new ApiError(404, 'MESSAGE_NOT_FOUND');
    const old = snap.data();
    if (old.senderId !== profileId) throw new ApiError(403, 'MESSAGE_OWNER_REQUIRED');
    await requireChat(db, String(old.chatId), profileId);
    const editedAt = Date.now();
    await ref.update({ text: nextText, editedAt });
    const latest = await listMessages(db, String(old.chatId));
    const newest = latest[latest.length - 1];
    if (newest?.id === messageId) {
      await db.doc(`private_chats/${old.chatId}`).set({
        lastMessage: messagePreview({ ...old, text: nextText }),
        lastMessageAt: Number(old.createdAt) || editedAt,
        updatedAt: editedAt,
      }, { merge: true });
    }
    return sendJson(res, 200, { success: true, editedAt });
  }

  if (action === 'delete') {
    const messageId = text(body.messageId, 180);
    const chatId = text(body.chatId, 180);
    await requireChat(db, chatId, profileId);
    const ref = db.doc(`private_messages/${messageId}`);
    const snap = await ref.get();
    if (!snap.exists || snap.data()?.chatId !== chatId) throw new ApiError(404, 'MESSAGE_NOT_FOUND');
    await ref.delete();
    await refreshPreview(db, chatId);
    return sendJson(res, 200, { success: true });
  }

  if (action === 'clear') {
    const chatId = text(body.chatId, 180);
    await requireChat(db, chatId, profileId);
    const snap = await db.collection('private_messages').where('chatId', '==', chatId).get();
    for (let offset = 0; offset < snap.docs.length; offset += 450) {
      const batch = db.batch();
      snap.docs.slice(offset, offset + 450).forEach((doc) => batch.delete(doc.ref));
      await batch.commit();
    }
    await db.doc(`private_chats/${chatId}`).set({ lastMessage: '', lastMessageAt: 0, updatedAt: Date.now() }, { merge: true });
    return sendJson(res, 200, { success: true });
  }

  if (action === 'status') {
    const messageId = text(body.messageId, 180);
    const ref = db.doc(`private_messages/${messageId}`);
    const snap = await ref.get();
    if (!snap.exists || snap.data()?.recipientId !== profileId) throw new ApiError(403, 'MESSAGE_STATUS_DENIED');
    await requireChat(db, String(snap.data().chatId), profileId);
    const patch = {};
    if (Number(body.deliveredAt) > 0) patch.deliveredAt = Number(body.deliveredAt);
    if (Number(body.readAt) > 0) {
      patch.readAt = Number(body.readAt);
      patch.deliveredAt = patch.deliveredAt || Number(body.deliveredAt) || Date.now();
    }
    if (Object.keys(patch).length) await ref.update(patch);
    return sendJson(res, 200, { success: true });
  }

  throw new ApiError(400, 'MESSAGE_ACTION_INVALID');
}

async function refreshPreview(db, chatId) {
  const messages = await listMessages(db, chatId);
  const latest = messages[messages.length - 1];
  await db.doc(`private_chats/${chatId}`).set({
    lastMessage: latest ? messagePreview(latest) : '',
    lastMessageAt: latest ? Number(latest.createdAt) || 0 : 0,
    updatedAt: Date.now(),
  }, { merge: true });
}

module.exports = async function privateMessages(req, res) {
  if (applyCors(req, res, 'GET, POST, OPTIONS')) return;
  const action = String(req.query?.action || '');
  const profileId = text(req.method === 'GET' ? req.query?.profileId : req.body?.profileId, 20);
  try {
    const db = getAdminFirestore();
    if (req.method === 'GET') return await handleGet(req, res, db, profileId, action);
    if (req.method === 'POST') {
      await authenticate(req, db, profileId);
      return await handlePost(req, res, db, profileId, action);
    }
    res.setHeader('Allow', 'GET, POST, OPTIONS');
    return sendJson(res, 405, { error: 'METHOD_NOT_ALLOWED' });
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 500;
    const code = error instanceof ApiError ? error.code : 'PRIVATE_MESSAGES_FAILED';
    if (status >= 500) console.error('[PrivateMessages API]', error);
    return sendJson(res, status, { error: code });
  }
};
