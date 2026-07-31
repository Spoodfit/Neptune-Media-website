import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(scriptDir, '..');
const repoRoot = resolve(appRoot, '..');
const read = (path) => readFile(resolve(appRoot, path), 'utf8');

const [
  wrangler,
  entry,
  routes,
  openAiRoutes,
  openAiAnalysis,
  store,
  analysis,
  localAnalysis,
  html,
  css,
  openAiCss,
  openAiUi,
  compatibility,
  localMain,
  localAudio,
  localWorker,
  localRender,
  localStorage,
  viteConfig,
  built,
  rootPackage,
  nestedPackage,
  security,
] = await Promise.all([
  readFile(resolve(repoRoot, 'wrangler.jsonc'), 'utf8'),
  read('src/entry-v15.js'),
  read('src/video-ai-local-routes-v1.js'),
  read('src/video-ai-openai-routes-v1.js'),
  read('src/openai-video-analysis-v1.js'),
  read('src/store-v10.js'),
  read('src/video-ai-analysis-v1.js'),
  read('local-video-engine/src/analysis.js'),
  read('public/studio/video-ai.html'),
  read('public/studio/video-ai-local-v3.css'),
  read('public/studio/video-ai-openai-v1.css'),
  read('public/studio/video-ai-openai-v1.js'),
  read('public/studio/video-ai-local-compat-v3.js'),
  read('local-video-engine/src/main.js'),
  read('local-video-engine/src/audio.js'),
  read('local-video-engine/src/transcriber.worker.js'),
  read('local-video-engine/src/render.js'),
  read('local-video-engine/src/storage.js'),
  read('local-video-engine/vite.config.js'),
  read('public/studio/local-engine/neptune-video-local-engine-v1.js'),
  readFile(resolve(repoRoot, 'package.json'), 'utf8'),
  read('package.json'),
  read('src/security.js'),
]);

assert.match(wrangler, /entry-v15\.js/u);
assert.match(wrangler, /"OPENAI_MODEL": "gpt-5-mini"/u);
assert.match(wrangler, /"OPENAI_BASE_URL": "https:\/\/api\.openai\.com\/v1"/u);
assert.doesNotMatch(wrangler, /OPENAI_API_KEY/u, 'The OpenAI secret must never be committed');
assert.doesNotMatch(wrangler, /"containers"/u);
assert.doesNotMatch(wrangler, /"VIDEO_PROCESSOR"/u);
assert.match(wrangler, /"deleted_classes": \["VideoProcessor"\]/u);

for (const marker of [
  'handleVideoAiLocalRoute',
  'handleOpenAiVideoRoute',
  'request.clone()',
  "videoAiSemanticPriority: 'openai-then-workers-ai-then-deterministic-local'",
  "videoAiOpenAiMode: 'always-before-render-when-configured'",
  'videoAiOpenAiStructuredOutputs: true',
  "videoAiOpenAiDataPolicy: 'store-false-timestamped-transcript-and-metrics-only-no-source-video'",
  'videoAiContainerRequired: false',
  "videoAiSourcePrivacy: 'source-never-uploaded'",
  "Cross-Origin-Embedder-Policy', 'require-corp'",
]) assert.ok(entry.includes(marker), `Missing active entry marker: ${marker}`);

for (const marker of [
  '/api/admin/video-ai/local/jobs',
  '/assist',
  '/complete',
  'const sourceFingerprint = `local:',
  'local://browser/',
  'request.body',
  'uploadType=resumable',
  "origin: 'neptune_ai_generated'",
  "engine: 'neptune_video_local'",
  'contact@neptunebusiness.com',
]) assert.ok(routes.includes(marker), `Missing local route marker: ${marker}`);
assert.ok(!routes.includes('getContainer('), 'Local routes must not dispatch a Container');
assert.ok(!routes.includes('createMultipartUpload'), 'Source upload must not use R2 multipart');

for (const marker of [
  '/api/admin/video-ai/bootstrap',
  '/api/admin/video-ai/openai/status',
  '/api/admin/video-ai/openai/test',
  'openAiAnalysisAvailable',
  "openAiAnalysisMode: configured ? 'always-before-render' : 'disabled'",
  "assistMode: 'openai-structured-analysis'",
  "fallback: 'workers-ai-then-local'",
]) assert.ok(openAiRoutes.includes(marker), `Missing OpenAI route marker: ${marker}`);

for (const marker of [
  "const DEFAULT_MODEL = 'gpt-5-mini'",
  "const DEFAULT_BASE_URL = 'https://api.openai.com/v1'",
  "`${openAiBaseUrl(env)}/responses`",
  'Authorization: `Bearer ${clean(env.OPENAI_API_KEY, 500)}`',
  'store: false',
  "type: 'json_schema'",
  'strict: true',
  "provider: 'openai'",
  "sourceVideoUploaded: false",
  "transmittedData: 'timestamped-transcript-candidate-context-and-visual-metrics-only'",
]) assert.ok(openAiAnalysis.includes(marker), `Missing OpenAI analysis marker: ${marker}`);

for (const marker of ['CREATE TABLE IF NOT EXISTS video_ai_jobs', 'CREATE TABLE IF NOT EXISTS video_ai_clips', '>= 60', 'selected_proposal_id', 'drive_file_id']) assert.ok(store.includes(marker), `Missing store marker: ${marker}`);
for (const marker of ["const MIN_SCORE = 60", "const FUNNELS = new Set(['TOFU', 'MOFU', 'BOFU'])", "['direct', 'Directe et provocante']", "['humour', 'Humoristique et situationnelle']", "['expertise', 'Professionnelle et conversationnelle']"]) assert.ok(analysis.includes(marker), `Missing fallback analysis marker: ${marker}`);
for (const marker of ['rankAndDeduplicate', 'b.score - a.score', "return ['direct', 'humour', 'expertise']"]) assert.ok(localAnalysis.includes(marker), `Missing local quality marker: ${marker}`);

for (const marker of [
  'Vidéo source 100 % locale',
  'OpenAI renforce la sélection',
  'store: false',
  'Aucun fichier vidéo source n’est envoyé à OpenAI',
  'Garder cet onglet ouvert',
  'SEUIL 60/100',
  '/studio/video-ai-openai-v1.css?v=1',
  '/studio/video-ai-openai-v1.js?v=1',
  '/studio/local-engine/neptune-video-local-engine-v1.js?v=1',
  '/studio/video-ai-local-compat-v3.js?v=1',
]) assert.ok(html.includes(marker), `Missing UI marker: ${marker}`);
for (const marker of ['local-privacy-banner', 'local-requirements', 'local-preview-missing']) assert.ok(css.includes(marker), `Missing local CSS marker: ${marker}`);
for (const marker of ['openai-integration-card', 'openai-integration-card__status', 'data-state="configured"']) assert.ok(openAiCss.includes(marker), `Missing OpenAI CSS marker: ${marker}`);
for (const marker of ["'/api/admin/video-ai/openai/status'", "'/api/admin/video-ai/openai/test'", 'Tester la connexion', 'Vidéo source non envoyée']) assert.ok(openAiUi.includes(marker), `Missing OpenAI UI marker: ${marker}`);
for (const marker of ['crossOriginIsolated', 'VideoEncoder', 'AudioEncoder', 'wakeLock.request', 'stopImmediatePropagation']) assert.ok(compatibility.includes(marker), `Missing compatibility marker: ${marker}`);

for (const marker of ['extractAudioChunks', 'transcribeChunk', 'buildLocalCandidates', 'mergeAssistedCandidates', 'renderCandidate', 'saveClip', 'readClip', 'X-Clip-Size', 'beforeunload']) assert.ok(localMain.includes(marker), `Missing local client marker: ${marker}`);
for (const marker of ['openAiSemanticAssistPlugin', 'openAiAnalysisAvailable', 'Analyse éditoriale OpenAI', 'semantic_ai_assist_unavailable']) assert.ok(viteConfig.includes(marker), `Missing Vite OpenAI activation marker: ${marker}`);
for (const marker of ['AudioBufferSink', 'TARGET_SAMPLE_RATE = 16_000', 'MAX_CHUNK_SECONDS = 420']) assert.ok(localAudio.includes(marker), `Missing audio marker: ${marker}`);
for (const marker of ['onnx-community/whisper-base_timestamped', "device === 'webgpu'", "return_timestamps: 'word'", "'wasm'", 'raw > 1 ? raw / 100 : raw']) assert.ok(localWorker.includes(marker), `Missing Whisper marker: ${marker}`);
for (const marker of ['VideoSampleSink', 'AudioSampleSink', '1080', '1920', 'FaceDetector', 'drawCaption', 'Mp4OutputFormat', 'WebMOutputFormat', 'CAPTION_WINDOW_WORDS = 7', 'activeGlobalIndex']) assert.ok(localRender.includes(marker), `Missing render marker: ${marker}`);
for (const marker of ['indexedDB.open', "const STORE = 'clips'", 'navigator.storage']) assert.ok(localStorage.includes(marker), `Missing storage marker: ${marker}`);
assert.ok(built.length > 10000, 'Local Vite bundle was not generated');
assert.match(built, /openAiAnalysisAvailable/u, 'The built browser engine does not call OpenAI before rendering');

assert.doesNotMatch(rootPackage, /@cloudflare\/containers/u);
assert.doesNotMatch(nestedPackage, /@cloudflare\/containers/u);
assert.match(rootPackage, /@huggingface\/transformers/u);
assert.match(rootPackage, /mediabunny/u);
assert.match(nestedPackage, /build:video-local/u);
assert.match(security, /worker-src 'self' blob:/u);
assert.match(security, /https:\/\/huggingface\.co/u);

const moduleUrl = pathToFileURL(resolve(appRoot, 'src/video-ai-analysis-v1.js')).href;
const { analyzeVideoForClips } = await import(moduleUrl);
const text = 'Pourquoi tout le monde fait cette erreur alors que la solution est simple ? Un client nous a montré un cas concret : avant, il perdait du temps et de l’argent parce que personne ne posait la bonne question. Pourtant, avec une méthode claire en trois étapes, le résultat change vraiment. La première étape consiste à comprendre le problème réel. La deuxième évite les décisions prises trop vite. La troisième transforme le conseil en action mesurable. C’est important parce qu’une offre ne vaut rien si le client ne comprend jamais le bénéfice. Cette méthode a réduit la frustration, amélioré le processus et rendu la décision beaucoup plus simple.';
const words = text.split(/\s+/u);
const segments = [];
for (let index = 0; index < words.length; index += 14) {
  const start = (index / 14) * 7;
  segments.push({ start, end: start + 7, text: words.slice(index, index + 14).join(' ') });
}
const fallback = await analyzeVideoForClips({}, { transcript: text, segments, durationSeconds: segments.at(-1).end, visualProfile: { luminance: .42, contrast: .62, technicalQuality: .9 } });
assert.ok(fallback.candidates.length >= 1, 'Fallback must retain a coherent candidate when cloud analysis is unavailable');
for (const candidate of fallback.candidates) {
  assert.ok(candidate.score >= 60 && candidate.score <= 100);
  assert.equal(candidate.editorialProposals.length, 3);
  assert.deepEqual(candidate.editorialProposals.map((item) => item.id), ['direct', 'humour', 'expertise']);
  for (const proposal of candidate.editorialProposals) assert.match(proposal.cta, /\?$/u);
}

console.log(`Neptune Video Engine verified: local source privacy, OpenAI semantic layer, Workers AI fallback, local render and ${fallback.candidates.length} deterministic fallback candidate(s).`);
