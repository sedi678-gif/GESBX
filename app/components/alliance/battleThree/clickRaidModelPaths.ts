import type { ClickRaidCardId } from '@/app/lib/clickRaidLogic';

export interface ClickRaidGltfConfig {
  /** public/models (və /model alias) altındakı nisbi yol */
  gltf: string;
  death?: string;
  displayScale: number;
  clips: {
    run: string;
    attack: string;
    death: string;
  };
}

export interface ClickRaidFbxConfig {
  attack: string;
  death: string;
  run: string;
  meshScale: number;
}

export const CLICK_RAID_GLTF: Record<ClickRaidCardId, ClickRaidGltfConfig> = {
  mutant: {
    gltf: 'sword and shield/Sword And Shield Attack.glb',
    death: 'sword and shield/Sword And Shield Death.glb',
    displayScale: 2.8,
    clips: { run: 'run', attack: 'attack', death: 'death' },
  },
  standing: {
    gltf: 'standing/Standing attack.glb',
    death: 'standing/Standing death.glb',
    displayScale: 2.6,
    clips: { run: 'run', attack: 'attack', death: 'death' },
  },
  zombi: {
    gltf: 'zombie/Zombie Attack.glb',
    displayScale: 2.8,
    clips: { run: 'run', attack: 'attack', death: 'death' },
  },
  it: {
    gltf: 'goblin/goblin attack.glb',
    death: 'goblin/goblin death.glb',
    displayScale: 2.9,
    clips: { run: 'run', attack: 'attack', death: 'death' },
  },
};

export type ClickRaidAnimState = 'run' | 'attack' | 'death';

export const CLICK_RAID_FBX_SOURCES: Record<ClickRaidCardId, ClickRaidFbxConfig> = {
  mutant: {
    run: 'mutant/Mutant Walking.fbx',
    attack: 'mutant/Mutant Swiping.fbx',
    death: 'mutant/Mutant Dying.fbx',
    meshScale: 0.011,
  },
  standing: {
    run: 'standing/Standing Run Forward.fbx',
    attack: 'standing/Standing 2H Magic Attack 01.fbx',
    death: 'standing/Standing React Death Backward.fbx',
    meshScale: 0.01,
  },
  zombi: {
    run: 'zombie/Zombie Run.fbx',
    attack: 'zombie/Zombie Attack.fbx',
    death: 'zombie/Zombie Death.fbx',
    meshScale: 0.011,
  },
  it: {
    run: 'dog/dog run.fbx',
    attack: 'dog/dog attack.fbx',
    death: 'dog/dog death.fbx',
    meshScale: 0.012,
  },
};
