import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  type Transaction,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from '@/firebase';
import { requireFirebaseAuth } from '@/app/lib/firebaseAuth';
import { serverNowMs, syncServerClock } from '@/app/lib/battlePlay/battleServerClock';
import { replayBattleRequest } from '@/app/lib/battleReconnect/replayBattleRequest';
import { timestampToMs } from '@/app/lib/battleEventLog/battleEventLog';
import {
  addLeaderboardScore,
  clampLeaderboardScore,
  isPeriodKey,
  LEADERBOARD_ARCHIVES_COLLECTION,
  LEADERBOARD_DAILY_COLLECTION,
  LEADERBOARD_ENTRIES,
  LEADERBOARD_RESETS_COLLECTION,
  LEADERBOARD_SCHEMA,
  LEADERBOARD_STATE_COLLECTION,
  LEADERBOARD_STATE_ID,
  LEADERBOARD_TIMEZONE,
  LEADERBOARD_TZ_OFFSET_MS,
  LEADERBOARD_WEEKLY_COLLECTION,
  LEADERBOARD_WEEKLY_SCORE_BASE,
  officialActiveUserCount,
  officialNormalizedAllianceScore,
  officialPeriod,
  rankLeaderboardRows,
  upsertLeaderboardRow,
  type LeaderboardBoard,
  type LeaderboardPeriod,
  type LeaderboardRow,
} from './leaderboardConfig';

const WRITE_MS = 12_000;

export function leaderboardStateRef() {
  return doc(db, LEADERBOARD_STATE_COLLECTION, LEADERBOARD_STATE_ID);
}

export function dailyBoardRef(dayKey: string) {
  return doc(db, LEADERBOARD_DAILY_COLLECTION, dayKey);
}

export function weeklyBoardRef(weekKey: string) {
  return doc(db, LEADERBOARD_WEEKLY_COLLECTION, weekKey);
}

export function dailyEntryRef(dayKey: string, playerId: string) {
  return doc(db, LEADERBOARD_DAILY_COLLECTION, dayKey, LEADERBOARD_ENTRIES, playerId);
}

export function weeklyEntryRef(weekKey: string, allianceId: string) {
  return doc(db, LEADERBOARD_WEEKLY_COLLECTION, weekKey, LEADERBOARD_ENTRIES, allianceId);
}

function resetRef(kind: 'daily' | 'weekly', periodKey: string) {
  return doc(db, LEADERBOARD_RESETS_COLLECTION, `${kind}_${periodKey}`);
}

function archiveRef(kind: 'daily' | 'weekly', periodKey: string) {
  return doc(db, LEADERBOARD_ARCHIVES_COLLECTION, `${kind}_${periodKey}`);
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

function viewRows(raw: unknown): LeaderboardRow[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item, index) => {
      const row = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
      return {
        id: String(row.id || ''),
        rank: Math.max(1, Math.trunc(Number(row.rank) || index + 1)),
        name: String(row.name || row.id || ''),
        score: clampLeaderboardScore(row.score),
        rawScore: row.rawScore != null ? clampLeaderboardScore(row.rawScore) : undefined,
        activeUsers:
          typeof row.activeUsers === 'number'
            ? Math.max(1, Math.min(50, Math.trunc(row.activeUsers)))
            : undefined,
      };
    })
    .filter((row) => row.id);
}

export function viewLeaderboardBoard(
  kind: 'daily' | 'weekly',
  periodKey: string,
  data?: Record<string, unknown> | null
): LeaderboardBoard {
  return {
    kind,
    periodKey,
    timezone: typeof data?.timezone === 'string' ? data.timezone : LEADERBOARD_TIMEZONE,
    status: data?.status === 'closed' ? 'closed' : 'open',
    rows: viewRows(data?.rows),
    version: Math.max(0, Math.trunc(Number(data?.version) || 0)),
    updatedAt: timestampToMs(data?.updatedAt),
  };
}

function emptyBoard(kind: 'daily' | 'weekly', periodKey: string) {
  return {
    kind,
    periodKey,
    timezone: LEADERBOARD_TIMEZONE,
    offsetMs: LEADERBOARD_TZ_OFFSET_MS,
    status: 'open' as const,
    rows: [] as LeaderboardRow[],
    version: 1,
    schemaVersion: LEADERBOARD_SCHEMA,
    updatedAt: serverTimestamp(),
  };
}

function writeBoard(tx: Transaction, ref: ReturnType<typeof dailyBoardRef>, board: LeaderboardBoard) {
  tx.set(
    ref,
    {
      kind: board.kind,
      periodKey: board.periodKey,
      timezone: LEADERBOARD_TIMEZONE,
      offsetMs: LEADERBOARD_TZ_OFFSET_MS,
      status: board.status,
      rows: board.rows,
      version: board.version + 1,
      schemaVersion: LEADERBOARD_SCHEMA,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

export interface BattleLeaderboardAward {
  battleId: string;
  dayKey: string;
  weekKey: string;
  players: { id: string; name: string; delta: number }[];
  alliances: { id: string; name: string; delta: number; activePlayerIds: string[] }[];
}

/** Eyni transaction-da entry + board — client cədvəl sıralamır. */
export async function applyBattleLeaderboardAwards(tx: Transaction, award: BattleLeaderboardAward) {
  if (!isPeriodKey(award.dayKey) || !isPeriodKey(award.weekKey)) {
    throw new Error('Period açarı yanlışdır');
  }
  if (!award.battleId) throw new Error('Battle ID tələb olunur');

  const playerAwards = award.players.filter((item) => item.delta > 0);
  const allianceAwards = award.alliances.filter((item) => item.delta > 0);
  if (playerAwards.length === 0 && allianceAwards.length === 0) return;

  const dailyRef = dailyBoardRef(award.dayKey);
  const weeklyRef = weeklyBoardRef(award.weekKey);
  const playerEntryRefs = playerAwards.map((item) => dailyEntryRef(award.dayKey, item.id));
  const allianceEntryRefs = allianceAwards.map((item) => weeklyEntryRef(award.weekKey, item.id));

  const [dailySnap, weeklySnap, ...rest] = await Promise.all([
    tx.get(dailyRef),
    tx.get(weeklyRef),
    ...playerEntryRefs.map((ref) => tx.get(ref)),
    ...allianceEntryRefs.map((ref) => tx.get(ref)),
  ]);

  const playerSnaps = rest.slice(0, playerAwards.length);
  const allianceSnaps = rest.slice(playerAwards.length);

  let daily = viewLeaderboardBoard('daily', award.dayKey, dailySnap.data() as Record<string, unknown> | undefined);
  let weekly = viewLeaderboardBoard('weekly', award.weekKey, weeklySnap.data() as Record<string, unknown> | undefined);

  playerAwards.forEach((item, index) => {
    const prev = playerSnaps[index];
    const prevScore = prev.exists() ? clampLeaderboardScore(prev.data()?.score) : 0;
    const score = addLeaderboardScore(prevScore, item.delta);
    tx.set(
      playerEntryRefs[index],
      {
        playerId: item.id,
        name: item.name,
        score,
        dayKey: award.dayKey,
        battleId: award.battleId,
        schemaVersion: LEADERBOARD_SCHEMA,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
    daily = {
      ...daily,
      rows: upsertLeaderboardRow(daily.rows, { id: item.id, name: item.name, score }),
    };
  });

  allianceAwards.forEach((item, index) => {
    const prev = allianceSnaps[index];
    const prevRaw = prev.exists() ? clampLeaderboardScore(prev.data()?.rawScore) : 0;
    const prevActive =
      prev.exists() && Array.isArray(prev.data()?.activeUserIds)
        ? (prev.data()?.activeUserIds as unknown[]).map(String)
        : [];
    const rawScore = addLeaderboardScore(prevRaw, item.delta);
    const activeUserIds = [...new Set([...prevActive, ...item.activePlayerIds.map(String).filter(Boolean)])];
    const score = officialNormalizedAllianceScore(rawScore, activeUserIds);
    tx.set(
      allianceEntryRefs[index],
      {
        allianceId: item.id,
        name: item.name,
        rawScore,
        activeUserIds,
        activeUsers: officialActiveUserCount(activeUserIds),
        score,
        weekKey: award.weekKey,
        battleId: award.battleId,
        schemaVersion: LEADERBOARD_SCHEMA,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
    weekly = {
      ...weekly,
      rows: upsertLeaderboardRow(weekly.rows, {
        id: item.id,
        name: item.name,
        score,
        rawScore,
        activeUsers: officialActiveUserCount(activeUserIds),
      }),
    };
  });

  if (!dailySnap.exists()) tx.set(dailyRef, emptyBoard('daily', award.dayKey));
  if (!weeklySnap.exists()) tx.set(weeklyRef, emptyBoard('weekly', award.weekKey));
  if (playerAwards.length) {
    writeBoard(tx, dailyRef, { ...daily, status: 'open', periodKey: award.dayKey, kind: 'daily' });
  }
  if (allianceAwards.length) {
    writeBoard(tx, weeklyRef, { ...weekly, status: 'open', periodKey: award.weekKey, kind: 'weekly' });
  }
}

async function rollLeaderboardWork(): Promise<LeaderboardPeriod> {
  await requireFirebaseAuth();
  await syncServerClock();
  const now = serverNowMs();
  if (now <= 0) throw new Error('Server saatı yoxdur');
  const period = officialPeriod(now);

  const stateSnap = await getDoc(leaderboardStateRef());
  const openWeek = stateSnap.exists() ? String(stateSnap.data()?.openWeekKey || '') : '';
  const weekChanged = Boolean(openWeek && openWeek !== period.weekKey);

  const staleWeeklyEntries = weekChanged
    ? await getDocs(collection(db, LEADERBOARD_WEEKLY_COLLECTION, openWeek, LEADERBOARD_ENTRIES))
    : null;

  await withTimeout(
    runTransaction(db, async (tx) => {
      const stateRef = leaderboardStateRef();
      const st = await tx.get(stateRef);
      const currentDay = st.exists() ? String(st.data()?.openDayKey || '') : '';
      const currentWeek = st.exists() ? String(st.data()?.openWeekKey || '') : '';
      if (currentDay === period.dayKey && currentWeek === period.weekKey && st.exists()) return;

      const needDaily = Boolean(currentDay && currentDay !== period.dayKey);
      const needWeekly = Boolean(currentWeek && currentWeek !== period.weekKey);
      const dailyReceipt = needDaily ? resetRef('daily', currentDay) : null;
      const weeklyReceipt = needWeekly ? resetRef('weekly', currentWeek) : null;
      const staleAllianceIds = needWeekly ? (staleWeeklyEntries?.docs ?? []).map((item) => item.id) : [];

      const dailyReceiptSnap = dailyReceipt ? await tx.get(dailyReceipt) : null;
      const weeklyReceiptSnap = weeklyReceipt ? await tx.get(weeklyReceipt) : null;
      const doDaily = Boolean(needDaily && dailyReceipt && dailyReceiptSnap && !dailyReceiptSnap.exists());
      const doWeekly = Boolean(needWeekly && weeklyReceipt && weeklyReceiptSnap && !weeklyReceiptSnap.exists());

      const dailyBoardSnap = doDaily ? await tx.get(dailyBoardRef(currentDay)) : null;
      const weeklyBoardSnap = doWeekly ? await tx.get(weeklyBoardRef(currentWeek)) : null;
      const allianceSnaps = doWeekly
        ? await Promise.all(staleAllianceIds.map((id) => tx.get(doc(db, 'alliances', id))))
        : [];
      const dailyOpen = await tx.get(dailyBoardRef(period.dayKey));
      const weeklyOpen = await tx.get(weeklyBoardRef(period.weekKey));

      if (doDaily && dailyReceipt) {
        if (st.exists()) tx.update(stateRef, { dailyLock: currentDay, updatedAt: serverTimestamp() });
        const snapshot = viewLeaderboardBoard(
          'daily',
          currentDay,
          dailyBoardSnap?.exists() ? (dailyBoardSnap.data() as Record<string, unknown>) : null
        );
        tx.set(archiveRef('daily', currentDay), {
          kind: 'daily',
          periodKey: currentDay,
          timezone: LEADERBOARD_TIMEZONE,
          rows: snapshot.rows,
          version: snapshot.version,
          schemaVersion: LEADERBOARD_SCHEMA,
          archivedAt: serverTimestamp(),
        });
        if (dailyBoardSnap?.exists()) {
          writeBoard(tx, dailyBoardRef(currentDay), { ...snapshot, status: 'closed' });
        }
        tx.set(dailyReceipt, {
          status: 'done',
          kind: 'daily',
          periodKey: currentDay,
          schemaVersion: LEADERBOARD_SCHEMA,
          createdAt: serverTimestamp(),
        });
      }

      if (doWeekly && weeklyReceipt) {
        if (st.exists()) tx.update(stateRef, { weeklyLock: currentWeek, updatedAt: serverTimestamp() });
        const snapshot = viewLeaderboardBoard(
          'weekly',
          currentWeek,
          weeklyBoardSnap?.exists() ? (weeklyBoardSnap.data() as Record<string, unknown>) : null
        );
        tx.set(archiveRef('weekly', currentWeek), {
          kind: 'weekly',
          periodKey: currentWeek,
          timezone: LEADERBOARD_TIMEZONE,
          rows: snapshot.rows,
          version: snapshot.version,
          schemaVersion: LEADERBOARD_SCHEMA,
          archivedAt: serverTimestamp(),
        });
        if (weeklyBoardSnap?.exists()) {
          writeBoard(tx, weeklyBoardRef(currentWeek), { ...snapshot, status: 'closed' });
        }
        allianceSnaps.forEach((allianceSnap) => {
          if (!allianceSnap.exists()) return;
          tx.set(
            allianceSnap.ref,
            {
              score: LEADERBOARD_WEEKLY_SCORE_BASE,
              weeklyKey: period.weekKey,
              weeklyResetFrom: currentWeek,
              updatedAt: serverTimestamp(),
            },
            { merge: true }
          );
        });
        tx.set(weeklyReceipt, {
          status: 'done',
          kind: 'weekly',
          periodKey: currentWeek,
          schemaVersion: LEADERBOARD_SCHEMA,
          createdAt: serverTimestamp(),
        });
      }

      if (!dailyOpen.exists()) tx.set(dailyBoardRef(period.dayKey), emptyBoard('daily', period.dayKey));
      if (!weeklyOpen.exists()) tx.set(weeklyBoardRef(period.weekKey), emptyBoard('weekly', period.weekKey));

      tx.set(
        stateRef,
        {
          timezone: LEADERBOARD_TIMEZONE,
          offsetMs: LEADERBOARD_TZ_OFFSET_MS,
          openDayKey: period.dayKey,
          openWeekKey: period.weekKey,
          dailyLock: null,
          weeklyLock: null,
          schemaVersion: LEADERBOARD_SCHEMA,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    }),
    WRITE_MS,
    'Leaderboard reset yazılmadı.'
  );

  return period;
}

/** Gün/həftə dəyişəndə lock + archive; eyni period ikinci dəfə reset olunmur. */
export function rollLeaderboardIfNeeded(): Promise<LeaderboardPeriod> {
  return replayBattleRequest('leaderboard_roll', () => rollLeaderboardWork());
}

export async function requireLeaderboardPeriod(): Promise<LeaderboardPeriod> {
  await syncServerClock();
  return rollLeaderboardIfNeeded();
}

export function listenLeaderboardBoard(
  kind: 'daily' | 'weekly',
  periodKey: string,
  onChange: (board: LeaderboardBoard | null) => void
): Unsubscribe {
  const ref = kind === 'daily' ? dailyBoardRef(periodKey) : weeklyBoardRef(periodKey);
  const root = kind === 'daily' ? LEADERBOARD_DAILY_COLLECTION : LEADERBOARD_WEEKLY_COLLECTION;
  const entriesRef = collection(db, root, periodKey, LEADERBOARD_ENTRIES);
  let board: LeaderboardBoard | null = null;
  let entryRows: LeaderboardRow[] = [];
  const emit = () => {
    if (!board && entryRows.length === 0) {
      onChange(null);
      return;
    }
    onChange({
      ...(board ?? {
        kind,
        periodKey,
        timezone: LEADERBOARD_TIMEZONE,
        status: 'open',
        rows: [],
        version: 0,
        updatedAt: 0,
      }),
      rows: rankLeaderboardRows(entryRows),
    });
  };
  const unsubBoard = onSnapshot(ref, (snap) => {
    board = snap.exists() ? viewLeaderboardBoard(kind, periodKey, snap.data() as Record<string, unknown>) : null;
    emit();
  });
  const unsubEntries = onSnapshot(entriesRef, (snap) => {
    entryRows = snap.docs.map((item) => {
      const data = item.data();
      return {
        id: String(data.playerId || data.allianceId || item.id),
        rank: 0,
        name: String(data.name || item.id),
        score: clampLeaderboardScore(data.score),
        rawScore: data.rawScore != null ? clampLeaderboardScore(data.rawScore) : undefined,
        activeUsers: data.activeUsers != null ? officialActiveUserCount(data.activeUserIds) : undefined,
      };
    });
    emit();
  });
  return () => {
    unsubBoard();
    unsubEntries();
  };
}

export function listenLeaderboardState(
  onChange: (state: { dayKey: string; weekKey: string } | null) => void
): Unsubscribe {
  return onSnapshot(leaderboardStateRef(), (snap) => {
    if (!snap.exists()) {
      onChange(null);
      return;
    }
    const dayKey = String(snap.data()?.openDayKey || '');
    const weekKey = String(snap.data()?.openWeekKey || '');
    onChange(isPeriodKey(dayKey) && isPeriodKey(weekKey) ? { dayKey, weekKey } : null);
  });
}
