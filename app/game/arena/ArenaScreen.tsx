"use client";

import { useEffect, useMemo, useRef, useState } from 'react';
import { listenServerClock } from '@/app/lib/battlePlay/battleServerClock';
import ArenaHeader from './ArenaHeader';
import HandCards from './HandCards';
import PlayerRow from './PlayerRow';
import ArenaClickerPanel from './ArenaClickerPanel';
import ArenaReactionPanel from './ArenaReactionPanel';
import ArenaLoadoutPicker from './ArenaLoadoutPicker';
import ArenaResultPanel from './ArenaResultPanel';
import ArenaTableVoice from './ArenaTableVoice';
import {
  completeArenaMatch,
  expireArenaReaction,
  heartbeatArenaPresence,
  listenArenaMatch,
  listenArenaPresence,
  makeArenaActionId,
  playArenaCard,
  remainingTurnSeconds,
  submitArenaReactionClick,
  timeoutArenaTurn,
  type ArenaMatchState,
  type ArenaPresenceState,
} from './match';
import { matchToArenaView } from './match/matchView';
import { officialArenaFinishReason } from './match/completion';
import { arenaCardMeta, isArenaCardId } from './match/catalog';
import { EMPTY_ARENA_VIEW, type ArenaViewModel } from './types';
import styles from '../table/gameTable.module.css';

interface ArenaScreenProps {
  onClose: () => void;
  view?: ArenaViewModel;
  matchId?: string | null;
  playerId?: string | null;
}

export default function ArenaScreen({ onClose, view, matchId, playerId }: ArenaScreenProps) {
  const [match, setMatch] = useState<ArenaMatchState | null>(null);
  const [presence, setPresence] = useState<Record<string, ArenaPresenceState>>({});
  const [serverNow, setServerNow] = useState(0);
  const [pendingModeCard, setPendingModeCard] = useState<string | null>(null);
  const timeoutLock = useRef(false);
  const reactionLock = useRef(false);

  useEffect(() => {
    if (view || !matchId) return undefined;
    return listenArenaMatch(matchId, setMatch);
  }, [matchId, view]);

  useEffect(() => {
    if (view || !matchId) return undefined;
    return listenArenaPresence(matchId, setPresence);
  }, [matchId, view]);

  useEffect(() => {
    if (view || !matchId) return undefined;
    return listenServerClock((now) => setServerNow(now));
  }, [matchId, view]);

  useEffect(() => {
    if (view || !matchId || !playerId) return undefined;
    void heartbeatArenaPresence({ matchId, playerId, online: true }).catch(() => {});
    const timer = window.setInterval(() => {
      void heartbeatArenaPresence({ matchId, playerId, online: true }).catch(() => {});
    }, 8_000);
    return () => {
      window.clearInterval(timer);
      void heartbeatArenaPresence({ matchId, playerId, online: false }).catch(() => {});
    };
  }, [matchId, playerId, view]);

  useEffect(() => {
    if (view || !match || !matchId) return;
    if (match.status !== 'active') return;
    if (!officialArenaFinishReason(match)) return;
    void completeArenaMatch({ matchId }).catch(() => {});
  }, [match, matchId, view]);

  useEffect(() => {
    if (view || !match || !matchId || serverNow <= 0) return;
    if (match.status !== 'active') return;
    if (match.phase !== 'combat') return;
    if (remainingTurnSeconds(match.turnExpiresAt, serverNow) > 0) return;
    if (timeoutLock.current) return;
    timeoutLock.current = true;
    void timeoutArenaTurn({ matchId })
      .catch(() => {})
      .finally(() => {
        window.setTimeout(() => {
          timeoutLock.current = false;
        }, 750);
      });
  }, [match, matchId, serverNow, view]);

  useEffect(() => {
    if (view || !match || !matchId || serverNow <= 0) return;
    if (match.status !== 'active') return;
    const reaction = match.reaction;
    if (!reaction || reaction.status !== 'ACTIVE') return;
    if (remainingTurnSeconds(reaction.expiresAt, serverNow) > 0) return;
    if (reactionLock.current) return;
    reactionLock.current = true;
    void expireArenaReaction({ matchId })
      .catch(() => {})
      .finally(() => {
        window.setTimeout(() => {
          reactionLock.current = false;
        }, 750);
      });
  }, [match, matchId, serverNow, view]);

  const liveView = useMemo(() => {
    if (!match || !playerId) return null;
    return matchToArenaView({
      match,
      viewerPlayerId: playerId,
      serverNow,
      presence,
    });
  }, [match, playerId, presence, serverNow]);

  const ui = view ?? liveView ?? EMPTY_ARENA_VIEW;
  const needsLoadout = Boolean(
    match && playerId && match.phase === 'loadout' && !match.loadouts[playerId] && match.players[playerId]?.role !== 'CLICKER'
  );
  const waitingLoadout = Boolean(match && playerId && match.phase === 'loadout' && (match.loadouts[playerId] || match.players[playerId]?.role === 'CLICKER'));
  const loading = Boolean(matchId && !match && !view);
  const reactionActive = Boolean(match?.reaction?.status === 'ACTIVE' && ui.clickEvent.visible);
  const isClicker = Boolean(playerId && match?.players[playerId]?.role === 'CLICKER');

  const last = match?.effects?.lastPlay;
  const hideLast = Boolean(last?.hidden && last.playerId !== playerId);
  const lastMeta = last && isArenaCardId(last.cardId) ? arenaCardMeta(last.cardId) : null;

  async function onPlayCard(cardId: string, mode?: 'earthquake' | 'tsunami' | 'fire' | 'ice') {
    if (!matchId || !playerId || match?.phase !== 'combat' || match.status !== 'active') return;
    if ((cardId === 'felaket' || cardId === 'qutb') && !mode) {
      setPendingModeCard(cardId);
      return;
    }
    setPendingModeCard(null);
    try {
      await playArenaCard({
        matchId,
        playerId,
        cardId,
        actionId: makeArenaActionId(),
        mode,
      });
    } catch {
      /* server REJECT */
    }
  }

  async function onReactionClick() {
    if (!matchId || !playerId || !ui.clickEvent.reactionId || match?.status !== 'active') return;
    try {
      await submitArenaReactionClick({
        matchId,
        playerId,
        reactionId: ui.clickEvent.reactionId,
        actionId: makeArenaActionId(),
      });
    } catch {
      /* server REJECT */
    }
  }

  const energyMax = ui.energy.max || (ui.gameMode === '1v1' ? 35 : 30);
  const energyCurrent = Math.max(0, Math.min(energyMax, ui.energy.current ?? 0));
  const energyPct = energyMax > 0 ? Math.round((energyCurrent / energyMax) * 100) : 0;
  const matchClosed = match?.status === 'closed' && Boolean(match.result);
  const handPlay =
    !matchClosed &&
    match?.phase === 'combat' &&
    playerId &&
    (playerId === match.currentTurn || match.players[playerId]?.role === 'CLICKER')
      ? onPlayCard
      : undefined;

  return (
    <div className={styles.body}>
      <ArenaHeader view={ui} onClose={onClose} />
      {matchId && playerId && !view ? (
        <ArenaTableVoice
          matchId={matchId}
          playerId={playerId}
          playerName={match?.displayNames[playerId] || playerId}
        />
      ) : null}
      <div className={styles.board}>
        <PlayerRow
          label="Rəqib"
          players={ui.players.away}
          currentPlayerId={ui.currentTurn?.playerId}
          gameMode={ui.gameMode}
        />
        <div className={styles.table}>
          <div className={styles.tableInner}>
            {last ? (
              <div className={styles.played} aria-label="Oynanmış kart">
                {hideLast || !lastMeta?.image ? (
                  <div className="flex h-full w-full items-center justify-center text-[10px] font-black text-amber-100">
                    {hideLast ? 'Gizli' : lastMeta?.emoji ?? '🃏'}
                  </div>
                ) : (
                  <img src={lastMeta.image} alt="" />
                )}
              </div>
            ) : (
              <p className={styles.vs}>VS</p>
            )}
            {ui.currentTurn?.label ? <p className={styles.turn}>{ui.currentTurn.label}</p> : null}
            {ui.effectLabel && !hideLast ? <p className={styles.effect}>{ui.effectLabel}</p> : null}
            {ui.doubleActive ? <p className={styles.effect}>2X aktivdir</p> : null}
            {loading ? <p className={styles.waiting}>Masa yüklənir…</p> : null}
            {waitingLoadout ? <p className={styles.waiting}>Kartların lock olundu. Rəqib gözlənilir.</p> : null}
            {matchClosed && match?.result && playerId ? (
              <ArenaResultPanel
                result={match.result}
                viewerPlayerId={playerId}
                homeAllianceId={match.homeAllianceId}
                awayAllianceId={match.awayAllianceId}
                viewerSide={match.players[playerId]?.side ?? null}
                opponentLabel={ui.awayAllianceName || 'Rəqib'}
              />
            ) : null}
            <div className={styles.energyWrap}>
              <p className={styles.energyLabel}>{`⚡ ${energyCurrent}/${energyMax}`}</p>
              <div className={styles.energyTrack}>
                <div className={styles.energyFill} style={{ width: `${energyPct}%` }} />
              </div>
            </div>
          </div>
        </div>
        <PlayerRow
          label="Öz tərəf"
          players={ui.players.home}
          currentPlayerId={ui.currentTurn?.playerId}
          gameMode={ui.gameMode}
        />
      </div>
      <div className={styles.dock}>
        {needsLoadout && matchId && playerId ? <ArenaLoadoutPicker matchId={matchId} playerId={playerId} /> : null}
        {reactionActive && matchId && playerId ? (
          <ArenaReactionPanel
            cardTitle={ui.clickEvent.cardTitle}
            modeLabel={ui.clickEvent.modeLabel ?? ''}
            remainingSeconds={ui.clickEvent.remainingSeconds ?? 0}
            currentClicks={ui.clickEvent.currentClicks ?? 0}
            requiredClicks={ui.clickEvent.requiredClicks ?? 0}
            canClick={Boolean(ui.clickEvent.canClick)}
            onClick={() => void onReactionClick()}
          />
        ) : null}
        {reactionActive && matchId && playerId && isClicker ? (
          <ArenaClickerPanel
            matchId={matchId}
            playerId={playerId}
            cardTitle={ui.clickEvent.cardTitle}
            shareable={Boolean(ui.clickEvent.shareable)}
            chatText={ui.clickEvent.chatText}
          />
        ) : null}
        {pendingModeCard === 'felaket' ? (
          <div className={styles.actions}>
            <button type="button" className={styles.actionBtn} onClick={() => void onPlayCard('felaket', 'earthquake')}>
              Zəlzələ
            </button>
            <button type="button" className={styles.actionBtn} onClick={() => void onPlayCard('felaket', 'tsunami')}>
              Tsunami
            </button>
          </div>
        ) : null}
        {pendingModeCard === 'qutb' ? (
          <div className={styles.actions}>
            <button type="button" className={styles.actionBtn} onClick={() => void onPlayCard('qutb', 'fire')}>
              Yanğın
            </button>
            <button type="button" className={styles.actionBtn} onClick={() => void onPlayCard('qutb', 'ice')}>
              Buz
            </button>
          </div>
        ) : null}
        <HandCards cards={ui.cards.hand} onPlay={handPlay} />
      </div>
    </div>
  );
}
