import type { Container, Texture } from 'pixi.js';
import type { TroopState } from './battleTroopAssets';

export interface TroopTextureSet {
  attack: Texture;
  death: Texture;
}

export interface TroopSpriteDisplay {
  texture: Texture;
  anchor: { set(x: number, y?: number): void };
  scale: { set(x: number, y?: number): void };
  y: number;
}

/** Pixi addChild — TS mühitlərində Sprite/ContainerChild uyğunsuzluğunu aradan qaldırır */
function attachTroopSprite(container: Container, sprite: TroopSpriteDisplay) {
  (container as Container & { addChild: (child: TroopSpriteDisplay) => void }).addChild(sprite);
}

export interface BattleTroopUnitOptions {
  scale?: number;
  attackAnchorY?: number;
  deathAnchorY?: number;
  deathYOffset?: number;
}

/**
 * Qoşun vizualının əsas sinfi.
 * state dəyişdikdə attack/death teksturaları avtomatik əvəz olunur.
 */
export class BattleTroopUnit {
  readonly display: Container;
  protected sprite: TroopSpriteDisplay;
  protected textures: TroopTextureSet;
  private readonly options: Required<BattleTroopUnitOptions>;
  private _state: TroopState = 'attack';

  constructor(
    ContainerCtor: new () => Container,
    SpriteCtor: new (texture?: Texture) => TroopSpriteDisplay,
    textures: TroopTextureSet,
    options: BattleTroopUnitOptions = {},
  ) {
    this.textures = textures;
    this.options = {
      scale: options.scale ?? 0.34,
      attackAnchorY: options.attackAnchorY ?? 0.92,
      deathAnchorY: options.deathAnchorY ?? 0.78,
      deathYOffset: options.deathYOffset ?? 6,
    };

    this.display = new ContainerCtor();
    this.sprite = new SpriteCtor(textures.attack);
    this.applyVisualState('attack');
    attachTroopSprite(this.display, this.sprite);
  }

  get state(): TroopState {
    return this._state;
  }

  set state(value: TroopState) {
    if (this._state === value) return;
    this._state = value;
    this.applyVisualState(value);
  }

  setPosition(x: number, y: number) {
    this.display.position.set(x, y);
  }

  destroy() {
    this.display.destroy({ children: true });
  }

  private applyVisualState(value: TroopState) {
    if (value === 'attack') {
      this.sprite.texture = this.textures.attack;
      this.sprite.anchor.set(0.5, this.options.attackAnchorY);
      this.sprite.y = 0;
    } else {
      this.sprite.texture = this.textures.death;
      this.sprite.anchor.set(0.5, this.options.deathAnchorY);
      this.sprite.y = this.options.deathYOffset;
    }
    this.sprite.scale.set(this.options.scale);
  }
}
