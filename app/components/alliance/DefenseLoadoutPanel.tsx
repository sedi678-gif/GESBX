"use client";

import { useCallback, useEffect, useState } from 'react';
import {
  BATTLE_DEFENSE_LOADOUT_MAX,
  BATTLE_DEFENSE_LOADOUT_MIN,
  listenPlayerDefenseLoadout,
  setPlayerDefenseLoadout,
} from '@/app/lib/battleDefense';
import {
  BATTLE_LOADOUT_CARD_METAS,
  type BattleLoadoutCardId,
} from '@/app/lib/battleLoadout';
import { useAllianceBrain } from './AllianceBrainContext';
import styles from './alliance.module.css';

export default function DefenseLoadoutPanel() {
  const { userId } = useAllianceBrain();
  const [saved, setSaved] = useState<BattleLoadoutCardId[]>([]);
  const [selected, setSelected] = useState<BattleLoadoutCardId[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  useEffect(() => {
    if (!userId) return;
    return listenPlayerDefenseLoadout(userId, (ids) => {
      setSaved(ids);
      setSelected(ids);
    });
  }, [userId]);

  const onToggle = useCallback((id: BattleLoadoutCardId) => {
    setOk(false);
    setError(null);
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((item) => item !== id);
      if (prev.length >= BATTLE_DEFENSE_LOADOUT_MAX) return prev;
      return [...prev, id];
    });
  }, []);

  const onSave = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    setOk(false);
    try {
      const next = await setPlayerDefenseLoadout(userId, selected);
      setSaved(next);
      setSelected(next);
      setOk(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Müdafiə kartları yazılmadı');
    } finally {
      setBusy(false);
    }
  }, [busy, selected, userId]);

  return (
    <section className={styles.loadoutBox} aria-label="Müdafiə kartları">
      <div className={styles.loadoutHead}>
        <strong>Müdafiə kartları</strong>
        <span>
          {selected.length}/{BATTLE_DEFENSE_LOADOUT_MAX}
        </span>
      </div>
      <p className={styles.loadoutHint}>
        Offline olanda server yalnız bu {BATTLE_DEFENSE_LOADOUT_MIN}–{BATTLE_DEFENSE_LOADOUT_MAX} kartdan oynayır.
        Döyüş başlayanda siyahı kilidlənir.
      </p>
      <div className={styles.loadoutGrid}>
        {BATTLE_LOADOUT_CARD_METAS.map((card) => {
          const on = selected.includes(card.id);
          const blocked = !on && selected.length >= BATTLE_DEFENSE_LOADOUT_MAX;
          return (
            <button
              key={card.id}
              type="button"
              className={styles.loadoutCard}
              data-on={on ? '1' : '0'}
              disabled={blocked}
              onClick={() => onToggle(card.id)}
            >
              {card.image ? (
                <img src={card.image} alt="" className={styles.loadoutCardImg} />
              ) : (
                <span className={styles.loadoutCardEmoji}>{card.emoji}</span>
              )}
              <span className={styles.loadoutCardTitle}>{card.title}</span>
            </button>
          );
        })}
      </div>
      {error ? <p className={styles.battleJoinWarn}>{error}</p> : null}
      {ok ? <p className={styles.battleJoinHint}>Serverdə saxlanıldı. Saxlanmış: {saved.length} kart.</p> : null}
      <button
        type="button"
        className={styles.battleAttackBtn}
        disabled={busy || selected.length < BATTLE_DEFENSE_LOADOUT_MIN}
        onClick={() => void onSave()}
      >
        {busy ? 'Yazılır…' : 'Müdafiəni saxla'}
      </button>
    </section>
  );
}
