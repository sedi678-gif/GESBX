const { z } = require('zod');
const { db, HttpsError, secureCallable, getOwnedPlayer } = require('./security');

const playerIdSchema = z.string().regex(/^\d{1,20}$/);
const createSchema = z.object({
  userId: playerIdSchema,
  name: z.string().trim().min(2).max(32),
  region: z.string().trim().min(1).max(64),
  lat: z.number().finite().min(-90).max(90),
  lng: z.number().finite().min(-180).max(180),
}).strict();
const allianceSchema = z.object({
  userId: playerIdSchema,
  allianceId: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/),
}).strict();
const assistantLeaderSchema = allianceSchema.extend({
  assistantLeaderId: playerIdSchema,
  promote: z.boolean(),
}).strict();
const flagSchema = z.object({
  backgroundColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  thirdColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  emblem: z.string().min(1).max(16),
  pattern: z.enum(['solid', 'stripes-h', 'stripes-v', 'diagonal', 'cross', 'saltire', 'chevron', 'canton', 'border', 'tricolor-h', 'tricolor-v', 'checkered', 'sunburst', 'gradient', 'split-h', 'split-v', 'triangle', 'fess', 'pale']),
  shape: z.enum(['rect', 'swallowtail', 'banner', 'shield']).optional(),
  imageUrl: z.string().url().max(2048).optional(),
  imageUpdatedAt: z.number().int().nonnegative().optional(),
}).strict();
const updateNameSchema = allianceSchema.extend({ name: z.string().trim().min(2).max(32) }).strict();
const updateFlagSchema = allianceSchema.extend({ flag: flagSchema }).strict();

async function createAlliance({ uid, payload }) {
  const allianceRef = db.collection('alliances').doc();
  const now = Date.now();
  return db.runTransaction(async (tx) => {
    const owned = await getOwnedPlayer(uid, payload.userId, tx);
    if (owned.player.allianceId) throw new HttpsError('failed-precondition', 'Əvvəl mövcud ittifaqdan çıxın.');
    const leader = String(owned.player.displayName || `${owned.user.name || ''} ${owned.user.surname || ''}`).trim().slice(0, 100);
    const alliance = {
      name: payload.name,
      region: payload.region,
      lat: payload.lat,
      lng: payload.lng,
      leaderId: owned.playerId,
      leader,
      score: 50,
      members: [owned.playerId],
      createdAt: now,
      flag: {
        backgroundColor: '#7f1d1d', accentColor: '#fbbf24', thirdColor: '#f8fafc',
        emblem: '🦁', pattern: 'canton', shape: 'rect',
      },
      fortressLevel: 1,
      fortressQualifyingMs: 0,
    };
    tx.create(allianceRef, alliance);
    tx.create(db.doc(`alliance_members/${allianceRef.id}/members/${uid}`), {
      playerId: owned.playerId, createdAt: now,
    });
    tx.update(owned.playerRef, {
      allianceId: allianceRef.id, allianceName: payload.name, isLeader: true, score: 50, updatedAt: now,
    });
    return { id: allianceRef.id, ...alliance };
  });
}

async function joinAlliance({ uid, payload }) {
  return db.runTransaction(async (tx) => {
    const owned = await getOwnedPlayer(uid, payload.userId, tx);
    const allianceRef = db.doc(`alliances/${payload.allianceId}`);
    const allianceSnap = await tx.get(allianceRef);
    if (!allianceSnap.exists) throw new HttpsError('not-found', 'İttifaq tapılmadı.');
    if (owned.player.allianceId) throw new HttpsError('failed-precondition', 'Əvvəl mövcud ittifaqdan çıxın.');
    const alliance = allianceSnap.data();
    const members = Array.isArray(alliance.members) ? alliance.members : [];
    if (members.includes(owned.playerId)) throw new HttpsError('already-exists', 'Siz artıq bu ittifaqdasınız.');
    if (members.length >= 50) throw new HttpsError('resource-exhausted', 'İttifaq doludur.');
    const updatedMembers = [...members, owned.playerId];
    const score = (Number(alliance.score) || 50) + 15;
    tx.update(allianceRef, { members: updatedMembers, score });
    tx.create(db.doc(`alliance_members/${payload.allianceId}/members/${uid}`), {
      playerId: owned.playerId, createdAt: Date.now(),
    });
    tx.update(owned.playerRef, {
      allianceId: payload.allianceId, allianceName: alliance.name || '', isLeader: false, score, updatedAt: Date.now(),
    });
    return { id: payload.allianceId, members: updatedMembers, score };
  });
}

async function leaveAlliance({ uid, payload }) {
  return db.runTransaction(async (tx) => {
    const owned = await getOwnedPlayer(uid, payload.userId, tx);
    const allianceRef = db.doc(`alliances/${payload.allianceId}`);
    const allianceSnap = await tx.get(allianceRef);
    if (!allianceSnap.exists) throw new HttpsError('not-found', 'İttifaq tapılmadı.');
    const alliance = allianceSnap.data();
    const members = Array.isArray(alliance.members) ? alliance.members : [];
    if (!members.includes(owned.playerId)) throw new HttpsError('permission-denied', 'Siz bu ittifaqın üzvü deyilsiniz.');
    const updatedMembers = members.filter((id) => id !== owned.playerId);
    const now = Date.now();

    if (alliance.leaderId === owned.playerId) {
      const otherIds = members.filter((id) => id !== owned.playerId);
      const otherRefs = otherIds.map((id) => db.doc(`players/${id}`));
      const memberRefs = otherIds.map((id) => db.collection(`alliance_members/${payload.allianceId}/members`)
        .where('playerId', '==', id));
      const [otherSnaps, memberSnaps] = await Promise.all([
        Promise.all(otherRefs.map((ref) => tx.get(ref))),
        Promise.all(memberRefs.map((query) => tx.get(query))),
      ]);
      tx.delete(allianceRef);
      tx.delete(db.doc(`alliance_members/${payload.allianceId}/members/${uid}`));
      otherSnaps.forEach((snap) => {
        if (snap.exists) tx.update(snap.ref, { allianceId: null, allianceName: null, isLeader: false, score: 0, updatedAt: now });
      });
      memberSnaps.forEach((snap) => snap.docs.forEach((member) => tx.delete(member.ref)));
    } else {
      const assistantLeaderIds = (Array.isArray(alliance.assistantLeaderIds) ? alliance.assistantLeaderIds : [])
        .filter((id) => String(id) !== owned.playerId);
      tx.update(allianceRef, { members: updatedMembers, assistantLeaderIds });
      tx.delete(db.doc(`alliance_members/${payload.allianceId}/members/${uid}`));
    }
    tx.update(owned.playerRef, { allianceId: null, allianceName: null, isLeader: false, score: 0, updatedAt: now });
    return { deleted: alliance.leaderId === owned.playerId };
  });
}

async function updateAllianceName({ uid, payload }) {
  return db.runTransaction(async (tx) => {
    const owned = await getOwnedPlayer(uid, payload.userId, tx);
    const allianceRef = db.doc(`alliances/${payload.allianceId}`);
    const allianceSnap = await tx.get(allianceRef);
    if (!allianceSnap.exists) throw new HttpsError('not-found', 'İttifaq tapılmadı.');
    const alliance = allianceSnap.data();
    if (alliance.leaderId !== owned.playerId) throw new HttpsError('permission-denied', 'Yalnız ittifaq lideri adını dəyişə bilər.');
    const previousName = String(alliance.name || '').trim();
    if (previousName === payload.name) return { name: payload.name };
    const members = [...new Set([...(Array.isArray(alliance.members) ? alliance.members : []), owned.playerId])];
    const refs = members.map((id) => db.doc(`players/${id}`));
    const snaps = await Promise.all(refs.map((ref) => tx.get(ref)));
    const now = Date.now();
    tx.update(allianceRef, { name: payload.name, previousName, nameUpdatedAt: now });
    snaps.forEach((snap) => {
      if (snap.exists) tx.update(snap.ref, { allianceName: payload.name, updatedAt: now });
    });
    return { name: payload.name };
  });
}

async function updateAllianceFlag({ uid, payload }) {
  return db.runTransaction(async (tx) => {
    const owned = await getOwnedPlayer(uid, payload.userId, tx);
    const allianceRef = db.doc(`alliances/${payload.allianceId}`);
    const allianceSnap = await tx.get(allianceRef);
    if (!allianceSnap.exists) throw new HttpsError('not-found', 'İttifaq tapılmadı.');
    if (allianceSnap.data().leaderId !== owned.playerId) {
      throw new HttpsError('permission-denied', 'Yalnız ittifaq lideri bayrağı dəyişə bilər.');
    }
    tx.update(allianceRef, { flag: payload.flag });
    return { flag: payload.flag };
  });
}

async function setAllianceAssistantLeader({ uid, payload }) {
  return db.runTransaction(async (tx) => {
    const owned = await getOwnedPlayer(uid, payload.userId, tx);
    const allianceRef = db.doc(`alliances/${payload.allianceId}`);
    const assistantRef = db.doc(`players/${payload.assistantLeaderId}`);
    const [allianceSnap, assistantSnap] = await Promise.all([
      tx.get(allianceRef),
      tx.get(assistantRef),
    ]);
    if (!allianceSnap.exists) throw new HttpsError('not-found', 'İttifaq tapılmadı.');
    const alliance = allianceSnap.data();
    if (String(alliance.leaderId) !== owned.playerId) {
      throw new HttpsError('permission-denied', 'Köməkçi lideri yalnız ittifaq lideri təyin edə bilər.');
    }
    if (!assistantSnap.exists || assistantSnap.data().allianceId !== payload.allianceId) {
      throw new HttpsError('failed-precondition', 'Köməkçi lider yalnız mövcud ittifaq üzvü ola bilər.');
    }
    if (payload.assistantLeaderId === owned.playerId) {
      throw new HttpsError('invalid-argument', 'Lider özünü köməkçi lider təyin edə bilməz.');
    }

    const members = Array.isArray(alliance.members) ? alliance.members.map(String) : [];
    if (!members.includes(payload.assistantLeaderId)) {
      throw new HttpsError('failed-precondition', 'İstifadəçi bu ittifaqın üzvü deyil.');
    }
    const current = Array.isArray(alliance.assistantLeaderIds)
      ? [...new Set(alliance.assistantLeaderIds.map(String))]
      : [];
    const next = payload.promote
      ? [...new Set([...current, payload.assistantLeaderId])]
      : current.filter((id) => id !== payload.assistantLeaderId);
    tx.update(allianceRef, { assistantLeaderIds: next });
    return { assistantLeaderIds: next };
  });
}

exports.createAlliance = secureCallable('createAlliance', createSchema, createAlliance, { max: 5, windowMs: 60_000 });
exports.joinAlliance = secureCallable('joinAlliance', allianceSchema, joinAlliance, { max: 10, windowMs: 60_000 });
exports.leaveAlliance = secureCallable('leaveAlliance', allianceSchema, leaveAlliance, { max: 10, windowMs: 60_000 });
exports.updateAllianceName = secureCallable('updateAllianceName', updateNameSchema, updateAllianceName, { max: 5, windowMs: 60_000 });
exports.updateAllianceFlag = secureCallable('updateAllianceFlag', updateFlagSchema, updateAllianceFlag, { max: 10, windowMs: 60_000 });
exports.setAllianceAssistantLeader = secureCallable('setAllianceAssistantLeader', assistantLeaderSchema, setAllianceAssistantLeader, { max: 20, windowMs: 60_000 });
