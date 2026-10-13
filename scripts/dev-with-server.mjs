/**
 * Next.js + Socket.io server eyni vaxtda (zəng/mesaj üçün vacib)
 * Usage: npm run dev:all
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const isWin = process.platform === 'win32';

function run(label, command, args) {
  const child = spawn(command, args, {
    cwd: root,
    stdio: 'inherit',
    shell: isWin,
  });
  child.on('exit', (code) => {
    if (code !== 0 && code !== null) {
      console.error(`\n[${label}] proses dayandı (kod ${code})`);
    }
  });
  return child;
}

console.log('\n🚀 Yolüstü dev: Zəng/mesaj serveri (4000) + Next.js\n');
console.log('   Zəng sistemi üçün server vacibdir. Dayandırmaq: Ctrl+C\n');

const server = run('socket', 'node', ['server.js']);
const next = run('next', 'npm', ['run', 'dev']);

function shutdown() {
  try {
    server.kill('SIGTERM');
  } catch {
    /* ignore */
  }
  try {
    next.kill('SIGTERM');
  } catch {
    /* ignore */
  }
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
