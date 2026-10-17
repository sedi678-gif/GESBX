const crypto = require('node:crypto');
const { z } = require('zod');
const {
  db,
  FieldValue,
  HttpsError,
  secureCallable,
  operationDocId,
  getOwnedPlayer,
  readOperation,
  ensureRateLimitTx,
  writeXpLedger,
  storedXp,
} = require('./security');

const idSchema = z.string().regex(/^\d{1,20}$/);
const userSchema = z.object({ userId: idSchema }).strict();
const startSchema = z.object({ userId: idSchema, videoId: z.string().min(1).max(180) }).strict();
const heartbeatSchema = z.object({ userId: idSchema, sessionId: z.string().min(12).max(100) }).strict();
const completeSchema = z.object({
  userId: idSchema,
  sessionId: z.string().min(12).max(100),
  playedSeconds: z.number().finite().min(0).max(3600),
}).strict();

function uidKey(uid) {
  return crypto.createHash('sha256').update(uid).digest('hex').slice(0, 32);
}

function startReelRewardView({ uid, payload, operationId, rateLimit }) {
  const sessionId = operationDocId(uid, `reel-start:${operationId}`);
  const sessionRef = db.doc(`reel_view_sessions/${sessionId}`);
  const postRef = db.doc(`posts/${payload.videoId}`);
  const now = Date.now();
  return db.runTransaction(async (tx) => {
    const existing = await tx.get(sessionRef);
    if (existing.exists) return { sessionId, startedAt: existing.data().startedAt };
    const rate = await ensureRateLimitTx(tx, uid, 'startReelRewardView', rateLimit, now);
    const owned = await getOwnedPlayer(uid, payload.userId, tx);
    const postSnap = await tx.get(postRef);
    if (!postSnap.exists) throw new HttpsError('not-found', 'Video tapılmadı.');
    const post = postSnap.data();
    if (String(post.userId) === owned.playerId) throw new HttpsError('failed-precondition', 'Öz videona baxış üçün XP verilmir.');
    const duration = Number(post.durationSeconds ?? post.videoDurationSeconds);
    if (post.mediaType !== 'video' || !Number.isFinite(duration) || duration < 5 || duration > 3600) {
      throw new HttpsError('failed-precondition', 'Videonun uzunluğu təsdiqlənmir.');
    }
    tx.create(sessionRef, {
      authUid: uid,
      playerId: owned.playerId,
      videoId: payload.videoId,
      durationSeconds: duration,
      startedAt: now,
      heartbeatCount: 0,
      lastHeartbeatAt: 0,
      status: 'watching',
      expiresAt: now + 24 * 60 * 60 * 1000,
      createdAt: FieldValue.serverTimestamp(),
    });
    tx.set(rate.ref, rate.next);
    return { sessionId, startedAt: now, durationSeconds: duration };
  });
}

function heartbeatReelRewardView({ uid, payload, rateLimit }) {
  const sessionRef = db.doc(`reel_view_sessions/${payload.sessionId}`);
  const now = Date.now();
  return db.runTransaction(async (tx) => {
    const rate = await ensureRateLimitTx(tx, uid, 'heartbeatReelRewardView', rateLimit, now);
    const sessionSnap = await tx.get(sessionRef);
    if (!sessionSnap.exists || sessionSnap.data().authUid !== uid) throw new HttpsError('not-found', 'Baxış sessiyası tapılmadı.');
    const session = sessionSnap.data();
    if (session.status !== 'watching') throw new HttpsError('failed-precondition', 'Baxış sessiyası artıq aktiv deyil.');
    if (now - Number(session.startedAt) > Math.max(180_000, Number(session.durationSeconds) * 4_000)) {
      throw new HttpsError('deadline-exceeded', 'Baxış sessiyasının vaxtı bitib.');
    }
    const elapsed = now - Number(session.lastHeartbeatAt || session.startedAt);
    if (elapsed < 4_000) {
      tx.set(rate.ref, rate.next);
      return { heartbeatCount: Number(session.heartbeatCount) || 0, accepted: false };
    }
    const nextCount = Math.min(240, (Number(session.heartbeatCount) || 0) + 1);
    tx.update(sessionRef, { heartbeatCount: nextCount, lastHeartbeatAt: now, updatedAt: FieldValue.serverTimestamp() });
    tx.set(rate.ref, rate.next);
    return { heartbeatCount: nextCount, accepted: true };
  });
}

function completeReelRewardView({ uid, payload, operationId, rateLimit }) {
  const sessionRef = db.doc(`reel_view_sessions/${payload.sessionId}`);
  const now = Date.now();
  const dayKey = new Date(now).toISOString().slice(0, 10);
  const dailyRef = db.doc(`reel_reward_daily/${uidKey(uid)}_${dayKey}`);
  const completionRef = db.doc(`reel_reward_views/${operationDocId(uid, `${payload.sessionId}:${dayKey}`)}`);

  return db.runTransaction(async (tx) => {
    const xpLedger = await readOperation(tx, uid, operationId, 'xp_ledger');
    if (xpLedger.data) return xpLedger.data.result;
    const rate = await ensureRateLimitTx(tx, uid, 'completeReelRewardView', rateLimit, now);
    const sessionSnap = await tx.get(sessionRef);
    if (!sessionSnap.exists || sessionSnap.data().authUid !== uid) throw new HttpsError('not-found', 'Baxış sessiyası tapılmadı.');
    const session = sessionSnap.data();
    const owned = await getOwnedPlayer(uid, payload.userId, tx);
    const [dailySnap, completedSnap] = await Promise.all([tx.get(dailyRef), tx.get(completionRef)]);
    if (session.playerId !== owned.playerId) throw new HttpsError('permission-denied', 'Baxış sessiyası bu oyunçuya aid deyil.');
    if (completedSnap.exists || session.status === 'completed') {
      const duplicateResult = { xp: 0, dailyXp: Number(dailySnap.data()?.earnedXp) || 0, duplicate: true };
      tx.set(rate.ref, rate.next);
      return duplicateResult;
    }
    if (session.status !== 'watching') throw new HttpsError('failed-precondition', 'Baxış sessiyası etibarlı deyil.');

    const elapsedSeconds = (now - Number(session.startedAt)) / 1000;
    const videoSeconds = Number(session.durationSeconds);
    const playedSeconds = Number(payload.playedSeconds);
    const requiredSeconds = Math.min(videoSeconds, Math.max(5, videoSeconds * 0.7));
    const requiredHeartbeats = Math.max(1, Math.floor(requiredSeconds / 8));
    if (elapsedSeconds + 1 < requiredSeconds || playedSeconds < requiredSeconds || playedSeconds > elapsedSeconds + 3) {
      throw new HttpsError('failed-precondition', 'Video minimum izlənmə müddəti tamamlanmayıb.');
    }
    if ((Number(session.heartbeatCount) || 0) < requiredHeartbeats) {
      throw new HttpsError('failed-precondition', 'Video baxış fəaliyyəti təsdiqlənmədi.');
    }
    if (elapsedSeconds > Math.max(180, videoSeconds * 4)) {
      throw new HttpsError('deadline-exceeded', 'Baxış sessiyasının vaxtı bitib.');
    }

    const dailyXp = dailySnap.exists ? Math.max(0, Number(dailySnap.data().earnedXp) || 0) : 0;
    const xpModeDisabled = owned.player.proPanelActive === true;
    const award = xpModeDisabled || dailyXp >= 500 ? 0 : Math.min(1, 500 - dailyXp);
    if (award === 0) {
      const result = { xp: 0, dailyXp, capped: dailyXp >= 500, xpModeDisabled };
      tx.update(sessionRef, { status: 'completed', completedAt: now, updatedAt: FieldValue.serverTimestamp() });
      tx.create(completionRef, { authUid: uid, playerId: owned.playerId, videoId: session.videoId, dateKey: dayKey, xp: 0, createdAt: FieldValue.serverTimestamp() });
      tx.set(rate.ref, rate.next);
      return result;
    }

    const nextXp = storedXp(owned.player) + award;
    const nextDailyXp = dailyXp + award;
    const result = { xp: award, dailyXp: nextDailyXp, capped: nextDailyXp >= 500 };
    tx.update(sessionRef, { status: 'completed', completedAt: now, updatedAt: FieldValue.serverTimestamp() });
    tx.create(completionRef, { authUid: uid, playerId: owned.playerId, videoId: session.videoId, dateKey: dayKey, xp: award, createdAt: FieldValue.serverTimestamp() });
    tx.set(dailyRef, { authUid: uid, dateKey: dayKey, earnedXp: nextDailyXp, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    tx.set(owned.playerRef, { xp: nextXp, updatedAt: now }, { merge: true });
    writeXpLedger(tx, xpLedger.ref, {
      uid, playerId: owned.playerId, operationId, type: 'reel_view', amount: award,
      xpAfter: nextXp, source: session.videoId, result,
    });
    tx.set(rate.ref, rate.next);
    return result;
  });
}

const startReelRewardView = secureCallable('startReelRewardView', startSchema, startReelRewardView, { max: 20, windowMs: 60_000 });
const heartbeatReelRewardView = secureCallable('heartbeatReelRewardView', heartbeatSchema, heartbeatReelRewardView, { max: 20, windowMs: 60_000 });
const completeReelRewardView = secureCallable('completeReelRewardView', completeSchema, completeReelRewardView, { max: 20, windowMs: 60_000 });

module.exports = { startReelRewardView, heartbeatReelRewardView, completeReelRewardView };
