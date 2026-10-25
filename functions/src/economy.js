const { z } = require('zod');
const {
  db,
  FieldValue,
  HttpsError,
  secureCallable,
  safeId,
  operationDocId,
  getOwnedPlayer,
  readOperation,
  ensureRateLimitTx,
  writeWalletLedger,
  storedManat,
  adminUid,
  ADMIN_UIDS,
} = require('./security');

const idSchema = z.string().regex(/^\d{1,20}$/);
const operationFields = {
  userId: idSchema,
  operationId: z.string().min(16).max(80).optional(),
};

const battleCards = {
  zombi: { price: 500 },
  yarasa: { price: 450 },
  duman: { price: 400 },
  mutant: { price: 700 },
  standing: { price: 650 },
  it: { price: 550 },
};
const shields = {
  '12h': { price: 800, durationMs: 12 * 60 * 60 * 1000, name: 'Qalxan — 12 saat' },
  '1d': { price: 1400, durationMs: 24 * 60 * 60 * 1000, name: 'Qalxan — 1 gün' },
  '3d': { price: 3200, durationMs: 3 * 24 * 60 * 60 * 1000, name: 'Qalxan — 3 gün' },
  '7d': { price: 6000, durationMs: 7 * 24 * 60 * 60 * 1000, name: 'Qalxan — 7 gün' },
};
const fortressPrices = { 2: 20, 3: 40, 4: 60, 5: 80, 6: 100 };
const vipPrice = 30;

const cosmetics = {
  vip_gold_7d: { category: 'vip', price: 2500, vipTier: 'gold', vipDurationMs: 7 * 86400000 },
  vip_platinum_30d: { category: 'vip', price: 8000, vipTier: 'platinum', vipDurationMs: 30 * 86400000 },
  vip_gold_30d: { category: 'vip', price: 6500, vipTier: 'gold', vipDurationMs: 30 * 86400000 },
  vip_gold_90d: { category: 'vip', price: 16500, vipTier: 'gold', vipDurationMs: 90 * 86400000 },
  vip_platinum_7d: { category: 'vip', price: 4200, vipTier: 'platinum', vipDurationMs: 7 * 86400000 },
  vip_platinum_90d: { category: 'vip', price: 22000, vipTier: 'platinum', vipDurationMs: 90 * 86400000 },
  vip_platinum_365d: { category: 'vip', price: 78000, vipTier: 'platinum', vipDurationMs: 365 * 86400000 },
  name_gold: { category: 'nameStyle', price: 1200, vipOnly: true },
  name_rainbow: { category: 'nameStyle', price: 1800, vipOnly: true },
  name_neon: { category: 'nameStyle', price: 1500, vipOnly: true },
  name_fire: { category: 'nameStyle', price: 1500, vipOnly: true },
  name_ice: { category: 'nameStyle', price: 1500, vipOnly: true },
  name_royal: { category: 'nameStyle', price: 2200, vipOnly: true, platinumOnly: true },
  name_emerald: { category: 'nameStyle', price: 1700, vipOnly: true },
  name_sakura: { category: 'nameStyle', price: 1900, vipOnly: true },
  name_comet: { category: 'nameStyle', price: 2100, vipOnly: true },
  name_cyberwave: { category: 'nameStyle', price: 2300, vipOnly: true },
  name_void: { category: 'nameStyle', price: 2700, vipOnly: true, platinumOnly: true },
  frame_gold: { category: 'frame', price: 1500, vipOnly: true },
  frame_neon: { category: 'frame', price: 1600, vipOnly: true },
  frame_fire: { category: 'frame', price: 1800, vipOnly: true },
  frame_galaxy: { category: 'frame', price: 2000, vipOnly: true },
  frame_diamond: { category: 'frame', price: 3000, vipOnly: true, platinumOnly: true },
  frame_emerald: { category: 'frame', price: 1700, vipOnly: true },
  frame_sakura: { category: 'frame', price: 1800, vipOnly: true },
  frame_comet: { category: 'frame', price: 2200, vipOnly: true },
  frame_obsidian: { category: 'frame', price: 2500, vipOnly: true },
  frame_celestial: { category: 'frame', price: 3400, vipOnly: true, platinumOnly: true },
  banner_sunset: { category: 'banner', price: 1000, vipOnly: true, gradient: 'linear-gradient(135deg, #f97316 0%, #ec4899 50%, #8b5cf6 100%)' },
  banner_aurora: { category: 'banner', price: 1200, vipOnly: true, gradient: 'linear-gradient(135deg, #06b6d4 0%, #8b5cf6 40%, #22c55e 100%)' },
  banner_midnight: { category: 'banner', price: 1000, vipOnly: true, gradient: 'linear-gradient(135deg, #0f172a 0%, #312e81 50%, #1e1b4b 100%)' },
  banner_volcano: { category: 'banner', price: 1400, vipOnly: true, gradient: 'linear-gradient(135deg, #450a0a 0%, #dc2626 45%, #f97316 100%)' },
  banner_ocean: { category: 'banner', price: 1000, vipOnly: true, gradient: 'linear-gradient(135deg, #0c4a6e 0%, #0284c7 50%, #06b6d4 100%)' },
  banner_galaxy: { category: 'banner', price: 1800, vipOnly: true, platinumOnly: true, gradient: 'linear-gradient(135deg, #020617 0%, #4c1d95 35%, #ec4899 70%, #06b6d4 100%)' },
  banner_royal: { category: 'banner', price: 1600, vipOnly: true, gradient: 'linear-gradient(135deg, #312e81 0%, #7c3aed 48%, #fbbf24 100%)' },
  banner_emerald: { category: 'banner', price: 1300, vipOnly: true, gradient: 'linear-gradient(135deg, #052e16 0%, #15803d 48%, #4ade80 100%)' },
  banner_sakura: { category: 'banner', price: 1500, vipOnly: true, gradient: 'linear-gradient(135deg, #4a044e 0%, #db2777 52%, #fda4af 100%)' },
  banner_nebula: { category: 'banner', price: 2100, vipOnly: true, platinumOnly: true, gradient: 'linear-gradient(135deg, #020617 0%, #4338ca 38%, #c026d3 72%, #22d3ee 100%)' },
  banner_sunforge: { category: 'banner', price: 1700, vipOnly: true, gradient: 'linear-gradient(135deg, #7c2d12 0%, #f97316 45%, #fde047 100%)' },
  badge_star: { category: 'badge', price: 800, vipOnly: true },
  badge_crown: { category: 'badge', price: 1500, vipOnly: true },
  badge_diamond: { category: 'badge', price: 2000, vipOnly: true, platinumOnly: true },
  badge_phoenix: { category: 'badge', price: 1300, vipOnly: true },
  badge_wolf: { category: 'badge', price: 1200, vipOnly: true },
  badge_moon: { category: 'badge', price: 1400, vipOnly: true },
  badge_lightning: { category: 'badge', price: 1600, vipOnly: true },
  badge_rose: { category: 'badge', price: 2400, vipOnly: true, platinumOnly: true },
};

function getTodayKey(now = Date.now()) {
  return new Date(now).toISOString().slice(0, 10);
}

function getWeekId(now = Date.now()) {
  const date = new Date(now);
  date.setUTCHours(0, 0, 0, 0);
  const day = date.getUTCDay();
  date.setUTCDate(date.getUTCDate() + (day === 0 ? -6 : 1 - day));
  return date.toISOString().slice(0, 10);
}

function normalizedCards(raw = {}) {
  const ids = Object.keys(battleCards);
  return Object.fromEntries(ids.map((id) => [id, Math.max(0, Math.floor(Number(raw[id]) || 0))]));
}

function normalizedCosmetics(raw) {
  const equipped = raw?.equipped && typeof raw.equipped === 'object' ? { ...raw.equipped } : {};
  const vip = raw?.vip && typeof raw.vip === 'object' ? raw.vip : {};
  return {
    owned: Array.isArray(raw?.owned) ? [...new Set(raw.owned.filter((id) => typeof id === 'string' && cosmetics[id]))] : [],
    equipped,
    vip: {
      tier: vip.tier === 'gold' || vip.tier === 'platinum' ? vip.tier : 'none',
      expiresAt: Number(vip.expiresAt) || 0,
    },
  };
}

function slotForCategory(category) {
  return ({ nameStyle: 'nameStyleId', frame: 'frameId', banner: 'bannerId', badge: 'badgeId' })[category] || null;
}

async function getLedgerOrThrow(tx, uid, operationId) {
  const result = await readOperation(tx, uid, operationId);
  if (result.data) return { ...result, duplicate: true };
  return { ...result, duplicate: false };
}

function writeQuestShopEvent(tx, { uid, playerId, allianceId, operationId, amount = 1 }) {
  if (!allianceId) return;
  const dateKey = getTodayKey();
  const eventId = operationDocId(uid, `quest:${operationId}`);
  tx.create(db.doc(`quest_activity_events/${eventId}`), {
    authUid: uid,
    playerId,
    allianceId,
    dateKey,
    type: 'shop_buy',
    amount,
    createdAt: FieldValue.serverTimestamp(),
  });
}

async function buyBattleCard({ uid, payload, operationId, rateLimit }) {
  const card = battleCards[payload.cardId];
  if (!card) throw new HttpsError('invalid-argument', 'Kart tapılmadı.');
  const allianceId = safeId(payload.allianceId, 'İttifaq ID-si');
  const weeklyRef = db.doc(`alliance_weekly_shop/${allianceId}`);
  const allianceRef = db.doc(`alliances/${allianceId}`);
  const now = Date.now();

  return db.runTransaction(async (tx) => {
    const ledger = await getLedgerOrThrow(tx, uid, operationId);
    if (ledger.duplicate) return ledger.data.result;
    const rate = await ensureRateLimitTx(tx, uid, 'buyBattleCard', rateLimit, now);
    const owned = await getOwnedPlayer(uid, payload.userId, tx);
    const [allianceSnap, weeklySnap] = await Promise.all([tx.get(allianceRef), tx.get(weeklyRef)]);
    if (!allianceSnap.exists) throw new HttpsError('not-found', 'İttifaq tapılmadı.');
    const alliance = allianceSnap.data();
    if (!Array.isArray(alliance.members) || !alliance.members.includes(owned.playerId)) {
      throw new HttpsError('permission-denied', 'Yalnız öz ittifaqın üçün kart ala bilərsən.');
    }

    const balance = storedManat(owned.player);
    if (balance < card.price) throw new HttpsError('failed-precondition', 'Balansda kifayət qədər manat yoxdur.');
    const weekId = getWeekId(now);
    const weekly = weeklySnap.exists && weeklySnap.data().weekId === weekId
      ? weeklySnap.data()
      : { weekId, cardPurchases: {} };
    const cardPurchases = { ...(weekly.cardPurchases || {}) };
    const used = Math.max(0, Number(cardPurchases[payload.cardId]) || 0);
    if (used >= 7) throw new HttpsError('resource-exhausted', 'Kart üçün həftəlik limit dolub.');
    const nextBalance = balance - card.price;
    const cards = normalizedCards(owned.player.battleCards);
    cards[payload.cardId] += 1;
    cardPurchases[payload.cardId] = used + 1;
    const result = { balance: nextBalance, cardId: payload.cardId };

    tx.set(owned.playerRef, {
      manat: nextBalance,
      coins: nextBalance,
      battleCards: cards,
      allianceId,
      allianceName: alliance.name || owned.player.allianceName || null,
      updatedAt: now,
    }, { merge: true });
    tx.set(weeklyRef, { weekId, cardPurchases, updatedAt: now }, { merge: true });
    writeWalletLedger(tx, ledger.ref, {
      uid, playerId: owned.playerId, operationId,
      type: 'shop_battle_card', amount: -card.price,
      balanceAfter: nextBalance, source: payload.cardId, result,
    });
    writeQuestShopEvent(tx, { uid, playerId: owned.playerId, allianceId, operationId });
    tx.set(rate.ref, rate.next);
    return result;
  });
}

async function buyShield({ uid, payload, operationId, rateLimit }) {
  const product = shields[payload.durationId];
  if (!product) throw new HttpsError('invalid-argument', 'Qalxan tapılmadı.');
  const now = Date.now();

  return db.runTransaction(async (tx) => {
    const ledger = await getLedgerOrThrow(tx, uid, operationId);
    if (ledger.duplicate) return ledger.data.result;
    const rate = await ensureRateLimitTx(tx, uid, 'buyShield', rateLimit, now);
    const owned = await getOwnedPlayer(uid, payload.userId, tx);
    const balance = storedManat(owned.player);
    if (balance < product.price) throw new HttpsError('failed-precondition', 'Balansda kifayət qədər manat yoxdur.');
    const active = Array.isArray(owned.player.activeShields)
      ? owned.player.activeShields.filter((item) => Number(item.expiresAt) > now)
      : [];
    const shield = {
      id: `shield_${operationId}`,
      durationId: payload.durationId,
      name: product.name,
      expiresAt: now + product.durationMs,
      protectsAgainst: ['earthquake', 'tsunami', 'fire'],
      purchasedAt: now,
    };
    const nextBalance = balance - product.price;
    const result = { balance: nextBalance, shield };
    tx.set(owned.playerRef, {
      manat: nextBalance, coins: nextBalance, activeShields: [...active, shield], updatedAt: now,
    }, { merge: true });
    writeWalletLedger(tx, ledger.ref, {
      uid, playerId: owned.playerId, operationId, type: 'shop_shield',
      amount: -product.price, balanceAfter: nextBalance, source: payload.durationId, result,
    });
    writeQuestShopEvent(tx, { uid, playerId: owned.playerId, allianceId: owned.player.allianceId, operationId });
    tx.set(rate.ref, rate.next);
    return result;
  });
}

async function buyCosmetic({ uid, payload, operationId, rateLimit }) {
  const product = cosmetics[payload.productId];
  if (!product) throw new HttpsError('invalid-argument', 'Məhsul tapılmadı.');
  const now = Date.now();
  return db.runTransaction(async (tx) => {
    const ledger = await getLedgerOrThrow(tx, uid, operationId);
    if (ledger.duplicate) return ledger.data.result;
    const rate = await ensureRateLimitTx(tx, uid, 'buyCosmetic', rateLimit, now);
    const owned = await getOwnedPlayer(uid, payload.userId, tx);
    const state = normalizedCosmetics(owned.player.cosmetics);
    const vipActive = state.vip.tier !== 'none' && state.vip.expiresAt > now;
    if (product.vipOnly && !vipActive) throw new HttpsError('failed-precondition', 'VIP paketi tələb olunur.');
    if (product.platinumOnly && (!vipActive || state.vip.tier !== 'platinum')) {
      throw new HttpsError('failed-precondition', 'Platinum VIP tələb olunur.');
    }
    if (product.category !== 'vip' && state.owned.includes(payload.productId)) {
      throw new HttpsError('already-exists', 'Artıq sahibsən.');
    }
    const balance = storedManat(owned.player);
    if (balance < product.price) throw new HttpsError('failed-precondition', 'Balansda kifayət qədər manat yoxdur.');

    const next = {
      ...state,
      owned: product.category === 'vip' ? state.owned : [...state.owned, payload.productId],
    };
    if (product.category === 'vip') {
      const base = state.vip.expiresAt > now ? state.vip.expiresAt : now;
      const tier = product.vipTier === 'platinum' || state.vip.tier === 'platinum' ? 'platinum' : 'gold';
      next.vip = { tier, expiresAt: base + product.vipDurationMs };
    } else {
      const slot = slotForCategory(product.category);
      if (slot && !next.equipped[slot]) next.equipped = { ...next.equipped, [slot]: payload.productId };
    }
    const nextBalance = balance - product.price;
    const nextUserPatch = {
      equippedCosmetics: next.equipped,
      vipTier: next.vip.expiresAt > now ? next.vip.tier : 'none',
      vipExpiresAt: next.vip.expiresAt,
      updatedAt: now,
    };
    if (product.category === 'banner' && !state.equipped.bannerId && product.gradient) {
      nextUserPatch.bannerGradient = product.gradient;
    }
    const result = { balance: nextBalance, cosmetics: next };
    tx.set(owned.playerRef, { manat: nextBalance, coins: nextBalance, cosmetics: next, updatedAt: now }, { merge: true });
    tx.set(owned.userRef, nextUserPatch, { merge: true });
    writeWalletLedger(tx, ledger.ref, {
      uid, playerId: owned.playerId, operationId, type: 'shop_cosmetic',
      amount: -product.price, balanceAfter: nextBalance, source: payload.productId, result,
    });
    tx.set(rate.ref, rate.next);
    return result;
  });
}

async function updateCosmeticEquipment({ uid, payload, operationId, action, rateLimit }) {
  const userId = payload.userId;
  const now = Date.now();
  const ledgerRef = db.doc(`operation_ledger/${operationDocId(uid, operationId)}`);
  return db.runTransaction(async (tx) => {
    const prior = await tx.get(ledgerRef);
    if (prior.exists) return prior.data().result;
    const rate = await ensureRateLimitTx(tx, uid, action, rateLimit, now);
    const owned = await getOwnedPlayer(uid, userId, tx);
    const state = normalizedCosmetics(owned.player.cosmetics);
    const product = cosmetics[payload.productId];
    if (action === 'equipCosmetic') {
      if (!product || product.category === 'vip' || !state.owned.includes(payload.productId)) {
        throw new HttpsError('failed-precondition', 'Bu kosmetikaya sahib deyilsən.');
      }
      const slot = slotForCategory(product.category);
      if (!slot) throw new HttpsError('invalid-argument', 'Kosmetika kateqoriyası etibarsızdır.');
      state.equipped[slot] = payload.productId;
    } else {
      const slot = payload.slot;
      if (!['nameStyleId', 'frameId', 'bannerId', 'badgeId'].includes(slot)) {
        throw new HttpsError('invalid-argument', 'Kosmetika yeri etibarsızdır.');
      }
      delete state.equipped[slot];
    }
    const result = { cosmetics: state };
    tx.set(owned.playerRef, { cosmetics: state, updatedAt: now }, { merge: true });
    tx.set(owned.userRef, {
      equippedCosmetics: state.equipped,
      vipTier: state.vip.expiresAt > now ? state.vip.tier : 'none',
      vipExpiresAt: state.vip.expiresAt,
      updatedAt: now,
    }, { merge: true });
    tx.create(ledgerRef, { authUid: uid, playerId: owned.playerId, action, operationId, result, createdAt: FieldValue.serverTimestamp() });
    tx.set(rate.ref, rate.next);
    return result;
  });
}

async function buyVipPro({ uid, payload, operationId, rateLimit }) {
  const now = Date.now();
  return db.runTransaction(async (tx) => {
    const ledger = await getLedgerOrThrow(tx, uid, operationId);
    if (ledger.duplicate) return ledger.data.result;
    const rate = await ensureRateLimitTx(tx, uid, 'buyVipPro', rateLimit, now);
    const owned = await getOwnedPlayer(uid, payload.userId, tx);
    if (owned.player.userPlan === 'VIP_PRO' && owned.player.hasVipPass === true && owned.player.isVipLifetime === true) {
      const result = { userPlan: 'VIP_PRO', hasVipPass: true, isVipLifetime: true, proPanelActive: owned.player.proPanelActive === true, balance: storedManat(owned.player) };
      tx.set(ledger.ref, { authUid: uid, playerId: owned.playerId, operationId, type: 'vip_pro_already_owned', amount: 0, balanceAfter: result.balance, source: 'vip_pro', result, createdAt: FieldValue.serverTimestamp() });
      tx.set(rate.ref, rate.next);
      return result;
    }
    const balance = storedManat(owned.player);
    if (balance < vipPrice) throw new HttpsError('failed-precondition', 'VIP Professional üçün 30 AZN lazımdır.');
    const nextBalance = balance - vipPrice;
    const plan = { userPlan: 'VIP_PRO', hasVipPass: true, isVipLifetime: true, proPanelActive: true };
    const result = { ...plan, balance: nextBalance };
    tx.set(owned.playerRef, { manat: nextBalance, coins: nextBalance, ...plan, updatedAt: now }, { merge: true });
    writeWalletLedger(tx, ledger.ref, { uid, playerId: owned.playerId, operationId, type: 'vip_pro_purchase', amount: -vipPrice, balanceAfter: nextBalance, source: 'vip_pro', result });
    tx.set(rate.ref, rate.next);
    return result;
  });
}

async function setProPanelActive({ uid, payload, operationId, rateLimit }) {
  const now = Date.now();
  return db.runTransaction(async (tx) => {
    const operation = await readOperation(tx, uid, operationId, 'operation_ledger');
    if (operation.data) return operation.data.result;
    const rate = await ensureRateLimitTx(tx, uid, 'setProPanelActive', rateLimit, now);
    const owned = await getOwnedPlayer(uid, payload.userId, tx);
    const result = {
      userPlan: owned.player.userPlan || 'FREE',
      hasVipPass: owned.player.hasVipPass === true,
      isVipLifetime: owned.player.isVipLifetime === true,
      proPanelActive: payload.active,
    };
    tx.set(owned.playerRef, { proPanelActive: payload.active, updatedAt: now }, { merge: true });
    tx.create(operation.ref, {
      authUid: uid,
      playerId: owned.playerId,
      operationId,
      action: 'setProPanelActive',
      result,
      createdAt: FieldValue.serverTimestamp(),
    });
    tx.set(rate.ref, rate.next);
    return result;
  });
}

async function grantManatAsAdmin({ uid, payload, operationId, rateLimit }) {
  if (!await adminUid(uid)) throw new HttpsError('permission-denied', 'Admin icazəsi tələb olunur.');
  const targetId = safeId(payload.targetUserId, 'İstifadəçi ID-si');
  const playerRef = db.doc(`players/${targetId}`);
  const userRef = db.doc(`users/${targetId}`);
  const commandRef = db.doc(`admin_commands/${operationDocId(uid, operationId)}`);
  const walletLedgerRef = db.doc(`wallet_ledger/${operationDocId(uid, operationId)}`);
  const now = Date.now();
  return db.runTransaction(async (tx) => {
    const operation = await readOperation(tx, uid, operationId, 'operation_ledger');
    if (operation.data) return operation.data.result;
    const rate = await ensureRateLimitTx(tx, uid, 'grantManatAsAdmin', rateLimit, now);
    const [playerSnap, userSnap] = await Promise.all([tx.get(playerRef), tx.get(userRef)]);
    if (!playerSnap.exists || !userSnap.exists) throw new HttpsError('not-found', 'İstifadəçi tapılmadı.');
    const player = playerSnap.data();
    const user = userSnap.data();
    if (!player.identityVerifiedAt || !player.firebaseUid || player.firebaseUid !== user.firebaseUid) {
      throw new HttpsError('failed-precondition', 'İstifadəçi hesabı serverdə təsdiqlənməyib.');
    }
    const previousBalance = storedManat(player);
    const newBalance = previousBalance + payload.amount;
    const result = { previousBalance, newBalance };
    tx.update(playerRef, { manat: newBalance, coins: newBalance, updatedAt: now });
    tx.create(walletLedgerRef, {
      authUid: user.firebaseUid,
      actorUid: uid,
      playerId: targetId,
      operationId,
      type: 'admin_grant',
      amount: payload.amount,
      balanceAfter: newBalance,
      source: payload.reason || 'admin_adjustment',
      result,
      createdAt: FieldValue.serverTimestamp(),
    });
    tx.create(commandRef, {
      adminUid: uid,
      adminId: uid,
      action: 'grant_manat',
      targetUserId: targetId,
      details: { amount: payload.amount, previousBalance, newBalance, reason: payload.reason || null },
      createdAt: now,
    });
    tx.create(operation.ref, { authUid: uid, operationId, action: 'grantManatAsAdmin', result, createdAt: FieldValue.serverTimestamp() });
    tx.set(rate.ref, rate.next);
    return result;
  });
}

async function buyFortress({ uid, payload, operationId, rateLimit }) {
  const targetLevel = Number(payload.level);
  const price = fortressPrices[targetLevel];
  if (!price) throw new HttpsError('invalid-argument', 'Qala səviyyəsi etibarsızdır.');
  const allianceId = safeId(payload.allianceId, 'İttifaq ID-si');
  const allianceRef = db.doc(`alliances/${allianceId}`);
  const now = Date.now();
  return db.runTransaction(async (tx) => {
    const ledger = await getLedgerOrThrow(tx, uid, operationId);
    if (ledger.duplicate) return ledger.data.result;
    const rate = await ensureRateLimitTx(tx, uid, 'buyFortress', rateLimit, now);
    const owned = await getOwnedPlayer(uid, payload.userId, tx);
    const allianceSnap = await tx.get(allianceRef);
    if (!allianceSnap.exists) throw new HttpsError('not-found', 'İttifaq tapılmadı.');
    const alliance = allianceSnap.data();
    if (String(alliance.leaderId) !== owned.playerId) throw new HttpsError('permission-denied', 'Yalnız ittifaq lideri qala ala bilər.');
    const currentLevel = Math.max(1, Math.min(6, Math.floor(Number(alliance.fortressLevel) || 1)));
    if (targetLevel !== currentLevel + 1) throw new HttpsError('failed-precondition', 'Qala bir səviyyə artırıla bilər.');
    const balance = storedManat(owned.player);
    if (balance < price) throw new HttpsError('failed-precondition', 'Balansda kifayət qədər manat yoxdur.');
    const nextBalance = balance - price;
    const result = { balance: nextBalance, fortressLevel: targetLevel };
    tx.set(owned.playerRef, { manat: nextBalance, coins: nextBalance, updatedAt: now }, { merge: true });
    tx.update(allianceRef, { fortressLevel: targetLevel, fortressQualifyingMs: 0, fortressPurchasedAt: now, fortressUpdatedAt: now });
    writeWalletLedger(tx, ledger.ref, { uid, playerId: owned.playerId, operationId, type: 'fortress_purchase', amount: -price, balanceAfter: nextBalance, source: `level_${targetLevel}`, result });
    tx.set(rate.ref, rate.next);
    return result;
  });
}

const sharedUser = z.object({ userId: idSchema }).strict();
const purchaseBattleCardSchema = z.object({ ...operationFields, allianceId: idSchema, cardId: z.enum(Object.keys(battleCards)) }).strict();
const purchaseShieldSchema = z.object({ ...operationFields, durationId: z.enum(Object.keys(shields)) }).strict();
const purchaseCosmeticSchema = z.object({ ...operationFields, productId: z.enum(Object.keys(cosmetics)) }).strict();
const equipCosmeticSchema = z.object({ ...operationFields, productId: z.enum(Object.keys(cosmetics)) }).strict();
const unequipSchema = z.object({ ...operationFields, slot: z.enum(['nameStyleId', 'frameId', 'bannerId', 'badgeId']) }).strict();
const fortressSchema = z.object({ ...operationFields, allianceId: idSchema, level: z.number().int().min(2).max(6) }).strict();
const claimQuestSchema = z.object({ ...operationFields, allianceId: idSchema, questId: z.enum(['daily_chat_5', 'daily_attack_1', 'daily_attack_3', 'daily_shop_1']) }).strict();

const purchaseBattleCard = secureCallable('purchaseBattleCard', purchaseBattleCardSchema, buyBattleCard, { max: 20, windowMs: 60_000 });
const purchaseShield = secureCallable('purchaseShield', purchaseShieldSchema, buyShield, { max: 20, windowMs: 60_000 });
const purchaseCosmetic = secureCallable('purchaseCosmetic', purchaseCosmeticSchema, buyCosmetic, { max: 10, windowMs: 60_000 });
const equipCosmetic = secureCallable('equipCosmetic', equipCosmeticSchema, (ctx) => updateCosmeticEquipment({ ...ctx, action: 'equipCosmetic' }), { max: 30, windowMs: 60_000 });
const unequipCosmeticSlot = secureCallable('unequipCosmeticSlot', unequipSchema, (ctx) => updateCosmeticEquipment({ ...ctx, action: 'unequipCosmeticSlot' }), { max: 30, windowMs: 60_000 });
const purchaseVipProPlan = secureCallable('purchaseVipProPlan', sharedUser, buyVipPro, { max: 5, windowMs: 60_000 });
const setProPanelActiveCallable = secureCallable(
  'setProPanelActive',
  z.object({ ...operationFields, active: z.boolean() }).strict(),
  setProPanelActive,
  { max: 30, windowMs: 60_000 },
);
const adminGrantManatCallable = secureCallable(
  'adminGrantManat',
  z.object({
    targetUserId: idSchema,
    amount: z.number().int().positive().max(1_000_000),
    reason: z.string().trim().max(500).optional(),
  }).strict(),
  grantManatAsAdmin,
  { max: 30, windowMs: 60_000 },
  [ADMIN_UIDS],
);
const purchaseFortressLevel = secureCallable('purchaseFortressLevel', fortressSchema, buyFortress, { max: 10, windowMs: 60_000 });

async function refreshQuestProgress({ uid, payload, rateLimit }) {
  const allianceId = safeId(payload.allianceId, 'İttifaq ID-si');
  const dateKey = getTodayKey();
  const questRef = db.doc(`alliance_quests/${allianceId}_${dateKey}`);
  const activityQuery = db.collection('quest_activity_events')
    .where('authUid', '==', uid)
    .where('allianceId', '==', allianceId)
    .where('dateKey', '==', dateKey)
    .where('type', '==', 'shop_buy');
  const now = Date.now();

  return db.runTransaction(async (tx) => {
    const rate = await ensureRateLimitTx(tx, uid, 'refreshQuestProgress', rateLimit, now);
    const owned = await getOwnedPlayer(uid, payload.userId, tx);
    const [allianceSnap, questSnap, activitySnap] = await Promise.all([
      tx.get(db.doc(`alliances/${allianceId}`)),
      tx.get(questRef),
      tx.get(activityQuery),
    ]);
    if (!allianceSnap.exists || !Array.isArray(allianceSnap.data().members) || !allianceSnap.data().members.includes(owned.playerId)) {
      throw new HttpsError('permission-denied', 'Bu ittifaq üçün tapşırıqları aça bilməzsən.');
    }
    const progress = questSnap.exists ? { ...(questSnap.data().progress || {}) } : {};
    const claimed = questSnap.exists ? { ...(questSnap.data().claimed || {}) } : {};
    const shopCount = activitySnap.docs.reduce((sum, event) => sum + Math.max(0, Number(event.data().amount) || 0), 0);
    progress.daily_shop_1 = Math.min(1, shopCount);
    tx.set(questRef, { allianceId, dateKey, progress, claimed, updatedAt: now }, { merge: true });
    tx.set(rate.ref, rate.next);
    return { dateKey, progress, claimed };
  });
}

async function claimAllianceQuest({ uid, payload, operationId, rateLimit }) {
  const rewards = {
    daily_chat_5: { type: 'chat', target: 5, reward: 80 },
    daily_attack_1: { type: 'attack', target: 1, reward: 150 },
    daily_attack_3: { type: 'attack', target: 3, reward: 350 },
    daily_shop_1: { type: 'shop_buy', target: 1, reward: 100 },
  };
  const quest = rewards[payload.questId];
  const allianceId = safeId(payload.allianceId, 'İttifaq ID-si');
  const dateKey = getTodayKey();
  const questRef = db.doc(`alliance_quests/${allianceId}_${dateKey}`);
  const questEventQuery = db.collection('quest_activity_events')
    .where('authUid', '==', uid)
    .where('allianceId', '==', allianceId)
    .where('dateKey', '==', dateKey)
    .where('type', '==', quest.type);
  const now = Date.now();

  return db.runTransaction(async (tx) => {
    const ledger = await getLedgerOrThrow(tx, uid, operationId);
    if (ledger.duplicate) return ledger.data.result?.reward || 0;
    const rate = await ensureRateLimitTx(tx, uid, 'claimAllianceQuest', rateLimit, now);
    const owned = await getOwnedPlayer(uid, payload.userId, tx);
    const [questSnap, activitySnap] = await Promise.all([tx.get(questRef), tx.get(questEventQuery)]);
    const progress = questSnap.exists ? { ...(questSnap.data().progress || {}) } : {};
    const claimed = questSnap.exists ? { ...(questSnap.data().claimed || {}) } : {};
    const serverCount = activitySnap.docs.reduce((sum, doc) => sum + Math.max(0, Number(doc.data().amount) || 0), 0);
    if (claimed[payload.questId]) throw new HttpsError('already-exists', 'Tapşırıq mükafatı artıq götürülüb.');
    if (serverCount < quest.target) {
      throw new HttpsError('failed-precondition', 'Tapşırıq server tərəfindən hələ tamamlanmış sayılmır.');
    }
    const nextBalance = storedManat(owned.player) + quest.reward;
    claimed[payload.questId] = true;
    progress[payload.questId] = Math.max(Number(progress[payload.questId]) || 0, quest.target);
    const result = { reward: quest.reward, balance: nextBalance };
    tx.set(questRef, { allianceId, dateKey, progress, claimed, updatedAt: now }, { merge: true });
    tx.set(owned.playerRef, { manat: nextBalance, coins: nextBalance, updatedAt: now }, { merge: true });
    writeWalletLedger(tx, ledger.ref, { uid, playerId: owned.playerId, operationId, type: 'alliance_quest_reward', amount: quest.reward, balanceAfter: nextBalance, source: payload.questId, result });
    tx.set(rate.ref, rate.next);
    return quest.reward;
  });
}

const claimQuestReward = secureCallable('claimQuestReward', claimQuestSchema, claimAllianceQuest, { max: 10, windowMs: 60_000 });
const refreshQuestProgressCallable = secureCallable(
  'refreshQuestProgress',
  z.object({ ...operationFields, allianceId: idSchema }).strict(),
  refreshQuestProgress,
  { max: 30, windowMs: 60_000 },
);

module.exports = {
  purchaseBattleCard,
  purchaseShield,
  purchaseCosmetic,
  equipCosmetic,
  unequipCosmeticSlot,
  purchaseVipProPlan,
  setProPanelActive: setProPanelActiveCallable,
  adminGrantManat: adminGrantManatCallable,
  purchaseFortressLevel,
  claimQuestReward,
  refreshQuestProgress: refreshQuestProgressCallable,
};
