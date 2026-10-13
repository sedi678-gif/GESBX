#!/usr/bin/env node
/**
 * Firebase layihə yoxlaması — CLI, layihə ID və Anonymous Auth təlimatı.
 * İstifadə: npm run firebase:check
 */

import { execSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const projectId = 'youstu-cab15';

function runFirebase(args, timeoutMs = 20000) {
  return execSync(`npm exec -- firebase ${args}`, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
    shell: true,
    timeout: timeoutMs,
  }).trim();
}

console.log('\n🔥 Yolustu — Firebase yoxlaması\n');

let ok = true;

if (existsSync(join(root, 'node_modules', 'firebase-tools', 'package.json'))) {
  const pkg = JSON.parse(readFileSync(join(root, 'node_modules', 'firebase-tools', 'package.json'), 'utf8'));
  console.log(`✓ firebase-tools: v${pkg.version}`);
} else {
  console.error('✗ firebase-tools yoxdur. İşlədin: npm install');
  ok = false;
}

try {
  runFirebase('--version', 15000);
  console.log('✓ Firebase CLI işləyir');
} catch {
  console.warn('⚠ Firebase CLI birbaşa işləmədi — npm skriptləri yenə də işləyə bilər');
}

if (existsSync(join(root, '.firebaserc'))) {
  const rc = JSON.parse(readFileSync(join(root, '.firebaserc'), 'utf8'));
  const active = rc.projects?.default;
  console.log(`✓ Layihə (.firebaserc): ${active}`);
  if (active !== projectId) {
    console.warn(`  ⚠ Gözlənilən: ${projectId}`);
  }
} else {
  console.error('✗ .firebaserc tapılmadı');
  ok = false;
}

for (const file of ['firestore.rules', 'storage.rules', 'firestore.indexes.json', 'firebase.json']) {
  if (existsSync(join(root, file))) {
    console.log(`✓ ${file}`);
  } else {
    console.error(`✗ ${file} yoxdur`);
    ok = false;
  }
}

try {
  runFirebase('projects:list');
  console.log('✓ Firebase hesabına giriş aktivdir');
} catch {
  console.warn('⚠ Firebase-ə daxil deyilsiniz. İşlədin: npm run firebase:login');
  ok = false;
}

console.log(`
📋 Firebase Console addımları (bir dəfə):
   1. Authentication → Sign-in method → Anonymous → Enable
   2. Firestore Database → Create database (test mode və ya rules deploy)
   3. Storage → Get started

   Console: https://console.firebase.google.com/project/${projectId}

🚀 Əsas komandalar:
   npm run firebase:deploy     — qaydalar + indekslər (Firestore + Storage)
   npm run release:android     — Firebase deploy + build + Android sync
   npm run dev                 — lokal inkişaf (Firebase avtomatik anonim giriş)
`);

process.exit(ok ? 0 : 1);
