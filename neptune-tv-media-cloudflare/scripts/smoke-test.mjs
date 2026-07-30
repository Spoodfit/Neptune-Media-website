import { readFile } from 'node:fs/promises';

const config = JSON.parse(await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8'));
const activeEntry = await readFile(new URL('../src/entry-v11.js', import.meta.url), 'utf8');
const storageEntry = await readFile(new URL('../src/entry-v10.js', import.meta.url), 'utf8');
const releaseEntry = await readFile(new URL('../src/entry-v9.js', import.meta.url), 'utf8');
const workflowEntry = await readFile(new URL('../src/entry-v8.js', import.meta.url), 'utf8');
const controlEntry = await readFile(new URL('../src/entry-v7.js', import.meta.url), 'utf8');
const studioEntryHtml = await readFile(new URL('../public/studio/index.html', import.meta.url), 'utf8');
const studioWorkspaceHtml = await readFile(new URL('../public/studio/clients.html', import.meta.url), 'utf8');
const studioLogin = await readFile(new URL('../public/studio/studio-login-v48.js', import.meta.url), 'utf8');

const failures = [];
if (config.main !== 'src/entry-v11.js') failures.push(`wrangler.main=${config.main || 'absent'} au lieu de src/entry-v11.js`);
if (!Array.isArray(config.assets?.run_worker_first) || !config.assets.run_worker_first.includes('/api/*')) failures.push('les routes /api/* ne passent pas en priorité par le Worker');
if (!config.assets?.run_worker_first?.includes('/espace-client/*')) failures.push('les routes /espace-client/* ne passent pas par le Worker actif');
if (config.analytics_engine_datasets?.length) failures.push('Analytics Engine bloque encore le déploiement alors que le compte ne l’active pas');
if (!activeEntry.includes("from './store-v7.js'")) failures.push('entry-v11 ne réexporte pas le moteur store-v7');
if (!activeEntry.includes("workflowStore: 'store-v7'")) failures.push('le diagnostic final ne confirme pas store-v7');
if (!activeEntry.includes("from './entry-v10.js'")) failures.push('entry-v11 ne prolonge pas entry-v10');
if (![
  'neptune-efficiency-operational-fallback-20260730-v11',
  'neptune-client-information-architecture-20260730-v62',
  'neptune-studio-sidebar-authority-20260730-v12',
].some((release) => activeEntry.includes(release))) failures.push('aucun identifiant de release entry-v11 compatible n’est présent');
if (!activeEntry.includes("clientInformationArchitecture: 'three-primary-screens-home-content-publications-v62'")) failures.push('le diagnostic de l’architecture client v62 est absent');
if (!activeEntry.includes("analyticsEngineBinding: 'optional-not-required-for-deployment'")) failures.push('Analytics Engine n’est pas optionnel dans le diagnostic');
if (!storageEntry.includes("from './entry-v9.js'")) failures.push('entry-v10 ne prolonge pas la release applicative entry-v9');
if (!releaseEntry.includes('neptune-verified-content-runtime-20260730-v18')) failures.push('la release applicative v18 est absente');
if (!releaseEntry.includes('studioCanonicalPath: STUDIO_CANONICAL_PATH')) failures.push('le chemin canonique du Studio n’est pas déclaré');
if (!releaseEntry.includes("legacyStudioDashboard: 'removed'")) failures.push('la suppression du dashboard hérité n’est pas déclarée');
if (!workflowEntry.includes('injectWorkflowAssets')) failures.push('l’injection des interfaces workflow est absente');
if (!workflowEntry.includes('/assets/media-dialog-safety-v50.js?v=1')) failures.push('la protection de fermeture des médias n’est pas injectée');
if (!controlEntry.includes("'/api/admin/control-room'")) failures.push('la route /api/admin/control-room est absente de la chaîne active');
if (!controlEntry.includes("'/portal/autopilot-safe-list'")) failures.push('le parcours de secours du Studio est absent');
if (!studioEntryHtml.includes('/studio/studio-login-v48.js')) failures.push('la racine Studio ne charge pas la passerelle de connexion unifiée');
if (studioEntryHtml.includes('/studio/control-v37.js') || studioEntryHtml.includes('id="app"')) failures.push('l’ancien dashboard est encore présent dans la racine Studio');
if (!studioWorkspaceHtml.includes('<h1>Parcours clients</h1>')) failures.push('le workspace canonique Parcours clients est absent');
if (studioWorkspaceHtml.includes('href="/studio/"')) failures.push('le workspace contient encore un retour vers l’ancienne racine');
if (!studioLogin.includes("const CANONICAL_STUDIO_PATH = '/studio/clients'")) failures.push('la connexion ne cible pas le workspace canonique');

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

console.log('Neptune entry-v11, architecture client v62, runtime contenu et Studio unifié validés.');
