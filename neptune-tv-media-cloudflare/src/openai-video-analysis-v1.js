const DEFAULT_MODEL = 'gpt-5-mini';
const DEFAULT_BASE_URL = 'https://api.openai.com/v1';
const PROMPT_VERSION = 'neptune-openai-video-analysis-20260731-v1';
const MIN_SCORE = 60;
const MIN_DURATION = 18;
const MAX_DURATION = 90;
const MAX_CHUNK_CHARACTERS = 24000;
const MAX_CHUNKS = 8;
const REQUEST_TIMEOUT_MS = 90000;
const FUNNELS = new Set(['TOFU', 'MOFU', 'BOFU']);
const CAPTION_PRESETS = new Set(['neptune-contrast', 'neptune-light', 'neptune-boxed', 'neptune-premium']);
const PROPOSAL_IDS = ['direct', 'humour', 'expertise'];

export function isOpenAiConfigured(env = {}) {
  return Boolean(clean(env.OPENAI_API_KEY, 500));
}

export function openAiModel(env = {}) {
  return clean(env.OPENAI_MODEL, 120) || DEFAULT_MODEL;
}

export function openAiBaseUrl(env = {}) {
  const configured = clean(env.OPENAI_BASE_URL, 500) || DEFAULT_BASE_URL;
  return configured.replace(/\/+$/u, '');
}

export function openAiPublicConfiguration(env = {}) {
  return {
    configured: isOpenAiConfigured(env),
    model: openAiModel(env),
    provider: 'openai-responses-api',
    structuredOutputs: true,
    dataStorage: 'store-false',
    sourceVideoUploaded: false,
    transmittedData: 'timestamped-transcript-candidate-context-and-visual-metrics-only',
  };
}

export async function testOpenAiConnection(env = {}) {
  if (!isOpenAiConfigured(env)) throw new OpenAiError('openai_not_configured', 409);
  const startedAt = Date.now();
  const result = await createResponse(env, {
    input: [
      {
        role: 'developer',
        content: [{ type: 'input_text', text: 'Réponds uniquement avec la structure demandée. Cette requête vérifie une connexion technique.' }],
      },
      {
        role: 'user',
        content: [{ type: 'input_text', text: 'Confirme que la connexion API fonctionne.' }],
      },
    ],
    text: {
      format: {
        type: 'json_schema',
        name: 'neptune_openai_connection_test',
        strict: true,
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: { connected: { type: 'boolean' } },
          required: ['connected'],
        },
      },
    },
    max_output_tokens: 128,
  });
  const parsed = parseStructuredOutput(result.body);
  if (parsed?.connected !== true) throw new OpenAiError('openai_test_invalid_response', 502, result.requestId);
  return {
    ok: true,
    connected: true,
    model: result.body.model || openAiModel(env),
    latencyMs: Date.now() - startedAt,
    requestId: result.requestId,
  };
}

export async function analyzeVideoWithOpenAI(env = {}, raw = {}) {
  if (!isOpenAiConfigured(env)) throw new OpenAiError('openai_not_configured', 409);
  const segments = normalizeSegments(raw.segments, raw.transcript, raw.durationSeconds);
  if (!segments.length) throw new OpenAiError('openai_transcript_missing', 400);
  const durationSeconds = positive(raw.durationSeconds) || segments.at(-1)?.end || 0;
  const chunks = buildChunks(segments).slice(0, MAX_CHUNKS);
  const candidates = [];
  const requestIds = [];
  const usage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };

  for (const [index, chunk] of chunks.entries()) {
    const result = await analyzeChunk(env, raw, chunk, durationSeconds, index + 1, chunks.length);
    requestIds.push(result.requestId);
    usage.inputTokens += Number(result.body?.usage?.input_tokens || 0);
    usage.outputTokens += Number(result.body?.usage?.output_tokens || 0);
    usage.totalTokens += Number(result.body?.usage?.total_tokens || 0);
    const parsed = parseStructuredOutput(result.body);
    candidates.push(...normalizeCandidates(parsed?.candidates, chunk, raw));
  }

  const retained = rankAndDeduplicate(candidates, durationSeconds)
    .filter((candidate) => candidate.score >= MIN_SCORE)
    .slice(0, maxRetainedClips(durationSeconds));
  if (!retained.length) throw new OpenAiError('openai_no_candidate_above_minimum_score', 422, requestIds.at(-1));

  return {
    promptVersion: PROMPT_VERSION,
    aiModel: openAiModel(env),
    provider: 'openai',
    generationStatus: 'openai',
    minimumScore: MIN_SCORE,
    transcript: cleanMultiline(raw.transcript || segments.map((segment) => segment.text).join(' '), 180000),
    segments,
    candidates: retained.map((candidate, index) => ({ ...candidate, rank: index + 1 })),
    usage,
    requestIds,
  };
}

async function analyzeChunk(env, raw, chunk, durationSeconds, chunkIndex, chunkCount) {
  const prompt = buildPrompt(raw, chunk, durationSeconds, chunkIndex, chunkCount);
  return createResponse(env, {
    input: [
      {
        role: 'developer',
        content: [{
          type: 'input_text',
          text: 'Tu es le directeur éditorial de Neptune Media. Tu sélectionnes uniquement des extraits réellement autonomes et fidèles à la transcription. Tu n’inventes aucun fait, chiffre, citation ni résultat.',
        }],
      },
      { role: 'user', content: [{ type: 'input_text', text: prompt }] },
    ],
    text: { format: candidateResponseFormat() },
    max_output_tokens: 12000,
  });
}

async function createResponse(env, payload) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort('openai_timeout'), REQUEST_TIMEOUT_MS);
  const requestId = crypto.randomUUID();
  const headers = {
    Authorization: `Bearer ${clean(env.OPENAI_API_KEY, 500)}`,
    'Content-Type': 'application/json',
    'X-Client-Request-Id': requestId,
  };
  if (clean(env.OPENAI_ORGANIZATION, 200)) headers['OpenAI-Organization'] = clean(env.OPENAI_ORGANIZATION, 200);
  if (clean(env.OPENAI_PROJECT, 200)) headers['OpenAI-Project'] = clean(env.OPENAI_PROJECT, 200);

  try {
    const response = await fetch(`${openAiBaseUrl(env)}/responses`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: openAiModel(env),
        store: false,
        ...payload,
      }),
      signal: controller.signal,
    });
    const body = await response.json().catch(() => ({}));
    const upstreamRequestId = response.headers.get('x-request-id') || requestId;
    if (!response.ok) {
      const code = clean(body?.error?.code || body?.error?.type, 120) || `openai_http_${response.status}`;
      const message = cleanMultiline(body?.error?.message, 800);
      throw new OpenAiError(code, response.status, upstreamRequestId, message);
    }
    if (body.status === 'incomplete' || body.status === 'failed') {
      throw new OpenAiError(`openai_response_${body.status}`, 502, upstreamRequestId, cleanMultiline(body?.incomplete_details?.reason, 500));
    }
    return { body, requestId: upstreamRequestId };
  } catch (error) {
    if (error instanceof OpenAiError) throw error;
    if (error?.name === 'AbortError' || String(error).includes('openai_timeout')) {
      throw new OpenAiError('openai_timeout', 504, requestId);
    }
    throw new OpenAiError('openai_network_error', 502, requestId, cleanMultiline(error?.message || error, 500));
  } finally {
    clearTimeout(timeout);
  }
}

function candidateResponseFormat() {
  const proposal = {
    type: 'object',
    additionalProperties: false,
    properties: {
      id: { type: 'string', enum: PROPOSAL_IDS },
      label: { type: 'string' },
      hook: { type: 'string' },
      description: { type: 'string' },
      cta: { type: 'string' },
      hashtags: { type: 'array', items: { type: 'string' }, minItems: 3, maxItems: 6 },
      fullPost: { type: 'string' },
    },
    required: ['id', 'label', 'hook', 'description', 'cta', 'hashtags', 'fullPost'],
  };
  return {
    type: 'json_schema',
    name: 'neptune_video_editorial_analysis',
    description: 'Sélection horodatée des meilleurs extraits et rédaction sociale fidèle à la transcription.',
    strict: true,
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        candidates: {
          type: 'array',
          maxItems: 12,
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              startSeconds: { type: 'number' },
              endSeconds: { type: 'number' },
              title: { type: 'string' },
              funnel: { type: 'string', enum: ['TOFU', 'MOFU', 'BOFU'] },
              scoreBreakdown: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  hook: { type: 'integer', minimum: 0, maximum: 20 },
                  autonomy: { type: 'integer', minimum: 0, maximum: 15 },
                  value: { type: 'integer', minimum: 0, maximum: 15 },
                  retention: { type: 'integer', minimum: 0, maximum: 15 },
                  emotion: { type: 'integer', minimum: 0, maximum: 10 },
                  originality: { type: 'integer', minimum: 0, maximum: 10 },
                  marketing: { type: 'integer', minimum: 0, maximum: 10 },
                  technical: { type: 'integer', minimum: 0, maximum: 5 },
                },
                required: ['hook', 'autonomy', 'value', 'retention', 'emotion', 'originality', 'marketing', 'technical'],
              },
              rationale: { type: 'string' },
              hookMoment: { type: 'string' },
              captionPreset: { type: 'string', enum: [...CAPTION_PRESETS] },
              editorialProposals: { type: 'array', items: proposal, minItems: 3, maxItems: 3 },
            },
            required: ['startSeconds', 'endSeconds', 'title', 'funnel', 'scoreBreakdown', 'rationale', 'hookMoment', 'captionPreset', 'editorialProposals'],
          },
        },
      },
      required: ['candidates'],
    },
  };
}

function buildPrompt(raw, chunk, durationSeconds, chunkIndex, chunkCount) {
  const client = [raw.company, raw.clientName].map((value) => clean(value, 120)).filter(Boolean).join(' · ') || 'Client Neptune Media';
  const project = clean(raw.orderTitle || raw.projectTitle, 240) || 'Passage Neptune Media';
  const objective = cleanMultiline(raw.objective, 1200) || 'Créer des shorts autonomes, mémorables et utiles, équilibrés entre visibilité, expertise et conversion.';
  const visual = raw.visualProfile && typeof raw.visualProfile === 'object' ? raw.visualProfile : {};
  const transcript = chunk.segments.map((segment) => `[${formatTime(segment.start)} → ${formatTime(segment.end)}] ${segment.text}`).join('\n');
  return `MISSION
Analyser la fenêtre ${chunkIndex}/${chunkCount} d’une vidéo longue Neptune Media et sélectionner uniquement les extraits qui méritent réellement un montage vertical.

CONTEXTE
Client : ${client}
Projet : ${project}
Objectif : ${objective}
Durée totale : ${Math.round(durationSeconds)} secondes
Fenêtre : ${formatTime(chunk.start)} à ${formatTime(chunk.end)}
Qualité visuelle : luminosité=${numberOr(visual.luminance, 0.5)}, contraste=${numberOr(visual.contrast, 0.5)}, qualité technique=${numberOr(visual.technicalQuality, 0.8)}.

RÈGLES DE SÉLECTION
- Un extrait doit être compréhensible sans le reste de l’interview.
- Le début doit contenir une tension, une opinion, une erreur, une promesse, une émotion, une preuve ou une question forte.
- La fin doit résoudre l’idée sans couper une phrase.
- Durée obligatoire : 18 à 90 secondes.
- Rejeter salutations, transitions, répétitions, banalités, digressions et passages dépendant d’un contexte absent.
- Ne jamais inventer de propos, de chiffres ou de résultats.
- Ne pas créer deux candidats racontant essentiellement la même chose.

FUNNEL
TOFU : portée large, opinion, surprise, récit, émotion, erreur fréquente.
MOFU : méthode, expertise, objection, explication, conseil applicable.
BOFU : preuve, résultat, différenciation, offre, processus, bénéfice ou objection d’achat.

NOTATION EXACTE SUR 100
hook 0-20 ; autonomy 0-15 ; value 0-15 ; retention 0-15 ; emotion 0-10 ; originality 0-10 ; marketing 0-10 ; technical 0-5.
La somme doit être exacte. Ne proposer aucun candidat sous 60/100.

RÉDACTION
Produire exactement trois propositions dans cet ordre : direct, humour, expertise.
Chaque CTA est une question. Les textes sont fidèles au passage, immédiatement publiables sur Instagram et LinkedIn, sans imitation d’une personne ou d’une marque identifiable.

TRANSCRIPTION HORODATÉE
${transcript}`;
}

function parseStructuredOutput(body = {}) {
  if (typeof body.output_text === 'string' && body.output_text.trim()) return safeJson(body.output_text);
  for (const item of Array.isArray(body.output) ? body.output : []) {
    for (const content of Array.isArray(item?.content) ? item.content : []) {
      if (content?.type === 'output_text' && typeof content.text === 'string') return safeJson(content.text);
    }
  }
  throw new OpenAiError('openai_output_missing', 502, body.id || '');
}

function normalizeCandidates(value, chunk, raw) {
  const output = [];
  for (const candidate of Array.isArray(value) ? value : []) {
    const start = clampNumber(candidate?.startSeconds, chunk.start, chunk.end);
    const end = clampNumber(candidate?.endSeconds, start + MIN_DURATION, Math.min(chunk.end, start + MAX_DURATION));
    if (!Number.isFinite(start) || !Number.isFinite(end) || end - start < MIN_DURATION || end - start > MAX_DURATION) continue;
    const selected = chunk.segments.filter((segment) => segment.end > start && segment.start < end);
    const transcript = cleanMultiline(selected.map((segment) => segment.text).join(' '), 12000);
    if (transcript.split(/\s+/u).filter(Boolean).length < 25) continue;
    const breakdown = normalizeBreakdown(candidate?.scoreBreakdown);
    const score = Object.values(breakdown).reduce((sum, item) => sum + item, 0);
    if (score < MIN_SCORE) continue;
    const funnel = FUNNELS.has(String(candidate?.funnel || '').toUpperCase()) ? String(candidate.funnel).toUpperCase() : 'MOFU';
    output.push({
      id: crypto.randomUUID(),
      startSeconds: round(start),
      endSeconds: round(end),
      durationSeconds: round(end - start),
      title: clean(candidate?.title, 140) || titleFromTranscript(transcript),
      funnel,
      score,
      scoreBreakdown: breakdown,
      rationale: cleanMultiline(candidate?.rationale, 700) || `Passage ${funnel} retenu après analyse sémantique OpenAI.`,
      hookMoment: clean(candidate?.hookMoment, 300) || firstSentence(transcript),
      captionPreset: CAPTION_PRESETS.has(candidate?.captionPreset) ? candidate.captionPreset : captionPreset(raw.visualProfile),
      transcript,
      transcriptSegments: selected,
      editorialProposals: normalizeProposals(candidate?.editorialProposals, transcript, funnel),
    });
  }
  return output;
}

function normalizeProposals(value, transcript, funnel) {
  const byId = new Map((Array.isArray(value) ? value : []).map((item) => [String(item?.id || '').toLowerCase(), item]));
  return PROPOSAL_IDS.map((id) => {
    const raw = byId.get(id) || {};
    const label = id === 'direct' ? 'Directe et provocante' : id === 'humour' ? 'Humoristique et situationnelle' : 'Professionnelle et conversationnelle';
    const hook = clean(raw.hook, 220) || firstSentence(transcript);
    const description = cleanMultiline(raw.description, 1800) || cleanMultiline(transcript, 800);
    const cta = ensureQuestion(clean(raw.cta, 280) || 'Qu’en pensez-vous');
    const hashtags = normalizeHashtags(raw.hashtags, funnel);
    return {
      id,
      label,
      hook,
      description,
      cta,
      hashtags,
      fullPost: cleanMultiline(raw.fullPost, 2600) || [hook, description, cta, hashtags.join(' ')].filter(Boolean).join('\n\n'),
    };
  });
}

function buildChunks(segments) {
  const chunks = [];
  let current = [];
  let characters = 0;
  for (const segment of segments) {
    const added = segment.text.length + 32;
    if (current.length && characters + added > MAX_CHUNK_CHARACTERS) {
      chunks.push(chunkFrom(current));
      current = current.slice(-2);
      characters = current.reduce((sum, item) => sum + item.text.length + 32, 0);
    }
    current.push(segment);
    characters += added;
  }
  if (current.length) chunks.push(chunkFrom(current));
  return chunks;
}

function chunkFrom(segments) {
  return { start: segments[0].start, end: segments.at(-1).end, segments };
}

function normalizeSegments(value, transcript, durationSeconds) {
  const output = [];
  for (const raw of Array.isArray(value) ? value : []) {
    const start = positiveOrZero(raw?.start ?? raw?.startSeconds);
    const end = positive(raw?.end ?? raw?.endSeconds);
    const text = cleanMultiline(raw?.text, 4000);
    if (!text || !Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
    output.push({ start: round(start), end: round(end), text });
  }
  output.sort((a, b) => a.start - b.start);
  if (output.length) return output.slice(0, 12000);
  const text = cleanMultiline(transcript, 180000);
  if (!text) return [];
  return [{ start: 0, end: positive(durationSeconds) || 90, text }];
}

function rankAndDeduplicate(candidates, durationSeconds) {
  const ranked = [...candidates].sort((a, b) => b.score - a.score || a.startSeconds - b.startSeconds);
  const kept = [];
  for (const candidate of ranked) {
    if (kept.some((item) => overlap(item, candidate) > 0.58 || similarity(item.transcript, candidate.transcript) > 0.74)) continue;
    kept.push(candidate);
  }
  return kept.slice(0, maxRetainedClips(durationSeconds));
}

function normalizeBreakdown(value = {}) {
  return {
    hook: clampInt(value.hook, 0, 20),
    autonomy: clampInt(value.autonomy, 0, 15),
    value: clampInt(value.value, 0, 15),
    retention: clampInt(value.retention, 0, 15),
    emotion: clampInt(value.emotion, 0, 10),
    originality: clampInt(value.originality, 0, 10),
    marketing: clampInt(value.marketing, 0, 10),
    technical: clampInt(value.technical, 0, 5),
  };
}

function normalizeHashtags(value, funnel) {
  const tags = (Array.isArray(value) ? value : [])
    .map((item) => clean(item, 60).replace(/^#+/u, ''))
    .filter(Boolean)
    .map((item) => `#${item.replace(/\s+/gu, '')}`)
    .slice(0, 6);
  for (const fallback of ['#NeptuneMedia', `#${funnel}`, '#Business']) {
    if (tags.length >= 3) break;
    if (!tags.includes(fallback)) tags.push(fallback);
  }
  return tags;
}

function overlap(a, b) {
  const intersection = Math.max(0, Math.min(a.endSeconds, b.endSeconds) - Math.max(a.startSeconds, b.startSeconds));
  return intersection / Math.max(1, Math.min(a.durationSeconds, b.durationSeconds));
}

function similarity(a, b) {
  const left = new Set(tokens(a));
  const right = new Set(tokens(b));
  const common = [...left].filter((token) => right.has(token)).length;
  return common / Math.max(1, Math.min(left.size, right.size));
}

function tokens(value) {
  return clean(value, 12000).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/gu, '').split(/[^a-z0-9]+/u).filter((token) => token.length > 3);
}

function captionPreset(visual = {}) {
  const luminance = Number(visual?.luminance ?? 0.5);
  const contrast = Number(visual?.contrast ?? 0.5);
  if (contrast < 0.28) return 'neptune-boxed';
  if (luminance < 0.38) return 'neptune-light';
  if (luminance > 0.76) return 'neptune-premium';
  return 'neptune-contrast';
}

function maxRetainedClips(durationSeconds) {
  return Math.max(4, Math.min(36, Math.ceil(Number(durationSeconds || 0) / 150)));
}

function titleFromTranscript(text) {
  return clean(text, 1000).replace(/[.!?…]/gu, '').split(/\s+/u).filter(Boolean).slice(0, 9).join(' ') || 'Short Neptune';
}

function firstSentence(text) {
  return clean(text, 2000).split(/(?<=[.!?…])\s+/u)[0]?.slice(0, 220) || '';
}

function ensureQuestion(value) {
  const text = clean(value, 280).replace(/[.!]+$/u, '');
  return `${text || 'Qu’en pensez-vous'}?`;
}

function safeJson(value) {
  try { return JSON.parse(String(value || '').trim()); } catch { throw new OpenAiError('openai_invalid_json', 502); }
}

function formatTime(seconds) {
  const total = Math.max(0, Math.round(Number(seconds || 0)));
  const minutes = Math.floor(total / 60);
  return `${String(minutes).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function numberOr(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number * 100) / 100 : fallback;
}

function clampNumber(value, min, max) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : NaN;
}

function clampInt(value, min, max) {
  return Math.max(min, Math.min(max, Math.round(Number(value || 0))));
}

function positive(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function positiveOrZero(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : NaN;
}

function round(value) {
  return Math.round(Number(value || 0) * 1000) / 1000;
}

function clean(value, max = 500) {
  return String(value ?? '').replace(/\s+/gu, ' ').trim().slice(0, max);
}

function cleanMultiline(value, max = 5000) {
  return String(value ?? '').replace(/\r\n?/gu, '\n').replace(/[\t ]+/gu, ' ').replace(/\n{3,}/gu, '\n\n').trim().slice(0, max);
}

export class OpenAiError extends Error {
  constructor(code, status = 500, requestId = '', detail = '') {
    super(code);
    this.name = 'OpenAiError';
    this.code = code;
    this.status = status;
    this.requestId = requestId;
    this.detail = detail;
  }
}
