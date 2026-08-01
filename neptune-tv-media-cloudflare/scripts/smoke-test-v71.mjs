import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const config = JSON.parse(await read('../wrangler.jsonc'));
const entry = await read('../src/entry-v16.js');
const routes = await read('../src/video-ai-routes-v5.js');
const queue = await read('../src/video-ai-queue-v71.js');
const container = await read('../src/video-ai-container-v2.js');
const store = await read('../src/store-v13.js');
const processor = await read('../containers/video-ai/app_v71.py');
const liveProcessor = await read('../containers/video-ai/app_v69.py');
const dockerfile = await read('../containers/video-ai/Dockerfile');
const html = await read('../public/studio/video-ai.html');
const story = await read('../public/studio/video-ai-story-v71.js');
const openAi = await read('../src/openai-video-analysis-v1.js');
const cloudCore = await read('../src/video-ai-routes-v3-core.js');

const failures = [];
const expect = (condition, message) => { if (!condition) failures.push(message); };

expect(config.main === 'src/entry-v16.js', 'wrangler.main ne cible pas entry-v16');
expect(config.queues?.producers?.some((item) => item.binding === 'VIDEO_JOBS'), 'binding VIDEO_JOBS absent');
expect(config.queues?.consumers?.some((item) => item.queue === 'neptune-video-jobs'), 'consumer neptune-video-jobs absent');
expect(config.durable_objects?.bindings?.some((item) => item.name === 'VIDEO_PROCESSOR'), 'binding VIDEO_PROCESSOR absent');
expect(config.r2_buckets?.some((item) => item.binding === 'MEDIA'), 'binding R2 MEDIA absent');

expect(entry.includes("from './store-v13.js'"), 'entry-v16 ne charge pas store-v13');
expect(entry.includes("from './video-ai-routes-v5.js'"), 'entry-v16 ne charge pas routes-v5');
expect(entry.includes("from './video-ai-queue-v71.js'"), 'entry-v16 ne charge pas queue-v71');
expect(entry.includes('async queue(batch, env, ctx)'), 'consumer Queue absent de entry-v16');
expect(entry.includes("videoAiDispatchMode: 'direct-acceptance-then-durable-queue-fallback'"), 'mode de dispatch v71 absent');
expect(entry.includes("videoAiRecoveryPolicy: 'five-bounded-attempts-with-persisted-errors'"), 'politique de reprise bornée absente');
expect(entry.includes('videoAiPersistentHeartbeatSeconds: 20'), 'heartbeat persistant non déclaré');
expect(entry.includes('videoAiStatusReadSideEffects: false'), 'lecture de statut sans effet de bord non déclarée');
expect(entry.includes("videoAiEngineMode: 'cloud-asynchronous-with-local-fallback'"), 'contrat moteur cloud historique absent');

expect(routes.includes('readProcessorJobState'), 'la lecture du processeur ne passe pas par RPC');
expect(routes.includes('persistProcessorHeartbeat'), 'route heartbeat interne absente');
expect(routes.includes("verifyVideoAiRequest(request, env, 'heartbeat', jobId)"), 'signature du heartbeat non vérifiée');
expect(routes.includes('dispatchVideoJobNow'), 'dispatch direct avec preuve d’acceptation absent');
expect(routes.includes('startWithQueueFallback'), 'fallback Queue après échec direct absent');
expect(routes.includes("'/portal/video-ai-job-reset'"), 'remise à zéro contrôlée des tentatives absente');
expect(!routes.includes('recoverStuckStartup'), 'le GET de statut déclenche encore une reprise');
expect(!routes.includes('STUCK_STARTUP_MS'), 'le watchdog par polling est encore actif');

expect(queue.includes('MAX_DISPATCH_ATTEMPTS = 5'), 'limite de cinq tentatives réelles absente');
expect(queue.includes("detail.includes('video_processor_attempts_exhausted')"), 'épuisement des tentatives non terminal');
expect(queue.includes("throw new Error('video_processor_attempts_exhausted')"), 'le dispatch peut dépasser cinq essais');
expect(queue.includes('message.retry'), 'retry Queue absent');
expect(queue.includes('instance.dispatchJob(requestPayload)'), 'dispatch RPC explicite absent');
expect(queue.includes('instance.readJob(String(jobId))'), 'lecture RPC sans démarrage absent');
expect(queue.includes('v71_legacy_recovery'), 'migration automatique de la boucle v70 absente');
expect(queue.includes("'/portal/video-ai-job-reset'"), 'la boucle v70 n’est pas réellement remise à zéro');
expect(queue.includes('QUEUED_RECOVERY_AFTER_MS'), 'fenêtre anti-duplication de récupération absente');
expect(!queue.includes('instance.fetch(new Request(`http://container/jobs/'), 'la lecture de statut peut encore démarrer le Container');

expect(container.includes('async dispatchJob(payload)'), 'RPC dispatchJob absent du Container');
expect(container.includes('async readJob(jobId)'), 'RPC readJob absent du Container');
expect(container.includes("state.status !== 'healthy'"), 'readJob ne vérifie pas l’état avant lecture');
expect(container.includes('instanceGetTimeoutMS: 60_000'), 'allocation Container insuffisamment bornée');
expect(container.includes('portReadyTimeoutMS: 180_000'), 'démarrage Container insuffisamment borné');
expect(store.includes("'/portal/video-ai-job-reset'"), 'endpoint de reset des tentatives absent');
expect(store.includes('error_code AS errorCode'), 'diagnostic de dispatch absent des jobs à reprendre');

expect(processor.includes('class JobRequestV71'), 'contrat de job v71 absent');
expect(processor.includes('heartbeatUrl'), 'URL heartbeat absente du processeur');
expect(processor.includes('report_heartbeat'), 'reporter heartbeat absent');
expect(processor.includes('delay = 20.0'), 'heartbeat non limité à vingt secondes');
expect(liveProcessor.includes('run_ffmpeg_progress'), 'progression FFmpeg absente');
expect(liveProcessor.includes('make_vertical_preview'), 'aperçu vertical réel absent');
expect(dockerfile.includes('app_v71:app'), 'Docker ne démarre pas app_v71');

expect(html.includes('/studio/video-ai-story-v71.js?v=1'), 'interface v71 non chargée');
expect(story.includes('Tentative ${Math.max(1, attempts)} sur ${maximum}'), 'compteur de tentatives honnête absent');
expect(story.includes('job.attemptStartedAt'), 'temps encore calculé depuis la première tentative');
expect(story.includes('job.errorDetail'), 'diagnostic réel non visible dans les détails');
expect(story.includes('stopped_with_code'), 'état de sortie Container non traduit');

expect(openAi.includes('store: false'), 'OpenAI store:false absent');
expect(openAi.includes("type: 'json_schema'"), 'Structured Outputs OpenAI absents');
expect(cloudCore.includes('await env.MEDIA.delete(sourceKey)'), 'suppression de la source après succès absente');

if (failures.length) {
  console.error(failures.map((failure) => `- ${failure}`).join('\n'));
  process.exit(1);
}

console.log('Orchestrateur vidéo Neptune v71 validé : preuve d’acceptation, Queue de secours, cinq tentatives réelles, heartbeat persistant, diagnostics conservés et polling sans effet de bord.');
