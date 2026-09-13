import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const failures = [];
const warnings = [];
const notes = [];

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function fail(message) {
  failures.push(message);
}

function warn(message) {
  warnings.push(message);
}

function note(message) {
  notes.push(message);
}

function walk(directory, predicate, output = []) {
  const absolute = path.join(root, directory);
  if (!fs.existsSync(absolute)) return output;
  for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
    const relative = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(relative, predicate, output);
    else if (!predicate || predicate(relative)) output.push(relative);
  }
  return output;
}

for (const required of [
  'migration/manifest.json',
  'MIGRATION.md',
  'migration/COMPONENT_MAP.md',
  'migration/API_CONTRACTS.md',
  'migration/DATA_OWNERSHIP.md',
  'migration/TARGET_VPS.md',
  'migration/LEGACY_CLEANUP.md',
  'migration/RUNTIME_GRAPH.md',
]) {
  if (!exists(required)) fail(`${required} is missing`);
}

let manifest = null;
if (exists('migration/manifest.json')) {
  try {
    manifest = JSON.parse(read('migration/manifest.json'));
  } catch (error) {
    fail(`migration/manifest.json is invalid JSON: ${error.message}`);
  }
}

if (manifest) {
  const entry = manifest.current?.workerEntry;
  if (!entry || !exists(entry)) fail(`Canonical Worker entry is missing: ${entry || '(undefined)'}`);

  for (const surface of manifest.current?.surfaces || []) {
    if (!exists(surface)) fail(`Canonical surface is missing: ${surface}`);
  }

  for (const wranglerFile of manifest.current?.wranglerFiles || []) {
    if (!exists(wranglerFile)) {
      fail(`Wrangler config is missing: ${wranglerFile}`);
      continue;
    }
    const content = read(wranglerFile);
    const expected = String(entry || '').replaceAll('\\', '/');
    if (expected && !content.includes(`"main": "${expected}"`)) {
      fail(`${wranglerFile} does not point to canonical entry ${expected}`);
    }
  }

  const canonicalDeploy = manifest.current?.canonicalDeployWorkflow;
  if (!canonicalDeploy || !exists(canonicalDeploy)) {
    fail(`Canonical deploy workflow is missing: ${canonicalDeploy || '(undefined)'}`);
  } else if (!read(canonicalDeploy).includes('wrangler deploy')) {
    fail(`${canonicalDeploy} does not contain a Worker deployment step`);
  }
}

const entryFiles = walk('neptune-tv-media-cloudflare/src', file => /(?:^|\/)entry-v\d+\.js$/u.test(file));
note(`${entryFiles.length} versioned entry wrappers are still present; they are migration debt, not target architecture.`);

const sourceFiles = walk('neptune-tv-media-cloudflare/src', file => file.endsWith('.js'));
const platformPatterns = manifest?.current?.platformSpecificPatterns || [];
const coupling = Object.fromEntries(platformPatterns.map(pattern => [pattern, 0]));
for (const file of sourceFiles) {
  const content = read(file);
  for (const pattern of platformPatterns) {
    if (content.includes(pattern)) coupling[pattern] += 1;
  }
}
for (const [pattern, count] of Object.entries(coupling)) {
  if (count) note(`${pattern}: ${count} source file(s) currently platform-coupled.`);
}

const canonicalDeploy = manifest?.current?.canonicalDeployWorkflow;
if (canonicalDeploy && exists(canonicalDeploy) && manifest?.current?.workerEntry) {
  const workflow = read(canonicalDeploy);
  const expectedBasename = path.basename(manifest.current.workerEntry);
  const staleEntryRefs = [...workflow.matchAll(/entry-v(\d+)\.js/gu)]
    .map(match => match[0])
    .filter(name => name !== expectedBasename);
  if (staleEntryRefs.length) {
    warn(`${canonicalDeploy} contains legacy entry references while canonical entry is ${expectedBasename}: ${[...new Set(staleEntryRefs)].join(', ')}`);
  }
}

const deployWorkflows = walk('.github/workflows', file => /deploy.*\.ya?ml$/iu.test(file));
const workerDeployers = deployWorkflows.filter(file => /wrangler\s+deploy/u.test(read(file)));
if (workerDeployers.length > 1) {
  warn(`${workerDeployers.length} workflows can run wrangler deploy on the Media Worker: ${workerDeployers.join(', ')}`);
}

const rootGeneratedArtifacts = fs.readdirSync(root, { withFileTypes: true })
  .filter(entry => entry.isFile())
  .map(entry => entry.name)
  .filter(name => /(?:diagnostic|deployment-status|production-verification|production-check|source-validation|import-status|production-status|trigger).*\.(?:json|txt)$/iu.test(name) || name === 'render-polish-production.json');
if (rootGeneratedArtifacts.length) {
  fail(`Generated diagnostic/deployment artifacts must not be committed at repository root: ${rootGeneratedArtifacts.join(', ')}`);
}

console.log('\nNeptune Media migration readiness\n');
for (const message of notes) console.log(`INFO  ${message}`);
for (const message of warnings) console.log(`WARN  ${message}`);
for (const message of failures) console.error(`FAIL  ${message}`);

console.log(`\nSummary: ${failures.length} failure(s), ${warnings.length} warning(s), ${notes.length} information item(s).`);
if (failures.length) process.exit(1);
