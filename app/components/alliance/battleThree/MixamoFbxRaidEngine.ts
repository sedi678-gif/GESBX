/**
 * Mixamo GLB: hücum + ölüm klipləri, qala ətrafında spawn, Attack LoopRepeat.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { ClickRaidCardId } from '@/app/lib/clickRaidLogic';
import type { ClickRaidAnimState } from './clickRaidModelPaths';
import { CLICK_RAID_GLTF } from './clickRaidModelPaths';
import type { ClickRaidMapSlot, IClickRaidMapEngine } from './clickRaidMapEngineTypes';
import { loadFromPublicModels } from './raidModelAssets';
import { CASTLE_HERO_TARGET_PX, computeRaidSpawnPoint } from './clickRaidMapMotion';
import { applyHeroAppearance } from './heroAppearance';

interface RaidInstance {
  slotId: string;
  attackId: string;
  cardId: ClickRaidCardId;
  root: THREE.Group;
  mesh: THREE.Object3D;
  mixer: THREE.AnimationMixer | null;
  attack: THREE.AnimationAction | null;
  death: THREE.AnimationAction | null;
  mode: ClickRaidAnimState;
  castleX: number;
  castleY: number;
  ringIndex: number;
  ringTotal: number;
  zoomScale: number;
}

type HeroTemplate = {
  scene: THREE.Group;
  attackClip: THREE.AnimationClip | null;
  deathClip: THREE.AnimationClip | null;
  unitScale: number;
};

export class MixamoFbxRaidEngine implements IClickRaidMapEngine {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.OrthographicCamera;
  private clock = new THREE.Clock(true);
  private rafId = 0;
  private width = 1;
  private height = 1;
  private raids = new Map<string, RaidInstance>();
  private mixers = new Set<THREE.AnimationMixer>();
  private templates = new Map<ClickRaidCardId, HeroTemplate>();
  private ready = false;
  private lastSlots: ClickRaidMapSlot[] = [];

  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.camera = new THREE.OrthographicCamera(0, 1, 1, 0, -800, 800);
    this.camera.position.set(0, 0, 120);
    this.camera.lookAt(0, 0, 0);

    this.scene.add(new THREE.AmbientLight(0xffffff, 1.2));
    const key = new THREE.DirectionalLight(0xfff7ed, 1.35);
    key.position.set(80, 140, 160);
    this.scene.add(key);
  }

  async init(): Promise<boolean> {
    const ids: ClickRaidCardId[] = ['mutant', 'standing', 'zombi', 'it'];
    await Promise.all(ids.map((id) => this.loadHeroGlb(id)));
    this.ready = this.templates.size > 0;
    if (!this.ready) {
      console.error('[ClickRaid] GLB yüklənmədi. public/models yoxlanılmalıdır.');
    }
    if (this.lastSlots.length) this.syncRaids(this.lastSlots);
    return this.ready;
  }

  private meshCount(root: THREE.Object3D): number {
    let n = 0;
    root.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) n += 1;
    });
    return n;
  }

  private fitToCastle(root: THREE.Object3D): number {
    const box = new THREE.Box3().setFromObject(root);
    const size = box.getSize(new THREE.Vector3());
    const h = Math.max(size.y, 0.001);
    return CASTLE_HERO_TARGET_PX / h;
  }

  private plantFeet(root: THREE.Object3D): void {
    const box = new THREE.Box3().setFromObject(root);
    const center = box.getCenter(new THREE.Vector3());
    root.position.x -= center.x;
    root.position.z -= center.z;
    root.position.y -= box.min.y;
  }

  /** Hücum GLB + ayrıca ölüm GLB (Mixamo eyni skelet). */
  private async loadHeroGlb(id: ClickRaidCardId): Promise<void> {
    const cfg = CLICK_RAID_GLTF[id];
    const loader = new GLTFLoader();
    try {
      const attackGltf = await loadFromPublicModels(cfg.gltf, (url) => loader.loadAsync(url));
      if (!attackGltf.scene || this.meshCount(attackGltf.scene) === 0) {
        console.error(`[ClickRaid] ${cfg.gltf} mesh yoxdur.`);
        return;
      }
      attackGltf.scene.updateMatrixWorld(true);
      applyHeroAppearance(attackGltf.scene, id);

      const attackClip = attackGltf.animations[0] ? attackGltf.animations[0].clone() : null;
      if (attackClip) attackClip.name = 'attack';

      let deathClip = attackGltf.animations[1] ? attackGltf.animations[1].clone() : null;
      if (cfg.death) {
        try {
          const deathGltf = await loadFromPublicModels(cfg.death, (url) => loader.loadAsync(url));
          if (deathGltf.animations[0]) {
            deathClip = deathGltf.animations[0].clone();
          }
        } catch (err) {
          console.warn(`[ClickRaid:${id}] ölüm GLB yoxdur:`, err);
        }
      }
      if (deathClip) deathClip.name = 'death';

      this.templates.set(id, {
        scene: attackGltf.scene,
        attackClip,
        deathClip,
        unitScale: this.fitToCastle(attackGltf.scene),
      });
    } catch (err) {
      console.error(`[ClickRaid] GLTFLoader ${id} uğursuz: public/models/${cfg.gltf}`, err);
    }
  }

  resize(w: number, h: number): void {
    this.width = Math.max(1, w);
    this.height = Math.max(1, h);
    this.renderer.setSize(this.width, this.height, false);
    this.camera.left = 0;
    this.camera.right = this.width;
    this.camera.top = this.height;
    this.camera.bottom = 0;
    this.camera.updateProjectionMatrix();
  }

  private prepare(root: THREE.Object3D): void {
    root.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.frustumCulled = false;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const mat of mats) {
        if (!mat) continue;
        mat.side = THREE.DoubleSide;
        mat.needsUpdate = true;
      }
    });
  }

  private createRaid(slot: ClickRaidMapSlot): RaidInstance | null {
    const data = this.templates.get(slot.cardId);
    if (!data) return null;

    const mesh = SkeletonUtils.clone(data.scene) as THREE.Group;
    mesh.scale.setScalar(data.unitScale);
    mesh.updateMatrixWorld(true);
    this.plantFeet(mesh);
    this.prepare(mesh);
    applyHeroAppearance(mesh, slot.cardId);

    const mixer = new THREE.AnimationMixer(mesh);
    this.mixers.add(mixer);

    const attack = data.attackClip ? mixer.clipAction(data.attackClip) : null;
    if (attack) {
      attack.setLoop(THREE.LoopRepeat, Infinity);
      attack.play();
    }

    const root = new THREE.Group();
    root.add(mesh);

    const inst: RaidInstance = {
      slotId: slot.slotId,
      attackId: slot.attackId,
      cardId: slot.cardId,
      root,
      mesh,
      mixer,
      attack,
      death: data.deathClip ? mixer.clipAction(data.deathClip) : null,
      mode: 'attack',
      castleX: slot.castleX,
      castleY: slot.castleY,
      ringIndex: slot.ringIndex,
      ringTotal: slot.ringTotal,
      zoomScale: slot.zoomScale || 1,
    };

    this.placeAroundCastle(inst);
    this.scene.add(root);
    this.raids.set(slot.slotId, inst);
    return inst;
  }

  private placeAroundCastle(raid: RaidInstance) {
    const spawn = computeRaidSpawnPoint(
      raid.castleX,
      raid.castleY,
      raid.ringIndex,
      raid.ringTotal,
      raid.zoomScale
    );
    raid.root.position.set(spawn.x, this.height - spawn.z, 8);
    raid.root.scale.setScalar(raid.zoomScale);

    // lookAt işlətmə — modeli uzadıb xəritəni örtür.
    // Yalnız yaw: ayaq üstə qalır, üz qala pin-inə.
    const dx = raid.castleX - spawn.x;
    const dz = raid.castleY - spawn.z;
    raid.root.rotation.order = 'YXZ';
    raid.root.rotation.set(0.32, Math.atan2(dx, dz), 0);
  }

  private disposeRaid(raid: RaidInstance) {
    raid.mixer?.stopAllAction();
    if (raid.mixer) this.mixers.delete(raid.mixer);
    this.scene.remove(raid.root);
  }

  syncRaids(slots: ClickRaidMapSlot[]): void {
    if (!this.ready) {
      this.lastSlots = slots;
      return;
    }
    this.lastSlots = slots;
    const seen = new Set<string>();

    for (const slot of slots) {
      seen.add(slot.slotId);
      let raid = this.raids.get(slot.slotId);
      if (!raid) {
        const created = this.createRaid(slot);
        if (!created) continue;
        raid = created;
      }
      raid.castleX = slot.castleX;
      raid.castleY = slot.castleY;
      raid.ringIndex = slot.ringIndex;
      raid.ringTotal = slot.ringTotal;
      raid.zoomScale = slot.zoomScale || 1;
      this.placeAroundCastle(raid);
      if (slot.mode === 'death' && raid.mode !== 'death') this.playDeath(slot.attackId);
    }

    for (const [id, raid] of this.raids) {
      if (!seen.has(id)) {
        this.disposeRaid(raid);
        this.raids.delete(id);
      }
    }
  }

  playAttack(attackId: string): void {
    for (const raid of this.raids.values()) {
      if (raid.attackId !== attackId || raid.mode === 'death') continue;
      raid.mode = 'attack';
      raid.attack?.reset().setLoop(THREE.LoopRepeat, Infinity).play();
    }
  }

  playDeath(attackId: string): void {
    for (const raid of this.raids.values()) {
      if (raid.attackId !== attackId) continue;
      raid.mode = 'death';
      if (raid.death) {
        raid.attack?.fadeOut(0.1);
        raid.death.reset().setLoop(THREE.LoopOnce, 1).fadeIn(0.1).play();
        raid.death.clampWhenFinished = true;
      }
    }
  }

  hitTest(clientX: number, clientY: number): string | null {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return null;
    const x = ((clientX - rect.left) / rect.width) * this.width;
    const y = ((clientY - rect.top) / rect.height) * this.height;
    const coarse =
      typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;
    let best: { id: string; dist: number } | null = null;
    for (const raid of this.raids.values()) {
      if (raid.mode === 'death') continue;
      const s = raid.zoomScale || 1;
      const hitR = (coarse ? 64 : 40) * s;
      const feetX = raid.root.position.x;
      const feetY = this.height - raid.root.position.y;
      const bodyX = feetX;
      const bodyY = feetY - CASTLE_HERO_TARGET_PX * 0.5 * s;
      const dist = Math.hypot(x - bodyX, y - bodyY);
      if (dist < hitR && (!best || dist < best.dist)) best = { id: raid.attackId, dist };
    }
    return best?.id ?? null;
  }

  isReady(): boolean {
    return this.ready;
  }

  start(): void {
    if (this.width <= 1 || this.height <= 1) {
      this.resize(Math.max(1, this.canvas.clientWidth), Math.max(1, this.canvas.clientHeight));
    }
    cancelAnimationFrame(this.rafId);
    this.clock.start();
    const animate = () => {
      this.rafId = requestAnimationFrame(animate);
      const delta = this.clock.getDelta();
      for (const mixer of this.mixers) mixer.update(delta);
      this.renderer.render(this.scene, this.camera);
    };
    animate();
  }

  stop(): void {
    cancelAnimationFrame(this.rafId);
    this.rafId = 0;
    this.clock.stop();
    for (const raid of this.raids.values()) this.disposeRaid(raid);
    this.raids.clear();
    this.mixers.clear();
    this.renderer.dispose();
    this.ready = false;
  }
}
