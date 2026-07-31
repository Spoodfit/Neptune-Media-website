import { readFile } from 'node:fs/promises';

const config = JSON.parse(await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8'));
const activeEntry = await readFile(new URL('../src/entry-v15.js', import.meta.url), 'utf8');
const auditEntry = await readFile(new URL('../src/entry-v13.js', import.meta.url), 'utf8');
const editorialEntry = await readFile(new URL('../src/entry-v12.js', import.meta.url), 'utf8');
const efficiencyEntry = await readFile(new URL('../src/entry-v11.js', import.meta.url), 'utf8');
const storageEntry = await readFile(new URL('../src/entry-v10.js', import.meta.url), 'utf8');
const releaseEntry = await readFile(new URL('../src/entry-v9.js', import.meta.url), 'utf8');
const workflowEntry = await readFile(new URL('../src/entry-v8.js', import.meta.url), 'utf8');
const controlEntry = await readFile(new URL('../src/entry-v7.js', import.meta.url), 'utf8');
const studioEntryHtml = await readFile(new URL('../public/studio/index.html', import.meta.url), 'utf8');
const studioWorkspaceHtml = await readFile(new URL('../public/studio/clients.html', import.meta.url), 'utf8');
const studioLogin = await readFile(new URL('../public/studio/studio-login-v48.js', import.meta.url), 'utf8');
const openAiRoutes = await readFile(new URL('../src/video-ai-openai-routes-v1.js', import.meta.url), 'utf8');
const openAiAnalysis = await readFile(new URL('../src/openai-video-analysis-v1.js', import.meta.url), 'utf8');

const failures = [];
if (config.main !== 'src/entry-v15.js') failures.push(`wrangler.main=${config.main || 'absent'} au lieu de src/entry-v15.js`);
if (!Array.isArray(config.assets?.run_worker_first) || !config.assets.run_worker_first.includes('/api/*')) failures.push('les routes /api/* ne passent pas en priorité par le Worker');
if (!config.assets?.run_worker_first?.includes('/espace-client/*')) failures.push('les routes /espace-client/* ne passent pas par le Worker actif');
if (!config.assets?.run_worker_first?.includes('/studio/*')) failures.push('les routes /studio/* ne passent pas par le Worker actif');
if (config.analytics_engine_datasets?.length) failures.push('Analytics Engine bloque encore le déploiement alors que le compte ne l’active pas');
if (Object.prototype.hasOwnProperty.call(config.vars || {}, 'OPENAI_API_KEY')) failures.push('OPENAI_API_KEY ne doit jamais être enregistrée dans wrangler.jsonc');
if (config.vars?.OPENAI_MODEL !== 'gpt-5-mini') failures.push('OPENAI_MODEL ne cible pas gpt-5-mini par défaut');
if (config.vars?.OPENAI_BASE_URL !== 'https://api.openai.com/v1') failures.push('OPENAI_BASE_URL ne cible pas la Responses API officielle');

if (!activeEntry.includes("from './store-v12.js'")) failures.push('entry-v15 ne réexporte pas le store-v12 actif');
if (!activeEntry.includes("from './entry-v13.js'")) failures.push('entry-v15 ne prolonge pas la chaîne applicative entry-v13');
if (!activeEntry.includes('handleVideoAiLocalRoute')) failures.push('entry-v15 ne route pas le moteur vidéo local');
if (!activeEntry.includes('handleOpenAiVideoRoute')) failures.push('entry-v15 ne route pas la couche OpenAI');
if (!activeEntry.includes('handleOpenAiVideoRoute(request.clone()')) failures.push('la couche OpenAI ne préserve pas la requête pour le repli local');
if (!activeEntry.includes("videoAiEngineMode: 'browser-local'")) failures.push('le moteur vidéo local n’est plus déclaré comme moteur principal');
if (!activeEntry.includes("videoAiSemanticPriority: 'openai-then-workers-ai-then-deterministic-local'")) failures.push('la priorité sémantique OpenAI et ses replis ne sont pas déclarés');
if (!activeEntry.includes("videoAiOpenAiMode: 'always-before-render-when-configured'")) failures.push('OpenAI n’est pas déclaré avant le rendu quand configuré');
if (!activeEntry.includes('videoAiOpenAiStructuredOutputs: true')) failures.push('les Structured Outputs OpenAI ne sont pas déclarés');
if (!activeEntry.includes("videoAiOpenAiDataPolicy: 'store-false-timestamped-transcript-and-metrics-only-no-source-video'")) failures.push('la politique de confidentialité OpenAI est absente');

if (!auditEntry.includes("from './entry-v12.js'")) failures.push('entry-v13 ne prolonge pas l’espace éditorial entry-v12');
if (!editorialEntry.includes("from './entry-v11.js'")) failures.push('entry-v12 ne prolonge pas entry-v11');
if (!efficiencyEntry.includes("from './store-v7.js'")) failures.push('entry-v11 ne réexporte pas le moteur store-v7 historique');
if (!efficiencyEntry.includes("workflowStore: 'store-v7'")) failures.push('le diagnostic d’efficacité ne confirme pas store-v7');
if (!efficiencyEntry.includes("from './entry-v10.js'")) failures.push('entry-v11 ne prolonge pas entry-v10');
if (!efficiencyEntry.includes("clientInformationArchitecture: 'three-primary-screens-home-content-publications-v62'")) failures.push('le diagnostic de l’architecture client v62 est absent');
if (!efficiencyEntry.includes("analyticsEngineBinding: 'optional-not-required-for-deployment'")) failures.push('Analytics Engine n’est pas optionnel dans le diagnostic');
if (!storageEntry.includes("from './entry-v9.js'")) failures.push('entry-v10 ne prolonge pas la release applicative entry-v9');
if (!releaseEntry.includes('neptune-verified-content-runtime-20260730-v18')) failures.push('la release applicative v18 est absente');
if (!releaseEntry.includes('studioCanonicalPath: STUDIO_CANONICAL_PATH')) failures.push('le chemin canonique du Studio n’est pas déclaré');
if (!releaseEntry.includes("legacyStudioDashboard: 'removed'")) failures.push('la suppression du dashboard hérité n’est pas déclarée');
if (!workflowEntry.includes('injectWorkflowAssets')) failures.push('l’injection des interfaces workflow est absente');
if (!workflowEntry.includes('/assets/media-dialog-safety-v50.js?v=1')) failures.push('la protection de fermeture des médias n’est pas injectée');
if (!controlEntry.includes("'/api/admin/control-room'")) failures.push('la route /api/admin/control-room est absente de la chaîne active');
if (!controlEntry.includes("'/portal/autopilot-safe-list'")) failures.push('le parcours de secours du Studio est absent');

if (!openAiRoutes.includes("const STATUS_PATH = '/api/admin/video-ai/openai/status'")) failures.push('la route de statut OpenAI est absente');
if (!openAiRoutes.includes("const TEST_PATH = '/api/admin/video-ai/openai/test'")) failures.push('la route de test OpenAI est absente');
if (!openAiRoutes.includes("assistMode: 'openai-structured-analysis'")) failures.push('l’analyse vidéo ne marque pas les résultats OpenAI structurés');
if (!openAiRoutes.includes("fallback: 'workers-ai-then-local'")) failures.push('le repli OpenAI vers Workers AI puis local est absent');
if (!openAiAnalysis.includes("`${openAiBaseUrl(env)}/responses`")) failures.push('l’intégration n’appelle pas la Responses API');
if (!openAiAnalysis.includes('store: false')) failures.push('les requêtes OpenAI ne désactivent pas le stockage');
if (!openAiAnalysis.includes("type: 'json_schema'")) failures.push('le schéma structuré OpenAI est absent');
if (!openAiAnalysis.includes('strict: true')) failures.push('le schéma OpenAI n’est pas strict');
if (openAiAnalysis.includes('input_image')) failures.push('des images ou la vidéo source sont envoyées à OpenAI alors que v66 doit rester textuel');

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

console.log('Neptune entry-v15, OpenAI vidéo v66, architecture client v62, runtime contenu et Studio unifié validés.');
