export type ProfileCropKind = 'avatar' | 'banner' | 'flag';

export interface CropExportOptions {
  kind: ProfileCropKind;
  scale: number;
  panX: number;
  panY: number;
  viewportWidth: number;
  viewportHeight: number;
  frameWidth: number;
  frameHeight: number;
}

function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Şəkil oxunmadı.'));
    };
    img.src = url;
  });
}

export function getMinCoverScale(
  imageWidth: number,
  imageHeight: number,
  frameWidth: number,
  frameHeight: number
): number {
  return Math.max(frameWidth / imageWidth, frameHeight / imageHeight);
}

export async function exportProfileCrop(
  file: File,
  options: CropExportOptions
): Promise<File> {
  const img = await loadImageFromFile(file);
  const {
    kind,
    scale,
    panX,
    panY,
    viewportWidth,
    viewportHeight,
    frameWidth,
    frameHeight,
  } = options;

  const frameLeft = (viewportWidth - frameWidth) / 2;
  const frameTop = (viewportHeight - frameHeight) / 2;
  const displayW = img.naturalWidth * scale;
  const displayH = img.naturalHeight * scale;
  const imageLeft = (viewportWidth - displayW) / 2 + panX;
  const imageTop = (viewportHeight - displayH) / 2 + panY;

  let cropX = (frameLeft - imageLeft) / scale;
  let cropY = (frameTop - imageTop) / scale;
  let cropW = frameWidth / scale;
  let cropH = frameHeight / scale;

  cropX = Math.max(0, Math.min(img.naturalWidth - 1, cropX));
  cropY = Math.max(0, Math.min(img.naturalHeight - 1, cropY));
  cropW = Math.min(cropW, img.naturalWidth - cropX);
  cropH = Math.min(cropH, img.naturalHeight - cropY);

  const outW = kind === 'avatar' ? 640 : kind === 'flag' ? 360 : 1200;
  const outH =
    kind === 'avatar' ? 640 : Math.round(outW * (frameHeight / frameWidth));

  const canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Şəkil emalı mümkün deyil.');

  ctx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, outW, outH);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Şəkil sıxıla bilmədi.'))),
      'image/jpeg',
      kind === 'avatar' ? 0.88 : kind === 'flag' ? 0.68 : 0.82
    );
  });

  const name =
    kind === 'avatar' ? 'avatar.jpg' : kind === 'flag' ? 'flag.jpg' : 'banner.jpg';
  return new File([blob], name, { type: 'image/jpeg', lastModified: Date.now() });
}
