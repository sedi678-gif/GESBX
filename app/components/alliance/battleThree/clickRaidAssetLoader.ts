import type { ClickRaidCardId } from '@/app/lib/clickRaidLogic';
import { CLICK_RAID_GLTF } from './clickRaidModelPaths';
import { loadClickRaidPixiModule } from './clickRaidPixiRuntime';
import { loadFromPublicModels } from './raidModelAssets';
import type { Animation, glTFAsset, Model } from 'pixi3d/pixi7';

export interface ClickRaidAnimSet {
  run: Animation | null;
  attack: Animation | null;
  death: Animation | null;
}

export interface ClickRaidModelInstance {
  model: Model;
  anims: ClickRaidAnimSet;
}

const gltfCache = new Map<ClickRaidCardId, glTFAsset>();
const loadPromises = new Map<ClickRaidCardId, Promise<boolean>>();

function resolveClip(model: Model, preferredName: string): Animation | null {
  const lower = preferredName.toLowerCase();
  const exact = model.animations.find((a) => a.name?.toLowerCase() === lower);
  if (exact) return exact;
  const fuzzy = model.animations.find((a) => a.name?.toLowerCase().includes(lower));
  if (fuzzy) return fuzzy;
  const byIndex: Record<string, number> = { run: 0, attack: 1, death: 2 };
  const idx = byIndex[lower];
  if (idx !== undefined && model.animations[idx]) return model.animations[idx];
  return model.animations[0] ?? null;
}

async function loadGltfAsset(url: string): Promise<glTFAsset> {
  const { PIXI, pixi3d } = await loadClickRaidPixiModule();
  try {
    const loaded = await PIXI.Assets.load(url);
    if (loaded && typeof loaded === 'object' && 'descriptor' in loaded) {
      return loaded as glTFAsset;
    }
  } catch {
    /* Assets.load bəzən qeydiyyatsız qalır — glTFLoader */
  }
  return pixi3d.glTFLoader.load(url);
}

export async function ensureClickRaidAssets(cardId: ClickRaidCardId): Promise<boolean> {
  if (gltfCache.has(cardId)) return true;
  const pending = loadPromises.get(cardId);
  if (pending) return pending;

  const promise = (async () => {
    try {
      const asset = await loadFromPublicModels(CLICK_RAID_GLTF[cardId].gltf, (url) =>
        loadGltfAsset(url)
      );
      gltfCache.set(cardId, asset);
      return true;
    } catch (err) {
      console.error(`[ClickRaid] HARD ERROR: GLTF tapılmadı (${cardId}). Fallback grafik yoxdur.`, err);
      return false;
    }
  })();

  loadPromises.set(cardId, promise);
  return promise;
}

export async function createClickRaidModelAsync(
  cardId: ClickRaidCardId
): Promise<ClickRaidModelInstance | null> {
  const ok = await ensureClickRaidAssets(cardId);
  if (!ok) return null;
  const { pixi3d } = await loadClickRaidPixiModule();
  const asset = gltfCache.get(cardId);
  if (!asset) return null;

  const cfg = CLICK_RAID_GLTF[cardId];
  const model = pixi3d.Model.from(asset);
  const s = cfg.displayScale;
  model.scale.set(s, s, s);

  const clips = cfg.clips;
  return {
    model,
    anims: {
      run: resolveClip(model, clips.run),
      attack: resolveClip(model, clips.attack),
      death: resolveClip(model, clips.death),
    },
  };
}

export function preloadAllClickRaidAssets(): Promise<boolean[]> {
  const ids: ClickRaidCardId[] = ['mutant', 'standing', 'zombi', 'it'];
  return Promise.all(ids.map((id) => ensureClickRaidAssets(id)));
}

