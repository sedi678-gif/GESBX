const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const { getFirestore } = require('firebase-admin/firestore');

const db = getFirestore();
const ADMIN_UIDS = defineSecret('ADMIN_UIDS');
const REGION = 'us-central1';

function adminUid(uid) {
  return String(ADMIN_UIDS.value() || '').split(',').map((value) => value.trim()).filter(Boolean).includes(uid);
}

function projectPlayer(playerId, data) {
  return {
    playerId,
    displayName: String(data.displayName || data.name || `Oyunçu ${playerId}`).slice(0, 80),
    avatar: typeof data.avatar === 'string' ? data.avatar.slice(0, 2048) : '',
    allianceId: typeof data.allianceId === 'string' ? data.allianceId : null,
    allianceName: typeof data.allianceName === 'string' ? data.allianceName.slice(0, 80) : null,
    isLeader: data.isLeader === true,
    score: Number.isFinite(Number(data.score)) ? Math.max(0, Math.floor(Number(data.score))) : 0,
    hasDefenseLoadout: Array.isArray(data.defenseLoadout) && data.defenseLoadout.length > 0,
    updatedAt: Date.now(),
    projectionVersion: 1,
  };
}

const syncPublicPlayerProjection = onDocumentWritten('players/{playerId}', async (event) => {
  const after = event.data?.after;
  const ref = db.doc(`public_players/${event.params.playerId}`);
  if (!after?.exists) {
    await ref.delete().catch((error) => {
      if (error.code !== 5) throw error;
    });
    return;
  }
  await ref.set(projectPlayer(event.params.playerId, after.data()));
});

const backfillPublicPlayers = onCall({ region: REGION, enforceAppCheck: true, secrets: [ADMIN_UIDS] }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Giriş tələb olunur.');
  if (!adminUid(uid)) throw new HttpsError('permission-denied', 'Yalnız admin bu köçürməni başlada bilər.');
  const limit = Math.min(400, Math.max(1, Number(request.data?.limit) || 300));
  let query = db.collection('players').orderBy('__name__').limit(limit);
  if (typeof request.data?.cursor === 'string' && request.data.cursor) {
    query = query.startAfter(request.data.cursor);
  }
  const snapshot = await query.get();
  if (!snapshot.empty) {
    const batch = db.batch();
    for (const player of snapshot.docs) {
      batch.set(db.doc(`public_players/${player.id}`), projectPlayer(player.id, player.data()));
    }
    await batch.commit();
  }
  return {
    processed: snapshot.size,
    nextCursor: snapshot.size === limit ? snapshot.docs[snapshot.size - 1].id : null,
  };
});

module.exports = { syncPublicPlayerProjection, backfillPublicPlayers, projectPlayer };
