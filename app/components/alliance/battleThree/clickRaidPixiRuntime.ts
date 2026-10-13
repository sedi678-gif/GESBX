/** PixiJS v7 + Pixi3D — yalnız click-raid 3D layer (əsas xəritə Pixi v8) */

export type ClickRaidPixiBundle = {
  PIXI: typeof import('pixi7');
  pixi3d: typeof import('pixi3d/pixi7');
};

let bundlePromise: Promise<ClickRaidPixiBundle> | null = null;

export function loadClickRaidPixiModule(): Promise<ClickRaidPixiBundle> {
  if (!bundlePromise) {
    bundlePromise = Promise.all([import('pixi7'), import('pixi3d/pixi7')]).then(
      ([PIXI, pixi3d]) => {
        pixi3d.glTFLoader.add();
        return { PIXI, pixi3d };
      }
    );
  }
  return bundlePromise;
}
