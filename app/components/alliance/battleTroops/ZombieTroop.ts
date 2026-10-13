import type { Container } from 'pixi.js';
import { BattleTroopUnit, type TroopSpriteDisplay, type TroopTextureSet } from './BattleTroopUnit';

type SpriteCtor = new (texture?: import('pixi.js').Texture) => TroopSpriteDisplay;

/** Zombi qoşunu — zombie.state = 'attack' | 'death' */
export class Zombie extends BattleTroopUnit {
  constructor(
    ContainerCtor: new () => Container,
    SpriteCtor: SpriteCtor,
    textures: TroopTextureSet,
  ) {
    super(ContainerCtor, SpriteCtor, textures, {
      scale: 0.34,
      attackAnchorY: 0.9,
      deathAnchorY: 0.74,
      deathYOffset: 6,
    });
  }
}
