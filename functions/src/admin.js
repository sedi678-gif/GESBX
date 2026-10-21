const { z } = require('zod');
const {
  db,
  FieldValue,
  HttpsError,
  secureCallable,
  operationDocId,
  ensureRateLimitTx,
  adminUid,
  storedManat,
  ADMIN_UIDS,
} = require('./security');

const ADMIN_PROFILE_ID = '1';
const playerIdSchema = z.string().regex(/^\d{1,20}$/);
const bootstrapSchema = z.object({ displayName: z.string().trim().min(2).max(100) }).strict();
const sessionSchema = z.object({ displayName: z.string().trim().max(100).optional(), active: z.boolean() }).strict();

function splitName(displayName) {
  const parts = String(displayName || '').trim().split(/\s+/).filter(Boolean);
  return {
    name: parts[0] || 'Admin',
    surname: parts.slice(1).join(' '),
  };
}

async function bootstrapSuperAdmin({ uid, payload, operationId, rateLimit, authToken }) {
  if (!adminUid(uid)) throw new HttpsError('permission-denied', 'Admin icazəsi tələb olunur.');
  const userRef = db.doc(`users/${ADMIN_PROFILE_ID}`);
  const playerRef = db.doc(`players/${ADMIN_PROFILE_ID}`);
  const configRef = db.doc('app_config/admin');
  const counterRef = db.doc('counters/userIdCounter');
  const sessionRef = db.doc(`admin_sessions/${ADMIN_PROFILE_ID}`);
  const opRef = db.doc(`operation_ledger/${operationDocId(uid, operationId)}`);
  const commandRef = db.doc(`admin_commands/${operationDocId(uid, operationId)}`);
  const now = Date.now();
  const names = splitName(payload.displayName);

  return db.runTransaction(async (tx) => {
    const operation = await tx.get(opRef);
    if (operation.exists) return operation.data().result;
    const rate = await ensureRateLimitTx(tx, uid, 'bootstrapSuperAdmin', rateLimit, now);
    const [userSnap, playerSnap, configSnap, counterSnap] = await Promise.all([
      tx.get(userRef), tx.get(playerRef), tx.get(configRef), tx.get(counterRef),
    ]);
    if (userSnap.exists && userSnap.data().firebaseUid && userSnap.data().firebaseUid !== uid) {
      throw new HttpsError('permission-denied', 'Admin profil ID-si başqa Firebase hesabına bağlıdır.');
    }
    if (playerSnap.exists && playerSnap.data().firebaseUid && playerSnap.data().firebaseUid !== uid) {
      throw new HttpsError('permission-denied', 'Admin oyunçu ID-si başqa Firebase hesabına bağlıdır.');
    }
    const oldUser = userSnap.exists ? userSnap.data() : {};
    const oldPlayer = playerSnap.exists ? playerSnap.data() : {};
    const trustedPlayer = oldPlayer.identityVerifiedAt && oldPlayer.firebaseUid === uid;
    const result = { userId: ADMIN_PROFILE_ID, active: true };
    tx.set(userRef, {
      id: ADMIN_PROFILE_ID,
      ...names,
      handle: oldUser.handle || '@admin',
      role: 'super_admin',
      isAdmin: true,
      isModerator: true,
      canViewReports: true,
      canAccessAdminPanel: true,
      firebaseUid: uid,
      email: oldUser.email || authToken.email || null,
      createdAt: oldUser.createdAt || now,
      updatedAt: now,
    }, { merge: true });
    tx.set(playerRef, {
      odId: ADMIN_PROFILE_ID,
      firebaseUid: uid,
      identityVerifiedAt: trustedPlayer ? oldPlayer.identityVerifiedAt : now,
      displayName: payload.displayName,
      allianceId: trustedPlayer ? (oldPlayer.allianceId || null) : null,
      allianceName: trustedPlayer ? (oldPlayer.allianceName || null) : null,
      isLeader: false,
      manat: trustedPlayer ? storedManat(oldPlayer) : 0,
      coins: trustedPlayer ? storedManat(oldPlayer) : 0,
      xp: trustedPlayer ? Math.max(0, Math.floor(Number(oldPlayer.xp) || 0)) : 0,
      battleCards: trustedPlayer ? oldPlayer.battleCards : { zombi: 0, yarasa: 0, duman: 0, mutant: 0, standing: 0, it: 0 },
      activeShields: trustedPlayer && Array.isArray(oldPlayer.activeShields) ? oldPlayer.activeShields : [],
      cosmetics: trustedPlayer && oldPlayer.cosmetics ? oldPlayer.cosmetics : { owned: [], equipped: {}, vip: { tier: 'none', expiresAt: 0 } },
      userPlan: trustedPlayer ? (oldPlayer.userPlan || 'FREE') : 'FREE',
      hasVipPass: trustedPlayer && oldPlayer.hasVipPass === true,
      isVipLifetime: trustedPlayer && oldPlayer.isVipLifetime === true,
      proPanelActive: trustedPlayer && oldPlayer.proPanelActive === true,
      battleCardsVersion: 4,
      updatedAt: now,
    }, { merge: true });
    if (!configSnap.exists) tx.create(configRef, { superAdminId: ADMIN_PROFILE_ID, minNewUserId: 2, updatedAt: now });
    const currentId = counterSnap.exists ? Math.max(1, Math.floor(Number(counterSnap.data().currentId) || 1)) : 1;
    tx.set(counterRef, { currentId: Math.max(1, currentId), reservedAdminId: ADMIN_PROFILE_ID, updatedAt: now }, { merge: true });
    tx.set(sessionRef, { adminId: ADMIN_PROFILE_ID, adminUid: uid, displayName: payload.displayName, active: true, lastLoginAt: now }, { merge: true });
    tx.create(commandRef, { adminId: ADMIN_PROFILE_ID, adminUid: uid, action: 'bootstrap_super_admin', details: {}, createdAt: now });
    tx.create(opRef, { authUid: uid, operationId, action: 'bootstrapSuperAdmin', result, createdAt: FieldValue.serverTimestamp() });
    tx.set(rate.ref, rate.next);
    return result;
  });
}

async function recordAdminSession({ uid, payload, operationId, rateLimit }) {
  if (!adminUid(uid)) throw new HttpsError('permission-denied', 'Admin icazəsi tələb olunur.');
  const opRef = db.doc(`operation_ledger/${operationDocId(uid, operationId)}`);
  const sessionRef = db.doc(`admin_sessions/${ADMIN_PROFILE_ID}`);
  const commandRef = db.doc(`admin_commands/${operationDocId(uid, operationId)}`);
  const now = Date.now();
  return db.runTransaction(async (tx) => {
    const operation = await tx.get(opRef);
    if (operation.exists) return operation.data().result;
    const rate = await ensureRateLimitTx(tx, uid, 'recordAdminSession', rateLimit, now);
    const session = await tx.get(sessionRef);
    const result = { active: payload.active };
    tx.set(sessionRef, {
      adminId: ADMIN_PROFILE_ID,
      adminUid: uid,
      ...(payload.displayName ? { displayName: payload.displayName } : {}),
      active: payload.active,
      ...(payload.active ? { lastLoginAt: now } : { lastLogoutAt: now }),
    }, { merge: true });
    tx.create(commandRef, {
      adminId: ADMIN_PROFILE_ID,
      adminUid: uid,
      action: payload.active ? 'admin_login' : 'admin_logout',
      details: payload.displayName ? { displayName: payload.displayName } : {},
      createdAt: now,
      wasActive: session.exists && session.data().active === true,
    });
    tx.create(opRef, { authUid: uid, operationId, action: 'recordAdminSession', result, createdAt: FieldValue.serverTimestamp() });
    tx.set(rate.ref, rate.next);
    return result;
  });
}

async function runAdminMutation(context, action, targetUserId, details, mutate) {
  const { uid, operationId, rateLimit } = context;
  if (!adminUid(uid)) throw new HttpsError('permission-denied', 'Admin icazəsi tələb olunur.');
  const opRef = db.doc(`operation_ledger/${operationDocId(uid, operationId)}`);
  const commandRef = db.doc(`admin_commands/${operationDocId(uid, operationId)}`);
  const now = Date.now();
  return db.runTransaction(async (tx) => {
    const operation = await tx.get(opRef);
    if (operation.exists) return operation.data().result;
    const rate = await ensureRateLimitTx(tx, uid, action, rateLimit, now);
    const result = await mutate(tx, now);
    tx.create(commandRef, {
      adminId: ADMIN_PROFILE_ID,
      adminUid: uid,
      action,
      targetUserId: targetUserId || null,
      details: details || {},
      createdAt: now,
    });
    tx.create(opRef, { authUid: uid, operationId, action, result, createdAt: FieldValue.serverTimestamp() });
    tx.set(rate.ref, rate.next);
    return result;
  });
}

async function adminResolveReport(context) {
  const reportRef = db.doc(`reports/${context.payload.reportId}`);
  return runAdminMutation(context, 'resolve_report', undefined, { status: context.payload.status }, async (tx, now) => {
    const report = await tx.get(reportRef);
    if (!report.exists) throw new HttpsError('not-found', 'Şikayət tapılmadı.');
    tx.update(reportRef, { status: context.payload.status, resolvedAt: now, resolvedBy: context.uid });
    return { reportId: reportRef.id, status: context.payload.status };
  });
}

async function adminPunishUser(context) {
  const userId = context.payload.targetUserId;
  const userRef = db.doc(`users/${userId}`);
  const playerRef = db.doc(`players/${userId}`);
  const until = Date.now() + context.payload.days * 24 * 60 * 60 * 1000;
  return runAdminMutation(context, 'punish_user', userId, { days: context.payload.days, reason: context.payload.reason, until }, async (tx, now) => {
    const [user, player] = await Promise.all([tx.get(userRef), tx.get(playerRef)]);
    if (!user.exists) throw new HttpsError('not-found', 'İstifadəçi tapılmadı.');
    tx.update(userRef, { punishedUntil: until, punishReason: context.payload.reason, updatedAt: now, punishedBy: context.uid });
    if (player.exists) tx.update(playerRef, { punishedUntil: until, updatedAt: now });
    return { userId, punishedUntil: until };
  });
}

async function adminBanUser(context) {
  const userId = context.payload.targetUserId;
  const userRef = db.doc(`users/${userId}`);
  const playerRef = db.doc(`players/${userId}`);
  return runAdminMutation(context, context.payload.banned ? 'ban_user' : 'unban_user', userId, { banned: context.payload.banned }, async (tx, now) => {
    const [user, player] = await Promise.all([tx.get(userRef), tx.get(playerRef)]);
    if (!user.exists) throw new HttpsError('not-found', 'İstifadəçi tapılmadı.');
    tx.update(userRef, { banned: context.payload.banned, updatedAt: now, bannedBy: context.payload.banned ? context.uid : null });
    if (player.exists) tx.update(playerRef, { banned: context.payload.banned, updatedAt: now });
    return { userId, banned: context.payload.banned };
  });
}

async function adminDeleteUser(context) {
  const userId = context.payload.targetUserId;
  if (userId === ADMIN_PROFILE_ID) throw new HttpsError('failed-precondition', 'Super admin silinə bilməz.');
  const userRef = db.doc(`users/${userId}`);
  const playerRef = db.doc(`players/${userId}`);
  return runAdminMutation(context, 'delete_user', userId, {}, async (tx) => {
    const [user, player] = await Promise.all([tx.get(userRef), tx.get(playerRef)]);
    if (!user.exists) throw new HttpsError('not-found', 'İstifadəçi tapılmadı.');
    tx.delete(userRef);
    if (player.exists) tx.delete(playerRef);
    return { userId, deleted: true };
  });
}

async function adminGrantModerator(context) {
  const userId = context.payload.targetUserId;
  const userRef = db.doc(`users/${userId}`);
  return runAdminMutation(context, context.payload.grant ? 'grant_moderator' : 'revoke_moderator', userId, { grant: context.payload.grant }, async (tx, now) => {
    const user = await tx.get(userRef);
    if (!user.exists) throw new HttpsError('not-found', 'İstifadəçi tapılmadı.');
    tx.update(userRef, {
      isModerator: context.payload.grant,
      canViewReports: context.payload.grant,
      updatedAt: now,
      moderatorBy: context.payload.grant ? context.uid : null,
    });
    return { userId, isModerator: context.payload.grant };
  });
}

const reportSchema = z.object({ reportId: z.string().min(6).max(120), status: z.enum(['resolved', 'dismissed']) }).strict();
const punishSchema = z.object({ targetUserId: playerIdSchema, days: z.number().int().min(1).max(365), reason: z.string().trim().min(1).max(500) }).strict();
const banSchema = z.object({ targetUserId: playerIdSchema, banned: z.boolean() }).strict();
const deleteSchema = z.object({ targetUserId: playerIdSchema }).strict();
const moderatorSchema = z.object({ targetUserId: playerIdSchema, grant: z.boolean() }).strict();

async function allocateUserId({ uid }) {
  const counterRef = db.doc('counters/userIdCounter');
  const configRef = db.doc('app_config/admin');
  return db.runTransaction(async (tx) => {
    const [counterSnap, configSnap] = await Promise.all([tx.get(counterRef), tx.get(configRef)]);
    let candidate = Math.max(2, Number(counterSnap.data()?.currentId || 1) + 1,
      Number(configSnap.data()?.minNewUserId || 2));
    for (let attempt = 0; attempt < 100; attempt += 1, candidate += 1) {
      const [userSnap, playerSnap] = await Promise.all([
        tx.get(db.doc(`users/${candidate}`)), tx.get(db.doc(`players/${candidate}`)),
      ]);
      if (userSnap.exists || playerSnap.exists) continue;
      tx.set(counterRef, { currentId: candidate, reservedAdminId: ADMIN_PROFILE_ID, updatedAt: Date.now() }, { merge: true });
      return { userId: String(candidate) };
    }
    throw new HttpsError('resource-exhausted', 'İstifadəçi ID-si ayrıla bilmədi.');
  });
}

exports.allocateUserId = secureCallable(
  'allocateUserId', z.object({}).strict(), allocateUserId, { max: 10, windowMs: 60_000 },
  [ADMIN_UIDS],
);

exports.bootstrapSuperAdmin = secureCallable(
  'bootstrapSuperAdmin', bootstrapSchema, bootstrapSuperAdmin, { max: 5, windowMs: 60_000 },
  [ADMIN_UIDS],
);
exports.recordAdminSession = secureCallable(
  'recordAdminSession', sessionSchema, recordAdminSession, { max: 30, windowMs: 60_000 },
  [ADMIN_UIDS],
);
exports.adminResolveReport = secureCallable('adminResolveReport', reportSchema, adminResolveReport, { max: 60, windowMs: 60_000 }, [ADMIN_UIDS]);
exports.adminPunishUser = secureCallable('adminPunishUser', punishSchema, adminPunishUser, { max: 30, windowMs: 60_000 }, [ADMIN_UIDS]);
exports.adminBanUser = secureCallable('adminBanUser', banSchema, adminBanUser, { max: 30, windowMs: 60_000 }, [ADMIN_UIDS]);
exports.adminDeleteUser = secureCallable('adminDeleteUser', deleteSchema, adminDeleteUser, { max: 10, windowMs: 60_000 }, [ADMIN_UIDS]);
exports.adminGrantModerator = secureCallable('adminGrantModerator', moderatorSchema, adminGrantModerator, { max: 30, windowMs: 60_000 }, [ADMIN_UIDS]);
