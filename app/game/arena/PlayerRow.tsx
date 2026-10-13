"use client";

import PlayerSlot from './PlayerSlot';
import { padArenaSlots } from './slotLayout';
import type { ArenaSlotPlayer } from './types';
import styles from '../table/gameTable.module.css';

interface PlayerRowProps {
  players: Array<ArenaSlotPlayer | null>;
  label: string;
  currentPlayerId?: string;
  gameMode: '1v1' | '5v5';
}

export default function PlayerRow({ players, label, currentPlayerId, gameMode }: PlayerRowProps) {
  if (gameMode === '1v1') {
    const player = players.find((item) => Boolean(item)) ?? null;
    return (
      <section className={styles.row1} aria-label={label}>
        <PlayerSlot
          player={player}
          index={0}
          current={Boolean(player && currentPlayerId && player.id === currentPlayerId)}
        />
      </section>
    );
  }

  const slots = padArenaSlots(players);
  return (
    <section className={styles.row5} aria-label={label}>
      {slots.map((player, index) => (
        <PlayerSlot
          key={`${label}-${index}`}
          player={player}
          index={index}
          current={Boolean(player && currentPlayerId && player.id === currentPlayerId)}
        />
      ))}
    </section>
  );
}
