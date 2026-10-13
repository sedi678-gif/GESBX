"use client";

import type { ArenaSlotPlayer } from './types';
import { ARENA_ROLE_LABEL } from './types';
import styles from '../table/gameTable.module.css';

interface PlayerSlotProps {
  player: ArenaSlotPlayer | null;
  index: number;
  current?: boolean;
}

export default function PlayerSlot({ player, current }: PlayerSlotProps) {
  const empty = !player;
  const initial = empty ? '—' : player.name.trim().slice(0, 1).toUpperCase();

  return (
    <div className={styles.slot}>
      <div
        className={`${styles.avatar} ${current ? styles.avatarCurrent : ''} ${empty ? styles.avatarEmpty : ''}`}
      >
        {player?.avatarUrl ? (
          <img src={player.avatarUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <span>{initial}</span>
        )}
        {player?.online ? <span className={styles.onlineDot} /> : null}
      </div>
      <p className={styles.name}>{empty ? 'Boş' : player.name}</p>
      <p className={styles.role}>{empty ? 'Slot' : ARENA_ROLE_LABEL[player.role]}</p>
    </div>
  );
}
