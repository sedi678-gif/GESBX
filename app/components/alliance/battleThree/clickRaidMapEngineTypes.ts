import type { ClickRaidCardId } from '@/app/lib/clickRaidLogic';
import type { ClickRaidAnimState } from './clickRaidModelPaths';

export interface ClickRaidMapSlot {
  slotId: string;
  attackId: string;
  cardId: ClickRaidCardId;
  castleX: number;
  castleY: number;
  ringIndex: number;
  ringTotal: number;
  spawnedAt: number;
  mode: ClickRaidAnimState;
  /** HUD / geriyə uyğunluq — spawn nöqtəsi */
  screenX: number;
  screenY: number;
  rotationY: number;
  /** Qala CSS zoom-scale — qəhrəman eyni ölçü */
  zoomScale: number;
}

export interface IClickRaidMapEngine {
  init(): Promise<boolean>;
  resize(width: number, height: number): void;
  start(): void;
  stop(): void;
  syncRaids(slots: ClickRaidMapSlot[]): void;
  playAttack(attackId: string): void;
  playDeath(attackId: string): void;
  hitTest(clientX: number, clientY: number): string | null;
  isReady(): boolean;
}
