"use client";

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { BattleRecord, BattleSide } from '@/app/lib/battleEventLog/battleEventTypes';
import {
  BATTLE_LOADOUT_CARD_METAS,
  BATTLE_LOADOUT_MAX_COPIES,
  BATTLE_LOADOUT_SIZE,
  canEditBattleLoadout,
  getOwnedLoadoutCards,
  listenOwnLoadout,
  listenVisibleLoadouts,
  setBattleLoadout,
  type BattleLoadoutCardId,
  type BattleLoadoutView,
} from '@/app/lib/battleLoadout';
import { BATTLE_ENERGY_START, loadoutEnergyCost, officialCardEnergyCost } from '@/app/lib/battleEnergy';
import type { PlayerProfile } from './types';
import styles from './alliance.module.css';

function teammateName(players: PlayerProfile[], id: string, you: string) {
  if (id === you) return 'Sən';
  return players.find((item) => item.odId === id)?.displayName || `ID ${id}`;
}

export default function BattleLoadoutPicker({
  battleId,
  playerId,
  side,
  battleStatus,
  players,
}: {
  battleId: string;
  playerId: string;
  side: BattleSide;
  battleStatus: BattleRecord['status'];
  players: PlayerProfile[];
}) {
  const [owned, setOwned] = useState<Record<string, number>>({});
  const [selected, setSelected] = useState<BattleLoadoutCardId[]>([]);
  const [team, setTeam] = useState<BattleLoadoutView[]>([]);
  const [locked, setLocked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [hasLoadout, setHasLoadout] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void getOwnedLoadoutCards(playerId).then((inv) => {
      if (!cancelled) setOwned(inv);
    });
    return () => {
      cancelled = true;
    };
  }, [playerId]);

  useEffect(() => {
    return listenOwnLoadout(battleId, playerId, (loadout) => {
      if (!loadout) return;
      setSelected(loadout.cardIds);
      setLocked(loadout.locked);
      setHasLoadout(true);
      setSaved(true);
    });
  }, [battleId, playerId]);

  useEffect(() => {
    return listenVisibleLoadouts(battleId, { playerId, side }, battleStatus, setTeam);
  }, [battleId, playerId, side, battleStatus]);

  const energyUsed = useMemo(() => loadoutEnergyCost(selected), [selected]);
  const editable = canEditBattleLoadout(battleStatus, locked, hasLoadout);
  const ownedUnique = useMemo(
    () => Object.values(owned).filter((count) => Number(count) > 0).length,
    [owned]
  );
  const counts = useMemo(() => {
    const out: Record<string, number> = {};
    for (const id of selected) out[id] = (out[id] ?? 0) + 1;
    return out;
  }, [selected]);

  const onToggle = useCallback(
    (id: BattleLoadoutCardId) => {
      if (!editable || busy) return;
      setError(null);
      setSaved(false);
      setSelected((prev) => {
        if (prev.includes(id)) return prev.filter((item) => item !== id);
        if (prev.length >= BATTLE_LOADOUT_SIZE) return prev;
        const have = owned[id] ?? 0;
        const used = prev.filter((item) => item === id).length;
        if (have <= used || used >= BATTLE_LOADOUT_MAX_COPIES) return prev;
        if (loadoutEnergyCost([...prev, id]) > BATTLE_ENERGY_START) return prev;
        return [...prev, id];
      });
    },
    [busy, editable, owned]
  );

  const onSave = useCallback(async () => {
    if (!editable || busy) return;
    setBusy(true);
    setError(null);
    try {
      await setBattleLoadout({ battleId, playerId, cardIds: selected, commit: false });
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kart seçimi yazılmadı');
    } finally {
      setBusy(false);
    }
  }, [battleId, busy, editable, playerId, selected]);

  const teammates = team.filter((item) => item.playerId !== playerId);

  return (
    <div className={styles.loadoutBox}>
      <div className={styles.loadoutHead}>
        <strong>Kart seçimi</strong>
        <span>
          {selected.length}/{BATTLE_LOADOUT_SIZE} · ⚡ {energyUsed}/{BATTLE_ENERGY_START}
        </span>
      </div>
      <p className={styles.loadoutHint}>
        {editable
          ? `15 kartdan 5-ni seç. Cəmi ${BATTLE_ENERGY_START} energy-dən çox olmasın. Rəqib sənin seçimini görmür.`
          : locked
            ? 'Loadout kilitlənib — dəyişmək olmaz.'
            : 'Battle başladı — loadout dəyişdirilə bilməz.'}
      </p>

      <div className={styles.loadoutGrid}>
        {BATTLE_LOADOUT_CARD_METAS.map((card) => {
          const have = owned[card.id] ?? 0;
          const used = counts[card.id] ?? 0;
          const isOn = used > 0;
          const overBudget =
            !isOn && loadoutEnergyCost([...selected, card.id]) > BATTLE_ENERGY_START;
          const blocked =
            !editable || have <= 0 || (!isOn && selected.length >= BATTLE_LOADOUT_SIZE) || overBudget;
          return (
            <button
              key={card.id}
              type="button"
              className={styles.loadoutCard}
              data-on={isOn ? '1' : '0'}
              disabled={blocked && !isOn}
              onClick={() => onToggle(card.id)}
              style={{ ['--card-accent' as string]: card.accent }}
            >
              {card.image ? (
                <img src={card.image} alt={card.title} className={styles.loadoutCardImg} />
              ) : (
                <span className={styles.loadoutCardEmoji}>{card.emoji}</span>
              )}
              <span className={styles.loadoutCardTitle}>{card.title}</span>
              <span className={styles.loadoutCardQty}>
                ⚡ {officialCardEnergyCost(card.id)} · {have > 999 ? '∞' : `${have}`}
              </span>
            </button>
          );
        })}
      </div>

      {ownedUnique < BATTLE_LOADOUT_SIZE ? (
        <p className={styles.battleJoinWarn}>
          Battle üçün {BATTLE_LOADOUT_SIZE} fərqli kartın olmalıdır. İndi {ownedUnique} kartın var.
        </p>
      ) : null}
      {error ? <p className={styles.battleJoinWarn}>{error}</p> : null}
      {saved && editable ? <p className={styles.battleJoinHint}>Seçimin serverdə saxlanıldı.</p> : null}

      {editable ? (
        <button
          type="button"
          className={styles.battleAttackBtn}
          disabled={busy || selected.length !== BATTLE_LOADOUT_SIZE}
          onClick={() => void onSave()}
        >
          {busy ? 'Yazılır…' : '5 kartı təsdiqlə'}
        </button>
      ) : null}

      {teammates.length > 0 ? (
        <div className={styles.loadoutTeam}>
          <div className={styles.loadoutTeamHead}>Komanda seçimi</div>
          {teammates.map((item) => (
            <div key={item.playerId} className={styles.loadoutTeamRow}>
              <span>{teammateName(players, item.playerId, playerId)}</span>
              <span>
                {item.revealed && item.cardIds
                  ? item.cardIds.map((id) => BATTLE_LOADOUT_CARD_METAS.find((card) => card.id === id)?.title ?? id).join(', ')
                  : `${item.count} kart gizlidir`}
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
