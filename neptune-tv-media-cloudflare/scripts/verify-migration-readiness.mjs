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
    const relative = path.join(directory, entry.name).replaceAll('\\', '/');
    if (entry.isDirectory()) walk(relative, predicate, output);
    else if (!predicate || predicate(relative)) output.push(relative);
  }
  return output;
}

function hasRealWorkerDeploy(content) {
  return content.split(/\r?\n/u).some(line => /wrangler\s+deploy/u.test(line) && !/--dry-run/u.test(line) && !/^\s*#/u.test(line));
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
  'migration/WORKFLOW_OWNERSHIP.md',
  'migration/PORTING_PLAN.md',
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
  } else if (!hasRealWorkerDeploy(read(canonicalDeploy))) {
    fail(`${canonicalDeploy} does not contain the production Worker deployment step`);
  }

  const postDeploy = manifest.current?.postDeployVerificationWorkflow;
  if (!postDeploy || !exists(postDeploy)) {
    fail(`Post-deploy verification workflow is missing: ${postDeploy || '(undefined)'}`);
  }
}

const entryFiles = walk('neptune-tv-media-cloudflare/src', file => /(?:^|\/)entry-v\d+\.js$/u.test(file));
note(`${entryFiles.length} versioned entry wrappers are still present; they remain Cloudflare compatibility debt and are explicitly excluded from the VPS target architecture.`);

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
    fail(`${canonicalDeploy} contains legacy entry references while canonical entry is ${expectedBasename}: ${[...new Set(staleEntryRefs)].join(', ')}`);
  }
}

const workflowFiles = walk('.github/workflows', file => /\.ya?ml$/iu.test(file)).sort();
const canonicalWorkflows = [...(manifest?.current?.canonicalWorkflows || [])].sort();
if (!canonicalWorkflows.length) {
  fail('migration manifest must declare current.canonicalWorkflows');
} else {
  const unexpected = workflowFiles.filter(file => !canonicalWorkflows.includes(file));
  const missing = canonicalWorkflows.filter(file => !workflowFiles.includes(file));
  if (unexpected.length) fail(`Unexpected workflow files remain: ${unexpected.join(', ')}`);
  if (missing.length) fail(`Canonical workflow files are missing: ${missing.join(', ')}`);
  if (!unexpected.length && !missing.length) note(`Workflow allowlist is clean: ${canonicalWorkflows.length} canonical workflow(s).`);
}

const workerDeployers = workflowFiles.filter(file => hasRealWorkerDeploy(read(file)));
if (workerDeployers.length !== 1) {
  fail(`Exactly one workflow must deploy the Media Worker; found ${workerDeployers.length}: ${workerDeployers.join(', ') || '(none)'}`);
} else if (canonicalDeploy && workerDeployers[0] !== canonicalDeploy) {
  fail(`Worker deployer ${workerDeployers[0]} does not match canonical workflow ${canonicalDeploy}.`);
} else {
  note(`Single Worker deploy owner: ${workerDeployers[0]}.`);
}

const importWorkflow = '.github/workflows/import-launch-emissions.yml';
if (exists(importWorkflow) && /^\s*push\s*:/mu.test(read(importWorkflow))) {
  fail(`${importWorkflow} must remain manual-only; production media imports must never run on push.`);
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
