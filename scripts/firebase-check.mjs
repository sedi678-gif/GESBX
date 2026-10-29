#!/usr/bin/env node
import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const projectId = 'gesbx-c4312';
let ok = true;

function runFirebase(args) {
  return execSync(`npm exec -- firebase ${args}`, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
    timeout: 20_000,
  }).trim();
}

console.log(`GESBX Firebase configuration check (${projectId})`);

try {
  console.log(`Firebase CLI: ${runFirebase('--version')}`);
} catch {
  console.error('Firebase CLI is unavailable. Install dependencies or sign in.');
  ok = false;
}

try {
  const rc = JSON.parse(readFileSync(join(root, '.firebaserc'), 'utf8'));
  const active = rc.projects?.default;
  console.log(`.firebaserc default: ${active || '(missing)'}`);
  if (active !== projectId) ok = false;
} catch {
  console.error('.firebaserc is missing or invalid.');
  ok = false;
}

for (const file of ['firestore.rules', 'firestore.indexes.json', 'firebase.json']) {
  if (!existsSync(join(root, file))) {
    console.error(`Missing ${file}`);
    ok = false;
  }
}

try {
  runFirebase(`projects:list --json`);
  console.log('Firebase CLI account is signed in.');
} catch {
  console.warn('Firebase CLI is not signed in; run npm run firebase:login.');
  ok = false;
}

console.log(`\nSetup reminders:
  - Enable Anonymous sign-in and configure Firestore in ${projectId}.
  - Configure Vercel API environment variables as documented in SECURITY_SETUP.md.
  - The deploy scripts target ${projectId} explicitly and exclude Cloud Functions and Storage.
  - Firebase Storage and Firebase Cloud Functions are unavailable on Spark; this repo's media and remaining callable features need separate backends.
  - Run npm run firebase:deploy to deploy only Firestore rules/indexes and Hosting.
`);

process.exit(ok ? 0 : 1);
