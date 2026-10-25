const { z } = require('zod');
const { getAuth } = require('firebase-admin/auth');
const { getStorage } = require('firebase-admin/storage');
const { db, HttpsError, secureCallable } = require('./security');

async function deleteDocuments(query) {
  const snapshot = await query.get();
  for (let offset = 0; offset < snapshot.docs.length; offset += 450) {
    const batch = db.batch();
    snapshot.docs.slice(offset, offset + 450).forEach((document) => batch.delete(document.ref));
    await batch.commit();
  }
  return snapshot.docs;
}

async function deleteOwnAccount({ uid }) {
  const profiles = await db.collection('users').where('firebaseUid', '==', uid).limit(2).get();
  if (profiles.size > 1) throw new HttpsError('failed-precondition', 'Hesaba birdən çox profil bağlanıb. Dəstəyə müraciət edin.');
  const profile = profiles.docs[0];
  const userId = profile?.id;
  if (userId === '92') throw new HttpsError('permission-denied', 'Admin hesabı silinə bilməz.');

  if (userId) {
    const chats = await db.collection('private_chats').where('participants', 'array-contains', userId).get();
    const queries = [
      db.collection('posts').where('userId', '==', userId),
      db.collection('global_chat').where('userId', '==', userId),
      db.collection('alliance_chat').where('userId', '==', userId),
      db.collection('post_comments').where('userId', '==', userId),
      db.collection('post_likes').where('userId', '==', userId),
      db.collection('follows').where('followerId', '==', userId),
      db.collection('follows').where('followingId', '==', userId),
      db.collection('blocks').where('blockerId', '==', userId),
      db.collection('blocks').where('blockedId', '==', userId),
      db.collection('reports').where('reporterId', '==', userId),
      db.collection('feedback').where('userId', '==', userId),
      db.collection('support_requests').where('userId', '==', userId),
      db.collection('message_contacts').where('ownerId', '==', userId),
      db.collection('private_messages').where('senderId', '==', userId),
      db.collection('private_messages').where('recipientId', '==', userId),
      db.collection('call_sessions').where('callerId', '==', userId),
      db.collection('call_sessions').where('calleeId', '==', userId),
      ...chats.docs.map((chat) => db.collection('private_messages').where('chatId', '==', chat.id)),
    ];
    await Promise.all(queries.map(deleteDocuments));
    await Promise.all(chats.docs.map((chat) => db.recursiveDelete(chat.ref)));

    const bucket = getStorage().bucket();
    const prefixes = [
      `profiles/${userId}/`,
      `posts/${userId}/`,
      ...chats.docs.flatMap((chat) => [
        `chat_media/${chat.id}/`, `voice_messages/${chat.id}/`, `chat_files/${chat.id}/`,
      ]),
    ];
    await Promise.all(prefixes.map((prefix) => bucket.deleteFiles({ prefix })));

    const refs = [
      db.doc(`players/${userId}`),
      db.doc(`user_settings/${userId}`),
      db.doc(`private_user_profiles/${uid}`),
      profile.ref,
    ];
    const batch = db.batch();
    refs.forEach((ref) => batch.delete(ref));
    await batch.commit();
  }

  await getAuth().deleteUser(uid);
  return { deleted: true };
}

async function setOwnFreezeStatus({ uid, payload }) {
  const profiles = await db.collection('users').where('firebaseUid', '==', uid).limit(2).get();
  if (profiles.size !== 1) throw new HttpsError('not-found', 'İstifadəçi profili tapılmadı.');
  const profile = profiles.docs[0];
  if (profile.id === '92') throw new HttpsError('permission-denied', 'Admin hesabı dondurula bilməz.');
  const now = Date.now();
  const batch = db.batch();
  batch.set(profile.ref, {
    frozen: payload.frozen,
    frozenAt: payload.frozen ? now : null,
    ...(payload.frozen ? { frozenBy: 'self' } : { unfrozenAt: now }),
    updatedAt: now,
  }, { merge: true });
  batch.set(db.doc(`players/${profile.id}`), { frozen: payload.frozen, updatedAt: now }, { merge: true });
  await batch.commit();
  return { frozen: payload.frozen };
}

exports.setOwnFreezeStatus = secureCallable(
  'setOwnFreezeStatus', z.object({ frozen: z.boolean() }).strict(), setOwnFreezeStatus,
  { max: 5, windowMs: 60_000 },
);

exports.deleteOwnAccount = secureCallable(
  'deleteOwnAccount', z.object({}).strict(), deleteOwnAccount, { max: 3, windowMs: 60_000 },
);
