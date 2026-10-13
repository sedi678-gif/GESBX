/**
 * Zego konfiqurasiyasını Firestore-a yazır (.env.local-dən oxuyur).
 * Bir dəfə: npm run zego:seed
 */
import { readFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc } from 'firebase/firestore';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

function parseEnvFile(path) {
  if (!existsSync(path)) return {};
  const out = {};
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    out[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return out;
}

function pick(env, ...keys) {
  for (const key of keys) {
    const v = env[key];
    if (v && String(v).trim()) return String(v).trim();
  }
  return '';
}

const env = parseEnvFile(join(root, '.env.local'));
const appId = Number(pick(env, 'NEXT_PUBLIC_ZEGO_APP_ID', 'ZEGO_APP_ID'));
const appSign = pick(env, 'NEXT_PUBLIC_ZEGO_APP_SIGN', 'ZEGO_APP_SIGN');
const serverSecret = pick(env, 'ZEGO_SERVER_SECRET', 'NEXT_PUBLIC_ZEGO_SERVER_SECRET');

if (!appId || !appSign) {
  console.error('NEXT_PUBLIC_ZEGO_APP_ID və NEXT_PUBLIC_ZEGO_APP_SIGN .env.local-də tapılmadı.');
  process.exit(1);
}
if (!serverSecret || serverSecret === appSign) {
  console.error('ZEGO_SERVER_SECRET .env.local-də yoxdur (AppSign token üçün istifadə olunmur).');
  process.exit(1);
}

const firebaseConfig = {
  apiKey: env.NEXT_PUBLIC_FIREBASE_API_KEY ?? 'AIzaSyBcRbbdNYaLV_Ym1trKPmjcmuyIppU5X20',
  authDomain: env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? 'youstu-cab15.firebaseapp.com',
  projectId: env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? 'youstu-cab15',
  storageBucket: env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? 'youstu-cab15.firebasestorage.app',
  messagingSenderId: env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? '213802937871',
  appId: env.NEXT_PUBLIC_FIREBASE_APP_ID ?? '1:213802937871:web:affc17228f042761533d7a',
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

await setDoc(doc(db, 'app_config', 'zego'), {
  appId,
  appSign,
  serverSecret,
  updatedAt: Date.now(),
});

console.log('Zego config Firestore-a yazıldı: app_config/zego');
process.exit(0);
