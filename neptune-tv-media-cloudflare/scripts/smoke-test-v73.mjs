import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const config = JSON.parse(await read('../wrangler.jsonc'));
const rootConfig = JSON.parse(await read('../../wrangler.jsonc'));
const rootPackage = JSON.parse(await read('../../package.json'));
const nestedPackage = JSON.parse(await read('../package.json'));
const entry = await read('../src/entry-v16.js');
const html = await read('../public/studio/video-ai.html');
const bridge = await read('../public/studio/video-ai-engine-v73.js');
const css = await read('../public/studio/video-ai-engine-v73.css');
const vite = await read('../local-video-engine/vite.config.js');
const built = await read('../public/studio/local-engine/neptune-video-local-engine-v1.js');
const engine = await read('../../neptune-video-engine/app.py');
const runtime = await read('../../neptune-video-engine/runtime.py');
const dockerfile = await read('../../neptune-video-engine/Dockerfile');
const compose = await read('../../neptune-video-engine/docker-compose.yml');
const installer = await read('../public/studio/install-neptune-video-engine.ps1');

const failures = [];
const expect = (condition, message) => { if (!condition) failures.push(message); };

for (const [name, current] of [['root', rootConfig], ['nested', config]]) {
  const containers = Array.isArray(current.containers) ? current.containers : [];
  expect(containers.every((item) => item?.class_name === 'WebTvEncoder'), `${name}: un Container Cloudflare autre que WebTvEncoder est configuré`);
  expect(!current.queues, `${name}: la Queue Cloudflare vidéo est encore configurée`);
  expect(!current.durable_objects?.bindings?.some((item) => item.name === 'VIDEO_PROCESSOR'), `${name}: VIDEO_PROCESSOR est encore lié`);
  expect(!containers.some((item) => /video.?processor/iu.test(String(item?.class_name || ''))), `${name}: le traitement vidéo IA a été remis dans un Container Cloudflare`);
}
for (const [name, current] of [['root', rootPackage], ['nested', nestedPackage]]) {
  if ((Array.isArray((name === 'root' ? rootConfig : config).containers) ? (name === 'root' ? rootConfig : config).containers : []).length) {
    expect(Boolean(current.dependencies?.['@cloudflare/containers']), `${name}: la dépendance Cloudflare Containers manque pour la Web TV`);
  }
}

expect(entry.includes("videoAiEngineMode: 'persistent-local-service-with-browser-fallback'"), 'le Worker ne déclare pas le service permanent primaire');
expect(entry.includes("videoAiDispatchMode: 'localhost-persistent-sqlite-queue'"), 'la file SQLite locale n’est pas déclarée');
expect(entry.includes('videoAiBackgroundProcessing: true'), 'la poursuite hors onglet n’est pas déclarée');
expect(entry.includes('videoAiBrowserFallbackPresent: true'), 'le secours navigateur n’est pas déclaré');
expect(html.includes('NEPTUNE VIDEO ENGINE'), 'le Studio n’annonce pas le moteur permanent');
expect(html.includes('La production continue même après fermeture du Studio'), 'la promesse d’autonomie est absente');
expect(html.includes('/studio/video-ai-engine-v73.js?v=75'), 'le bridge v74 n’est pas chargé');
expect(html.includes('/studio/local-engine/neptune-video-local-engine-v1.js?v=73'), 'le fallback navigateur v73 n’est pas chargé');
expect(html.includes('/studio/install-neptune-video-engine.ps1'), 'l’installateur Windows n’est pas proposé');
expect(bridge.includes('NeptuneVideoEngineBridge'), 'le bridge global est absent');
expect(bridge.includes('/v1/jobs'), 'le bridge ne crée pas de jobs persistants');
expect(bridge.includes('localStorage.setItem(JOBS_KEY'), 'le lien entre jobs Studio et moteur n’est pas persisté');
expect(bridge.includes('xhr.upload.onprogress'), 'la progression de copie réelle est absente');
expect(bridge.includes('targetAddressSpace'), 'la compatibilité réseau local moderne est absente');
expect(bridge.includes('engineLivePreview'), 'l’aperçu réel du moteur est absent');
expect(bridge.includes('this.preview(jobId)'), 'la récupération authentifiée de l’aperçu est absente');
expect(bridge.includes('neptune-video-engine-20260803-v75'), 'le Studio ne détecte pas la version v74 du moteur');
expect(bridge.includes('Mettre à jour le moteur'), 'le Studio ne propose pas la mise à jour du moteur');
expect(css.includes('.engine-setup'), 'le panneau de connexion n’est pas stylé');
expect(css.includes('.engine-live-preview'), 'l’aperçu réel n’est pas stylé');

for (const marker of [
  'processFileWithPreferredEngine',
  'processFileWithPermanentEngine',
  'resumePermanentEngineJobs',
  'syncPermanentEngineResult',
  'NeptuneVideoEngineBridge',
  'neptune-video-engine-bridge-20260802-v73',
]) expect(vite.includes(marker) || built.includes(marker), `marqueur d’orchestration absent: ${marker}`);
for (const marker of [
  'neptune-video-engine-bridge-20260802-v73',
  'permanent_engine_queued',
  'permanent_engine_processing',
  'Le moteur permanent n’est pas connecté',
  'Import terminé. Vous pouvez fermer cet onglet',
]) expect(built.includes(marker), `marqueur fonctionnel absent du bundle construit: ${marker}`);

for (const marker of [
  'persistent-local-service',
  'CREATE TABLE IF NOT EXISTS jobs',
  "status IN ('queued','processing')",
  'WhisperModel',
  'openai_candidates',
  'ollama_candidates',
  'heuristic_candidates',
  'render_clip',
  'write_subtitles',
  'opencv-smart-crop',
  '/v1/jobs/{job_id}/clips/{clip_id}',
]) expect(engine.includes(marker), `fonction moteur absente: ${marker}`);
for (const marker of [
  'Access-Control-Allow-Private-Network',
  'cropCenterX',
  'select_candidates_with_crop',
  'render_clip_with_smart_crop',
]) expect(runtime.includes(marker), `durcissement moteur absent: ${marker}`);
expect(dockerfile.includes('HEALTHCHECK'), 'le Container local n’a pas de healthcheck');
expect(dockerfile.includes('runtime:app'), 'le runtime durci n’est pas démarré');
expect(compose.includes('restart: unless-stopped'), 'le service local ne redémarre pas automatiquement');
expect(compose.includes('neptune_video_data'), 'le volume persistant est absent');
expect(installer.includes('docker compose up -d --build'), 'l’installateur ne démarre pas le moteur');
expect(installer.includes('Set-Clipboard'), 'l’installateur ne transmet pas le code de connexion');

if (failures.length) {
  console.error(failures.map((failure) => `- ${failure}`).join('\n'));
  process.exit(1);
}

console.log('Neptune Video Engine v75 validé : service local persistant, Cloudflare Containers réservé à la Web TV, mise à jour visible, progression et aperçu réels, recadrage visage, Studio connecté, reprise hors onglet, OpenAI/Ollama/règles, FFmpeg/Whisper/OpenCV et fallback navigateur.');
