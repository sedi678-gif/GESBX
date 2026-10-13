import * as THREE from 'three';
import type { ClickRaidCardId } from '@/app/lib/clickRaidLogic';

type Outfit = {
  skin: string;
  skinDark: string;
  shirt: string;
  shirtDark: string;
  hole: string;
  pants: string;
  pantsFade: string;
  stain: string;
  metalness: number;
  roughness: number;
};

const OUTFITS: Record<ClickRaidCardId, Outfit> = {
  zombi: {
    skin: '#6aa84f',
    skinDark: '#3d6b32',
    shirt: '#8a7350',
    shirtDark: '#5c4a30',
    hole: '#4f7a3a',
    pants: '#2a3140',
    pantsFade: '#1a1f28',
    stain: '#3d2a18',
    metalness: 0.04,
    roughness: 0.9,
  },
  /** Döyüşçü — tünd dəri, polad/dəri zireh */
  mutant: {
    skin: '#c4a07a',
    skinDark: '#8a6848',
    shirt: '#6b7280',
    shirtDark: '#d4af37',
    hole: '#4b5563',
    pants: '#1f2937',
    pantsFade: '#111827',
    stain: '#92400e',
    metalness: 0.72,
    roughness: 0.32,
  },
  /** Qırmızı cübbə */
  standing: {
    skin: '#e8c4a0',
    skinDark: '#c4926a',
    shirt: '#dc2626',
    shirtDark: '#7f1d1d',
    hole: '#b91c1c',
    pants: '#450a0a',
    pantsFade: '#1c0a0a',
    stain: '#fbbf24',
    metalness: 0.12,
    roughness: 0.72,
  },
  /** Goblin — göy dəri + göy geyim */
  it: {
    skin: '#3b82f6',
    skinDark: '#1e3a8a',
    shirt: '#1d4ed8',
    shirtDark: '#1e40af',
    hole: '#60a5fa',
    pants: '#1e3a8a',
    pantsFade: '#172554',
    stain: '#2563eb',
    metalness: 0.08,
    roughness: 0.82,
  },
};

const texCache = new Map<ClickRaidCardId, THREE.CanvasTexture>();

function paintOutfit(kind: ClickRaidCardId): THREE.CanvasTexture {
  const cached = texCache.get(kind);
  if (cached) return cached;
  const o = OUTFITS[kind];
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d')!;

  const band = (y0: number, y1: number, color: string) => {
    ctx.fillStyle = color;
    ctx.fillRect(0, Math.round((1 - y1) * 256), 256, Math.round((y1 - y0) * 256));
  };

  band(0, 1, o.skin);
  band(0.08, 0.48, o.pants);
  band(0.42, 0.8, o.shirt);
  band(0.76, 0.84, o.shirtDark);
  band(0.84, 1, o.skin);

  if (kind === 'mutant') {
    ctx.fillStyle = '#9ca3af';
    ctx.fillRect(0, 62, 256, 18);
    ctx.fillRect(0, 118, 256, 10);
    ctx.fillStyle = '#d4af37';
    ctx.fillRect(0, 78, 256, 4);
    ctx.fillStyle = '#e5e7eb';
    for (let x = 12; x < 256; x += 28) {
      ctx.beginPath();
      ctx.arc(x, 88, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (kind === 'standing') {
    ctx.fillStyle = '#991b1b';
    for (let x = 0; x < 256; x += 16) {
      ctx.fillRect(x, 55, 6, 90);
    }
    ctx.fillStyle = '#fbbf24';
    ctx.fillRect(0, 52, 256, 5);
    ctx.fillRect(0, 140, 256, 4);
  } else if (kind === 'it') {
    ctx.fillStyle = '#93c5fd';
    for (let i = 0; i < 18; i += 1) {
      ctx.globalAlpha = 0.35;
      ctx.fillRect(Math.random() * 256, 55 + Math.random() * 80, 14, 6);
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#1e40af';
    ctx.fillRect(0, 78, 256, 6);
  } else {
    ctx.fillStyle = o.skinDark;
    for (let i = 0; i < 16; i += 1) {
      ctx.globalAlpha = 0.35;
      ctx.beginPath();
      ctx.arc(Math.random() * 256, Math.random() * 42, 4 + Math.random() * 8, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = o.hole;
    [
      [40, 80, 12],
      [200, 100, 10],
      [120, 70, 8],
    ].forEach(([x, y, r]) => {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  ctx.fillStyle = o.pantsFade;
  for (let i = 0; i < 12; i += 1) {
    ctx.fillRect((i * 37) % 256, 168 + (i % 5) * 10, 10, 14);
  }

  ctx.fillStyle = o.skin;
  ctx.fillRect(0, 232, 256, 24);

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  texCache.set(kind, tex);
  return tex;
}

function ensureBodyUVs(mesh: THREE.Mesh): void {
  const geo = mesh.geometry;
  if (geo.getAttribute('uv')) return;
  const pos = geo.getAttribute('position');
  if (!pos) return;
  const box = new THREE.Box3().setFromBufferAttribute(pos as THREE.BufferAttribute);
  const h = Math.max(box.max.y - box.min.y, 0.001);
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    uv[i * 2] = Math.atan2(z, x) / (Math.PI * 2) + 0.5;
    uv[i * 2 + 1] = (y - box.min.y) / h;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

/** Qəhrəmana dəri rəngi + paltar çəkir. */
export function applyHeroAppearance(root: THREE.Object3D, cardId: ClickRaidCardId): void {
  if (typeof document === 'undefined') return;
  const look = OUTFITS[cardId];
  const map = paintOutfit(cardId);
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    ensureBodyUVs(mesh);
    mesh.material = new THREE.MeshStandardMaterial({
      map,
      roughness: look.roughness,
      metalness: look.metalness,
      side: THREE.DoubleSide,
    });
    mesh.frustumCulled = false;
  });
}
