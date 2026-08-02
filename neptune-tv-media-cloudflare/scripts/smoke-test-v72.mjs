import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const config = JSON.parse(await read('../wrangler.jsonc'));
const rootConfig = JSON.parse(await read('../../wrangler.jsonc'));
const entry = await read('../src/entry-v16.js');
const store = await read('../src/store-v13.js');
const localRoutes = await read('../src/video-ai-local-routes-v1.js');
const openAiRoutes = await read('../src/video-ai-openai-routes-v1.js');
const html = await read('../public/studio/video-ai.html');
const source = await read('../local-video-engine/src/main.js');
const built = await read('../public/studio/local-engine/neptune-video-local-engine-v1.js');

const failures = [];
const expect = (condition, message) => { if (!condition) failures.push(message); };

for (const [name, current] of [['root', rootConfig], ['nested', config]]) {
  expect(!current.containers, `${name}: la section Containers est encore présente`);
  expect(!current.queues, `${name}: la Queue vidéo est encore présente`);
  expect(!current.durable_objects?.bindings?.some((item) => item.name === 'VIDEO_PROCESSOR'), `${name}: le binding VIDEO_PROCESSOR est encore actif`);
  expect(current.durable_objects?.bindings?.some((item) => item.name === 'STUDIO' && item.class_name === 'StudioStore'), `${name}: le Store Studio est absent`);
  expect(current.migrations?.some((item) => item.tag === 'v5' && item.deleted_classes?.includes('VideoProcessorV2')), `${name}: la suppression de VideoProcessorV2 n'est pas déclarée`);
  expect(current.ai?.binding === 'AI', `${name}: Workers AI n'est pas disponible comme secours`);
}

expect(entry.includes("from './video-ai-local-routes-v1.js'"), 'entry-v16 ne charge pas le moteur local');
expect(entry.includes("from './video-ai-openai-routes-v1.js'"), 'entry-v16 ne charge pas la sélection OpenAI');
expect(entry.includes("videoAiEngineMode: 'browser-local'"), 'le moteur local n’est pas déclaré comme primaire');
expect(entry.includes("videoAiDispatchMode: 'no-container-no-queue'"), 'le mode sans Container ni Queue n’est pas déclaré');
expect(entry.includes('videoAiContainerRequired: false'), 'le Container est encore déclaré obligatoire');
expect(entry.includes('videoAiQueueBindingPresent: false'), 'la Queue est encore déclarée active');
expect(entry.includes("videoAiLegacyCloudRecovery: 'retired-reselect-source-locally-no-upload'"), 'la migration des jobs cloud est absente');
expect(entry.includes("'/portal/video-ai-retire-cloud-jobs'"), 'entry-v16 ne déclenche pas la clôture des jobs cloud bloqués');
expect(!entry.includes('consumeVideoQueue'), 'entry-v16 consomme encore la Queue vidéo');
expect(!entry.includes('VideoProcessorV2'), 'entry-v16 exporte encore le Container vidéo');

expect(store.includes("'/portal/video-ai-retire-cloud-jobs'"), 'le Store ne sait pas clôturer les jobs cloud');
expect(store.includes("cloud_engine_retired_use_local"), 'le diagnostic de migration cloud est absent');
expect(store.includes("source_key LIKE ?"), 'la migration n’est pas bornée aux sources cloud');
expect(store.includes("status IN ('uploading','queued','processing')"), 'la migration peut toucher des productions terminées');

expect(localRoutes.includes("engineMode: 'browser-local'"), 'le bootstrap local est absent');
expect(localRoutes.includes('workersAiAssistAvailable: Boolean(env.AI)'), 'Workers AI n’est pas disponible en secours');
expect(localRoutes.includes("sourceUploadRequired: false"), 'la source est encore déclarée téléversée');
expect(openAiRoutes.includes('openAiAnalysisAvailable: configured'), 'OpenAI n’est pas exposé au moteur local');
expect(openAiRoutes.includes("fallback: 'workers-ai-then-local'"), 'la chaîne de repli sémantique est absente');

expect(html.includes('NEPTUNE VIDEO ENGINE LOCAL'), 'l’interface n’annonce pas le moteur local');
expect(html.includes('Plus de Container bloqué'), 'l’interface ne retire pas explicitement le faux redémarrage');
expect(html.includes('/studio/local-engine/neptune-video-local-engine-v1.js?v=72'), 'le bundle local v72 n’est pas chargé');
expect(!html.includes('video-ai-cloud-resilience-v67.js'), 'le runtime cloud est encore chargé');
expect(!html.includes('video-ai-dispatch-recovery-v68.js'), 'le faux écran de relance est encore chargé');
expect(!html.includes('video-ai-story-v71.js'), 'l’ancien récit de redémarrage est encore chargé');

for (const marker of ['startLocalProduction', 'processFileLocally', 'extractAudioChunks', 'renderCandidate', 'indexeddb-generated-clips-only']) {
  expect(source.includes(marker) || built.includes(marker), `marqueur moteur local absent: ${marker}`);
}
expect(built.includes('openAiAnalysisAvailable'), 'le bundle construit n’intègre pas l’assistance OpenAI');
expect(built.includes('workersAiAssistAvailable'), 'le bundle construit n’intègre pas le secours Workers AI');

if (failures.length) {
  console.error(failures.map((failure) => `- ${failure}`).join('\n'));
  process.exit(1);
}

console.log('Neptune Video v72 validé : moteur navigateur local, OpenAI puis Workers AI, aucun Container, aucune Queue, anciennes productions cloud clôturées et aucun faux redémarrage.');
