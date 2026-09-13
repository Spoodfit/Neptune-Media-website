import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.cwd());
const workflowDir = path.join(root, '.github/workflows');
const workflowPath = (name) => path.join(workflowDir, name);
const readWorkflow = (name) => fs.readFileSync(workflowPath(name), 'utf8');
const must = (condition, message) => { if (!condition) throw new Error(`production-ci: ${message}`); };

const manifest = JSON.parse(fs.readFileSync(path.join(root, 'migration/manifest.json'), 'utf8'));
const canonical = (manifest.current?.canonicalWorkflows || []).map((file) => path.basename(file)).sort();
const workflowFiles = fs.readdirSync(workflowDir).filter((name) => /\.ya?ml$/u.test(name)).sort();
must(canonical.length > 0, 'migration manifest must declare canonical workflows');
must(JSON.stringify(workflowFiles) === JSON.stringify(canonical), `workflow set must match migration manifest: ${workflowFiles.join(', ')}`);

const deployWorkflow = readWorkflow('deploy-cloudflare.yml');
const postDeployWorkflow = readWorkflow('verify-production-after-deploy.yml');
const visualWorkflow = readWorkflow('visual-render-audit.yml');
const importWorkflow = readWorkflow('import-launch-emissions.yml');

must(deployWorkflow.includes('npm run audit:migration'), 'deploy must enforce migration boundaries');
must(deployWorkflow.includes('npm run check'), 'deploy must validate the application before deployment');
must(deployWorkflow.includes('wrangler deploy --config wrangler.jsonc --dry-run'), 'deploy must validate the Worker bundle before production');
must(deployWorkflow.includes('wrangler deploy --config .wrangler-ci-deploy.jsonc'), 'deploy-cloudflare.yml must remain the production Worker deploy owner');
must(postDeployWorkflow.includes('scripts/verify-production-contracts.mjs'), 'post-deploy workflow must run consolidated production contracts');
must(postDeployWorkflow.includes('scripts/verify-studio-information-architecture-production-v65.mjs'), 'post-deploy workflow must preserve canonical Studio information-architecture verification');
must(visualWorkflow.includes('scripts/qa-production-ui.mjs'), 'visual workflow must keep the UI quality contract');
must(visualWorkflow.includes('scripts/visual-render-audit.mjs'), 'visual workflow must keep the multi-viewport render audit');
must(visualWorkflow.includes('actions/upload-artifact@v4'), 'visual evidence must be stored as a GitHub artifact');
must(!/^\s*push\s*:/mu.test(importWorkflow), 'launch-media import must remain manual-only');
must(importWorkflow.includes('workflow_dispatch'), 'launch-media import must be explicitly dispatchable');
must(importWorkflow.includes('actions/upload-artifact@v4'), 'launch-media import must preserve evidence as a GitHub artifact');

const repositoryWriters = [];
for (const name of workflowFiles) {
  const content = readWorkflow(name);
  const reasons = [];
  if (/^\s*contents:\s*write\s*$/mu.test(content)) reasons.push('contents:write');
  if (/(^|\s)git\s+push(?:\s|$)/mu.test(content)) reasons.push('git-push');
  if (reasons.length) repositoryWriters.push(`${name}(${reasons.join('+')})`);
}
must(repositoryWriters.length === 0, `repository-mutating workflows remain: ${repositoryWriters.join(', ')}`);

const publicLayout = fs.readFileSync(path.join(root, 'neptune-tv-media-cloudflare/src/public-layout.js'), 'utf8');
must(publicLayout.includes("raw === '/media/posters/hors-norme.webp'"), 'legacy HORS NORME poster must map to a maintained asset');
must(publicLayout.includes("raw === '/media/posters/jeu-connexio.webp'"), 'legacy Connexio poster must use the safe fallback until an authoritative visual exists');
must(publicLayout.includes("'/assets/posters/default.svg'"), 'public images must retain a safe default poster');

const activeStore = fs.readFileSync(path.join(root, 'neptune-tv-media-cloudflare/src/store-v29.js'), 'utf8');
must(activeStore.includes("url.pathname==='/auth/request-reset'"), 'active Studio store must intercept password reset requests');
must(activeStore.includes('RESET_LIMIT=3'), 'active Studio store must limit reset email requests');
must(activeStore.includes('RESET_WINDOW_MS=15*60*1000'), 'reset email limit must use a 15-minute window');
must(activeStore.includes('throttled:true'), 'excess reset requests must be silently throttled without account enumeration');

console.log(`Production CI contract: OK — ${workflowFiles.length} canonical workflows, one deploy owner, consolidated production evidence and active reset protections.`);
