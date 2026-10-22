const crypto = require('node:crypto');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { onSchedule } = require('firebase-functions/v2/scheduler');

const db = getFirestore();
const SCALE = 10_000; // wallet and payout precision: 4 decimal places
const VIP_POOL_BPS = 5_000;
const STANDARD_POOL_BPS = 3_000;

function toUnits(amount) {
  const value = Number(amount);
  if (!Number.isFinite(value) || value < 0 || value * SCALE > Number.MAX_SAFE_INTEGER) {
    throw new Error('Revenue amount must be finite, non-negative, and within the supported precision range.');
  }
  return Math.round(value * SCALE);
}

function fromUnits(units) {
  return Number((units / SCALE).toFixed(4));
}

function addUnits(left, right) {
  const total = BigInt(left) + BigInt(right);
  if (total > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error('Revenue pool exceeds the supported precision range.');
  }
  return Number(total);
}

function percentageUnits(units, basisPoints) {
  return Number((BigInt(units) * BigInt(basisPoints)) / 10_000n);
}

function monthIdFor(date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function previousMonthId(now = new Date()) {
  return monthIdFor(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)));
}

function nextMonthId(monthId) {
  const [year, month] = monthId.split('-').map(Number);
  return monthIdFor(new Date(Date.UTC(year, month, 1)));
}

function isVipCreator(player, user, atMillis) {
  if (player.userPlan === 'VIP_PRO' && player.hasVipPass === true) return true;
  const playerVip = player.cosmetics?.vip;
  if (playerVip && ['gold', 'platinum'].includes(playerVip.tier) && Number(playerVip.expiresAt) > atMillis) return true;
  return ['gold', 'platinum'].includes(user.vipTier) && Number(user.vipExpiresAt) > atMillis;
}

/**
 * Allocate integer 1e-4 currency units proportionally. Largest-remainder
 * allocation makes each eligible pool add up exactly to its pool amount.
 */
function allocatePool(poolUnits, creators, viewsField) {
  const eligible = creators
    .map((creator) => {
      const rawViews = Number(creator[viewsField] || 0);
      if (!Number.isFinite(rawViews) || rawViews < 0 || rawViews > Number.MAX_SAFE_INTEGER) {
        throw new Error(`Creator ${creator.creatorId} has an invalid monthly view count.`);
      }
      return { ...creator, views: Math.floor(rawViews) };
    })
    .filter((creator) => creator.views > 0)
    .sort((a, b) => String(a.creatorId).localeCompare(String(b.creatorId)));
  const totalViews = eligible.reduce((total, creator) => total + BigInt(creator.views), 0n);
  if (totalViews > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error('Monthly view total exceeds the supported precision range.');
  }
  if (totalViews === 0n) {
    return { totalViews: 0, rpm: 0, payouts: [], unallocatedUnits: poolUnits };
  }
  if (poolUnits <= 0) {
    return { totalViews: Number(totalViews), rpm: 0, payouts: [], unallocatedUnits: 0 };
  }

  const pool = BigInt(poolUnits);
  const shares = eligible.map((creator) => {
    const numerator = pool * BigInt(creator.views);
    return { ...creator, units: numerator / totalViews, remainder: numerator % totalViews };
  });
  let remainderUnits = pool - shares.reduce((sum, share) => sum + share.units, 0n);
  const remainderOrder = [...shares].sort((a, b) => {
    if (a.remainder === b.remainder) return String(a.creatorId).localeCompare(String(b.creatorId));
    return a.remainder > b.remainder ? -1 : 1;
  });
  for (const share of remainderOrder) {
    if (remainderUnits === 0n) break;
    share.units += 1n;
    remainderUnits -= 1n;
  }

  const viewCount = Number(totalViews);
  const rpm = Number(((poolUnits / SCALE / viewCount) * 1_000).toFixed(4));
  return {
    totalViews: viewCount,
    rpm,
    payouts: shares.filter((share) => share.units > 0n).map((share) => ({
      creatorId: String(share.creatorId),
      authUid: String(share.authUid || ''),
      views: share.views,
      amountUnits: Number(share.units),
      amount: fromUnits(Number(share.units)),
    })),
    unallocatedUnits: 0,
  };
}

function calculateCreatorRevenuePayouts({ totalRevenueAmount, vipRolloverAmount = 0, standardRolloverAmount = 0, creators = [] }) {
  const revenueUnits = toUnits(totalRevenueAmount);
  const vipRolloverUnits = toUnits(vipRolloverAmount);
  const standardRolloverUnits = toUnits(standardRolloverAmount);
  const vipRevenueUnits = percentageUnits(revenueUnits, VIP_POOL_BPS);
  const standardRevenueUnits = percentageUnits(revenueUnits, STANDARD_POOL_BPS);
  const vipPoolUnits = addUnits(vipRevenueUnits, vipRolloverUnits);
  const standardPoolUnits = addUnits(standardRevenueUnits, standardRolloverUnits);
  const vip = allocatePool(vipPoolUnits, creators, 'vipViews');
  const standard = allocatePool(standardPoolUnits, creators, 'standardViews');
  return {
    totalRevenueAmount: fromUnits(revenueUnits),
    vipPoolAmount: fromUnits(vipPoolUnits),
    standardPoolAmount: fromUnits(standardPoolUnits),
    platformRemainderAmount: fromUnits(revenueUnits - vipRevenueUnits - standardRevenueUnits),
    vipRolloverAmount: fromUnits(vip.unallocatedUnits),
    standardRolloverAmount: fromUnits(standard.unallocatedUnits),
    vip,
    standard,
  };
}

async function aggregateEligibleReelView(event) {
  const view = event.data?.data();
  const viewerAuthUid = String(event.params.viewerAuthUid || '');
  if (!view || view.viewerAuthUid !== viewerAuthUid) return;
  if (!view.postId || !view.ownerId || !view.viewerId || view.ownerId === view.viewerId) return;

  const eventMillis = Date.parse(event.time || '');
  if (!Number.isFinite(eventMillis)) return;
  const eventId = crypto.createHash('sha256').update(String(event.id)).digest('hex');
  const markerRef = db.doc(`creator_view_events/${eventId}`);
  const postRef = db.doc(`posts/${view.postId}`);
  const viewerRef = db.doc(`users/${view.viewerId}`);
  const creatorRef = db.doc(`users/${view.ownerId}`);
  const creatorPlayerRef = db.doc(`players/${view.ownerId}`);
  const [postSnap, viewerSnap, creatorSnap, playerSnap] = await Promise.all([
    postRef.get(), viewerRef.get(), creatorRef.get(), creatorPlayerRef.get(),
  ]);
  if (!postSnap.exists || !viewerSnap.exists || !creatorSnap.exists || !playerSnap.exists) return;

  const post = postSnap.data();
  const viewer = viewerSnap.data();
  const creator = creatorSnap.data();
  const player = playerSnap.data();
  if (post.userId !== String(view.ownerId) || post.mediaType !== 'video' || post.moderationStatus !== 'approved') return;
  if (viewer.firebaseUid !== viewerAuthUid || !viewerSnap.data().id || String(viewer.id) !== String(view.viewerId)) return;
  if (creator.firebaseUid !== player.firebaseUid || !creator.firebaseUid || !player.identityVerifiedAt) return;
  if (player.banned === true || player.frozen === true || creator.banned === true || creator.frozen === true) return;

  const monthId = monthIdFor(new Date(eventMillis));
  const creatorRefForMonth = db.doc(`creator_monthly_views/${monthId}/creators/${view.ownerId}`);
  const settlementRef = db.doc(`revenue_payout_logs/${monthId}`);
  const creatorIsVip = isVipCreator(player, creator, eventMillis);
  await db.runTransaction(async (tx) => {
    const [markerSnap, aggregateSnap, settlementSnap] = await Promise.all([
      tx.get(markerRef), tx.get(creatorRefForMonth), tx.get(settlementRef),
    ]);
    if (markerSnap.exists) return;
    // Freeze this billing month as soon as settlement starts so a delayed trigger
    // cannot change the payout snapshot while a run or retry is in progress.
    if (settlementSnap.exists && settlementSnap.data().status !== 'collecting') return;
    const prior = aggregateSnap.exists ? aggregateSnap.data() : {};
    const field = creatorIsVip ? 'vipViews' : 'standardViews';
    tx.set(creatorRefForMonth, {
      creatorId: String(view.ownerId),
      authUid: creator.firebaseUid,
      vipViews: Math.max(0, Number(prior.vipViews) || 0) + (field === 'vipViews' ? 1 : 0),
      standardViews: Math.max(0, Number(prior.standardViews) || 0) + (field === 'standardViews' ? 1 : 0),
      totalViews: Math.max(0, Number(prior.totalViews) || 0) + 1,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    tx.create(markerRef, { monthId, creatorId: String(view.ownerId), eventId: event.id, countedAt: FieldValue.serverTimestamp() });
  });
}

async function creditCreatorPayout({ monthId, pool, currency, payout, rpm }) {
  if (!payout.authUid) throw new Error(`Creator ${payout.creatorId} has no verified Firebase UID.`);
  const walletRef = db.doc(`user_wallets/${payout.creatorId}`);
  const payoutRef = walletRef.collection('payouts').doc(`${monthId}_${pool}`);
  return db.runTransaction(async (tx) => {
    const [walletSnap, payoutSnap] = await Promise.all([tx.get(walletRef), tx.get(payoutRef)]);
    if (payoutSnap.exists) return { credited: false, amount: Number(payoutSnap.data().amount) || 0 };
    const wallet = walletSnap.exists ? walletSnap.data() : {};
    if (wallet.authUid && wallet.authUid !== payout.authUid) {
      throw new Error(`Wallet owner mismatch for creator ${payout.creatorId}.`);
    }
    if (wallet.currency && wallet.currency !== currency) {
      throw new Error(`Currency mismatch in creator wallet ${payout.creatorId}.`);
    }
    const balanceUnits = addUnits(toUnits(wallet.balance || 0), payout.amountUnits);
    tx.set(walletRef, {
      creatorId: payout.creatorId,
      authUid: payout.authUid,
      currency,
      balance: fromUnits(balanceUnits),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    tx.create(payoutRef, {
      monthId,
      pool,
      authUid: payout.authUid,
      currency,
      views: payout.views,
      rpm,
      amount: payout.amount,
      createdAt: FieldValue.serverTimestamp(),
    });
    return { credited: true, amount: payout.amount };
  });
}

async function creditPoolPayouts({ monthId, pool, currency, payouts, rpm }) {
  const batchSize = 20;
  let creditedUnits = 0;
  for (let offset = 0; offset < payouts.length; offset += batchSize) {
    const batch = payouts.slice(offset, offset + batchSize);
    const results = await Promise.allSettled(batch.map((payout) =>
      creditCreatorPayout({ monthId, pool, currency, payout, rpm }),
    ));
    for (const result of results) {
      if (result.status === 'fulfilled') creditedUnits = addUnits(creditedUnits, toUnits(result.value.amount));
    }
    const failed = results.find((result) => result.status === 'rejected');
    if (failed) throw failed.reason;
  }
  return creditedUnits;
}

async function settleCreatorAdRevenue(monthId) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(monthId)) throw new Error('Invalid billing month. Expected YYYY-MM.');
  const revenueRef = db.doc(`creator_ad_revenue/${monthId}`);
  const logRef = db.doc(`revenue_payout_logs/${monthId}`);
  const lockToken = crypto.randomUUID();
  const lock = await db.runTransaction(async (tx) => {
    const existingSnap = await tx.get(logRef);
    const existing = existingSnap.exists ? existingSnap.data() : {};
    if (existing.status === 'processed') return { acquired: false };
    if (existing.status === 'processing' && Number(existing.lockUntil) > Date.now()) {
      throw new Error(`Settlement for ${monthId} is already running.`);
    }
    const revenueSnap = await tx.get(revenueRef);
    if (!revenueSnap.exists) throw new Error(`Revenue report creator_ad_revenue/${monthId} does not exist.`);
    const revenue = revenueSnap.data();
    if (revenue.status !== 'ready') throw new Error(`Revenue report ${monthId} is not marked ready.`);
    const currency = String(revenue.currency || '').trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) throw new Error(`Revenue report ${monthId} has an invalid ISO currency.`);
    tx.set(logRef, {
      monthId,
      status: 'processing',
      lockToken,
      // Longer than the maximum function timeout to prevent overlapping runs.
      lockUntil: Date.now() + 15 * 60_000,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    return { acquired: true, revenue };
  });
  if (!lock.acquired) return { monthId, status: 'already_processed' };

  try {
    const creatorsRef = db.collection(`creator_monthly_views/${monthId}/creators`);
    const revenue = lock.revenue;
    const currency = String(lock.revenue.currency).trim().toUpperCase();
    const creatorsSnap = await creatorsRef.get();
    const creators = creatorsSnap.docs.map((docSnap) => ({ creatorId: docSnap.id, ...docSnap.data() }));
    const payoutPlan = calculateCreatorRevenuePayouts({
      totalRevenueAmount: revenue.totalRevenueAmount,
      vipRolloverAmount: revenue.vipRolloverAmount || 0,
      standardRolloverAmount: revenue.standardRolloverAmount || 0,
      creators,
    });
    const planHash = crypto.createHash('sha256')
      .update(JSON.stringify({ currency, payoutPlan }))
      .digest('hex');
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(logRef);
      const log = snap.exists ? snap.data() : {};
      if (log.lockToken !== lockToken) throw new Error(`Settlement lock lost for ${monthId}.`);
      if (log.planHash && log.planHash !== planHash) {
        throw new Error(`Settlement inputs changed after processing started for ${monthId}.`);
      }
      tx.update(logRef, { planHash, updatedAt: FieldValue.serverTimestamp() });
    });

    const [vipCreditedUnits, standardCreditedUnits] = await Promise.all([
      creditPoolPayouts({ monthId, pool: 'vip', currency, payouts: payoutPlan.vip.payouts, rpm: payoutPlan.vip.rpm }),
      creditPoolPayouts({ monthId, pool: 'standard', currency, payouts: payoutPlan.standard.payouts, rpm: payoutPlan.standard.rpm }),
    ]);

    const rolloverApplied = await db.runTransaction(async (tx) => {
      const [logSnap, nextRevenueSnap] = await Promise.all([
        tx.get(logRef),
        tx.get(db.doc(`creator_ad_revenue/${nextMonthId(monthId)}`)),
      ]);
      const log = logSnap.exists ? logSnap.data() : {};
      if (log.lockToken !== lockToken) throw new Error(`Settlement lock lost for ${monthId}.`);
      if (log.rolloverApplied === true) return false;
      const nextRef = db.doc(`creator_ad_revenue/${nextMonthId(monthId)}`);
      const nextRevenue = nextRevenueSnap.exists ? nextRevenueSnap.data() : {};
      tx.set(nextRef, {
        vipRolloverAmount: fromUnits(addUnits(toUnits(nextRevenue.vipRolloverAmount || 0), toUnits(payoutPlan.vipRolloverAmount))),
        standardRolloverAmount: fromUnits(addUnits(toUnits(nextRevenue.standardRolloverAmount || 0), toUnits(payoutPlan.standardRolloverAmount))),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      tx.update(logRef, { rolloverApplied: true, updatedAt: FieldValue.serverTimestamp() });
      return true;
    });

    await db.runTransaction(async (tx) => {
      const snap = await tx.get(logRef);
      const log = snap.exists ? snap.data() : {};
      if (log.lockToken !== lockToken) throw new Error(`Settlement lock lost for ${monthId}.`);
      tx.set(logRef, {
        monthId,
        status: 'processed',
        currency,
        totalRevenueAmount: payoutPlan.totalRevenueAmount,
        vipPoolAmount: payoutPlan.vipPoolAmount,
        standardPoolAmount: payoutPlan.standardPoolAmount,
        platformRemainderAmount: payoutPlan.platformRemainderAmount,
        vipTotalViews: payoutPlan.vip.totalViews,
        standardTotalViews: payoutPlan.standard.totalViews,
        vipRpm: payoutPlan.vip.rpm,
        standardRpm: payoutPlan.standard.rpm,
        vipCreatorCount: payoutPlan.vip.payouts.length,
        standardCreatorCount: payoutPlan.standard.payouts.length,
        vipCreditedAmount: fromUnits(vipCreditedUnits),
        standardCreditedAmount: fromUnits(standardCreditedUnits),
        vipRolloverAmount: payoutPlan.vipRolloverAmount,
        standardRolloverAmount: payoutPlan.standardRolloverAmount,
        rolloverApplied,
        processedAt: FieldValue.serverTimestamp(),
        lockUntil: 0,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    });
    return { monthId, status: 'processed', currency, payoutPlan };
  } catch (error) {
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(logRef);
      if (!snap.exists || snap.data().lockToken !== lockToken) return;
      tx.set(logRef, {
        status: 'pending_retry',
        lockUntil: 0,
        lastError: String(error?.message || error).slice(0, 500),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    });
    throw error;
  }
}

const onCreatorReelViewCreated = onDocumentCreated(
  { document: 'post_views/{viewerAuthUid}/views/{viewId}', retry: true },
  aggregateEligibleReelView,
);

const settleMonthlyCreatorAdRevenue = onSchedule({
  schedule: '0 3 2 * *',
  timeZone: 'UTC',
  region: 'us-central1',
  retryCount: 3,
  maxRetrySeconds: 60 * 60,
  timeoutSeconds: 540,
  maxInstances: 1,
  concurrency: 1,
}, async () => settleCreatorAdRevenue(previousMonthId()));

module.exports = {
  allocatePool,
  calculateCreatorRevenuePayouts,
  previousMonthId,
  settleCreatorAdRevenue,
  onCreatorReelViewCreated,
  settleMonthlyCreatorAdRevenue,
};
