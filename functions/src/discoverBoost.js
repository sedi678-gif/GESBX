const { z } = require('zod');
const {
  db, HttpsError, secureCallable, getOwnedPlayer, readOperation,
  ensureRateLimitTx, writeXpLedger, storedXp,
} = require('./security');

const XP_COST = 5000;
const BOOST_MS = 15 * 60 * 1000;
const schema = z.object({ userId: z.string().regex(/^\d{1,20}$/) }).strict();

async function purchaseDiscoverBoost({ uid, payload, operationId, rateLimit }) {
  const now = Date.now();
  return db.runTransaction(async (tx) => {
    const ledger = await readOperation(tx, uid, operationId, 'xp_ledger');
    if (ledger.data) return ledger.data.result;
    const rate = await ensureRateLimitTx(tx, uid, 'purchaseDiscoverBoost', rateLimit, now);
    const owned = await getOwnedPlayer(uid, payload.userId, tx);
    const balance = storedXp(owned.player);
    if (balance < XP_COST) throw new HttpsError('failed-precondition', 'Kəşf boostu üçün 5000 XP lazımdır.');

    const boostRef = db.doc(`discover_boosts/${owned.playerId}`);
    const boostSnap = await tx.get(boostRef);
    const existingUntil = boostSnap.exists ? Number(boostSnap.data().until) : 0;
    const until = Math.max(now, Number.isFinite(existingUntil) ? existingUntil : 0) + BOOST_MS;
    const xpAfter = balance - XP_COST;
    const result = { until, xpRemaining: xpAfter, durationMs: BOOST_MS, cost: XP_COST };

    tx.set(owned.playerRef, { xp: xpAfter, updatedAt: now }, { merge: true });
    tx.set(boostRef, { userId: owned.playerId, until, updatedAt: now, source: 'xp' }, { merge: true });
    writeXpLedger(tx, ledger.ref, {
      uid, playerId: owned.playerId, operationId,
      type: 'discover_boost_purchase', amount: -XP_COST, xpAfter,
      source: 'discover_15m', result,
    });
    tx.set(rate.ref, rate.next);
    return result;
  });
}

exports.purchaseDiscoverBoost = secureCallable('purchaseDiscoverBoost', schema, purchaseDiscoverBoost, { max: 5, windowMs: 60_000 });
