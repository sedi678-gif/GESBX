export const MUTANT_MODELS = {
  run: 'mutant/Mutant Run.fbx',
  attack: 'mutant/Mutant Swiping.fbx',
  death: 'mutant/Mutant Dying.fbx',
} as const;

export type MutantAnimState = 'run' | 'attack' | 'death';
