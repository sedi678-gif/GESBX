const crypto = require('node:crypto');
const { z } = require('zod');
const {
  db,
  HttpsError,
  secureCallable,
  getOwnedPlayer,
  FieldValue,
} = require('./security');

const queueSchema = z.object({ userId: z.string().regex(/^\d{1,20}$/) }).strict();
const QUEUE_FRESH_MS = 45_000;
const MAX_QUEUE_SCAN = 50;
const ENERGY = 30;
const TURN_MS = 15_000;
const DAILY_XP_CAP = 100;
const WIN_XP = 50;
const LOSS_XP = 10;
const DRAW_XP = 20;

function isUnallied(player) {
  const id = String(player?.allianceId || '').trim().toLowerCase();
  return !id || id === '0' || id === 'null' || id === 'undefined';
}

function displayName(player, playerId) {
  return String(player?.displayName || player?.username || player?.name || `Oyunçu ${playerId}`)
    .trim()
    .slice(0, 32);
}

function arenaEffects() {
  return {
    pendingDoubleFor: null,
    pendingHideNext: false,
    frozenUntil: { home: 0, away: 0 },
    lastPlay: null,
    lastCounterOk: false,
    countered: null,
    forcedReplay: null,
    slave: null,
    clickEvent: null,
    spyReveal: {},
    jokerMimic: null,
    chain: [],
    lastSummary: '',
    lastEvents: [],
  };
}

function makeMatch({ matchId, home, away, now }) {
  const homePlayerIds = [home.playerId, null, null, null, null];
  const awayPlayerIds = [away.playerId, null, null, null, null];
  const playerState = (playerId, side) => ({
    playerId,
    role: 'LIDER',
    side,
    slotIndex: 0,
    energy: ENERGY,
    maxEnergy: ENERGY,
  });
  return {
    matchId,
    status: 'active',
    phase: 'loadout',
    createdBy: home.playerId,
    homePlayerIds,
    awayPlayerIds,
    participantIds: [...new Set([home.playerId, away.playerId, home.uid, away.uid])],
    players: {
      [home.playerId]: playerState(home.playerId, 'home'),
      [away.playerId]: playerState(away.playerId, 'away'),
    },
    displayNames: {
      [home.playerId]: displayName(home.player, home.playerId),
      [away.playerId]: displayName(away.player, away.playerId),
    },
    currentTurn: home.playerId,
    turnSide: 'home',
    turnSlotIndex: 0,
    turnIndex: 0,
    turnSeq: 0,
    turnStartedAt: now,
    turnExpiresAt: now + TURN_MS,
    turnDuration: TURN_MS,
    lastActionId: null,
    lastActionTurnSeq: -1,
    loadouts: {},
    usedActionIds: {},
    gameMode: '1v1',
    homeAllianceId: '',
    awayAllianceId: '',
    reaction: null,
    result: null,
    sideScores: { home: 0, away: 0 },
    scoreHistory: [],
    effects: arenaEffects(),
    energyStart: ENERGY,
    energyMax: ENERGY,
    schemaVersion: 1,
    matchType: 'solo_random',
    createdAt: now,
    updatedAt: now,
  };
}

function matchedResult(ticket, matchId) {
  return {
    state: 'matched',
    matchId,
    opponentName: String(ticket.opponentName || '').slice(0, 32),
  };
}

async function queueSoloArenaMatch({ uid, payload }) {
  const now = Date.now();
  const ownTicketRef = db.doc(`solo_arena_queue/${uid}`);
  const matchRef = db.collection('arena_matches').doc();
  return db.runTransaction(async (tx) => {
    const own = await getOwnedPlayer(uid, payload.userId, tx);
    if (!isUnallied(own.player)) {
      throw new HttpsError('failed-precondition', 'Təsadüfi XP döyüşü yalnız ittifaqsız oyunçular üçündür.');
    }
    if (own.player.proPanelActive === true) {
      throw new HttpsError('failed-precondition', 'Döyüşdən XP almaq üçün XP rejimini aktivləşdir.');
    }

    const ownTicketSnap = await tx.get(ownTicketRef);
    const ownTicket = ownTicketSnap.exists ? ownTicketSnap.data() : null;
    if (ownTicket?.state === 'matched' && ownTicket.matchId) {
      const previousMatchSnap = await tx.get(db.doc(`arena_matches/${ownTicket.matchId}`));
      if (previousMatchSnap.exists && previousMatchSnap.data().status !== 'closed') {
        return matchedResult(ownTicket, ownTicket.matchId);
      }
    }

    const waitingQuery = db.collection('solo_arena_queue')
      .where('state', '==', 'waiting')
      .orderBy('updatedAt', 'desc')
      .limit(MAX_QUEUE_SCAN);
    const waitingSnap = await tx.get(waitingQuery);
    const candidates = waitingSnap.docs.filter((doc) => {
      if (doc.id === uid) return false;
      const ticket = doc.data();
      return ticket.state === 'waiting'
        && Number(ticket.updatedAt) >= now - QUEUE_FRESH_MS
        && /^\d{1,20}$/.test(String(ticket.playerId || ''));
    });
    const playerSnaps = await Promise.all(candidates.map((doc) => tx.get(db.doc(`players/${doc.data().playerId}`))));
    const userSnaps = await Promise.all(candidates.map((doc) => tx.get(db.doc(`users/${doc.data().playerId}`))));

    const eligible = [];
    const ineligibleRefs = [];
    candidates.forEach((ticketSnap, index) => {
      const ticket = ticketSnap.data();
      const candidatePlayer = playerSnaps[index];
      const candidateUser = userSnaps[index];
      if (!candidatePlayer.exists || !candidateUser.exists) {
        ineligibleRefs.push(ticketSnap.ref);
        return;
      }
      const player = candidatePlayer.data();
      const user = candidateUser.data();
      if (
        player.firebaseUid !== ticketSnap.id
        || user.firebaseUid !== ticketSnap.id
        || !isUnallied(player)
        || player.proPanelActive === true
        || player.banned === true
        || player.frozen === true
        || user.banned === true
        || user.frozen === true
      ) {
        ineligibleRefs.push(ticketSnap.ref);
        return;
      }
      eligible.push({
        ref: ticketSnap.ref,
        uid: ticketSnap.id,
        playerId: String(ticket.playerId),
        player,
        ticket,
      });
    });

    ineligibleRefs.forEach((ref) => tx.update(ref, { state: 'ineligible', updatedAt: now }));
    if (eligible.length === 0) {
      tx.set(ownTicketRef, {
        state: 'waiting',
        playerId: own.playerId,
        playerName: displayName(own.player, own.playerId),
        matchId: null,
        opponentName: null,
        createdAt: ownTicket?.state === 'waiting' ? Number(ownTicket.createdAt) || now : now,
        updatedAt: now,
      });
      return { state: 'waiting' };
    }

    const opponent = eligible[crypto.randomInt(eligible.length)];
    const home = { uid, playerId: own.playerId, player: own.player };
    const away = { uid: opponent.uid, playerId: opponent.playerId, player: opponent.player };
    const match = makeMatch({
      matchId: matchRef.id,
      home,
      away,
      now,
    });
    tx.create(matchRef, match);
    tx.create(db.doc(`solo_arena_matches/${matchRef.id}`), {
      matchId: matchRef.id,
      playerIds: [home.playerId, away.playerId],
      authUids: [home.uid, away.uid],
      createdAt: FieldValue.serverTimestamp(),
    });
    tx.set(ownTicketRef, {
      state: 'matched',
      playerId: own.playerId,
      playerName: displayName(own.player, own.playerId),
      matchId: matchRef.id,
      opponentName: displayName(opponent.player, opponent.playerId),
      createdAt: ownTicket?.state === 'waiting' ? Number(ownTicket.createdAt) || now : now,
      updatedAt: now,
    });
    tx.update(opponent.ref, {
      state: 'matched',
      matchId: matchRef.id,
      opponentName: displayName(own.player, own.playerId),
      updatedAt: now,
    });
    return { state: 'matched', matchId: matchRef.id, opponentName: displayName(opponent.player, opponent.playerId) };
  });
}

async function cancelSoloArenaQueue({ uid, payload }) {
  const ticketRef = db.doc(`solo_arena_queue/${uid}`);
  return db.runTransaction(async (tx) => {
    await getOwnedPlayer(uid, payload.userId, tx);
    const snap = await tx.get(ticketRef);
    if (!snap.exists) return { cancelled: false };
    const ticket = snap.data();
    if (ticket.state === 'matched' && ticket.matchId) {
      const matchSnap = await tx.get(db.doc(`arena_matches/${ticket.matchId}`));
      if (matchSnap.exists && matchSnap.data().status !== 'closed') return { cancelled: false };
    } else if (ticket.state !== 'waiting' && ticket.state !== 'ineligible') {
      return { cancelled: false };
    }
    tx.delete(ticketRef);
    return { cancelled: true };
  });
}

exports.queueSoloArenaMatch = secureCallable('queueSoloArenaMatch', queueSchema, queueSoloArenaMatch, { max: 24, windowMs: 60_000 });
exports.cancelSoloArenaQueue = secureCallable('cancelSoloArenaQueue', queueSchema, cancelSoloArenaQueue, { max: 10, windowMs: 60_000 });
