const { z } = require('zod');
const {
  db, HttpsError, secureCallable, getOwnedPlayer, readOperation,
  ensureRateLimitTx, writeXpLedger, storedXp,
} = require('./security');

const XP_COST_BY_DURATION = new Map([
  [5_000, 100],
  [10_000, 200],
  [25_000, 500],
  [60_000, 1_000],
  [2 * 60_000, 2_000],
  [3 * 60_000, 3_000],
  [4 * 60_000, 4_000],
  [5 * 60_000, 5_000],
]);
const schema = z.object({
  userId: z.string().regex(/^\d{1,20}$/),
  durationMs: z.number().int().refine((durationMs) => XP_COST_BY_DURATION.has(durationMs)),
}).strict();

async function purchaseDiscoverBoost({ uid, payload, operationId, rateLimit }) {
  const now = Date.now();
  return db.runTransaction(async (tx) => {
    const ledger = await readOperation(tx, uid, operationId, 'xp_ledger');
    if (ledger.data) return ledger.data.result;
    const rate = await ensureRateLimitTx(tx, uid, 'purchaseDiscoverBoost', rateLimit, now);
    const owned = await getOwnedPlayer(uid, payload.userId, tx);
    const balance = storedXp(owned.player);
    const durationMs = payload.durationMs;
    const cost = XP_COST_BY_DURATION.get(durationMs);
    if (cost == null) throw new HttpsError('invalid-argument', 'Kəşf boost müddəti düzgün deyil.');
    if (balance < cost) throw new HttpsError('failed-precondition', `Bu boost üçün ${cost} XP lazımdır.`);

    const boostRef = db.doc(`discover_boosts/${owned.playerId}`);
    const boostSnap = await tx.get(boostRef);
    const existingUntil = boostSnap.exists ? Number(boostSnap.data().until) : 0;
    const until = Math.max(now, Number.isFinite(existingUntil) ? existingUntil : 0) + durationMs;
    const xpAfter = balance - cost;
    const result = { until, xpRemaining: xpAfter, durationMs, cost };

    tx.set(owned.playerRef, { xp: xpAfter, updatedAt: now }, { merge: true });
    tx.set(boostRef, { userId: owned.playerId, until, updatedAt: now, source: 'xp' }, { merge: true });
    writeXpLedger(tx, ledger.ref, {
      uid, playerId: owned.playerId, operationId,
      type: 'discover_boost_purchase', amount: -cost, xpAfter,
      source: `discover_${durationMs}ms`, result,
    });
    tx.set(rate.ref, rate.next);
    return result;
  });
}

exports.purchaseDiscoverBoost = secureCallable('purchaseDiscoverBoost', schema, purchaseDiscoverBoost, { max: 5, windowMs: 60_000 });
