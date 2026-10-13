import type { Map as LeafletMap } from 'leaflet';
import type { AllianceAttack } from '@/app/lib/allianceBattleService';
import { isClickRaidCard } from '@/app/lib/clickRaidLogic';
import type { BattleCardId } from './types';
import { COUNTRY_VIEW_ZOOM } from './azerbaijanMapGeo';
import {
  createBattleTroop,
  isTroopSpriteCard,
  loadBattleTroopTextures,
  TROOP_ATTACK_PHASE_RATIO,
  TROOP_BATTLE_DURATION_MS,
  type BattleTroopUnit,
  type TroopSpriteCardId,
} from './battleTroops';
import { getPixiConstructors } from './pixiRuntime';

type PixiApp = import('pixi.js').Application;
type PixiContainer = import('pixi.js').Container;
type PixiGraphics = import('pixi.js').Graphics;

const MAX_ACTIVE_ANIMATIONS = 16;

const FALLBACK_COLORS: Record<BattleCardId, number> = {
  zombi: 0x22c55e,
  yarasa: 0x8b5cf6,
  duman: 0x64748b,
  mutant: 0x84cc16,
  standing: 0x6366f1,
  it: 0xf59e0b,
};

const UNIT_OFFSETS: [number, number][] = [
  [0, 0],
  [-14, 10],
  [14, 10],
  [-10, -8],
  [10, -8],
];

interface ActiveAnimation {
  id: string;
  attack: AllianceAttack;
  startMs: number;
  troops: BattleTroopUnit[];
  fallbackGfx: PixiGraphics | null;
  effects: PixiGraphics | null;
}

interface PreviewAttack {
  attackerLat: number;
  attackerLng: number;
  defenderLat: number;
  defenderLng: number;
  defenderAllianceName?: string;
}

export type MapViewMode = 'country' | 'region';

export class AllianceMapPixiOverlay {
  private container: HTMLDivElement | null = null;
  private app: PixiApp | null = null;
  private root: PixiContainer | null = null;
  private map: LeafletMap | null = null;
  private active = new Map<string, ActiveAnimation>();
  private animatedIds = new Set<string>();
  private pendingAttacks: AllianceAttack[] = [];
  private tickerBound = false;
  private ready = false;
  private preview: PreviewAttack | null = null;
  private previewGfx: PixiGraphics | null = null;
  private previewBadge: HTMLDivElement | null = null;

  async mount(container: HTMLDivElement, map: LeafletMap) {
    this.container = container;
    this.map = map;

    const { Application, Container } = await getPixiConstructors();
    const app = new Application();
    await app.init({ backgroundAlpha: 0, antialias: true } as never);
    app.renderer.resize(Math.max(container.clientWidth, 1), Math.max(container.clientHeight, 1));

    container.appendChild(app.canvas as HTMLCanvasElement);
    app.canvas.style.pointerEvents = 'none';

    this.app = app;
    this.root = new Container();
    app.stage.addChild(this.root);

    void loadBattleTroopTextures();

    this.previewBadge = document.createElement('div');
    this.previewBadge.style.cssText =
      'position:absolute;pointer-events:none;transform:translate(-50%,-100%);padding:2px 6px;border-radius:6px;background:rgba(15,23,42,0.9);border:1px solid #fbbf24;color:#fbbf24;font-size:10px;font-weight:700;white-space:nowrap;display:none;z-index:401;';
    container.appendChild(this.previewBadge);

    const onResize = () => this.resize();
    const onMove = () => {
      this.redrawAll();
      this.drawPreview();
    };
    window.addEventListener('resize', onResize);
    map.on('move zoom resize viewreset', onMove);

    this.container.dataset.pixiCleanup = '1';
    (this.container as HTMLDivElement & { _pixiCleanup?: () => void })._pixiCleanup = () => {
      window.removeEventListener('resize', onResize);
      map.off('move zoom resize viewreset', onMove);
    };

    if (!this.tickerBound) {
      app.ticker.add(() => this.tick());
      this.tickerBound = true;
    }

    this.resize();
    this.ready = true;

    if (this.pendingAttacks.length) {
      this.syncAttacks(this.pendingAttacks);
      this.pendingAttacks = [];
    }
  }

  destroy() {
    this.active.forEach((a) => this.removeAnimation(a.id));
    this.active.clear();
    this.animatedIds.clear();
    this.pendingAttacks = [];
    const cleanup = (this.container as HTMLDivElement & { _pixiCleanup?: () => void })?._pixiCleanup;
    cleanup?.();
    this.previewBadge?.remove();
    this.previewBadge = null;
    this.app?.destroy(true, { children: true });
    this.previewGfx = null;
    this.app = null;
    this.root = null;
    this.map = null;
    this.container = null;
    this.ready = false;
  }

  resize() {
    if (!this.app || !this.container) return;
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (w > 0 && h > 0) {
      this.app.renderer.resize(w, h);
      this.redrawAll();
      this.drawPreview();
    }
  }

  setPreviewAttack(preview: PreviewAttack | null) {
    this.preview = preview;
    this.drawPreview();
  }

  private drawPreview() {
    if (!this.root || !this.map) return;

    void getPixiConstructors().then(({ Graphics }) => {
      if (!this.previewGfx) {
        this.previewGfx = new Graphics();
        this.root!.addChild(this.previewGfx);
      }

      this.previewGfx.clear();

      if (!this.preview) {
        if (this.previewBadge) this.previewBadge.style.display = 'none';
        return;
      }

      const to = this.map!.latLngToContainerPoint([
        this.preview.defenderLat,
        this.preview.defenderLng,
      ]);

      this.previewGfx.circle(to.x, to.y, 16);
      this.previewGfx.stroke({ width: 2, color: 0xfbbf24, alpha: 0.85 });
      this.previewGfx.circle(to.x, to.y, 6);
      this.previewGfx.fill({ color: 0xef4444, alpha: 0.75 });

      if (this.previewBadge && this.preview.defenderAllianceName) {
        this.previewBadge.textContent = `🎯 ${this.preview.defenderAllianceName}`;
        this.previewBadge.style.left = `${to.x}px`;
        this.previewBadge.style.top = `${to.y - 18}px`;
        this.previewBadge.style.display = 'block';
      }
    });
  }

  /** Firebase-dən gələn hücumları hədəf koordinatında qoşun vizualına çevir */
  syncAttacks(attacks: AllianceAttack[]) {
    if (!this.ready) {
      this.pendingAttacks = attacks;
      return;
    }

    const now = Date.now();
    for (const attack of attacks) {
      if (this.animatedIds.has(attack.id)) continue;
      if (now - attack.createdAt > TROOP_BATTLE_DURATION_MS) continue;
      if (this.active.size >= MAX_ACTIVE_ANIMATIONS) break;

      void this.spawnAttack(attack);
    }
  }

  private async spawnAttack(attack: AllianceAttack): Promise<boolean> {
    if (!this.root || !this.map) return false;
    if (isClickRaidCard(attack.cardId)) return false;

    const toLat = attack.defenderLat;
    const toLng = attack.defenderLng;
    if (typeof toLat !== 'number' || typeof toLng !== 'number') return false;

    const elapsed = Date.now() - attack.createdAt;
    if (elapsed >= TROOP_BATTLE_DURATION_MS) return false;

    try {
      const { Container, Graphics, Sprite } = await getPixiConstructors();
      const textures = await loadBattleTroopTextures();
      const troops: BattleTroopUnit[] = [];
      let fallbackGfx: PixiGraphics | null = null;

      const unitCount = Math.min(5, Math.max(1, attack.cardCount));
      const target = this.map.latLngToContainerPoint([toLat, toLng]);

      if (isTroopSpriteCard(attack.cardId) && Sprite && textures[attack.cardId as TroopSpriteCardId]) {
        const cardId = attack.cardId as TroopSpriteCardId;
        const pair = textures[cardId]!;
        for (let i = 0; i < unitCount; i++) {
          const troop = createBattleTroop(cardId, Container, Sprite, pair);
          troop.state = 'attack';
          const [ox, oy] = UNIT_OFFSETS[i % UNIT_OFFSETS.length];
          troop.setPosition(target.x + ox, target.y + oy);
          this.root.addChild(troop.display);
          troops.push(troop);
        }
      } else {
        fallbackGfx = new Graphics();
        const color = FALLBACK_COLORS[attack.cardId] || 0xfbbf24;
        fallbackGfx.circle(target.x, target.y, 14 + unitCount * 2);
        fallbackGfx.fill({ color, alpha: 0.55 });
        fallbackGfx.circle(target.x, target.y, 14 + unitCount * 2);
        fallbackGfx.stroke({ width: 2, color: 0xffffff, alpha: 0.5 });
        this.root.addChild(fallbackGfx);
      }

      const effects = new Graphics();
      this.root.addChild(effects);

      this.active.set(attack.id, {
        id: attack.id,
        attack,
        startMs: attack.createdAt,
        troops,
        fallbackGfx,
        effects,
      });

      this.animatedIds.add(attack.id);
      this.drawAnimationFrame(attack.id, elapsed / TROOP_BATTLE_DURATION_MS);
      return true;
    } catch (err) {
      console.error('Hücum vizualı yaradılmadı:', err);
      return false;
    }
  }

  private tick() {
    const now = Date.now();
    for (const [id, anim] of this.active) {
      const t = (now - anim.startMs) / TROOP_BATTLE_DURATION_MS;
      if (t >= 1) {
        this.removeAnimation(id);
        continue;
      }
      this.drawAnimationFrame(id, t);
    }
  }

  private drawAnimationFrame(id: string, t: number) {
    const anim = this.active.get(id);
    const map = this.map;
    if (!anim || !map) return;

    const { attack, troops, fallbackGfx, effects } = anim;
    const defenderLat = attack.defenderLat;
    const defenderLng = attack.defenderLng;
    if (typeof defenderLat !== 'number' || typeof defenderLng !== 'number') return;

    const target = map.latLngToContainerPoint([defenderLat, defenderLng]);
    const inDeathPhase = t >= TROOP_ATTACK_PHASE_RATIO;
    const unitCount = troops.length || Math.min(5, Math.max(1, attack.cardCount));

    troops.forEach((troop, i) => {
      const [ox, oy] = UNIT_OFFSETS[i % UNIT_OFFSETS.length];
      troop.setPosition(target.x + ox, target.y + oy);
      troop.state = inDeathPhase ? 'death' : 'attack';

      if (!inDeathPhase) {
        troop.display.y += Math.sin(t * Math.PI * 10 + i) * 2;
      }
    });

    if (fallbackGfx) {
      fallbackGfx.clear();
      const color = FALLBACK_COLORS[attack.cardId] || 0xfbbf24;
      const pulse = 0.7 + 0.3 * Math.sin(t * Math.PI * 6);
      const radius = (14 + unitCount * 2) * pulse;
      fallbackGfx.circle(target.x, target.y, radius);
      fallbackGfx.fill({ color, alpha: inDeathPhase ? 0.25 : 0.55 });
      fallbackGfx.circle(target.x, target.y, radius);
      fallbackGfx.stroke({ width: 2, color: 0xffffff, alpha: inDeathPhase ? 0.2 : 0.5 });
    }

    if (effects) {
      effects.clear();
      if (t > TROOP_ATTACK_PHASE_RATIO + 0.05) {
        const et = (t - TROOP_ATTACK_PHASE_RATIO) / (1 - TROOP_ATTACK_PHASE_RATIO);
        effects.circle(target.x, target.y, 10 + et * 28);
        effects.fill({ color: 0x64748b, alpha: (1 - et) * 0.25 });
      }
    }
  }

  private redrawAll() {
    for (const [id, anim] of this.active) {
      const t = (Date.now() - anim.startMs) / TROOP_BATTLE_DURATION_MS;
      if (t < 1) this.drawAnimationFrame(id, t);
    }
  }

  private removeAnimation(id: string) {
    const anim = this.active.get(id);
    if (!anim) return;

    anim.troops.forEach((troop) => troop.destroy());
    anim.fallbackGfx?.destroy();
    anim.effects?.destroy();
    this.active.delete(id);
  }
}

export function getViewModeFromZoom(zoom: number): MapViewMode {
  return zoom <= COUNTRY_VIEW_ZOOM ? 'country' : 'region';
}

export { COUNTRY_VIEW_ZOOM, REGION_VIEW_ZOOM } from './azerbaijanMapGeo';
