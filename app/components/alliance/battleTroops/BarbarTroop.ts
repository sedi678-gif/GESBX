import type { Container } from 'pixi.js';
import { BattleTroopUnit, type TroopSpriteDisplay, type TroopTextureSet } from './BattleTroopUnit';

type SpriteCtor = new (texture?: import('pixi.js').Texture) => TroopSpriteDisplay;

/** Barbar qoşunu — barbar.state = 'attack' | 'death' */
export class Barbar extends BattleTroopUnit {
  constructor(
    ContainerCtor: new () => Container,
    SpriteCtor: SpriteCtor,
    textures: TroopTextureSet,
  ) {
    super(ContainerCtor, SpriteCtor, textures, {
      scale: 0.32,
      attackAnchorY: 0.92,
      deathAnchorY: 0.76,
      deathYOffset: 8,
    });
  }
}
