/**
 * PixiJS quraşdırmasında Texture exportu bəzən çatışmır.
 * Sprite tipini burada elan etmirik — Vercel-də real Pixi tipləri ilə toqquşur.
 */
declare module 'pixi.js' {
  export class Texture {
    static from(source: string): Texture;
  }
}

export {};
