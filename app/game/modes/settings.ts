import type { FiveVFiveSettings, GameMode, GameModeSettingsMap, OneVOneSettings } from './types';

export const GAME_MODES = ['1v1', '5v5'] as const;

export const MODE_NAMES: Record<GameMode, string> = {
  '1v1': '1v1',
  '5v5': '5v5',
};

export const MODE_SETTINGS: GameModeSettingsMap = {
  '1v1': {
    playersPerSide: 1,
    hasClicker: false,
    clicksPerClickCard: 3,
    energyMax: 35,
  },
  '5v5': {},
};

export function getModeSettings<M extends GameMode>(mode: M): GameModeSettingsMap[M] {
  return MODE_SETTINGS[mode];
}

export function getOneVOneSettings(): OneVOneSettings {
  return MODE_SETTINGS['1v1'];
}

export function getFiveVFiveSettings(): FiveVFiveSettings {
  return MODE_SETTINGS['5v5'];
}
