import { readFile } from 'node:fs/promises';

const config = JSON.parse(await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8'));
const activeEntry = await readFile(new URL('../src/entry-v9.js', import.meta.url), 'utf8');
const workflowEntry = await readFile(new URL('../src/entry-v8.js', import.meta.url), 'utf8');
const controlEntry = await readFile(new URL('../src/entry-v7.js', import.meta.url), 'utf8');
const studioHtml = await readFile(new URL('../public/studio/index.html', import.meta.url), 'utf8');

const failures = [];
if (config.main !== 'src/entry-v9.js') failures.push(`wrangler.main=${config.main || 'absent'} au lieu de src/entry-v9.js`);
if (!Array.isArray(config.assets?.run_worker_first) || !config.assets.run_worker_first.includes('/api/*')) failures.push('les routes /api/* ne passent pas en priorité par le Worker');
if (!config.assets?.run_worker_first?.includes('/espace-client/*')) failures.push('les routes /espace-client/* ne passent pas par le Worker actif');
if (!activeEntry.includes("from './store-v5.js'")) failures.push('entry-v9 ne réexporte pas le moteur store-v5');
if (!activeEntry.includes("workflowStore: 'store-v5'")) failures.push('le diagnostic de release ne confirme pas store-v5');
if (!workflowEntry.includes('injectWorkflowAssets')) failures.push('l’injection des interfaces workflow est absente');
if (!controlEntry.includes("'/api/admin/control-room'")) failures.push('la route /api/admin/control-room est absente de la chaîne active');
if (!controlEntry.includes("'/portal/autopilot-safe-list'")) failures.push('le parcours de secours du Studio est absent');
if (!studioHtml.includes('/studio/control-v37.js')) failures.push('la page Studio ne charge pas control-v37.js');

if (process.env.PUBLIC_URL) {
  const baseUrl = process.env.PUBLIC_URL.replace(/\/$/u, '');
  const response = await fetch(`${baseUrl}/api/admin/control-room`, { redirect: 'manual' });
  if (response.status === 404) failures.push('la route de production /api/admin/control-room répond encore 404');
  if (response.status >= 500) failures.push(`la route de production répond ${response.status}`);
}

if (failures.length) {
  console.error(failures.map((failure) => `- ${failure}`).join('\n'));
  process.exit(1);
}

console.log('Neptune workflow and Studio control room smoke test passed.');
