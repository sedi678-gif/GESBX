import AppLink from '@/app/components/AppLink';
import type { ArenaMatchResult } from './match/types';
import styles from '../table/gameTable.module.css';

export default function ArenaResultPanel(props: {
  result: ArenaMatchResult;
  viewerPlayerId: string;
  homeAllianceId: string;
  awayAllianceId: string;
  viewerSide: 'home' | 'away' | null;
  opponentLabel: string;
}) {
  const { result, viewerPlayerId, homeAllianceId, awayAllianceId, viewerSide, opponentLabel } = props;
  const draw =
    result.winnerScore === result.loserScore && result.winnerAllianceId == null && result.winnerPlayerId == null;
  let outcome: 'WIN' | 'LOSS' | 'DRAW' = 'LOSS';
  if (draw) {
    outcome = 'DRAW';
  } else if (result.gameMode === '1v1') {
    outcome = result.winnerPlayerId === viewerPlayerId ? 'WIN' : 'LOSS';
  } else {
    const viewerAlliance = viewerSide === 'home' ? homeAllianceId : viewerSide === 'away' ? awayAllianceId : '';
    outcome = viewerAlliance && result.winnerAllianceId === viewerAlliance ? 'WIN' : 'LOSS';
  }

  return (
    <div className={styles.resultPanel} aria-label="Döyüş nəticəsi">
      <p className={styles.resultOutcome}>{outcome}</p>
      <p className={styles.resultScore}>{`${result.winnerScore} — ${result.loserScore}`}</p>
      <p className={styles.resultMeta}>{`Zərər: ${result.finalDamage}`}</p>
      <p className={styles.resultMeta}>{`Rəqib: ${opponentLabel}`}</p>
      {result.completedAt > 0 ? (
        <p className={styles.resultMeta}>{`Bitmə: ${new Date(result.completedAt).toLocaleString()}`}</p>
      ) : null}
      <AppLink href={`/arena/history/details/?matchId=${encodeURIComponent(result.matchId)}`} className={styles.resultMeta}>
        Detallar
      </AppLink>
      <AppLink href="/arena/history" className={styles.resultMeta}>
        Döyüş tarixçəsi
      </AppLink>
    </div>
  );
}
