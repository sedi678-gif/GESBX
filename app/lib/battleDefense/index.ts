export {
  BATTLE_DEFENSE_COLLECTION,
  BATTLE_DEFENSE_LOADOUT_MAX,
  BATTLE_DEFENSE_LOADOUT_MIN,
  BATTLE_DEFENSE_OFFLINE_MS,
  BATTLE_DEFENSE_SCHEMA,
  BATTLE_PRESENCE_COLLECTION,
  isDefenseOffline,
  officialDefenseAiPick,
  readStoredDefenseLoadout,
  validateDefenseLoadout,
} from './battleDefenseConfig';

export {
  battlePresenceRef,
  defenseSnapshotRef,
  heartbeatBattlePresence,
  listenBattlePresence,
  listenPlayerDefenseLoadout,
  setPlayerDefenseLoadout,
  stampDefenseSnapshot,
} from './battleDefenseService';
