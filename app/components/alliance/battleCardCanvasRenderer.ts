import { BattleCardId } from './types';
import { getBattleCardAsset } from './battleCardAssets';

const CARD_W = 280;
const CARD_H = 420;

function drawFrame(ctx: CanvasRenderingContext2D) {
  const g = ctx.createLinearGradient(0, 0, CARD_W, CARD_H);
  g.addColorStop(0, '#3d2817');
  g.addColorStop(0.5, '#5c4033');
  g.addColorStop(1, '#2a1810');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, CARD_W, CARD_H);

  ctx.strokeStyle = '#d4af37';
  ctx.lineWidth = 4;
  ctx.strokeRect(8, 8, CARD_W - 16, CARD_H - 16);
  ctx.lineWidth = 2;
  ctx.strokeRect(14, 14, CARD_W - 28, CARD_H - 28);

  ctx.fillStyle = '#1a1208';
  ctx.fillRect(20, 52, CARD_W - 40, 180);

  ctx.fillStyle = '#f5e6c8';
  ctx.fillRect(24, 250, CARD_W - 48, 110);

  ctx.font = 'bold 11px Georgia, serif';
  ctx.fillStyle = '#fde68a';
  ctx.textAlign = 'center';
  ctx.fillText('YOLÜSTÜ · STRATEGY', CARD_W / 2, 34);
}

function drawZombi(ctx: CanvasRenderingContext2D) {
  const cx = CARD_W / 2;
  const cy = 145;
  // Bədən
  ctx.fillStyle = '#65a30d';
  ctx.beginPath();
  ctx.ellipse(cx, cy + 22, 36, 46, 0, 0, Math.PI * 2);
  ctx.fill();
  // Baş
  ctx.fillStyle = '#84cc16';
  ctx.beginPath();
  ctx.arc(cx, cy - 8, 26, 0, Math.PI * 2);
  ctx.fill();
  // Göz
  ctx.fillStyle = '#dc2626';
  ctx.beginPath();
  ctx.arc(cx - 10, cy - 10, 6, 0, Math.PI * 2);
  ctx.arc(cx + 10, cy - 10, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#14532d';
  ctx.beginPath();
  ctx.arc(cx - 10, cy - 10, 2, 0, Math.PI * 2);
  ctx.arc(cx + 10, cy - 10, 2, 0, Math.PI * 2);
  ctx.fill();
  // Ağız
  ctx.strokeStyle = '#365314';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy + 2, 10, 0.1 * Math.PI, 0.9 * Math.PI);
  ctx.stroke();
  // Qollar
  ctx.strokeStyle = '#84cc16';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(cx - 32, cy + 10);
  ctx.lineTo(cx - 48, cy + 35);
  ctx.moveTo(cx + 32, cy + 10);
  ctx.lineTo(cx + 48, cy + 35);
  ctx.stroke();
}

function drawBarbar(ctx: CanvasRenderingContext2D) {
  const cx = CARD_W / 2;
  const cy = 150;
  // Zireh
  ctx.fillStyle = '#92400e';
  ctx.fillRect(cx - 24, cy - 5, 48, 58);
  ctx.fillStyle = '#78350f';
  ctx.fillRect(cx - 20, cy, 40, 8);
  ctx.fillRect(cx - 20, cy + 18, 40, 8);
  // Baş + saç
  ctx.fillStyle = '#fde68a';
  ctx.beginPath();
  ctx.arc(cx, cy - 24, 20, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#451a03';
  ctx.beginPath();
  ctx.moveTo(cx - 22, cy - 28);
  ctx.lineTo(cx + 22, cy - 28);
  ctx.lineTo(cx + 18, cy - 42);
  ctx.lineTo(cx - 18, cy - 42);
  ctx.closePath();
  ctx.fill();
  // Qılınc
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(cx + 28, cy - 20);
  ctx.lineTo(cx + 58, cy + 45);
  ctx.stroke();
  ctx.fillStyle = '#64748b';
  ctx.fillRect(cx + 52, cy + 38, 16, 10);
  ctx.fillStyle = '#f59e0b';
  ctx.fillRect(cx + 24, cy - 24, 8, 12);
}

function drawSadikIt(ctx: CanvasRenderingContext2D) {
  const cx = CARD_W / 2;
  const cy = 158;
  // Bədən
  ctx.fillStyle = '#ea580c';
  ctx.beginPath();
  ctx.ellipse(cx, cy + 16, 34, 24, 0, 0, Math.PI * 2);
  ctx.fill();
  // Baş
  ctx.fillStyle = '#f97316';
  ctx.beginPath();
  ctx.arc(cx, cy - 6, 22, 0, Math.PI * 2);
  ctx.fill();
  // Qulaqlar
  ctx.fillStyle = '#c2410c';
  ctx.beginPath();
  ctx.moveTo(cx - 18, cy - 18);
  ctx.lineTo(cx - 28, cy - 38);
  ctx.lineTo(cx - 8, cy - 22);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(cx + 18, cy - 18);
  ctx.lineTo(cx + 28, cy - 38);
  ctx.lineTo(cx + 8, cy - 22);
  ctx.fill();
  // Göz + burun
  ctx.fillStyle = '#1e293b';
  ctx.beginPath();
  ctx.arc(cx - 8, cy - 8, 3, 0, Math.PI * 2);
  ctx.arc(cx + 8, cy - 8, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#451a03';
  ctx.beginPath();
  ctx.arc(cx, cy + 2, 5, 0, Math.PI * 2);
  ctx.fill();
  // Quyruq
  ctx.strokeStyle = '#c2410c';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(cx + 28, cy + 12);
  ctx.quadraticCurveTo(cx + 52, cy + 2, cx + 48, cy - 22);
  ctx.stroke();
  // Ayaqlar
  ctx.fillStyle = '#9a3412';
  ctx.fillRect(cx - 18, cy + 32, 8, 14);
  ctx.fillRect(cx + 10, cy + 32, 8, 14);
}

function drawJoker(ctx: CanvasRenderingContext2D) {
  const cx = CARD_W / 2;
  const cy = 148;
  // Şapka
  ctx.fillStyle = '#6d28d9';
  ctx.beginPath();
  ctx.moveTo(cx - 32, cy + 8);
  ctx.lineTo(cx, cy - 42);
  ctx.lineTo(cx + 32, cy + 8);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#fbbf24';
  ctx.beginPath();
  ctx.arc(cx, cy - 38, 8, 0, Math.PI * 2);
  ctx.fill();
  // Üz
  ctx.fillStyle = '#fde68a';
  ctx.beginPath();
  ctx.arc(cx, cy + 2, 18, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#451a03';
  ctx.beginPath();
  ctx.arc(cx - 7, cy - 2, 3, 0, Math.PI * 2);
  ctx.arc(cx + 7, cy - 2, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#451a03';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy + 8, 9, 0.15 * Math.PI, 0.85 * Math.PI);
  ctx.stroke();
  // J simvolu
  ctx.font = 'bold 28px Georgia, serif';
  ctx.fillStyle = '#ef4444';
  ctx.textAlign = 'center';
  ctx.fillText('J', cx, cy + 52);
}

function drawYarasa(ctx: CanvasRenderingContext2D) {
  const cx = CARD_W / 2;
  const cy = 150;
  ctx.fillStyle = '#312e81';
  ctx.beginPath();
  ctx.arc(cx, cy, 12, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#818cf8';
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx - 45, cy - 20);
  ctx.lineTo(cx - 25, cy + 5);
  ctx.lineTo(cx, cy - 5);
  ctx.lineTo(cx + 25, cy + 5);
  ctx.lineTo(cx + 45, cy - 20);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#c4b5fd';
  ctx.beginPath();
  ctx.arc(cx - 4, cy - 2, 3, 0, Math.PI * 2);
  ctx.arc(cx + 4, cy - 2, 3, 0, Math.PI * 2);
  ctx.fill();
}

function drawDuman(ctx: CanvasRenderingContext2D) {
  const cx = CARD_W / 2;
  for (let i = 0; i < 5; i++) {
    ctx.fillStyle = `rgba(148, 163, 184, ${0.35 + i * 0.1})`;
    ctx.beginPath();
    ctx.arc(cx - 30 + i * 15, 150, 22 + i * 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#64748b';
  ctx.fillRect(cx - 8, 175, 16, 28);
  ctx.fillStyle = '#e2e8f0';
  ctx.fillRect(cx - 6, 178, 12, 8);
}

function drawStanding(ctx: CanvasRenderingContext2D) {
  const cx = CARD_W / 2;
  const cy = 145;
  ctx.fillStyle = '#312e81';
  ctx.beginPath();
  ctx.ellipse(cx, cy + 22, 30, 40, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#6366f1';
  ctx.beginPath();
  ctx.arc(cx, cy - 6, 22, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#e0e7ff';
  ctx.beginPath();
  ctx.arc(cx - 8, cy - 8, 4, 0, Math.PI * 2);
  ctx.arc(cx + 8, cy - 8, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#818cf8';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(cx - 28, cy + 4);
  ctx.lineTo(cx - 44, cy - 18);
  ctx.moveTo(cx + 28, cy + 4);
  ctx.lineTo(cx + 44, cy - 18);
  ctx.stroke();
  ctx.font = 'bold 18px Georgia, serif';
  ctx.fillStyle = '#fde68a';
  ctx.textAlign = 'center';
  ctx.fillText('🧙', cx, cy + 56);
}

function drawMutant(ctx: CanvasRenderingContext2D) {
  const cx = CARD_W / 2;
  const cy = 145;
  ctx.fillStyle = '#166534';
  ctx.beginPath();
  ctx.ellipse(cx, cy + 24, 34, 44, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#4ade80';
  ctx.beginPath();
  ctx.arc(cx, cy - 6, 24, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#dc2626';
  ctx.beginPath();
  ctx.arc(cx - 9, cy - 8, 5, 0, Math.PI * 2);
  ctx.arc(cx + 9, cy - 8, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#14532d';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(cx - 30, cy + 8);
  ctx.lineTo(cx - 50, cy + 30);
  ctx.moveTo(cx + 30, cy + 8);
  ctx.lineTo(cx + 50, cy + 30);
  ctx.stroke();
  ctx.font = 'bold 18px Georgia, serif';
  ctx.fillStyle = '#fde68a';
  ctx.textAlign = 'center';
  ctx.fillText('☢', cx, cy + 58);
}

function drawIt(ctx: CanvasRenderingContext2D) {
  drawSadikIt(ctx);
  const cx = CARD_W / 2;
  ctx.font = 'bold 14px Georgia, serif';
  ctx.fillStyle = '#fbbf24';
  ctx.textAlign = 'center';
  ctx.fillText('HÜCUM', cx, 200);
}

const FIGURE_DRAW: Record<BattleCardId, (ctx: CanvasRenderingContext2D) => void> = {
  zombi: drawZombi,
  yarasa: drawYarasa,
  duman: drawDuman,
  mutant: drawMutant,
  standing: drawStanding,
  it: drawIt,
};

/** Canvas ilə unikal kart fiquru — mağaza/ittifaqda eyni şəkil problemi aradan qalxır */
export function renderBattleCardCanvas(id: BattleCardId): string | null {
  if (typeof document === 'undefined') return null;

  const asset = getBattleCardAsset(id);
  const canvas = document.createElement('canvas');
  canvas.width = CARD_W;
  canvas.height = CARD_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  drawFrame(ctx);
  FIGURE_DRAW[id](ctx);

  ctx.font = 'bold 16px Georgia, serif';
  ctx.fillStyle = '#fde68a';
  ctx.textAlign = 'center';
  ctx.fillText(asset.title.toUpperCase(), CARD_W / 2, 238);

  ctx.font = '11px system-ui, sans-serif';
  ctx.fillStyle = '#3d2817';
  const words = asset.desc.split(' ');
  let line = '';
  let y = 270;
  const maxW = CARD_W - 56;
  for (const word of words) {
    const test = line + word + ' ';
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line.trim(), CARD_W / 2, y);
      line = word + ' ';
      y += 14;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line.trim(), CARD_W / 2, y);

  if (asset.tag) {
    ctx.font = 'bold 12px Georgia, serif';
    ctx.fillStyle = '#d97706';
    ctx.fillText(asset.tag.toUpperCase(), CARD_W / 2, CARD_H - 28);
  }

  return canvas.toDataURL('image/png');
}

/** PNG şəkillər istifadə olunur; canvas yalnız fallback */
export const CANVAS_RENDERED_CARDS: BattleCardId[] = [];
