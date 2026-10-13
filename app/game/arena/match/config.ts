export const ARENA_MATCH_COLLECTION = 'arena_matches';
export const ARENA_PRESENCE_COLLECTION = 'presence';

export const ARENA_ENERGY_START = 30;
export const ARENA_ENERGY_MAX = 30;
export const ARENA_TURN_DURATION_MS = 15_000;
export const ARENA_SLOT_COUNT = 5;

export const ARENA_TURN_ROLES = ['LIDER', 'HELP_LIDER', 'CLICKER', 'MEMBER', 'MEMBER'] as const;
export type ArenaTurnRole = (typeof ARENA_TURN_ROLES)[number];
