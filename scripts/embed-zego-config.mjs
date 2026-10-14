/**
 * Build zamanı Zego açarlarını public/zego-runtime-config.json faylına yazır.
 * .env.local və ya process.env-dən oxuyur.
 *
 * TƏHLÜKƏSİZLİK: bu fayl statik hostinqdən hər kəsə açıq verilir, ona görə burada
 * YALNIZ public açarlar (appId, appSign) yazılır. `serverSecret` HEÇ VAXT bura düşməməlidir —
 * o, token imzalama açarıdır və yalnız serverdə (server.js / Cloud Function) qalmalıdır.
 */
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const outPath = join(root, 'public', 'zego-runtime-config.json');

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

const fileEnv = parseEnvFile(join(root, '.env.local'));

function pick(...keys) {
  for (const key of keys) {
    const v = process.env[key] ?? fileEnv[key];
    if (v && String(v).trim()) return String(v).trim();
  }
  return '';
}

const appIdRaw = pick('NEXT_PUBLIC_ZEGO_APP_ID', 'ZEGO_APP_ID');
const appSign = pick('NEXT_PUBLIC_ZEGO_APP_SIGN', 'ZEGO_APP_SIGN');

// serverSecret qəsdən oxunmur və yazılmır — klient bundle-ına düşməməlidir.
const payload = {
  appId: appIdRaw ? Number(appIdRaw) : 0,
  appSign,
};

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(payload, null, 2), 'utf8');

if (payload.appId > 0) {
  console.log('[zego] public config embedded → public/zego-runtime-config.json (serverSecret daxil edilmədi)');
} else {
  console.warn('[zego] appId yoxdur — runtime Firestore fallback işlədəcək');
}

if (pick('ZEGO_SERVER_SECRET', 'NEXT_PUBLIC_ZEGO_SERVER_SECRET')) {
  console.warn(
    '[zego] ⚠️  ZEGO_SERVER_SECRET .env-də var — bu düzgündür, YALNIZ serverdə qalmalıdır.\n' +
    '        Klientə heç vaxt ötürülməsin: token imzalama serverdə edilməlidir.'
  );
}
