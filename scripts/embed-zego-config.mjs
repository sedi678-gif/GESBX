/**
 * Build zamanı Zego açarlarını public/zego-runtime-config.json faylına yazır.
 * .env.local, process.env və ya Firestore seed-dən oxuya bilir.
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
const serverSecret = pick('ZEGO_SERVER_SECRET', 'NEXT_PUBLIC_ZEGO_SERVER_SECRET');

const payload = {
  appId: appIdRaw ? Number(appIdRaw) : 0,
  appSign,
  serverSecret: serverSecret || appSign,
};

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(payload, null, 2), 'utf8');

if (payload.appId > 0 && payload.serverSecret) {
  console.log('[zego] runtime config embedded → public/zego-runtime-config.json');
} else {
  console.warn('[zego] credentials missing — runtime will use Firestore fallback');
}
