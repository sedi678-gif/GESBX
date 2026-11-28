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
  if (message.forwardedFrom) return `↪️ ${messagePreview({ ...message, forwardedFrom: null })}`;
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

function profileAvatar(data = {}) {
  const candidates = [data.avatar, data.photoURL, data.photoUrl, data.userAvatar,
    data.avatarUrl, data.profileImage, data.profilePhoto];
  const value = candidates.find((item) => typeof item === 'string' && item.trim()
    && !item.includes('photo-1535713875002-d1d0cf377fde'));
  return text(value, 1500);
}

function profileMeta(data = {}) {
  return {
    name: text(data.name, 100),
    handle: text(data.handle, 80),
    avatar: profileAvatar(data),
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
    hiddenBy: [],
    lastMessage: preview,
    lastMessageAt: at,
    updatedAt: at,
  };
  await db.doc(`private_chats/${chatId}`).set(data, { merge: true });
  return chatId;
}

async function assertNotBlocked(db, senderId, recipientId) {
  const refs = [
    db.doc(`blocks/${senderId}_${recipientId}`),
    db.doc(`blocks/${recipientId}_${senderId}`),
  ];
  const snaps = await Promise.all(refs.map((ref) => ref.get()));
  if (snaps.some((snap) => snap.exists && snap.data()?.removed !== true)) {
    throw new ApiError(403, 'USER_BLOCKED');
  }
}

async function listChats(db, profileId) {
  const snap = await db.collection('private_chats')
    .where('participants', 'array-contains', profileId)
    .limit(100)
    .get();
  const result = [];
  snap.forEach((doc) => {
    const data = doc.data() || {};
    const participants = Array.isArray(data.participants) ? data.participants.map(String) : [];
    const hiddenBy = Array.isArray(data.hiddenBy) ? data.hiddenBy.map(String) : [];
    if (hiddenBy.includes(profileId)) return;
    const otherId = participants.find((id) => id !== profileId) || '';
    if (!otherId) return;
    const meta = data.participantMeta?.[otherId] || {};
    result.push({
      chatId: String(data.chatId || doc.id),
      otherUserId: otherId,
      otherUserName: text(meta.name, 100) || 'İstifadəçi',
      otherUserHandle: text(meta.handle, 80),
      otherUserAvatar: profileAvatar(meta),
      lastMessage: text(data.lastMessage, 2000),
      lastMessageAt: Number(data.lastMessageAt) || 0,
      archived: Array.isArray(data.archivedBy) && data.archivedBy.map(String).includes(profileId),
    });
  });
  result.sort((a, b) => b.lastMessageAt - a.lastMessageAt);

  // Köhnə söhbətlərdə participantMeta avatar saxlamaya bilər.
  // Profil fotosunu users və legacy players kolleksiyasından bərpa et.
  const visible = result;
  const needsLookup = visible.filter((chat) => chat.otherUserName === 'İstifadəçi' || !chat.otherUserAvatar);
  const refs = needsLookup.flatMap((chat) => [
    db.doc(`users/${chat.otherUserId}`),
    db.doc(`players/${chat.otherUserId}`),
  ]);
  if (refs.length) {
    const profiles = await db.getAll(...refs);
    needsLookup.forEach((chat, index) => {
      const user = profiles[index * 2]?.data() || {};
      const player = profiles[index * 2 + 1]?.data() || {};
      chat.otherUserName = chat.otherUserName !== 'İstifadəçi'
        ? chat.otherUserName
        : text(user.name || player.name, 100) || 'İstifadəçi';
      chat.otherUserHandle = chat.otherUserHandle || text(user.handle || player.handle, 80);
      chat.otherUserAvatar = chat.otherUserAvatar || profileAvatar(user) || profileAvatar(player);
    });
  }
  return visible;
}

async function listMessages(db, chatId) {
  const collection = db.collection('private_messages');
  try {
    // Composite index mövcuddursa yalnız ən son 100 mesaj oxunur.
    const snap = await collection.where('chatId', '==', chatId)
      .orderBy('createdAt', 'desc').limit(100).get();
    return snap.docs
      .map((doc) => ({ ...doc.data(), id: String(doc.data()?.id || doc.id) }))
      .reverse();
  } catch (error) {
    // Index hələ Firebase-ə deploy edilməyibsə tarixçə yenə açılsın.
    if (Number(error?.code) !== 9 && !['failed-precondition', 'FAILED_PRECONDITION'].includes(String(error?.code || ''))) throw error;
    const fallback = await collection.where('chatId', '==', chatId).get();
    return fallback.docs
      .map((doc) => ({ ...doc.data(), id: String(doc.data()?.id || doc.id) }))
      .sort((a, b) => (Number(a.createdAt) || 0) - (Number(b.createdAt) || 0))
      .slice(-100);
  }
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
  if (action === 'blocked') {
    const snap = await db.collection('blocks').where('blockerId', '==', profileId).get();
    const blockedIds = snap.docs
      .filter((doc) => doc.data()?.removed !== true)
      .map((doc) => String(doc.data()?.blockedId || ''))
      .filter(Boolean);
    return sendJson(res, 200, { blockedIds });
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
    // Recipient availability and both block directions are independent reads:
    // run them together to avoid serial Firestore round trips on every message.
    const [recipientSnap] = await Promise.all([
      db.doc(`users/${recipientId}`).get(),
      assertNotBlocked(db, senderId, recipientId),
    ]);
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
    if (Array.isArray(input.audioWaveform)) {
      message.audioWaveform = input.audioWaveform
        .slice(0, 36)
        .map((value) => Math.max(5, Math.min(100, Math.round(Number(value) || 5))));
    }
    if (Number.isFinite(Number(input.locationLat)) && Number(input.locationLat) >= -90 && Number(input.locationLat) <= 90) message.locationLat = Number(input.locationLat);
    if (Number.isFinite(Number(input.locationLng)) && Number(input.locationLng) >= -180 && Number(input.locationLng) <= 180) message.locationLng = Number(input.locationLng);
    if (['voice', 'video'].includes(input.callType)) message.callType = input.callType;
    if (input.replyTo && typeof input.replyTo === 'object') {
      const replyId = text(input.replyTo.id, 180);
      if (replyId && ID_PATTERN.test(replyId)) {
        const replySnap = await db.doc(`private_messages/${replyId}`).get();
        if (replySnap.exists && replySnap.data()?.chatId === chatId) {
          const reply = replySnap.data() || {};
          message.replyTo = {
            id: replyId,
            senderId: text(reply.senderId, 20),
            type: MESSAGE_TYPES.has(reply.type) ? reply.type : 'text',
            text: text(reply.text, 500),
          };
        }
      }
    }
    if (input.forwardedFrom && typeof input.forwardedFrom === 'object') {
      message.forwardedFrom = {
        senderId: text(input.forwardedFrom.senderId, 20),
        senderName: text(input.forwardedFrom.senderName, 100),
      };
    }
    // Mobil şəbəkədə cavab itərsə klient eyni message ID ilə sorğunu təkrar edir.
    // Mövcud mesajı yenidən yaratmağa çalışmaq əvəzinə əvvəlki nəticəni qaytar.
    const alreadySaved = await messageRef.get();
    if (alreadySaved.exists) {
      const saved = alreadySaved.data() || {};
      if (String(saved.chatId || '') !== chatId || String(saved.senderId || '') !== senderId) {
        throw new ApiError(409, 'MESSAGE_ID_CONFLICT');
      }
      return sendJson(res, 200, { message: { ...saved, id: messageId } });
    }

    const batch = db.batch();
    const previousMeta = existing.exists ? (existing.data()?.participantMeta || {}) : {};
    const senderMeta = previousMeta[senderId] || {};
    const recipientMeta = previousMeta[recipientId] || {};
    batch.set(chatRef, {
      chatId,
      participants: [senderId, recipientId].sort(),
      hiddenBy: [],
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

  if (action === 'delete-chat') {
    const chatId = text(body.chatId, 180);
    const chat = await requireChat(db, chatId, profileId);
    const hiddenBy = Array.isArray(chat.data.hiddenBy) ? chat.data.hiddenBy.map(String) : [];
    await chat.ref.set({
      hiddenBy: [...new Set([...hiddenBy, profileId])],
      updatedAt: Date.now(),
    }, { merge: true });
    return sendJson(res, 200, { success: true });
  }

  if (action === 'archive-chat' || action === 'unarchive-chat') {
    const chatId = text(body.chatId, 180);
    const chat = await requireChat(db, chatId, profileId);
    const archivedBy = Array.isArray(chat.data.archivedBy) ? chat.data.archivedBy.map(String) : [];
    const next = action === 'archive-chat'
      ? [...new Set([...archivedBy, profileId])]
      : archivedBy.filter((id) => id !== profileId);
    await chat.ref.set({ archivedBy: next, updatedAt: Date.now() }, { merge: true });
    return sendJson(res, 200, { archived: action === 'archive-chat' });
  }

  if (action === 'pin') {
    const messageId = text(body.messageId, 180);
    const chatId = text(body.chatId, 180);
    if (!ID_PATTERN.test(messageId)) throw new ApiError(400, 'MESSAGE_ID_INVALID');
    await requireChat(db, chatId, profileId);
    const ref = db.doc(`private_messages/${messageId}`);
    const pinnedBy = await db.runTransaction(async (transaction) => {
      const snap = await transaction.get(ref);
      if (!snap.exists || snap.data()?.chatId !== chatId) throw new ApiError(404, 'MESSAGE_NOT_FOUND');
      const current = Array.isArray(snap.data()?.pinnedBy) ? snap.data().pinnedBy.map(String) : [];
      const next = current.includes(profileId)
        ? current.filter((id) => id !== profileId)
        : [...current, profileId];
      transaction.update(ref, { pinnedBy: next, pinnedAt: next.length ? Date.now() : null });
      return next;
    });
    return sendJson(res, 200, { pinnedBy });
  }

  if (action === 'react') {
    const messageId = text(body.messageId, 180);
    const chatId = text(body.chatId, 180);
    const emoji = text(body.emoji, 8);
    const allowed = new Set(['❤️', '👍', '👎', '😂', '😮', '😢', '🙏', '🔥', '🎉']);
    if (!ID_PATTERN.test(messageId) || !allowed.has(emoji)) {
      throw new ApiError(400, 'MESSAGE_REACTION_INVALID');
    }
    await requireChat(db, chatId, profileId);
    const ref = db.doc(`private_messages/${messageId}`);
    const snap = await ref.get();
    if (!snap.exists || snap.data()?.chatId !== chatId) {
      throw new ApiError(404, 'MESSAGE_NOT_FOUND');
    }
    const reactions = await db.runTransaction(async (transaction) => {
      const fresh = await transaction.get(ref);
      if (!fresh.exists || fresh.data()?.chatId !== chatId) {
        throw new ApiError(404, 'MESSAGE_NOT_FOUND');
      }
      const current = fresh.data()?.reactions && typeof fresh.data().reactions === 'object'
        ? fresh.data().reactions : {};
      const alreadySelected = Array.isArray(current[emoji])
        && current[emoji].map(String).includes(profileId);
      const next = {};
      // Bir istifadəçinin bir mesaja yalnız bir reaksiyası ola bilər.
      // Eyni emoji yenidən seçilərsə reaksiya silinir, başqa emoji seçilərsə dəyişdirilir.
      for (const [existingEmoji, existingUsers] of Object.entries(current)) {
        if (!Array.isArray(existingUsers)) continue;
        const remaining = existingUsers.map(String).filter((id) => id !== profileId);
        if (remaining.length) next[existingEmoji] = remaining;
      }
      if (!alreadySelected) {
        const selectedUsers = Array.isArray(next[emoji]) ? next[emoji] : [];
        next[emoji] = [...selectedUsers, profileId];
      }
      transaction.update(ref, { reactions: next });
      return next;
    });
    return sendJson(res, 200, { reactions });
  }

  if (action === 'forward') {
    const sourceMessageId = text(body.messageId, 180);
    const targetUserId = text(body.targetUserId, 20);
    if (!ID_PATTERN.test(sourceMessageId) || !/^\d{1,20}$/.test(targetUserId) || targetUserId === profileId) {
      throw new ApiError(400, 'MESSAGE_FORWARD_INVALID');
    }
    const sourceRef = db.doc(`private_messages/${sourceMessageId}`);
    const sourceSnap = await sourceRef.get();
    if (!sourceSnap.exists) throw new ApiError(404, 'MESSAGE_NOT_FOUND');
    const source = sourceSnap.data() || {};
    await requireChat(db, String(source.chatId || ''), profileId);
    if (!MESSAGE_TYPES.has(source.type) || source.type === 'call') {
      throw new ApiError(400, 'MESSAGE_TYPE_CANNOT_FORWARD');
    }
    const targetSnap = await db.doc(`users/${targetUserId}`).get();
    if (!targetSnap.exists || targetSnap.data()?.banned === true || targetSnap.data()?.frozen === true) {
      throw new ApiError(404, 'RECIPIENT_NOT_AVAILABLE');
    }
    await assertNotBlocked(db, profileId, targetUserId);
    const target = targetSnap.data() || {};
    const now = Date.now();
    const chatId = chatIdFor(profileId, targetUserId);
    const chatRef = db.doc(`private_chats/${chatId}`);
    const chatSnap = await chatRef.get();
    const existing = chatSnap.exists ? chatSnap.data() || {} : {};
    const oldMeta = existing.participantMeta && typeof existing.participantMeta === 'object'
      ? existing.participantMeta : {};
    const senderMeta = profileMeta(body.senderMeta || {});
    const recipientMeta = profileMeta({
      name: target.name,
      handle: target.handle,
      avatar: target.avatar || target.photoURL || target.photoUrl,
    });
    const forwarded = {
      id: db.collection('private_messages').doc().id,
      chatId,
      senderId: profileId,
      recipientId: targetUserId,
      type: source.type,
      createdAt: now,
      forwardedFrom: {
        senderId: text(source.senderId, 20),
        senderName: text(body.forwardedFromName, 100) || 'İstifadəçi',
      },
    };
    for (const field of ['text', 'audioUrl', 'audioDurationMs', 'mediaUrl', 'mediaMime', 'fileName', 'locationLat', 'locationLng']) {
      if (source[field] !== undefined) forwarded[field] = source[field];
    }
    const batch = db.batch();
    batch.set(chatRef, {
      chatId,
      participants: [profileId, targetUserId].sort(),
      participantMeta: {
        ...oldMeta,
        [profileId]: senderMeta,
        [targetUserId]: recipientMeta,
      },
      lastMessage: messagePreview(forwarded),
      lastMessageAt: now,
      updatedAt: now,
    }, { merge: true });
    batch.create(db.doc(`private_messages/${forwarded.id}`), forwarded);
    await batch.commit();
    return sendJson(res, 200, { message: forwarded });
  }

  if (action === 'block' || action === 'unblock') {
    const targetUserId = text(body.targetUserId, 20);
    if (!/^\d{1,20}$/.test(targetUserId) || targetUserId === profileId) {
      throw new ApiError(400, 'BLOCK_TARGET_INVALID');
    }
    const target = await db.doc(`users/${targetUserId}`).get();
    if (!target.exists) throw new ApiError(404, 'USER_NOT_FOUND');
    await db.doc(`blocks/${profileId}_${targetUserId}`).set({
      blockerId: profileId,
      blockedId: targetUserId,
      createdAt: Date.now(),
      removed: action === 'unblock',
    });
    return sendJson(res, 200, { success: true });
  }

  if (action === 'report') {
    const targetUserId = text(body.targetUserId, 20);
    const reason = text(body.reason, 1000);
    if (!/^\d{1,20}$/.test(targetUserId) || targetUserId === profileId || !reason) {
      throw new ApiError(400, 'REPORT_FIELDS_INVALID');
    }
    await db.collection('reports').add({
      reporterId: profileId,
      targetUserId,
      reason,
      type: 'message',
      createdAt: Date.now(),
      status: 'pending',
    });
    return sendJson(res, 200, { success: true });
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

  if (action === 'status-bulk') {
    const chatId = text(body.chatId, 180);
    const messageIds = Array.isArray(body.messageIds)
      ? [...new Set(body.messageIds.map((id) => text(id, 180)).filter((id) => ID_PATTERN.test(id)))].slice(0, 100)
      : [];
    if (!messageIds.length) return sendJson(res, 200, { updated: 0 });
    await requireChat(db, chatId, profileId);
    const refs = messageIds.map((id) => db.doc(`private_messages/${id}`));
    const snaps = await Promise.all(refs.map((ref) => ref.get()));
    const now = Date.now();
    const patch = {};
    if (Number(body.deliveredAt) > 0) patch.deliveredAt = Number(body.deliveredAt);
    if (Number(body.readAt) > 0) {
      patch.readAt = Number(body.readAt);
      patch.deliveredAt = patch.deliveredAt || now;
    }
    const batch = db.batch();
    let updated = 0;
    snaps.forEach((snap) => {
      if (!snap.exists || snap.data()?.chatId !== chatId || snap.data()?.recipientId !== profileId) return;
      const current = snap.data() || {};
      const next = {};
      if (patch.deliveredAt && !current.deliveredAt) next.deliveredAt = patch.deliveredAt;
      if (patch.readAt && !current.readAt) next.readAt = patch.readAt;
      if (Object.keys(next).length) {
        batch.update(snap.ref, next);
        updated += 1;
      }
    });
    if (updated) await batch.commit();
    return sendJson(res, 200, { updated });
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
