const crypto = require('node:crypto');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { onSchedule } = require('firebase-functions/v2/scheduler');

const db = getFirestore();
const TIME_ZONE = 'Asia/Baku';
const SCALE = 10_000;
const PLAYER_POOL_BPS = 4_000;
const ALLIANCE_POOL_BPS = 4_000;

function toUnits(amount) {
  const value = Number(amount);
  if (!Number.isFinite(value) || value < 0 || value * SCALE > Number.MAX_SAFE_INTEGER) {
    throw new Error('Game ad revenue must be finite, non-negative, and within the supported range.');
  }
  return Math.round(value * SCALE);
}

function fromUnits(units) {
  return Number((units / SCALE).toFixed(4));
}

function addUnits(left, right) {
  const result = BigInt(left) + BigInt(right);
  if (result < 0n || result > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error('Game ad pool exceeds the supported precision range.');
  }
  return Number(result);
}

function percentageUnits(units, basisPoints) {
  return Number((BigInt(units) * BigInt(basisPoints)) / 10_000n);
}

function validDayKey(dayKey) {
  if (!/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(dayKey)) return false;
  const date = new Date(`${dayKey}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === dayKey;
}

function bakuDayKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function dayKeyFromSchedule(event) {
  const scheduled = Date.parse(event?.scheduleTime || '');
  return bakuDayKey(Number.isFinite(scheduled) ? new Date(scheduled) : new Date());
}

function addDays(dayKey, amount) {
  if (!validDayKey(dayKey)) throw new Error('Invalid game ad pool day. Expected YYYY-MM-DD.');
  const date = new Date(`${dayKey}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function weekKeyForDay(dayKey) {
  if (!validDayKey(dayKey)) throw new Error('Invalid game ad pool day. Expected YYYY-MM-DD.');
  const monday = new Date(`${dayKey}T12:00:00.000Z`);
  const weekday = monday.getUTCDay();
  monday.setUTCDate(monday.getUTCDate() - (weekday === 0 ? 6 : weekday - 1));
  return monday.toISOString().slice(0, 10);
}

function weekDayKeys(weekKey) {
  return Array.from({ length: 7 }, (_, index) => addDays(weekKey, index));
}

function normalizeCurrency(currency) {
  const value = String(currency || '').trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(value)) throw new Error('Game ad revenue report needs a valid ISO currency.');
  return value;
}

/** Integer-unit proportional payout with deterministic largest-remainder rounding. */
function allocateByScore(poolUnits, rows, weightField) {
  const recipients = new Map();
  for (const raw of Array.isArray(rows) ? rows : []) {
    const id = String(raw?.id || '').trim();
    const weight = Number(raw?.[weightField] ?? (weightField === 'rawScore' ? raw?.score : 0) ?? 0);
    if (!id) continue;
    if (!Number.isSafeInteger(weight) || weight < 0) {
      throw new Error(`Leaderboard row ${id} has an invalid ${weightField}.`);
    }
    if (weight === 0) continue;
    const prior = recipients.get(id);
    const combinedWeight = (prior?.weight || 0) + weight;
    if (!Number.isSafeInteger(combinedWeight)) throw new Error(`Leaderboard score for ${id} exceeds the supported range.`);
    recipients.set(id, {
      recipientId: id,
      name: String(raw?.name || id),
      weight: combinedWeight,
    });
  }

  const eligible = [...recipients.values()].sort((a, b) => a.recipientId.localeCompare(b.recipientId));
  const totalWeight = eligible.reduce((sum, recipient) => sum + BigInt(recipient.weight), 0n);
  if (totalWeight > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Leaderboard score total exceeds the supported range.');
  if (totalWeight === 0n) {
    return { totalWeight: 0, payouts: [], unallocatedUnits: poolUnits };
  }
  if (poolUnits === 0) {
    return { totalWeight: Number(totalWeight), payouts: [], unallocatedUnits: 0 };
  }

  const shares = eligible.map((recipient) => {
    const numerator = BigInt(poolUnits) * BigInt(recipient.weight);
    return { ...recipient, units: numerator / totalWeight, remainder: numerator % totalWeight };
  });
  let remaining = BigInt(poolUnits) - shares.reduce((sum, item) => sum + item.units, 0n);
  const remainderOrder = [...shares].sort((a, b) => {
    if (a.remainder === b.remainder) return a.recipientId.localeCompare(b.recipientId);
    return a.remainder > b.remainder ? -1 : 1;
  });
  for (const item of remainderOrder) {
    if (remaining === 0n) break;
    item.units += 1n;
    remaining -= 1n;
  }

  return {
    totalWeight: Number(totalWeight),
    payouts: shares.filter((item) => item.units > 0n).map((item) => ({
      recipientId: item.recipientId,
      name: item.name,
      weight: item.weight,
      amountUnits: Number(item.units),
      amount: fromUnits(Number(item.units)),
    })),
    unallocatedUnits: 0,
  };
}

async function attachWalletOwners(recipientType, payouts) {
  if (!payouts.length) return [];
  const recipientRefs = payouts.map((payout) => db.doc(
    recipientType === 'player' ? `players/${payout.recipientId}` : `alliances/${payout.recipientId}`,
  ));
  const recipientSnaps = await db.getAll(...recipientRefs);
  if (recipientType === 'player') {
    return payouts.map((payout, index) => {
      const snap = recipientSnaps[index];
      const authUid = String(snap.exists ? snap.data().firebaseUid || '' : '');
      if (!authUid) throw new Error(`Leaderboard player ${payout.recipientId} has no linked Firebase account.`);
      return { ...payout, authUid };
    });
  }

  const leaderIds = recipientSnaps.map((snap, index) => {
    if (!snap.exists) throw new Error(`Leaderboard alliance ${payouts[index].recipientId} no longer exists.`);
    const leaderId = String(snap.data().leaderId || '');
    if (!leaderId) throw new Error(`Leaderboard alliance ${payouts[index].recipientId} has no leader.`);
    return leaderId;
  });
  const leaderSnaps = await db.getAll(...leaderIds.map((id) => db.doc(`users/${id}`)));
  return payouts.map((payout, index) => {
    const authUid = String(leaderSnaps[index].exists ? leaderSnaps[index].data().firebaseUid || '' : '');
    if (!authUid) throw new Error(`Alliance leader ${leaderIds[index]} has no linked Firebase account.`);
    return { ...payout, authUid, leaderId: leaderIds[index] };
  });
}

function walletDocumentId(recipientType, recipientId, currency) {
  return `${recipientType}_${encodeURIComponent(recipientId)}_${currency}`;
}

async function creditGameAdPayout({ periodKind, periodKey, recipientType, currency, payout }) {
  const walletRef = db.doc(`game_ad_wallets/${walletDocumentId(recipientType, payout.recipientId, currency)}`);
  const payoutRef = walletRef.collection('payouts').doc(`${periodKind}_${periodKey}`);
  return db.runTransaction(async (tx) => {
    const [walletSnap, payoutSnap] = await Promise.all([tx.get(walletRef), tx.get(payoutRef)]);
    if (payoutSnap.exists) return Number(payoutSnap.data().amount) || 0;
    const wallet = walletSnap.exists ? walletSnap.data() : {};
    if (wallet.currency && wallet.currency !== currency) throw new Error(`Game ad wallet currency mismatch for ${payout.recipientId}.`);
    if (recipientType === 'player' && wallet.authUid && wallet.authUid !== payout.authUid) {
      throw new Error(`Game ad player wallet owner mismatch for ${payout.recipientId}.`);
    }
    const balanceUnits = addUnits(toUnits(wallet.balanceAmount || 0), payout.amountUnits);
    tx.set(walletRef, {
      recipientType,
      recipientId: payout.recipientId,
      recipientName: payout.name,
      authUid: payout.authUid,
      leaderId: payout.leaderId || null,
      currency,
      balanceAmount: fromUnits(balanceUnits),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    tx.create(payoutRef, {
      periodKind,
      periodKey,
      recipientType,
      recipientId: payout.recipientId,
      recipientName: payout.name,
      authUid: payout.authUid,
      currency,
      scoreWeight: payout.weight,
      amount: payout.amount,
      createdAt: FieldValue.serverTimestamp(),
    });
    return payout.amount;
  });
}

async function creditPayouts({ periodKind, periodKey, recipientType, currency, payouts }) {
  const batchSize = 20;
  let totalUnits = 0;
  for (let offset = 0; offset < payouts.length; offset += batchSize) {
    const batch = payouts.slice(offset, offset + batchSize);
    const results = await Promise.allSettled(batch.map((payout) =>
      creditGameAdPayout({ periodKind, periodKey, recipientType, currency, payout }),
    ));
    for (const result of results) {
      if (result.status === 'fulfilled') totalUnits = addUnits(totalUnits, toUnits(result.value));
    }
    const failed = results.find((result) => result.status === 'rejected');
    if (failed) throw failed.reason;
  }
  return totalUnits;
}

function dailyLogRef(dayKey) {
  return db.doc(`game_ad_pool_logs/daily_${dayKey}`);
}

function weeklyLogRef(weekKey) {
  return db.doc(`game_ad_pool_logs/weekly_${weekKey}`);
}

async function markRetryableFailure(logRef, lockToken, error) {
  await db.runTransaction(async (tx) => {
    const logSnap = await tx.get(logRef);
    if (!logSnap.exists || logSnap.data().lockToken !== lockToken) return;
    tx.set(logRef, {
      status: 'pending_retry',
      lockUntil: 0,
      lastError: String(error?.message || error).slice(0, 500),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  });
}

async function settleDailyGamePlayerPool(dayKey) {
  if (!validDayKey(dayKey)) throw new Error('Invalid daily settlement key. Expected YYYY-MM-DD.');
  const weekKey = weekKeyForDay(dayKey);
  const revenueRef = db.doc(`game_ad_revenue/${dayKey}`);
  const boardRef = db.doc(`leaderboard_daily/${dayKey}`);
  const previousPoolRef = db.doc(`daily_player_pool/${addDays(dayKey, -1)}`);
  const weeklyPoolRef = db.doc(`weekly_alliance_pool/${weekKey}`);
  const logRef = dailyLogRef(dayKey);
  const lockToken = crypto.randomUUID();
  const lock = await db.runTransaction(async (tx) => {
    const [logSnap, revenueSnap, boardSnap, previousPoolSnap, weeklyPoolSnap] = await Promise.all([
      tx.get(logRef), tx.get(revenueRef), tx.get(boardRef), tx.get(previousPoolRef), tx.get(weeklyPoolRef),
    ]);
    const existing = logSnap.exists ? logSnap.data() : {};
    if (existing.status === 'processed') return { acquired: false };
    if (existing.status === 'processing' && Number(existing.lockUntil) > Date.now()) {
      throw new Error(`Daily game ad pool ${dayKey} is already processing.`);
    }
    if (!revenueSnap.exists || revenueSnap.data().status !== 'ready') {
      throw new Error(`Daily game ad revenue game_ad_revenue/${dayKey} is missing or not ready.`);
    }
    const revenue = revenueSnap.data();
    const currency = normalizeCurrency(revenue.currency);
    const previousPool = previousPoolSnap.exists ? previousPoolSnap.data() : null;
    if (previousPool && previousPool.status !== 'processed') {
      throw new Error(`Previous daily player pool ${addDays(dayKey, -1)} is not settled yet.`);
    }
    if (previousPool?.currency && previousPool.currency !== currency) {
      throw new Error(`Daily player rollover ${addDays(dayKey, -1)} currency mismatch.`);
    }
    const weeklyPool = weeklyPoolSnap.exists ? weeklyPoolSnap.data() : {};
    if (weeklyPool.currency && weeklyPool.currency !== currency) {
      throw new Error(`Weekly alliance pool ${weekKey} currency mismatch.`);
    }
    const carryInUnits = previousPool && previousPool.rolloverAppliedToDayKey !== dayKey
      ? toUnits(previousPool.carryForwardAmount || 0)
      : 0;
    const board = boardSnap.exists ? boardSnap.data() : { rows: [] };
    if (board.periodKey && board.periodKey !== dayKey) throw new Error(`Daily leaderboard key does not match ${dayKey}.`);
    const totalRevenueUnits = toUnits(revenue.totalRevenueAmount);
    const playerRevenueUnits = percentageUnits(totalRevenueUnits, PLAYER_POOL_BPS);
    const allianceContributionUnits = percentageUnits(totalRevenueUnits, ALLIANCE_POOL_BPS);
    const platformRevenueUnits = totalRevenueUnits - playerRevenueUnits - allianceContributionUnits;
    const playerPoolUnits = addUnits(playerRevenueUnits, carryInUnits);
    tx.set(logRef, {
      periodKind: 'daily',
      periodKey: dayKey,
      status: 'processing',
      lockToken,
      lockUntil: Date.now() + 15 * 60_000,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    return {
      acquired: true,
      revenue,
      currency,
      board,
      carryInUnits,
      totalRevenueUnits,
      playerRevenueUnits,
      playerPoolUnits,
      allianceContributionUnits,
      platformRevenueUnits,
    };
  });
  if (!lock.acquired) return { periodKind: 'daily', periodKey: dayKey, status: 'already_processed' };

  try {
    const allocation = allocateByScore(lock.playerPoolUnits, lock.board.rows, 'score');
    const payouts = await attachWalletOwners('player', allocation.payouts);
    const plan = {
      currency: lock.currency,
      totalRevenueUnits: lock.totalRevenueUnits,
      playerRevenueUnits: lock.playerRevenueUnits,
      playerPoolUnits: lock.playerPoolUnits,
      carryInUnits: lock.carryInUnits,
      allianceContributionUnits: lock.allianceContributionUnits,
      platformRevenueUnits: lock.platformRevenueUnits,
      totalScore: allocation.totalWeight,
      payouts,
      rolloverUnits: allocation.unallocatedUnits,
    };
    const planHash = crypto.createHash('sha256').update(JSON.stringify(plan)).digest('hex');
    await db.runTransaction(async (tx) => {
      const logSnap = await tx.get(logRef);
      const current = logSnap.exists ? logSnap.data() : {};
      if (current.lockToken !== lockToken) throw new Error(`Daily game ad pool lock lost for ${dayKey}.`);
      if (current.planHash && current.planHash !== planHash) throw new Error(`Daily game ad inputs changed for ${dayKey}.`);
      tx.update(logRef, { planHash, updatedAt: FieldValue.serverTimestamp() });
    });

    const paidUnits = await creditPayouts({
      periodKind: 'daily', periodKey: dayKey, recipientType: 'player', currency: lock.currency, payouts,
    });
    const currentPoolRef = db.doc(`daily_player_pool/${dayKey}`);
    const contributionRef = weeklyPoolRef.collection('contributions').doc(dayKey);
    const platformRef = db.doc(`platform_revenue/${dayKey}`);
    const completed = await db.runTransaction(async (tx) => {
      const [logSnap, currentPoolSnap, previousPoolSnap, weeklyPoolSnap, contributionSnap, platformSnap] = await Promise.all([
        tx.get(logRef), tx.get(currentPoolRef), tx.get(previousPoolRef), tx.get(weeklyPoolRef),
        tx.get(contributionRef), tx.get(platformRef),
      ]);
      const currentLog = logSnap.exists ? logSnap.data() : {};
      if (currentLog.lockToken !== lockToken) throw new Error(`Daily game ad pool lock lost for ${dayKey}.`);
      if (currentLog.status === 'processed') return false;
      if (currentPoolSnap.exists && currentPoolSnap.data().status === 'processed') {
        throw new Error(`Daily player pool ${dayKey} was already committed without its settlement log.`);
      }

      const weeklyPool = weeklyPoolSnap.exists ? weeklyPoolSnap.data() : {};
      if (weeklyPool.currency && weeklyPool.currency !== lock.currency) {
        throw new Error(`Weekly alliance pool ${weekKey} currency mismatch.`);
      }
      if (!contributionSnap.exists) {
        tx.set(weeklyPoolRef, {
          weekKey,
          currency: lock.currency,
          balanceAmount: fromUnits(addUnits(toUnits(weeklyPool.balanceAmount || 0), lock.allianceContributionUnits)),
          totalContributedAmount: fromUnits(addUnits(toUnits(weeklyPool.totalContributedAmount || 0), lock.allianceContributionUnits)),
          contributionCount: (Number(weeklyPool.contributionCount) || 0) + 1,
          status: 'open',
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
        tx.create(contributionRef, {
          dayKey,
          weekKey,
          amount: fromUnits(lock.allianceContributionUnits),
          currency: lock.currency,
          createdAt: FieldValue.serverTimestamp(),
        });
      } else if (contributionSnap.data().currency !== lock.currency) {
        throw new Error(`Daily alliance contribution ${dayKey} currency mismatch.`);
      }

      if (!platformSnap.exists) {
        tx.create(platformRef, {
          dayKey,
          amount: fromUnits(lock.platformRevenueUnits),
          currency: lock.currency,
          source: 'game_ad_revenue',
          createdAt: FieldValue.serverTimestamp(),
        });
      } else if (platformSnap.data().currency !== lock.currency || toUnits(platformSnap.data().amount) !== lock.platformRevenueUnits) {
        throw new Error(`Platform revenue entry ${dayKey} does not match the daily report.`);
      }

      if (previousPoolSnap.exists && lock.carryInUnits > 0) {
        const previous = previousPoolSnap.data();
        if (previous.rolloverAppliedToDayKey && previous.rolloverAppliedToDayKey !== dayKey) {
          throw new Error(`Daily player rollover from ${addDays(dayKey, -1)} was consumed by another day.`);
        }
        tx.update(previousPoolRef, {
          carryForwardAmount: 0,
          rolloverAppliedToDayKey: dayKey,
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
      tx.set(currentPoolRef, {
        dayKey,
        weekKey,
        currency: lock.currency,
        dailyRevenueShareAmount: fromUnits(lock.playerRevenueUnits),
        carryInAmount: fromUnits(lock.carryInUnits),
        totalPoolAmount: fromUnits(lock.playerPoolUnits),
        paidAmount: fromUnits(paidUnits),
        balanceAmount: 0,
        carryForwardAmount: fromUnits(allocation.unallocatedUnits),
        rolloverAppliedToDayKey: null,
        recipientCount: payouts.length,
        totalLeaderboardScore: allocation.totalWeight,
        status: 'processed',
        processedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      tx.set(logRef, {
        periodKind: 'daily',
        periodKey: dayKey,
        status: 'processed',
        currency: lock.currency,
        totalRevenueAmount: fromUnits(lock.totalRevenueUnits),
        dailyPlayerShareAmount: fromUnits(lock.playerRevenueUnits),
        dailyPlayerPoolAmount: fromUnits(lock.playerPoolUnits),
        playerCarryInAmount: fromUnits(lock.carryInUnits),
        playerPayoutAmount: fromUnits(paidUnits),
        playerCarryForwardAmount: fromUnits(allocation.unallocatedUnits),
        weeklyAllianceContributionAmount: fromUnits(lock.allianceContributionUnits),
        platformRevenueAmount: fromUnits(lock.platformRevenueUnits),
        playerLeaderboardScore: allocation.totalWeight,
        playerRecipientCount: payouts.length,
        platformShareApplied: true,
        allianceContributionApplied: true,
        dailyPlayerPoolReset: true,
        processedAt: FieldValue.serverTimestamp(),
        lockUntil: 0,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      return true;
    });
    return { periodKind: 'daily', periodKey: dayKey, status: completed ? 'processed' : 'already_processed' };
  } catch (error) {
    await markRetryableFailure(logRef, lockToken, error);
    throw error;
  }
}

async function requireDailyWeekSettled(weekKey) {
  const days = weekDayKeys(weekKey);
  const refs = days.map((dayKey) => dailyLogRef(dayKey));
  const snaps = await db.getAll(...refs);
  const missing = snaps.map((snap, index) => snap.exists && snap.data().status === 'processed' ? '' : days[index]).filter(Boolean);
  if (missing.length) throw new Error(`Game ad daily settlements are incomplete for ${weekKey}: ${missing.join(', ')}.`);
}

async function settleWeeklyGameAlliancePool(weekKey) {
  if (!validDayKey(weekKey) || weekKeyForDay(weekKey) !== weekKey) {
    throw new Error('Invalid alliance week key. Expected its Monday YYYY-MM-DD.');
  }
  await requireDailyWeekSettled(weekKey);
  const poolRef = db.doc(`weekly_alliance_pool/${weekKey}`);
  const boardRef = db.doc(`leaderboard_weekly/${weekKey}`);
  const logRef = weeklyLogRef(weekKey);
  const nextWeekKey = addDays(weekKey, 7);
  const nextPoolRef = db.doc(`weekly_alliance_pool/${nextWeekKey}`);
  const lockToken = crypto.randomUUID();
  const lock = await db.runTransaction(async (tx) => {
    const [logSnap, poolSnap, boardSnap] = await Promise.all([tx.get(logRef), tx.get(poolRef), tx.get(boardRef)]);
    const existing = logSnap.exists ? logSnap.data() : {};
    if (existing.status === 'processed') return { acquired: false };
    if (existing.status === 'processing' && Number(existing.lockUntil) > Date.now()) {
      throw new Error(`Weekly alliance ad pool ${weekKey} is already processing.`);
    }
    const pool = poolSnap.exists ? poolSnap.data() : {};
    if (!poolSnap.exists) throw new Error(`Weekly alliance pool ${weekKey} does not exist.`);
    const currency = normalizeCurrency(pool.currency);
    const balanceUnits = toUnits(pool.balanceAmount || 0);
    const board = boardSnap.exists ? boardSnap.data() : { rows: [] };
    if (board.periodKey && board.periodKey !== weekKey) throw new Error(`Weekly alliance leaderboard key does not match ${weekKey}.`);
    tx.set(logRef, {
      periodKind: 'weekly',
      periodKey: weekKey,
      status: 'processing',
      lockToken,
      lockUntil: Date.now() + 15 * 60_000,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    return { acquired: true, pool, board, currency, balanceUnits };
  });
  if (!lock.acquired) return { periodKind: 'weekly', periodKey: weekKey, status: 'already_processed' };

  try {
    // The weekly board ranks on its official score; rawScore is the alliance's total points.
    const allocation = allocateByScore(lock.balanceUnits, lock.board.rows, 'rawScore');
    const payouts = await attachWalletOwners('alliance', allocation.payouts);
    const plan = {
      currency: lock.currency,
      balanceUnits: lock.balanceUnits,
      totalContributedAmount: Number(lock.pool.totalContributedAmount) || 0,
      totalRawAllianceScore: allocation.totalWeight,
      payouts,
      rolloverUnits: allocation.unallocatedUnits,
    };
    const planHash = crypto.createHash('sha256').update(JSON.stringify(plan)).digest('hex');
    await db.runTransaction(async (tx) => {
      const logSnap = await tx.get(logRef);
      const current = logSnap.exists ? logSnap.data() : {};
      if (current.lockToken !== lockToken) throw new Error(`Weekly game ad pool lock lost for ${weekKey}.`);
      if (current.planHash && current.planHash !== planHash) throw new Error(`Weekly game ad inputs changed for ${weekKey}.`);
      tx.update(logRef, { planHash, updatedAt: FieldValue.serverTimestamp() });
    });

    const paidUnits = await creditPayouts({
      periodKind: 'weekly', periodKey: weekKey, recipientType: 'alliance', currency: lock.currency, payouts,
    });
    const completed = await db.runTransaction(async (tx) => {
      const [logSnap, poolSnap, nextPoolSnap] = await Promise.all([tx.get(logRef), tx.get(poolRef), tx.get(nextPoolRef)]);
      const currentLog = logSnap.exists ? logSnap.data() : {};
      if (currentLog.lockToken !== lockToken) throw new Error(`Weekly game ad pool lock lost for ${weekKey}.`);
      if (currentLog.status === 'processed') return false;
      const pool = poolSnap.exists ? poolSnap.data() : {};
      if (pool.currency && pool.currency !== lock.currency) throw new Error(`Weekly alliance pool ${weekKey} currency mismatch.`);
      if (toUnits(pool.balanceAmount || 0) !== lock.balanceUnits) {
        throw new Error(`Weekly alliance pool ${weekKey} balance changed during settlement.`);
      }
      const nextPool = nextPoolSnap.exists ? nextPoolSnap.data() : {};
      if (allocation.unallocatedUnits > 0 && nextPool.currency && nextPool.currency !== lock.currency) {
        throw new Error(`Next weekly alliance pool ${nextWeekKey} currency mismatch.`);
      }
      if (allocation.unallocatedUnits > 0) {
        tx.set(nextPoolRef, {
          weekKey: nextWeekKey,
          currency: lock.currency,
          balanceAmount: fromUnits(addUnits(toUnits(nextPool.balanceAmount || 0), allocation.unallocatedUnits)),
          status: 'open',
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
      }
      tx.set(poolRef, {
        weekKey,
        currency: lock.currency,
        balanceAmount: 0,
        paidAmount: fromUnits(paidUnits),
        carryForwardAmount: fromUnits(allocation.unallocatedUnits),
        totalAllianceScore: allocation.totalWeight,
        recipientCount: payouts.length,
        status: 'processed',
        processedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      tx.set(logRef, {
        periodKind: 'weekly',
        periodKey: weekKey,
        status: 'processed',
        currency: lock.currency,
        weeklyPoolAmount: fromUnits(lock.balanceUnits),
        alliancePayoutAmount: fromUnits(paidUnits),
        allianceCarryForwardAmount: fromUnits(allocation.unallocatedUnits),
        totalAllianceScore: allocation.totalWeight,
        allianceRecipientCount: payouts.length,
        weeklyAlliancePoolReset: true,
        carryForwardApplied: allocation.unallocatedUnits > 0,
        processedAt: FieldValue.serverTimestamp(),
        lockUntil: 0,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      return true;
    });
    return { periodKind: 'weekly', periodKey: weekKey, status: completed ? 'processed' : 'already_processed' };
  } catch (error) {
    await markRetryableFailure(logRef, lockToken, error);
    throw error;
  }
}

const settleDailyGamePlayerAdPool = onSchedule({
  schedule: '59 23 * * *',
  timeZone: TIME_ZONE,
  region: 'us-central1',
  retryCount: 5,
  maxRetrySeconds: 60 * 60,
  timeoutSeconds: 540,
  maxInstances: 1,
  concurrency: 1,
}, async (event) => settleDailyGamePlayerPool(dayKeyFromSchedule(event)));

const settleWeeklyGameAllianceAdPool = onSchedule({
  schedule: '59 23 * * 0',
  timeZone: TIME_ZONE,
  region: 'us-central1',
  retryCount: 5,
  maxRetrySeconds: 60 * 60,
  timeoutSeconds: 540,
  maxInstances: 1,
  concurrency: 1,
}, async (event) => {
  const sundayKey = dayKeyFromSchedule(event);
  const weekKey = weekKeyForDay(sundayKey);
  await settleDailyGamePlayerPool(sundayKey);
  return settleWeeklyGameAlliancePool(weekKey);
});

module.exports = {
  allocateByScore,
  weekKeyForDay,
  settleDailyGamePlayerPool,
  settleWeeklyGameAlliancePool,
  settleDailyGamePlayerAdPool,
  settleWeeklyGameAllianceAdPool,
};
