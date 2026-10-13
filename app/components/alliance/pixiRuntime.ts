/** PixiJS konstruktorlarını təhlükəsiz yükləyir */
import type { TroopSpriteDisplay } from './battleTroops/BattleTroopUnit';

type PixiModule = typeof import('pixi.js') & {
  Sprite: new (texture?: import('pixi.js').Texture) => TroopSpriteDisplay;
};

export async function getPixiConstructors() {
  const pixi = (await import('pixi.js')) as unknown as PixiModule;
  return {
    Application: pixi.Application,
    Container: pixi.Container,
    Graphics: pixi.Graphics,
    Sprite: pixi.Sprite,
    Assets: pixi.Assets,
    Texture: pixi.Texture,
  };
}
