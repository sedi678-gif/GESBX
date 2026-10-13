const sharp = require('sharp');
const path = require('path');

const input = path.join(__dirname, '../public/images/alliance-sprites/alliance-castle-marker-source.png');
const output = path.join(__dirname, '../public/images/alliance-sprites/alliance-castle-marker.png');

/** Yalnız checkerboard / açıq boz fon — qala daşlarını şəffaf etmə */
function isBackgroundPixel(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const sat = max - min;
  const avg = (r + g + b) / 3;

  if (sat <= 10 && min >= 240) return true;
  if (sat <= 14 && avg >= 190 && min >= 175) return true;
  if (sat <= 8 && avg >= 165 && avg <= 205) return true;

  return false;
}

async function main() {
  const { data, info } = await sharp(input)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const pixels = Buffer.from(data);
  const { width: w, height: h } = info;

  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = (y * w + x) * 4;
      const r = pixels[i];
      const g = pixels[i + 1];
      const b = pixels[i + 2];
      pixels[i + 3] = isBackgroundPixel(r, g, b) ? 0 : 255;
    }
  }

  await sharp(pixels, { raw: { width: w, height: h, channels: 4 } })
    .trim({ threshold: 1 })
    .resize(128, null, { fit: 'inside', withoutEnlargement: false, kernel: sharp.kernel.lanczos3 })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toFile(output);

  console.log('OK', output);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
