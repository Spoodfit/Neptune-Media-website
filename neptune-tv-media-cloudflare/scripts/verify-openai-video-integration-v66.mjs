import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(scriptDir, '..');
const repoRoot = resolve(appRoot, '..');
const read = (path) => readFile(resolve(appRoot, path), 'utf8');

const [
  entry,
  integration,
  routes,
  html,
  ui,
  css,
  vite,
  built,
  rootWrangler,
  nestedWrangler,
] = await Promise.all([
  read('src/entry-v15.js'),
  read('src/openai-video-analysis-v1.js'),
  read('src/video-ai-openai-routes-v1.js'),
  read('public/studio/video-ai.html'),
  read('public/studio/video-ai-openai-v1.js'),
  read('public/studio/video-ai-openai-v1.css'),
  read('local-video-engine/vite.config.js'),
  read('public/studio/local-engine/neptune-video-local-engine-v1.js'),
  readFile(resolve(repoRoot, 'wrangler.jsonc'), 'utf8'),
  read('wrangler.jsonc'),
]);

for (const content of [rootWrangler, nestedWrangler]) {
  assert.match(content, /"OPENAI_MODEL": "gpt-5-mini"/u);
  assert.match(content, /"OPENAI_BASE_URL": "https:\/\/api\.openai\.com\/v1"/u);
  assert.doesNotMatch(content, /OPENAI_API_KEY/u, 'OPENAI_API_KEY must remain a Cloudflare secret');
}

for (const marker of [
  "import { handleOpenAiVideoRoute } from './video-ai-openai-routes-v1.js'",
  'handleOpenAiVideoRoute(request.clone()',
  "videoAiOpenAiIntegration: OPENAI_RELEASE",
  "videoAiSemanticPriority: 'openai-then-workers-ai-then-deterministic-local'",
  "videoAiOpenAiMode: 'always-before-render-when-configured'",
  'videoAiOpenAiStructuredOutputs: true',
  "videoAiOpenAiStatusEndpoint: '/api/admin/video-ai/openai/status'",
  "videoAiOpenAiTestEndpoint: '/api/admin/video-ai/openai/test'",
]) assert.ok(entry.includes(marker), `Missing entry marker: ${marker}`);

for (const marker of [
  "const DEFAULT_MODEL = 'gpt-5-mini'",
  "const DEFAULT_BASE_URL = 'https://api.openai.com/v1'",
  "`${openAiBaseUrl(env)}/responses`",
  'store: false',
  "type: 'json_schema'",
  "name: 'neptune_video_editorial_analysis'",
  'strict: true',
  "provider: 'openai'",
  "generationStatus: 'openai'",
  'requestIds',
  'usage',
]) assert.ok(integration.includes(marker), `Missing integration marker: ${marker}`);
assert.doesNotMatch(integration, /input_image/u, 'The source video or frames must not be sent in v66');

for (const marker of [
  "const BOOTSTRAP_PATH = '/api/admin/video-ai/bootstrap'",
  "const STATUS_PATH = '/api/admin/video-ai/openai/status'",
  "const TEST_PATH = '/api/admin/video-ai/openai/test'",
  'openAiAnalysisAvailable: configured',
  "openAiAnalysisMode: configured ? 'always-before-render' : 'disabled'",
  "assistMode: 'openai-structured-analysis'",
  "fallback: 'workers-ai-then-local'",
  'return null;',
]) assert.ok(routes.includes(marker), `Missing route marker: ${marker}`);

for (const marker of [
  'OpenAI renforce la sélection',
  'Vidéo source 100 % locale',
  'Aucun fichier vidéo source n’est envoyé à OpenAI',
  '<code>store: false</code>',
  '/studio/video-ai-openai-v1.css?v=1',
  '/studio/video-ai-openai-v1.js?v=1',
]) assert.ok(html.includes(marker), `Missing truthful UI marker: ${marker}`);
for (const marker of ['Analyse éditoriale OpenAI', 'Tester la connexion', 'Vidéo source non envoyée', 'store: false']) assert.ok(ui.includes(marker), `Missing connection UI marker: ${marker}`);
for (const marker of ['openai-integration-card', 'openai-integration-card__test', '[data-state="configured"]']) assert.ok(css.includes(marker), `Missing connection CSS marker: ${marker}`);
for (const marker of ['openAiSemanticAssistPlugin', 'openAiAnalysisAvailable', 'Analyse éditoriale OpenAI', 'semantic_ai_assist_unavailable']) assert.ok(vite.includes(marker), `Missing browser activation marker: ${marker}`);
assert.match(built, /openAiAnalysisAvailable/u, 'The generated browser bundle does not run semantic analysis before render');

const moduleUrl = pathToFileURL(resolve(appRoot, 'src/openai-video-analysis-v1.js')).href;
const { analyzeVideoWithOpenAI, isOpenAiConfigured, openAiPublicConfiguration, testOpenAiConnection } = await import(moduleUrl);
assert.equal(isOpenAiConfigured({}), false);
assert.equal(isOpenAiConfigured({ OPENAI_API_KEY: 'sk-test' }), true);
assert.equal(openAiPublicConfiguration({ OPENAI_API_KEY: 'sk-test' }).sourceVideoUploaded, false);

const transcript = 'Pourquoi tant d’entreprises perdent-elles des clients alors que leur service est bon ? Le problème vient rarement de la qualité réelle. Il vient du fait que la promesse reste abstraite. Quand le prospect ne comprend pas immédiatement ce qui change pour lui, il reporte sa décision. Une méthode simple consiste à nommer le problème, montrer sa conséquence puis présenter une preuve concrète. Cette structure rend le message plus clair, plus crédible et plus facile à retenir. Elle ne remplace pas une bonne offre, mais elle permet enfin au client d’en percevoir la valeur.';
const words = transcript.split(/\s+/u);
const segments = [];
for (let index = 0; index < words.length; index += 16) {
  const start = Math.round((index / 16) * 7 * 100) / 100;
  segments.push({ start, end: start + 7, text: words.slice(index, index + 16).join(' ') });
}

const candidate = {
  startSeconds: 0,
  endSeconds: 35,
  title: 'Pourquoi une bonne offre reste incomprise',
  funnel: 'MOFU',
  scoreBreakdown: { hook: 16, autonomy: 14, value: 14, retention: 12, emotion: 6, originality: 7, marketing: 9, technical: 4 },
  rationale: 'Le passage expose un problème autonome, sa conséquence et une méthode concrète.',
  hookMoment: 'Pourquoi tant d’entreprises perdent-elles des clients alors que leur service est bon ?',
  captionPreset: 'neptune-premium',
  editorialProposals: [
    { id: 'direct', label: 'Directe et provocante', hook: 'Votre offre est peut-être bonne, mais personne ne la comprend.', description: 'Le problème ne vient pas toujours du service.', cta: 'Votre promesse est-elle immédiatement claire ?', hashtags: ['#Business', '#Communication', '#NeptuneMedia'], fullPost: 'Post direct' },
    { id: 'humour', label: 'Humoristique et situationnelle', hook: 'Quand votre offre joue à cache-cache avec le client.', description: 'Une promesse abstraite reporte la décision.', cta: 'Votre offre se cache-t-elle encore ?', hashtags: ['#Entrepreneuriat', '#Marketing', '#NeptuneMedia'], fullPost: 'Post humour' },
    { id: 'expertise', label: 'Professionnelle et conversationnelle', hook: 'Une méthode en trois temps pour clarifier votre promesse.', description: 'Problème, conséquence, preuve.', cta: 'Quelle étape manque aujourd’hui dans votre message ?', hashtags: ['#Expertise', '#Stratégie', '#NeptuneMedia'], fullPost: 'Post expertise' },
  ],
};

const calls = [];
const originalFetch = globalThis.fetch;
globalThis.fetch = async (url, options = {}) => {
  const body = JSON.parse(options.body || '{}');
  calls.push({ url: String(url), options, body });
  const isTest = body?.text?.format?.name === 'neptune_openai_connection_test';
  const output = isTest ? { connected: true } : { candidates: [candidate] };
  return new Response(JSON.stringify({
    id: isTest ? 'resp_test' : 'resp_analysis',
    status: 'completed',
    model: 'gpt-5-mini-verified',
    output_text: JSON.stringify(output),
    usage: { input_tokens: 900, output_tokens: 420, total_tokens: 1320 },
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'x-request-id': isTest ? 'req_test' : 'req_analysis' },
  });
};

try {
  const connection = await testOpenAiConnection({ OPENAI_API_KEY: 'sk-test', OPENAI_MODEL: 'gpt-5-mini' });
  assert.equal(connection.connected, true);
  assert.equal(connection.requestId, 'req_test');

  const result = await analyzeVideoWithOpenAI({ OPENAI_API_KEY: 'sk-test', OPENAI_MODEL: 'gpt-5-mini' }, {
    transcript,
    segments,
    durationSeconds: segments.at(-1).end,
    objective: 'Priorité expertise MOFU',
    company: 'Neptune Test',
    visualProfile: { luminance: 0.45, contrast: 0.7, technicalQuality: 0.92 },
  });
  assert.equal(result.provider, 'openai');
  assert.equal(result.generationStatus, 'openai');
  assert.equal(result.aiModel, 'gpt-5-mini');
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].score, 82);
  assert.equal(result.candidates[0].funnel, 'MOFU');
  assert.equal(result.candidates[0].editorialProposals.length, 3);
  assert.deepEqual(result.candidates[0].editorialProposals.map((item) => item.id), ['direct', 'humour', 'expertise']);
  assert.equal(result.requestIds[0], 'req_analysis');

  assert.equal(calls.length, 2);
  for (const call of calls) {
    assert.equal(call.url, 'https://api.openai.com/v1/responses');
    assert.equal(call.options.headers.Authorization, 'Bearer sk-test');
    assert.equal(call.body.store, false);
    assert.equal(call.body.model, 'gpt-5-mini');
    assert.equal(call.body.text.format.type, 'json_schema');
    assert.equal(call.body.text.format.strict, true);
    assert.ok(!JSON.stringify(call.body).includes('video/mp4'));
  }
} finally {
  globalThis.fetch = originalFetch;
}

console.log('OpenAI Studio integration v66 verified: server-side secret, Responses API, strict Structured Outputs, store=false, no source video upload, UI status/test and deterministic fallback chain.');
