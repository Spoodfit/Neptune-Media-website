import { readFile } from 'node:fs/promises';

const config = JSON.parse(await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8'));
const activeEntry = await readFile(new URL('../src/entry-v16.js', import.meta.url), 'utf8');
const reliableRoutes = await readFile(new URL('../src/video-ai-routes-v4.js', import.meta.url), 'utf8');
const cloudRoutesWrapper = await readFile(new URL('../src/video-ai-routes-v3.js', import.meta.url), 'utf8');
const cloudRoutesCore = await readFile(new URL('../src/video-ai-routes-v3-core.js', import.meta.url), 'utf8');
const queueRuntime = await readFile(new URL('../src/video-ai-queue-v70.js', import.meta.url), 'utf8');
const cloudRoutes = `${reliableRoutes}\n${cloudRoutesWrapper}\n${cloudRoutesCore}`;
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
const videoStudioHtml = await readFile(new URL('../public/studio/video-ai.html', import.meta.url), 'utf8');
const openAiRoutes = await readFile(new URL('../src/video-ai-openai-routes-v1.js', import.meta.url), 'utf8');
const openAiAnalysis = await readFile(new URL('../src/openai-video-analysis-v1.js', import.meta.url), 'utf8');
const liveMonitor = await readFile(new URL('../public/studio/video-ai-live-monitor-v69.js', import.meta.url), 'utf8');
const simpleStory = await readFile(new URL('../public/studio/video-ai-story-v70.js', import.meta.url), 'utf8');
const simpleStoryCss = await readFile(new URL('../public/studio/video-ai-story-v70.css', import.meta.url), 'utf8');
const liveProcessor = await readFile(new URL('../containers/video-ai/app_v69.py', import.meta.url), 'utf8');
const processorDockerfile = await readFile(new URL('../containers/video-ai/Dockerfile', import.meta.url), 'utf8');

const failures = [];
if (config.main !== 'src/entry-v16.js') failures.push(`wrangler.main=${config.main || 'absent'} au lieu de src/entry-v16.js`);
if (!Array.isArray(config.assets?.run_worker_first) || !config.assets.run_worker_first.includes('/api/*')) failures.push('les routes /api/* ne passent pas en priorité par le Worker');
if (!config.assets?.run_worker_first?.includes('/espace-client/*')) failures.push('les routes /espace-client/* ne passent pas par le Worker actif');
if (!config.assets?.run_worker_first?.includes('/studio/*')) failures.push('les routes /studio/* ne passent pas par le Worker actif');
if (config.analytics_engine_datasets?.length) failures.push('Analytics Engine bloque encore le déploiement alors que le compte ne l’active pas');
if (Object.prototype.hasOwnProperty.call(config.vars || {}, 'OPENAI_API_KEY')) failures.push('OPENAI_API_KEY ne doit jamais être enregistrée dans wrangler.jsonc');
if (Object.prototype.hasOwnProperty.call(config.vars || {}, 'VIDEO_AI_INTERNAL_SECRET')) failures.push('VIDEO_AI_INTERNAL_SECRET ne doit jamais être enregistré dans wrangler.jsonc');
if (config.vars?.OPENAI_MODEL !== 'gpt-5-mini') failures.push('OPENAI_MODEL ne cible pas gpt-5-mini par défaut');
if (config.vars?.OPENAI_BASE_URL !== 'https://api.openai.com/v1') failures.push('OPENAI_BASE_URL ne cible pas la Responses API officielle');
if (!Array.isArray(config.containers) || !config.containers.some((item) => item.class_name === 'VideoProcessorV2')) failures.push('le Container VideoProcessorV2 n’est pas déclaré');
if (!config.durable_objects?.bindings?.some((item) => item.name === 'VIDEO_PROCESSOR' && item.class_name === 'VideoProcessorV2')) failures.push('le binding VIDEO_PROCESSOR n’est pas déclaré');
if (!config.r2_buckets?.some((item) => item.binding === 'MEDIA')) failures.push('le stockage R2 MEDIA n’est pas déclaré');
if (!config.queues?.producers?.some((item) => item.binding === 'VIDEO_JOBS' && item.queue === 'neptune-video-jobs')) failures.push('la Queue durable VIDEO_JOBS n’est pas liée au Worker');
if (!config.queues?.consumers?.some((item) => item.queue === 'neptune-video-jobs' && item.max_batch_size === 1)) failures.push('le consumer vidéo durable n’est pas configuré en traitement unitaire');
if (!config.queues?.consumers?.some((item) => item.dead_letter_queue === 'neptune-video-jobs-dlq')) failures.push('la dead-letter queue vidéo est absente');

if (!activeEntry.includes("from './store-v12.js'")) failures.push('entry-v16 ne réexporte pas le store-v12 actif');
if (!activeEntry.includes("from './entry-v13.js'")) failures.push('entry-v16 ne prolonge pas la chaîne applicative entry-v13');
if (!activeEntry.includes("from './video-ai-container-v2.js'")) failures.push('entry-v16 ne réexporte pas le Container vidéo v2');
if (!activeEntry.includes("from './video-ai-routes-v4.js'")) failures.push('entry-v16 ne route pas le moteur vidéo fiable v70');
if (!activeEntry.includes("from './video-ai-queue-v70.js'")) failures.push('entry-v16 ne charge pas le consumer Queue vidéo');
if (!activeEntry.includes('async queue(batch, env, ctx)')) failures.push('entry-v16 ne traite pas les messages de la Queue');
if (!activeEntry.includes('handleVideoAiRoute(request, env, ctx, studio)')) failures.push('entry-v16 ne transmet pas les requêtes au moteur cloud');
if (!activeEntry.includes('reconcileVideoAiJobs(env, studio)')) failures.push('entry-v16 ne réconcilie pas les traitements interrompus via la Queue');
if (!activeEntry.includes("videoAiEngineMode: 'cloud-asynchronous-with-local-fallback'")) failures.push('le moteur cloud asynchrone n’est pas déclaré comme moteur principal');
if (!activeEntry.includes("videoAiDispatchMode: 'durable-queue-with-pooled-containers'")) failures.push('le dispatch Queue/pool n’est pas déclaré');
if (!activeEntry.includes("videoAiPipeline: 'multipart-r2-durable-queue-warm-container-pool-openai-ffmpeg-review-drive'")) failures.push('le pipeline vidéo fiable complet n’est pas déclaré');
if (!activeEntry.includes('videoAiOpenAiStructuredOutputs: true')) failures.push('les Structured Outputs OpenAI ne sont pas déclarés');
if (!activeEntry.includes("videoAiOpenAiDataPolicy: 'store-false-for-responses-api-no-source-video'")) failures.push('la politique de confidentialité OpenAI du moteur cloud est absente');
if (!activeEntry.includes('videoAiBackgroundProcessing: true')) failures.push('le traitement en arrière-plan n’est pas déclaré');
if (!activeEntry.includes('videoAiSafeToCloseAfterUpload: true')) failures.push('la fermeture de l’onglet après import n’est pas déclarée sûre');
if (!activeEntry.includes('videoAiStartupWatchdogSeconds: 120')) failures.push('le watchdog de démarrage à deux minutes est absent');
if (!activeEntry.includes('videoAiProcessorPoolSize: 2')) failures.push('le pool de deux processeurs n’est pas déclaré');
if (!activeEntry.includes("videoAiSourceRetention: 'deleted-after-successful-generation'")) failures.push('la suppression de la source après génération n’est pas déclarée');
if (!activeEntry.includes('retiredSidebarCssPattern') || !activeEntry.includes('retiredSidebarJsPattern')) failures.push('entry-v16 ne retire pas l’ancien shell Studio v64');
if (activeEntry.includes('handleOpenAiVideoRoute(request.clone()')) failures.push('entry-v16 clone encore toutes les requêtes, y compris les flux vidéo volumineux');

if (!queueRuntime.includes('env.VIDEO_JOBS.send')) failures.push('les productions ne sont pas publiées dans la Queue durable');
if (!queueRuntime.includes('startAndWaitForPorts')) failures.push('le consumer ne vérifie pas que le processeur est réellement prêt');
if (!queueRuntime.includes('videoProcessorPoolId')) failures.push('le pool déterministe de processeurs est absent');
if (!queueRuntime.includes('isJobAlive')) failures.push('la réconciliation peut redémarrer un job encore actif');
if (!queueRuntime.includes('message.retry')) failures.push('les erreurs de démarrage ne sont pas retentées par la Queue');
if (!reliableRoutes.includes('STUCK_STARTUP_MS = 2 * 60 * 1000')) failures.push('le watchdog automatique à deux minutes est absent');
if (!reliableRoutes.includes("'/api/admin/video-ai/warmup'")) failures.push('le préchauffage du moteur depuis le Studio est absent');
if (!reliableRoutes.includes('enqueueVideoJob')) failures.push('les imports terminés ne sont pas envoyés à la Queue');
if (reliableRoutes.includes('ctx.waitUntil(dispatchVideoAiJob')) failures.push('le lancement vidéo dépend encore de la fenêtre waitUntil HTTP');

if (!cloudRoutes.includes('analyzeVideoWithOpenAI')) failures.push('le moteur cloud n’utilise pas l’analyse éditoriale OpenAI');
if (!cloudRoutes.includes('openai_transcription_failed_falling_back')) failures.push('le repli de transcription OpenAI vers Workers AI est absent');
if (!cloudRoutes.includes('openai_cloud_video_analysis_failed_falling_back')) failures.push('le repli de sélection OpenAI vers Workers AI est absent');
if (!cloudRoutes.includes('return legacyHandle(fallbackRequest, env, ctx, studio)')) failures.push('la transcription ne retombe pas sur le moteur Workers AI');
if (!cloudRoutes.includes('await env.MEDIA.delete(sourceKey)')) failures.push('la vidéo source R2 n’est pas supprimée après génération réussie');
if (!cloudRoutes.includes("sourceKey.startsWith('video-ai/sources/')")) failures.push('la suppression R2 n’est pas bornée au préfixe des sources vidéo');
if (!reliableRoutes.includes('liveTelemetryAvailable')) failures.push('la télémétrie du processeur n’est pas exposée au Studio');
if (!reliableRoutes.includes('livePreviewDataUrl')) failures.push('l’aperçu réel du processeur n’est pas exposé au Studio');
if (!reliableRoutes.includes('LIVE_TIMEOUT_MS')) failures.push('la lecture de télémétrie peut encore bloquer le Studio sans délai borné');
if (!liveProcessor.includes('run_ffmpeg_progress')) failures.push('FFmpeg ne publie pas de progression continue');
if (!liveProcessor.includes('make_vertical_preview')) failures.push('le moteur ne génère pas d’aperçu vertical réel');
if (!liveProcessor.includes('transcribedChunks')) failures.push('la transcription ne publie pas son avancement par bloc');
if (!liveMonitor.includes('Suivi en direct du moteur')) failures.push('le moniteur technique de diagnostic n’existe plus comme secours');
if (!simpleStory.includes('Neptune crée vos contenus')) failures.push('le Studio ne rend pas la vue simplifiée orientée résultat');
if (!simpleStory.includes('Vidéo prise en charge')) failures.push('la vue simplifiée ne présente pas les étapes compréhensibles');
if (!simpleStory.includes('/api/admin/video-ai/warmup')) failures.push('la vue Studio ne préchauffe pas le moteur');
if (!simpleStoryCss.includes('#videoLiveMonitor{display:none!important}')) failures.push('le moniteur technique reste visible par défaut');
if (!videoStudioHtml.includes('/studio/video-ai-story-v70.js')) failures.push('la page de production ne charge pas la vue simplifiée v70');
if (!videoStudioHtml.includes('/studio/video-ai-story-v70.css')) failures.push('la page de production ne charge pas le style simplifié v70');
if (!processorDockerfile.includes('app_v69:app')) failures.push('le Container ne démarre pas le moteur live v69');

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
if (!openAiAnalysis.includes("`${openAiBaseUrl(env)}/responses`")) failures.push('l’intégration n’appelle pas la Responses API');
if (!openAiAnalysis.includes('store: false')) failures.push('les requêtes OpenAI ne désactivent pas le stockage');
if (!openAiAnalysis.includes("type: 'json_schema'")) failures.push('le schéma structuré OpenAI est absent');
if (!openAiAnalysis.includes('strict: true')) failures.push('le schéma OpenAI n’est pas strict');
if (openAiAnalysis.includes('input_image')) failures.push('des images ou la vidéo source sont envoyées à OpenAI alors que l’analyse doit rester textuelle');

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

console.log('Neptune entry-v16 v70 validé : Queue durable, pool de processeurs, watchdog automatique, aperçu réel, interface simplifiée, OpenAI et secours local.');
