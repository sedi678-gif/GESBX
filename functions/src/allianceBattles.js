const crypto = require('node:crypto');
const { z } = require('zod');
const { db, HttpsError, secureCallable, getOwnedPlayer, FieldValue } = require('./security');

const playerId = z.string().regex(/^\d{1,20}$/);
const allianceId = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
const cardId = z.enum(['zombi', 'yarasa', 'duman', 'mutant', 'standing', 'it']);
const startSchema = z.object({
  userId: playerId,
  attackerAllianceId: allianceId,
  defenderAllianceId: allianceId,
  cardId,
  cardCount: z.number().int().min(1).max(10),
}).strict();
const clickSchema = z.object({ userId: playerId, attackId: allianceId }).strict();
const finishSchema = z.object({ attackId: allianceId }).strict();
const POWER = { zombi: 0, yarasa: 10, duman: 8, mutant: 0, standing: 0, it: 0 };
const RAID = {
  mutant: { damage: 1500, clicks: 7, duration: 14_000 },
  standing: { damage: 1000, clicks: 5, duration: 14_000 },
  zombi: { damage: 1500, clicks: 7, duration: 14_000 },
  it: { damage: 1000, clicks: 5, duration: 10_000 },
};
const isRaid = (id) => Object.hasOwn(RAID, id);
const raidValues = (id, members) => ({
  damage: Math.round((RAID[id].damage / 50) * Math.max(1, members)),
  clicks: Math.max(2, Math.round((RAID[id].clicks * Math.max(1, members)) / 50)),
});

async function startAllianceAttack({ uid, payload }) {
  if (payload.attackerAllianceId === payload.defenderAllianceId) {
    throw new HttpsError('invalid-argument', 'Öz ittifaqına hücum edə bilməzsən.');
  }
  const attackRef = db.collection('alliance_attacks').doc();
  const now = Date.now();
  const attack = await db.runTransaction(async (tx) => {
    const owned = await getOwnedPlayer(uid, payload.userId, tx);
    const attackerRef = db.doc(`alliances/${payload.attackerAllianceId}`);
    const defenderRef = db.doc(`alliances/${payload.defenderAllianceId}`);
    const [attackerSnap, defenderSnap] = await Promise.all([tx.get(attackerRef), tx.get(defenderRef)]);
    if (!attackerSnap.exists || !defenderSnap.exists) throw new HttpsError('not-found', 'İttifaq tapılmadı.');
    if (owned.player.allianceId !== payload.attackerAllianceId) {
      throw new HttpsError('permission-denied', 'Yalnız öz ittifaqın adından hücum edə bilərsən.');
    }
    const attacker = attackerSnap.data();
    const defender = defenderSnap.data();
    const assistantLeaderIds = Array.isArray(attacker.assistantLeaderIds)
      ? attacker.assistantLeaderIds.map(String)
      : [];
    if (String(attacker.leaderId) !== owned.playerId && !assistantLeaderIds.includes(owned.playerId)) {
      throw new HttpsError('permission-denied', 'Hücumu yalnız lider və onun təyin etdiyi köməkçi lider başlada bilər.');
    }
    const members = Array.isArray(defender.members) ? defender.members.length : 1;
    const raid = isRaid(payload.cardId);
    const rawDamage = raid ? raidValues(payload.cardId, members).damage : POWER[payload.cardId] * payload.cardCount;
    const guards = Math.min(5, Math.max(1, Math.ceil(Math.max(1, members) / 3)));
    const capacity = guards + Math.floor(Math.max(0, members) * 0.2);
    const blockedCount = raid ? 0 : Math.min(payload.cardCount, capacity);
    const breakthroughCount = raid ? payload.cardCount : Math.max(0, payload.cardCount - blockedCount);
    const damage = raid ? 0 : Math.max(0, Math.round(rawDamage * breakthroughCount / payload.cardCount));
    const raidData = raid ? raidValues(payload.cardId, members) : null;
    const profile = owned.player;
    const payloadDoc = {
      attackerAllianceId: payload.attackerAllianceId,
      attackerAllianceName: String(attacker.name || '?').slice(0, 64),
      defenderAllianceId: payload.defenderAllianceId,
      defenderAllianceName: String(defender.name || '?').slice(0, 64),
      attackerUserId: owned.playerId,
      attackerName: String(profile.displayName || `${owned.user.name || ''} ${owned.user.surname || ''}`).trim().slice(0, 100),
      cardId: payload.cardId,
      cardCount: payload.cardCount,
      damage,
      rawDamage,
      blockedCount,
      breakthroughCount,
      defenderGuardCount: guards,
      attackerLat: Number.isFinite(attacker.lat) ? attacker.lat : null,
      attackerLng: Number.isFinite(attacker.lng) ? attacker.lng : null,
      defenderLat: Number.isFinite(defender.lat) ? defender.lat : null,
      defenderLng: Number.isFinite(defender.lng) ? defender.lng : null,
      createdAt: now,
      status: raid ? `${payload.cardId}_active` : 'active',
      ...(raid ? {
        raidDamage: raidData.damage,
        raidClicksRequired: raidData.clicks,
        raidClicksRemaining: raidData.clicks,
        raidStatus: 'active',
        raidEndsAt: now + RAID[payload.cardId].duration,
        defenderMemberCount: members,
      } : {}),
    };
    tx.create(attackRef, payloadDoc);
    return { id: attackRef.id, ...payloadDoc };
  });
  return { damage: attack.damage, attack };
}

async function registerRaidClick({ uid, payload }) {
  const attackRef = db.doc(`alliance_attacks/${payload.attackId}`);
  const clickRef = db.doc(`alliance_raid_clicks/${crypto.createHash('sha256').update(`${payload.attackId}:${uid}`).digest('hex')}`);
  await db.runTransaction(async (tx) => {
    const [owned, attackSnap, clickSnap] = await Promise.all([
      getOwnedPlayer(uid, payload.userId, tx), tx.get(attackRef), tx.get(clickRef),
    ]);
    if (!attackSnap.exists) throw new HttpsError('not-found', 'Hücum tapılmadı.');
    const attack = attackSnap.data();
    if (!isRaid(attack.cardId) || attack.raidStatus !== 'active') return;
    if (owned.player.allianceId !== attack.defenderAllianceId) {
      throw new HttpsError('permission-denied', 'Yalnız müdafiəçi ittifaq üzvləri reydi dayandıra bilər.');
    }
    const now = Date.now();
    if (Number(attack.raidEndsAt) <= now) return;
    if (clickSnap.exists && now - Number(clickSnap.data().lastClickedAt || 0) < 180) return;
    const remaining = Math.max(0, Number(attack.raidClicksRemaining || 0) - 1);
    tx.set(clickRef, { lastClickedAt: now, updatedAt: FieldValue.serverTimestamp() });
    tx.update(attackRef, remaining === 0 ? {
      raidClicksRemaining: 0, raidStatus: 'killed', damage: 0,
      status: `${attack.cardId}_killed`, updatedAt: now,
    } : { raidClicksRemaining: remaining, updatedAt: now });
  });
}

async function finalizeRaid({ payload }) {
  const attackRef = db.doc(`alliance_attacks/${payload.attackId}`);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(attackRef);
    if (!snap.exists) return;
    const attack = snap.data();
    if (!isRaid(attack.cardId) || attack.raidStatus !== 'active') return;
    const now = Date.now();
    if (Number(attack.raidClicksRemaining) <= 0) {
      tx.update(attackRef, { raidStatus: 'killed', raidClicksRemaining: 0, damage: 0, status: `${attack.cardId}_killed`, updatedAt: now });
    } else if (Number(attack.raidEndsAt) <= now) {
      tx.update(attackRef, { raidStatus: 'hit', damage: Number(attack.raidDamage) || 0, status: `${attack.cardId}_hit`, updatedAt: now });
    }
  });
}

exports.startAllianceAttack = secureCallable('startAllianceAttack', startSchema, startAllianceAttack, { max: 10, windowMs: 60_000 });
exports.registerAllianceRaidClick = secureCallable('registerAllianceRaidClick', clickSchema, registerRaidClick, { max: 80, windowMs: 60_000 });
exports.finalizeAllianceRaid = secureCallable('finalizeAllianceRaid', finishSchema, finalizeRaid, { max: 30, windowMs: 60_000 });
