/** Sword & Shield FBX — public/models (alias: public/model) */

export const SHIELD_DEFENDER_MODELS = {
  idle: 'sword and shield/Sword And Shield Run.fbx',
  block: 'sword and shield/Sword And Shield Attack.fbx',
  death: 'sword and shield/Sword And Shield Death.fbx',
} as const;

export type DefenderAnimState = 'idle' | 'block' | 'death';
