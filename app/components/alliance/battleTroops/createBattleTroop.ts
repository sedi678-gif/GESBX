import type { TroopSpriteCardId } from './battleTroopAssets';
import type { BattleTroopUnit, TroopSpriteDisplay, TroopTextureSet } from './BattleTroopUnit';
import type { Container, Texture } from 'pixi.js';

type SpriteCtor = new (texture?: Texture) => TroopSpriteDisplay;

/** Köhnə sprite qoşunları silindi */
export function createBattleTroop(
  _cardId: TroopSpriteCardId,
  _ContainerCtor: new () => Container,
  _SpriteCtor: SpriteCtor,
  _textures: TroopTextureSet
): BattleTroopUnit {
  throw new Error('Sprite qoşunları artıq istifadə olunmur');
}
