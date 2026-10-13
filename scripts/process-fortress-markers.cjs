const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const dir = path.join(__dirname, '../public/images/alliance-fortress');

function isBackgroundPixel(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const sat = max - min;
  const avg = (r + g + b) / 3;

  if (sat <= 14 && min >= 228) return true;
  if (sat <= 22 && avg >= 160 && min >= 145) return true;
  if (max <= 48 && sat <= 22) return true;

  return false;
}

function stripBackground(pixels, w, h) {
  const bg = new Uint8Array(w * h);
  const queue = [];

  const tryPush = (x, y) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const idx = y * w + x;
    if (bg[idx]) return;
    const i = idx * 4;
    if (!isBackgroundPixel(pixels[i], pixels[i + 1], pixels[i + 2])) return;
    bg[idx] = 1;
    queue.push(idx);
  };

  for (let x = 0; x < w; x += 1) {
    tryPush(x, 0);
    tryPush(x, h - 1);
  }
  for (let y = 0; y < h; y += 1) {
    tryPush(0, y);
    tryPush(w - 1, y);
  }

  while (queue.length > 0) {
    const idx = queue.pop();
    const x = idx % w;
    const y = (idx - x) / w;
    tryPush(x - 1, y);
    tryPush(x + 1, y);
    tryPush(x, y - 1);
    tryPush(x, y + 1);
  }

  for (let idx = 0; idx < w * h; idx += 1) {
    const i = idx * 4;
    pixels[i + 3] = bg[idx] ? 0 : 255;
  }
}

/** remove.bg və oxşar mənbələr — mövcud alfa saxlanılır */
async function hasPrecutTransparency(input) {
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let soft = 0;
  const total = info.width * info.height;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] < 252) soft += 1;
  }
  return soft / total > 0.06;
}

async function processOne(level) {
  const input = path.join(dir, `fortress-level-${level}-source.png`);
  const output = path.join(dir, `fortress-level-${level}.png`);
  if (!fs.existsSync(input)) {
    console.warn('skip (no source):', input);
    return;
  }

  if (await hasPrecutTransparency(input)) {
    await sharp(input).trim({ threshold: 10 }).png({ force: true }).toFile(output);
    console.log('OK (alpha preserved)', output);
    return;
  }

  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const pixels = Buffer.from(data);
  stripBackground(pixels, info.width, info.height);

  await sharp(pixels, { raw: { width: info.width, height: info.height, channels: 4 } })
    .trim({ threshold: 1 })
    .png({ force: true })
    .toFile(output);

  console.log('OK', output);
}

async function main() {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  for (let level = 1; level <= 6; level += 1) {
    await processOne(level);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
