import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '@/firebase';
import {
  requireFirebaseAuth,
  blobToDataUrl,
  compressImageSafe,
  withTimeout,
} from './firebaseAuth';

const FLAG_MAX_WIDTH = 360;
const FLAG_QUALITY = 0.68;
const MAX_INLINE_CHARS = 120_000;

export async function prepareAllianceFlagFile(file: File): Promise<File> {
  if (file.type === 'image/jpeg' && file.size <= 80_000) return file;
  const blob = await compressImageSafe(file, FLAG_MAX_WIDTH, FLAG_QUALITY);
  return new File([blob], 'flag.jpg', { type: 'image/jpeg', lastModified: Date.now() });
}

async function buildInlineUrl(file: File): Promise<string> {
  let payload: Blob = file;
  if (file.size > 40_000) {
    payload = await compressImageSafe(file, 280, 0.55);
  }

  let dataUrl = await blobToDataUrl(payload);
  if (dataUrl.length <= MAX_INLINE_CHARS) return dataUrl;

  const tiny = await compressImageSafe(file, 200, 0.45);
  dataUrl = await blobToDataUrl(tiny);
  if (dataUrl.length > MAX_INLINE_CHARS) {
    throw new Error('Şəkil çox böyükdür. Daha kiçik fayl seçin.');
  }
  return dataUrl;
}

async function uploadToStorage(file: File, allianceId: string): Promise<string> {
  await requireFirebaseAuth();
  const path = `alliances/${allianceId}/flag_${Date.now()}.jpg`;
  const storageRef = ref(storage, path);
  await withTimeout(
    uploadBytes(storageRef, file, { contentType: 'image/jpeg' }),
    5_000,
    'Şəkil yüklənməsi vaxtı bitdi.'
  );
  return await withTimeout(getDownloadURL(storageRef), 4_000, 'Şəkil ünvanı alınmadı.');
}

/** Crop-dan sonra dərhal kiçik data URL qaytarır; Storage gözlədilmir. */
export async function uploadAllianceFlagImage(allianceId: string, file: File): Promise<string> {
  if (!allianceId?.trim()) {
    throw new Error('İttifaq tapılmadı.');
  }

  const prepared = await prepareAllianceFlagFile(file);
  return buildInlineUrl(prepared);
}

export function persistAllianceFlagToStorage(allianceId: string, file: File): void {
  if (!allianceId?.trim()) return;
  void (async () => {
    try {
      const prepared = await prepareAllianceFlagFile(file);
      await uploadToStorage(prepared, allianceId);
    } catch {
      /* UI artıq data URL ilə göstərir */
    }
  })();
}
