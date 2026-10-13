import type { Application } from 'pixi7';

import type { Animation, Camera, Container3D, Model } from 'pixi3d/pixi7';

import type { ClickRaidCardId } from '@/app/lib/clickRaidLogic';

import type { ClickRaidAnimState } from './clickRaidModelPaths';

import type { ClickRaidMapSlot } from './clickRaidMapEngineTypes';

import {

  createClickRaidModelAsync,

  ensureClickRaidAssets,

  type ClickRaidAnimSet,

} from './clickRaidAssetLoader';

import { loadClickRaidPixiModule } from './clickRaidPixiRuntime';

export type { ClickRaidMapSlot } from './clickRaidMapEngineTypes';



interface RaidInstance {

  attackId: string;

  model: Model;

  anims: ClickRaidAnimSet;

  mode: ClickRaidAnimState;

  activeAnim: Animation | null;

}



/** Leaflet px → 3D yer (qala markeri ilə üst-üstə düşmək üçün) */

const PIXEL_TO_WORLD = 0.014;

const ISO_PITCH_DEG = 35.264;

const ISO_YAW_DEG = 45;



export class ClickRaidMapEngine {

  private app: Application | null = null;

  private pixi3d: typeof import('pixi3d/pixi7') | null = null;

  private stage3d: Container3D | null = null;

  private camera: Camera | null = null;

  private ticker: Application['ticker'] | null = null;

  private raids = new Map<string, RaidInstance>();

  private pendingCreates = new Set<string>();

  private width = 1;

  private height = 1;

  private ready = false;



  constructor(private canvas: HTMLCanvasElement) {}



  async init(): Promise<boolean> {

    try {

      const { PIXI, pixi3d } = await loadClickRaidPixiModule();

      this.pixi3d = pixi3d;



      const app = new PIXI.Application({

        view: this.canvas,

        backgroundAlpha: 0,

        antialias: true,

        autoDensity: true,

        resolution: Math.min(window.devicePixelRatio, 2),

      });

      this.app = app;

      this.ticker = app.ticker;



      const stage3d = new pixi3d.Container3D();

      app.stage.addChild(stage3d);

      this.stage3d = stage3d;



      const dirLight = new pixi3d.Light();

      dirLight.type = pixi3d.LightType.directional;

      dirLight.intensity = 1.2;

      dirLight.rotationQuaternion.setEulerAngles(ISO_PITCH_DEG, ISO_YAW_DEG, 0);

      dirLight.position.set(-3, 8, -4);



      const fillLight = new pixi3d.Light();

      fillLight.type = pixi3d.LightType.directional;

      fillLight.intensity = 0.55;

      fillLight.rotationQuaternion.setEulerAngles(20, -120, 0);



      pixi3d.LightingEnvironment.main.lights.length = 0;

      pixi3d.LightingEnvironment.main.lights.push(dirLight, fillLight);



      const camera = new pixi3d.Camera(

        app.renderer as ConstructorParameters<typeof pixi3d.Camera>[0]

      );

      camera.orthographic = true;

      camera.near = 0.1;

      camera.far = 5000;

      pixi3d.Camera.main = camera;

      this.camera = camera;

      app.stage.addChild(camera);



      const results = await Promise.all([

        ensureClickRaidAssets('mutant'),

        ensureClickRaidAssets('standing'),

        ensureClickRaidAssets('zombi'),

        ensureClickRaidAssets('it'),

      ]);



      if (!results.some(Boolean)) {

        console.warn('[ClickRaidMap] Heç bir glTF yüklənmədi — /models/... yollarını yoxlayın');

        return false;

      }



      this.ready = true;

      this.applyCameraLayout();

      return true;

    } catch (err) {

      console.warn('[ClickRaidMap] Pixi3D init uğursuz:', err);

      return false;

    }

  }



  resize(width: number, height: number): void {

    this.width = Math.max(1, width);

    this.height = Math.max(1, height);

    this.app?.renderer.resize(this.width, this.height);

    this.applyCameraLayout();

  }



  private applyCameraLayout(): void {

    const camera = this.camera;

    if (!camera) return;



    camera.aspect = this.width / this.height;

    const halfWorldH = (this.height * 0.5) * PIXEL_TO_WORLD;

    camera.orthographicSize = halfWorldH * 1.08;

    camera.rotationQuaternion.setEulerAngles(ISO_PITCH_DEG, ISO_YAW_DEG, 0);

    camera.position.set(0, halfWorldH * 2.4, halfWorldH * 2.4);

  }



  private worldPosFromScreen(screenX: number, screenY: number) {

    return {

      x: (screenX - this.width * 0.5) * PIXEL_TO_WORLD,

      y: 0,

      z: (screenY - this.height * 0.5) * PIXEL_TO_WORLD,

    };

  }



  private async createRaidInstance(

    attackId: string,

    cardId: ClickRaidCardId

  ): Promise<RaidInstance | null> {

    if (this.pendingCreates.has(attackId) || this.raids.has(attackId)) {

      return this.raids.get(attackId) ?? null;

    }

    this.pendingCreates.add(attackId);



    try {

      const created = await createClickRaidModelAsync(cardId);

      if (!created || !this.stage3d || !this.ticker) return null;



      const instance: RaidInstance = {

        attackId,

        model: created.model,

        anims: created.anims,

        mode: 'attack',

        activeAnim: null,

      };



      this.stage3d.addChild(created.model);

      this.playClip(instance, instance.anims.attack ?? instance.anims.run, true, 1);

      this.raids.set(attackId, instance);

      return instance;

    } finally {

      this.pendingCreates.delete(attackId);

    }

  }



  private stopAnim(raid: RaidInstance): void {

    raid.activeAnim?.stop();

    raid.activeAnim = null;

  }



  private playClip(

    raid: RaidInstance,

    anim: Animation | null,

    loop: boolean,

    speed = 1

  ): void {

    if (!anim || !this.ticker) return;

    this.stopAnim(raid);

    anim.loop = loop;

    anim.position = 0;

    anim.speed = speed;

    anim.play(this.ticker);

    raid.activeAnim = anim;

  }



  syncRaids(slots: ClickRaidMapSlot[]): void {

    if (!this.ready || !this.stage3d) return;



    const seen = new Set<string>();



    for (const slot of slots) {

      seen.add(slot.attackId);

      const raid = this.raids.get(slot.attackId);

      if (!raid) {

        void this.createRaidInstance(slot.attackId, slot.cardId).then((created) => {

          if (created) this.applySlotTransform(created, slot);

        });

        continue;

      }



      this.applySlotTransform(raid, slot);



      if (slot.mode === 'attack' && raid.mode !== 'attack' && raid.mode !== 'death') {

        this.playAttack(slot.attackId);

      } else if (slot.mode === 'death' && raid.mode !== 'death') {

        this.playDeath(slot.attackId);

      }

    }



    for (const [id, raid] of this.raids) {

      if (!seen.has(id)) {

        this.stopAnim(raid);

        raid.model.removeFromParent();

        this.raids.delete(id);

      }

    }

  }



  private applySlotTransform(raid: RaidInstance, slot: ClickRaidMapSlot): void {

    const p = this.worldPosFromScreen(slot.screenX, slot.screenY);

    raid.model.position.set(p.x, p.y, p.z);

    raid.model.rotationQuaternion.setEulerAngles(0, (slot.rotationY * 180) / Math.PI, 0);

  }



  playAttack(attackId: string): void {

    const raid = this.raids.get(attackId);

    if (!raid?.anims.attack) return;

    raid.mode = 'attack';

    this.playClip(raid, raid.anims.attack, true, 1);

  }



  playDeath(attackId: string): void {

    const raid = this.raids.get(attackId);

    if (!raid?.anims.death) return;

    raid.mode = 'death';

    this.playClip(raid, raid.anims.death, false, 1);

  }



  hitTest(clientX: number, clientY: number): string | null {

    const rect = this.canvas.getBoundingClientRect();

    const x = ((clientX - rect.left) / rect.width) * this.width;

    const y = ((clientY - rect.top) / rect.height) * this.height;

    const camera = this.camera;

    if (!camera) return null;



    for (const [attackId, raid] of this.raids) {

      if (raid.mode === 'death') continue;



      const screen = camera.worldToScreen(

        raid.model.position.x,

        raid.model.position.y,

        raid.model.position.z,

        undefined,

        { width: this.width, height: this.height }

      );

      const dist = Math.hypot(x - screen.x, y - screen.y);

      if (dist < 56) return attackId;

    }

    return null;

  }



  isReady(): boolean {

    return this.ready;

  }



  start(): void {}



  stop(): void {

    for (const raid of this.raids.values()) {

      this.stopAnim(raid);

      raid.model.destroy({ children: true });

    }

    this.raids.clear();

    this.pendingCreates.clear();

    this.app?.destroy(true, { children: true, texture: true });

    this.app = null;

    this.stage3d = null;

    this.camera = null;

    this.pixi3d = null;

    this.ready = false;

  }

}


