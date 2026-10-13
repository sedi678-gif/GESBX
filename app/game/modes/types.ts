export type GameMode = '1v1' | '5v5';

export interface OneVOneSettings {
  playersPerSide: 1;
  hasClicker: false;
  clicksPerClickCard: 3;
  energyMax: 35;
}

export type FiveVFiveSettings = Record<string, never>;

export type GameModeSettingsMap = {
  '1v1': OneVOneSettings;
  '5v5': FiveVFiveSettings;
};

export type GameModeSettings = GameModeSettingsMap[GameMode];
