import type { GameRole } from '../players/types';
import { ARENA_SLOT_ROLES, type ArenaSlotPlayer } from './types';

export function padArenaSlots(players: Array<ArenaSlotPlayer | null>): Array<ArenaSlotPlayer | null> {
  const next: Array<ArenaSlotPlayer | null> = [...players].slice(0, 5);
  while (next.length < 5) next.push(null);
  return ARENA_SLOT_ROLES.map((role, index) => {
    const seated = next[index];
    if (!seated) return null;
    return { ...seated, role: seated.role || role };
  });
}

export function slotRoleAt(index: number): GameRole {
  return ARENA_SLOT_ROLES[index] ?? 'MEMBER';
}
