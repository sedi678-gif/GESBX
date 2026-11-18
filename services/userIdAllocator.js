const {
  FieldValue,
  getAdminFirestore,
  sha256,
} = require('./apiSecurity');

const ADMIN_PROFILE_ID = 98;
const MAX_ALLOCATION_ATTEMPTS = 256;

function numericId(value) {
  const normalized = String(value ?? '').trim();
  if (!/^\d{1,16}$/.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

async function readExistingIdHighWaterMark(db) {
  const [users, players] = await Promise.all([
    db.collection('users').get(),
    db.collection('players').get(),
  ]);
  let maximum = 1;
  for (const snapshot of [users, players]) {
    for (const document of snapshot.docs) {
      const data = document.data();
      maximum = Math.max(maximum, numericId(document.id) || 0, numericId(data.id) || 0, numericId(data.odId) || 0);
    }
  }
  return maximum;
}

async function allocateUserId(uid) {
  const db = getAdminFirestore();
  const counterRef = db.doc('counters/userIdCounter');
  const configRef = db.doc('app_config/admin');
  const allocationRef = db.doc(`user_id_allocations/${sha256(uid).slice(0, 48)}`);
  const highWaterCounter = await counterRef.get();
  const scannedHighWater = highWaterCounter.exists ? 1 : await readExistingIdHighWaterMark(db);

  return db.runTransaction(async (tx) => {
    const [allocationSnap, counterSnap, configSnap, existingUsers, existingPlayers] = await Promise.all([
      tx.get(allocationRef),
      tx.get(counterRef),
      tx.get(configRef),
      tx.get(db.collection('users').where('firebaseUid', '==', uid)),
      tx.get(db.collection('players').where('firebaseUid', '==', uid)),
    ]);
    if (allocationSnap.exists) {
      const allocatedId = numericId(allocationSnap.data().userId);
      if (allocatedId != null) return { userId: String(allocatedId) };
      // Older builds could reserve the Firebase UID itself as a profile ID.
      // Replace that invalid reservation with a numeric GESBX ID below.
    }

    // Ignore legacy orphan documents keyed directly by a Firebase UID.
    // Only numeric GESBX profile IDs represent completed/allocated profiles.
    const numericUsers = existingUsers.docs.filter((document) => numericId(document.id) != null);
    const numericPlayers = existingPlayers.docs.filter((document) => numericId(document.id) != null);
    if (numericUsers.length > 1 || numericPlayers.length > 1) throw new Error('PROFILE_UID_NOT_UNIQUE');
    const registeredIds = [
      ...numericUsers.map((document) => document.id),
      ...numericPlayers.map((document) => document.id),
    ];
    if (registeredIds.length) {
      const uniqueIds = [...new Set(registeredIds)];
      if (uniqueIds.length !== 1) throw new Error('PROFILE_ID_MISMATCH');
      const existingId = uniqueIds[0];
      const user = numericUsers[0]?.data();
      const player = numericPlayers[0]?.data();
      if ((user && user.firebaseUid !== uid) || (player && player.firebaseUid !== uid)) {
        throw new Error('PROFILE_OWNER_MISMATCH');
      }
      tx.set(allocationRef, {
        authUid: uid,
        userId: existingId,
        createdAt: FieldValue.serverTimestamp(),
        source: 'existing_profile',
      });
      return { userId: existingId };
    }

    const counterData = counterSnap.exists ? counterSnap.data() : {};
    const config = configSnap.exists ? configSnap.data() : {};
    const currentId = Math.max(1, numericId(counterData.currentId) || 1, scannedHighWater);
    const minimumId = Math.max(2, numericId(config.minNewUserId) || 2);
    let candidate = Math.max(currentId + 1, minimumId);
    for (let attempt = 0; attempt < MAX_ALLOCATION_ATTEMPTS; attempt += 1, candidate += 1) {
      if (candidate === ADMIN_PROFILE_ID) continue;
      if (!Number.isSafeInteger(candidate)) throw new Error('USER_ID_COUNTER_INVALID');
      const [userSnap, playerSnap] = await Promise.all([
        tx.get(db.doc(`users/${candidate}`)),
        tx.get(db.doc(`players/${candidate}`)),
      ]);
      if (userSnap.exists || playerSnap.exists) continue;

      tx.set(counterRef, {
        currentId: candidate,
        reservedAdminId: String(ADMIN_PROFILE_ID),
        updatedAt: Date.now(),
      }, { merge: true });
      tx.set(allocationRef, {
        authUid: uid,
        userId: String(candidate),
        createdAt: FieldValue.serverTimestamp(),
        source: 'registration',
      });
      return { userId: String(candidate) };
    }
    throw new Error('USER_ID_ALLOCATION_EXHAUSTED');
  });
}

module.exports = { allocateUserId, readExistingIdHighWaterMark };
