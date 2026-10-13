import type { Container } from 'pixi.js';
import { BattleTroopUnit, type TroopSpriteDisplay, type TroopTextureSet } from './BattleTroopUnit';

type SpriteCtor = new (texture?: import('pixi.js').Texture) => TroopSpriteDisplay;

/** Sadiq İt qoşunu — dog.state = 'attack' | 'death' */
export class LoyalDog extends BattleTroopUnit {
  constructor(
    ContainerCtor: new () => Container,
    SpriteCtor: SpriteCtor,
    textures: TroopTextureSet,
  ) {
    super(ContainerCtor, SpriteCtor, textures, {
      scale: 0.36,
      attackAnchorY: 0.9,
      deathAnchorY: 0.72,
      deathYOffset: 5,
    });
  }
}
