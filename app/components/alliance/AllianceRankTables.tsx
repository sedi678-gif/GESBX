"use client";

import React, { useEffect, useMemo, useState } from 'react';
import {
  listenLeaderboardBoard,
  listenLeaderboardState,
  requireLeaderboardPeriod,
  type LeaderboardBoard,
} from '@/app/lib/leaderboard';
import { useUser } from '@/context/UserContext';
import { getLocalProfileDisplayName } from '@/app/lib/userId';
import { PlayerProfile, AllianceData } from './types';
import { EMPTY_BATTLE_CARDS } from './battleCardsConfig';
import AllianceMapRoundBtn from './AllianceMapRoundBtn';
import AllianceMapSheet from './AllianceMapSheet';
import { IconMapCrown, IconMapRank, IconMapShield } from './AllianceMapIcons';
import { useAllianceBrain } from './AllianceBrainContext';
import styles from './alliance.module.css';

export interface RankRow {
  id: string;
  rank: number;
  name: string;
  score: number;
  subtitle?: string;
}

interface RankTableContentProps {
  rows: RankRow[];
  userRankRow: RankRow | null;
  userRankLabel: string;
  emptyMessage?: string;
  sheetMode?: boolean;
  onRowClick?: (row: RankRow) => void;
}

export function RankTableContent({
  rows,
  userRankRow,
  userRankLabel,
  emptyMessage = 'Hələ məlumat yoxdur.',
  sheetMode = false,
  onRowClick,
}: RankTableContentProps) {
  const top100 = rows.slice(0, 100);

  return (
    <div className={`${styles.rankTableContent} ${sheetMode ? styles.rankTableContentSheet : ''}`}>
      <div className={styles.rankTableScroll}>
        {top100.length === 0 ? (
          <p className={styles.rankTableEmpty}>{emptyMessage}</p>
        ) : (
          top100.map((row) => (
            <div
              key={`${row.id}-${row.rank}`}
              className={`${styles.rankTableRow} ${row.rank <= 3 ? styles.rankTableRowTop : ''} ${userRankRow?.id === row.id ? styles.rankTableRowMe : ''} ${onRowClick ? styles.rankTableRowClickable : ''}`}
              role={onRowClick ? 'button' : undefined}
              tabIndex={onRowClick ? 0 : undefined}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              onKeyDown={
                onRowClick
                  ? (e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onRowClick(row);
                      }
                    }
                  : undefined
              }
            >
              <span className={styles.rankTableRank}>#{row.rank}</span>
              <div className={styles.rankTableInfo}>
                <span className={styles.rankTableName}>{row.name}</span>
                {row.subtitle && <span className={styles.rankTableSub}>{row.subtitle}</span>}
              </div>
              <span className={styles.rankTableScore}>{row.score} xal</span>
            </div>
          ))
        )}
      </div>

      <div className={styles.rankTableFooter}>
        {userRankRow ? (
          <>
            <span className={styles.rankTableFooterLabel}>{userRankLabel}</span>
            <div className={`${styles.rankTableRow} ${styles.rankTableRowMe}`}>
              <span className={styles.rankTableRank}>#{userRankRow.rank}</span>
              <div className={styles.rankTableInfo}>
                <span className={styles.rankTableName}>{userRankRow.name}</span>
                {userRankRow.subtitle && (
                  <span className={styles.rankTableSub}>{userRankRow.subtitle}</span>
                )}
              </div>
              <span className={styles.rankTableScore}>{userRankRow.score} xal</span>
            </div>
          </>
        ) : (
          <p className={styles.rankTableFooterEmpty}>{userRankLabel}</p>
        )}
      </div>
    </div>
  );
}

interface CollapsibleRankTableProps {
  title: string;
  icon: React.ReactNode;
  shortLabel?: string;
  rows: RankRow[];
  userRankRow: RankRow | null;
  userRankLabel: string;
  emptyMessage?: string;
  defaultOpen?: boolean;
  variant?: 'inline' | 'sheet';
  onRowClick?: (row: RankRow) => void;
}

function CollapsibleRankTable({
  title,
  icon,
  shortLabel,
  rows,
  userRankRow,
  userRankLabel,
  emptyMessage = 'Hələ məlumat yoxdur.',
  defaultOpen = false,
  variant = 'inline',
  onRowClick,
}: CollapsibleRankTableProps) {
  const [open, setOpen] = useState(defaultOpen);
  const [sheetOpen, setSheetOpen] = useState(false);

  if (variant === 'sheet') {
    return (
      <>
        <AllianceMapRoundBtn
          icon={icon}
          label={shortLabel ?? title}
          onClick={() => setSheetOpen(true)}
          active={sheetOpen}
        />
        <AllianceMapSheet
          open={sheetOpen}
          onClose={() => setSheetOpen(false)}
          title={title}
          icon={icon}
        >
          <RankTableContent
            rows={rows}
            userRankRow={userRankRow}
            userRankLabel={userRankLabel}
            emptyMessage={emptyMessage}
            sheetMode
            onRowClick={onRowClick}
          />
        </AllianceMapSheet>
      </>
    );
  }

  return (
    <div className={`${styles.rankTable} ${styles.glass} ${open ? styles.rankTableOpen : ''}`}>
      <button
        type="button"
        className={styles.rankTableToggle}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span>{icon} {title}</span>
        <span className={styles.rankTableChevron}>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <RankTableContent
          rows={rows}
          userRankRow={userRankRow}
          userRankLabel={userRankLabel}
          emptyMessage={emptyMessage}
          onRowClick={onRowClick}
        />
      )}
    </div>
  );
}

interface AllianceRankTablesProps {
  alliances: AllianceData[];
  players: PlayerProfile[];
  currentUserId: string;
  currentUserName: string;
  activeAlliance: AllianceData | null;
  sections?: ('leaders' | 'alliances')[];
  stackClassName?: string;
  defaultOpen?: boolean;
  allianceTitle?: string;
  variant?: 'inline' | 'sheet';
  allianceShortLabel?: string;
}

export default function AllianceRankTables({
  alliances,
  players,
  currentUserId,
  currentUserName,
  activeAlliance,
  sections = ['leaders', 'alliances'],
  stackClassName,
  defaultOpen = false,
  allianceTitle = 'İttifaqlar cədvəli',
  variant = 'inline',
  allianceShortLabel = 'Reytinq',
}: AllianceRankTablesProps) {
  const { notifyAllianceInfoViewed } = useAllianceBrain();
  const { leaderRows, allianceRows, userLeaderRank, userAllianceRank } = useMemo(() => {
    const sortedAlliances = [...alliances].sort((a, b) => (b.score || 0) - (a.score || 0));

    const allianceRows: RankRow[] = sortedAlliances.map((item, index) => ({
      id: item.id,
      rank: index + 1,
      name: item.name,
      score: item.score || 50,
      subtitle: `📍 ${item.region} · ${item.members?.length || 0} üzv`,
    }));

    // Liderlər: Firebase players kolleksiyasından (mərkəzi beyin)
    let leaderSource: PlayerProfile[] = players
      .filter((p) => p.isLeader && p.score > 0)
      .sort((a, b) => b.score - a.score);

    if (leaderSource.length === 0) {
      leaderSource = sortedAlliances.map((item) => ({
        odId: item.leaderId,
        displayName: item.leader,
        allianceId: item.id,
        allianceName: item.name,
        isLeader: true,
        score: item.score || 50,
        manat: 0,
        battleCards: { ...EMPTY_BATTLE_CARDS },
        activeShields: [],
        updatedAt: 0,
      }));
    }

    const leaderRows: RankRow[] = leaderSource.slice(0, 100).map((p, index) => ({
      id: p.odId,
      rank: index + 1,
      name: p.displayName,
      score: p.score,
      subtitle: p.allianceName ? `🛡️ ${p.allianceName}` : undefined,
    }));

    let userAllianceRank: RankRow | null = null;
    if (activeAlliance) {
      userAllianceRank = allianceRows.find((r) => r.id === activeAlliance.id) ?? null;
    }

    let userLeaderRank: RankRow | null = null;
    userLeaderRank = leaderRows.find((r) => r.id === currentUserId) ?? null;

    return { leaderRows, allianceRows, userLeaderRank, userAllianceRank };
  }, [alliances, players, activeAlliance, currentUserId]);

  if (variant === 'sheet') {
    return (
      <>
        {sections.includes('leaders') && (
          <CollapsibleRankTable
            title="Liderlər cədvəli"
            icon={<IconMapCrown />}
            shortLabel="Lider"
            rows={leaderRows}
            userRankRow={userLeaderRank}
            userRankLabel={
              userLeaderRank
                ? 'Sizin lider sıranız'
                : `${currentUserName} — hələ lider sırasında deyilsiniz`
            }
            emptyMessage="Hələ heç bir lider yoxdur."
            defaultOpen={defaultOpen}
            variant={variant}
          />
        )}
        {sections.includes('alliances') && (
          <CollapsibleRankTable
            title={allianceTitle}
            icon={<IconMapShield />}
            shortLabel={allianceShortLabel}
            rows={allianceRows}
            userRankRow={userAllianceRank}
            userRankLabel={
              userAllianceRank
                ? 'Sizin ittifaq sıranız'
                : 'Hələ heç bir ittifaqda deyilsiniz'
            }
            emptyMessage="Hələ heç bir ittifaq yoxdur."
            defaultOpen={defaultOpen}
            variant={variant}
          />
        )}
      </>
    );
  }

  const stackClass = stackClassName ?? styles.leftRankStack;

  return (
    <div className={stackClass}>
      {sections.includes('leaders') && (
        <CollapsibleRankTable
          title="Liderlər cədvəli"
          icon={<IconMapCrown />}
          shortLabel="Lider"
          rows={leaderRows}
          userRankRow={userLeaderRank}
          userRankLabel={
            userLeaderRank
              ? 'Sizin lider sıranız'
              : `${currentUserName} — hələ lider sırasında deyilsiniz`
          }
          emptyMessage="Hələ heç bir lider yoxdur."
          defaultOpen={defaultOpen}
          variant={variant}
        />
      )}
      {sections.includes('alliances') && (
        <CollapsibleRankTable
          title={allianceTitle}
          icon={<IconMapShield />}
          shortLabel={allianceShortLabel}
          rows={allianceRows}
          userRankRow={userAllianceRank}
          userRankLabel={
            userAllianceRank
              ? 'Sizin ittifaq sıranız'
              : 'Hələ heç bir ittifaqda deyilsiniz'
          }
          emptyMessage="Hələ heç bir ittifaq yoxdur."
          defaultOpen={defaultOpen}
          variant={variant}
          onRowClick={(row) => {
            const alliance = alliances.find((item) => item.id === row.id);
            if (alliance) notifyAllianceInfoViewed(alliance);
          }}
        />
      )}
    </div>
  );
}

interface AlliancePlayerRankTableProps {
  players?: PlayerProfile[];
  currentUserId: string;
  currentUserName: string;
  defaultOpen?: boolean;
  variant?: 'inline' | 'sheet';
}

function useServerLeaderboards() {
  const [period, setPeriod] = useState<{ dayKey: string; weekKey: string } | null>(null);
  const [daily, setDaily] = useState<LeaderboardBoard | null>(null);
  const [weekly, setWeekly] = useState<LeaderboardBoard | null>(null);

  useEffect(() => {
    void requireLeaderboardPeriod().catch(() => {});
    return listenLeaderboardState(setPeriod);
  }, []);

  useEffect(() => {
    if (!period?.dayKey) return;
    return listenLeaderboardBoard('daily', period.dayKey, setDaily);
  }, [period?.dayKey]);

  useEffect(() => {
    if (!period?.weekKey) return;
    return listenLeaderboardBoard('weekly', period.weekKey, setWeekly);
  }, [period?.weekKey]);

  return { period, daily, weekly };
}

function boardToRows(board: LeaderboardBoard | null, subtitle?: (row: { id: string; activeUsers?: number }) => string | undefined): RankRow[] {
  return (board?.rows ?? []).map((row) => ({
    id: row.id,
    rank: row.rank,
    name: row.name,
    score: row.score,
    subtitle: subtitle?.(row),
  }));
}

export function AllianceRankingBoard({ sheetMode = false }: { sheetMode?: boolean }) {
  const { userId, user } = useUser();
  const userName = user?.displayName || user?.email || getLocalProfileDisplayName();
  const { alliances, activeAlliance, notifyAllianceInfoViewed } = useAllianceBrain();
  const { period, daily, weekly } = useServerLeaderboards();

  const allianceRows = useMemo(
    () =>
      boardToRows(weekly, (row) =>
        row.activeUsers ? `aktiv ${row.activeUsers} · normallaşdırılıb` : 'həftəlik'
      ),
    [weekly]
  );
  const playerRows = useMemo(() => boardToRows(daily, () => 'gündəlik'), [daily]);
  const userAllianceRank = activeAlliance
    ? allianceRows.find((row) => row.id === activeAlliance.id) ?? null
    : null;
  const userPlayerRank = playerRows.find((row) => row.id === userId) ?? null;

  return (
    <div className={styles.rankTablesSplit}>
      <section className={styles.rankTablesSplitCol}>
        <h3 className={styles.rankTablesSplitTitle}>
          İttifaq reytinqi
          {period?.weekKey ? ` · həftə ${period.weekKey}` : ''}
        </h3>
        <RankTableContent
          rows={allianceRows}
          userRankRow={userAllianceRank}
          userRankLabel={
            userAllianceRank ? 'Sizin ittifaq sıranız' : 'Hələ heç bir ittifaqda deyilsiniz'
          }
          emptyMessage="Həftəlik cədvəl serverdən gözlənilir."
          sheetMode={sheetMode}
          onRowClick={(row) => {
            const alliance = alliances.find((item) => item.id === row.id);
            if (alliance) notifyAllianceInfoViewed(alliance);
          }}
        />
      </section>
      <section className={styles.rankTablesSplitCol}>
        <h3 className={styles.rankTablesSplitTitle}>
          Oyunçu reytinqi
          {period?.dayKey ? ` · ${period.dayKey}` : ''}
        </h3>
        <RankTableContent
          rows={playerRows}
          userRankRow={userPlayerRank}
          userRankLabel={
            userPlayerRank
              ? 'Sizin oyunçu sıranız'
              : `${userName} — hələ reytinq cədvəlində deyilsiniz`
          }
          emptyMessage="Gündəlik cədvəl serverdən gözlənilir."
          sheetMode={sheetMode}
        />
      </section>
    </div>
  );
}

export function AllianceCombinedRankButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <AllianceMapRoundBtn
        icon={<IconMapRank />}
        label="Reytinq"
        title="Reytinq"
        onClick={() => setOpen(true)}
        active={open}
      />
      <AllianceMapSheet
        open={open}
        onClose={() => setOpen(false)}
        title="Reytinq"
        icon={<IconMapRank />}
        wide
      >
        <AllianceRankingBoard sheetMode />
      </AllianceMapSheet>
    </>
  );
}

export function AlliancePlayerRankTable({
  currentUserId,
  currentUserName,
  defaultOpen = false,
  variant = 'inline',
}: AlliancePlayerRankTableProps) {
  const { daily } = useServerLeaderboards();
  const playerRows = useMemo(() => boardToRows(daily, () => 'gündəlik'), [daily]);
  const userPlayerRank = playerRows.find((row) => row.id === currentUserId) ?? null;

  return (
    <CollapsibleRankTable
      title="İstifadəçilər reytinqi"
      icon={<IconMapRank />}
      shortLabel="Oyunçu"
      rows={playerRows}
      userRankRow={userPlayerRank}
      userRankLabel={
        userPlayerRank
          ? 'Sizin oyunçu sıranız'
          : `${currentUserName} — hələ reytinq cədvəlində deyilsiniz`
      }
      emptyMessage="Hələ heç bir oyunçu yoxdur."
      defaultOpen={defaultOpen}
      variant={variant}
    />
  );
}
