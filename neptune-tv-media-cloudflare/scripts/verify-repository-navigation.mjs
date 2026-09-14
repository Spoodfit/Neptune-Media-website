import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const failures = [];
const notes = [];

const exists = relativePath => fs.existsSync(path.join(root, relativePath));
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');
const fail = message => failures.push(message);
const note = message => notes.push(message);

const requiredNavigation = [
  'README.md',
  'REPOSITORY_MAP.md',
  'google-apps-script/README.md',
  'integrations/README.md',
  'migration/README.md',
  'neptune-tv-media-cloudflare/README.md',
  'neptune-video-engine/README.md',
  'tests/README.md',
];

for (const requiredPath of requiredNavigation) {
  if (!exists(requiredPath)) fail(`Repository navigation file is missing: ${requiredPath}`);
}

const allowedTopLevel = new Set([
  '.github',
  '.gitignore',
  'MIGRATION.md',
  'README.md',
  'REPOSITORY_MAP.md',
  'google-apps-script',
  'integrations',
  'migration',
  'neptune-tv-media-cloudflare',
  'neptune-video-engine',
  'package-lock.json',
  'package.json',
  'tests',
  'wrangler.jsonc',
]);

let trackedFiles = [];
try {
  trackedFiles = execFileSync('git', ['ls-files'], {
    cwd: root,
    encoding: 'utf8',
  }).split(/\r?\n/u).filter(Boolean);
} catch (error) {
  fail(`Unable to inspect tracked repository files: ${error.message}`);
}

const trackedTopLevel = [...new Set(trackedFiles.map(file => file.split('/')[0]))].sort();
const unexpectedTopLevel = trackedTopLevel.filter(entry => !allowedTopLevel.has(entry));
if (unexpectedTopLevel.length) {
  fail(`Unexpected top-level repository area(s): ${unexpectedTopLevel.join(', ')}. Reuse an existing owner or document the new area explicitly before adding it.`);
}

if (exists('README.md')) {
  const rootReadme = read('README.md');
  for (const marker of [
    'REPOSITORY_MAP.md',
    'neptune-tv-media-cloudflare/public/studio/',
    'neptune-tv-media-cloudflare/public/espace-client/',
    'neptune-tv-media-cloudflare/public/reserver/',
    'neptune-tv-media-cloudflare/react/hors-norme/',
    'neptune-video-engine/',
    'google-apps-script/',
    'integrations/google-drive/',
    'tests/',
    'LEGACY_REQUIRED',
  ]) {
    if (!rootReadme.includes(marker)) fail(`Root README no longer documents canonical repository marker: ${marker}`);
  }
}

if (exists('REPOSITORY_MAP.md')) {
  const repositoryMap = read('REPOSITORY_MAP.md');
  for (const marker of [
    'ACTIVE',
    'LEGACY_REQUIRED',
    'MIGRATION_SOURCE',
    'DEAD',
    'src/worker.js',
    'runtime_v75.py',
    'runtime_v74.py',
  ]) {
    if (!repositoryMap.includes(marker)) fail(`REPOSITORY_MAP.md is missing architecture marker: ${marker}`);
  }
}

if (!failures.length) {
  note(`Repository navigation is complete: ${requiredNavigation.length} entrypoint document(s).`);
  note(`Top-level structure is controlled: ${trackedTopLevel.length} tracked area(s), no unexplained root sprawl.`);
  note('Active, legacy-required, migration-source and dead-code semantics remain documented.');
}

console.log('\nNeptune Media repository navigation\n');
for (const message of notes) console.log(`INFO  ${message}`);
for (const message of failures) console.error(`FAIL  ${message}`);
console.log(`\nSummary: ${failures.length} failure(s), ${notes.length} information item(s).`);
if (failures.length) process.exit(1);
