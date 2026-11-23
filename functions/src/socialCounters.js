const { onDocumentCreated, onDocumentDeleted } = require('firebase-functions/v2/firestore');
const { getFirestore } = require('firebase-admin/firestore');

const db = getFirestore();

async function applyCounterEvent(eventId, userId, field, delta) {
  if (typeof userId !== 'string' || !userId || !['likesReceived', 'viewsReceived'].includes(field)) return;
  const eventRef = db.doc(`social_counter_events/${eventId}`);
  const userRef = db.doc(`users/${userId}`);
  await db.runTransaction(async (tx) => {
    const event = await tx.get(eventRef);
    if (event.exists) return;
    const user = await tx.get(userRef);
    if (user.exists) {
      const current = Math.max(0, Math.floor(Number(user.data()[field]) || 0));
      tx.update(userRef, { [field]: Math.max(0, current + delta), updatedAt: Date.now() });
    }
    tx.create(eventRef, { userId, field, delta, createdAt: Date.now() });
  });
}

const onLikeCreated = onDocumentCreated('post_likes/{likeId}', async (event) => {
  const like = event.data?.data();
  if (!like || typeof like.postId !== 'string') return;
  const post = await db.doc(`posts/${like.postId}`).get();
  if (!post.exists) return;
  await applyCounterEvent(`like-created-${event.id}`, post.data().userId, 'likesReceived', 1);
});

const onLikeDeleted = onDocumentDeleted('post_likes/{likeId}', async (event) => {
  const like = event.data?.data();
  if (!like || typeof like.postId !== 'string') return;
  let ownerId = like.ownerId;
  if (!ownerId) {
    const post = await db.doc(`posts/${like.postId}`).get();
    ownerId = post.exists ? post.data().userId : null;
  }
  await applyCounterEvent(`like-deleted-${event.id}`, ownerId, 'likesReceived', -1);
});

const onPostViewCreated = onDocumentCreated('post_views/{viewerAuthUid}/views/{viewId}', async (event) => {
  const view = event.data?.data();
  if (!view || view.viewerAuthUid !== event.params.viewerAuthUid) return;
  await applyCounterEvent(`view-created-${event.id}`, view.ownerId, 'viewsReceived', 1);
});

module.exports = { onLikeCreated, onLikeDeleted, onPostViewCreated, applyCounterEvent };
