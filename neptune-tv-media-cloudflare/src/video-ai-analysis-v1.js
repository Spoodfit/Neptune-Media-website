const MODEL = '@cf/openai/gpt-oss-120b';
const PROMPT_VERSION = 'neptune-video-ai-20260730-v1';
const MIN_SCORE = 60;
const MIN_DURATION = 18;
const MAX_DURATION = 90;

const FUNNELS = new Set(['TOFU', 'MOFU', 'BOFU']);
const PROPOSAL_ANGLES = [
  ['direct', 'Directe et provocante'],
  ['humour', 'Humoristique et situationnelle'],
  ['expertise', 'Professionnelle et conversationnelle'],
];

export async function analyzeVideoForClips(env, raw = {}) {
  const segments = normalizeSegments(raw.segments, raw.transcript);
  const duration = positiveNumber(raw.durationSeconds) || inferDuration(segments);
  const chunks = buildAnalysisChunks(segments, duration);
  const candidates = [];
  let aiSucceeded = false;

  for (const chunk of chunks) {
    const generated = await analyzeChunk(env, {
      ...raw,
      durationSeconds: duration,
      chunk,
    });
    if (generated.length) aiSucceeded = true;
    candidates.push(...generated);
  }

  const fallback = candidates.length ? [] : fallbackCandidates(segments, duration, raw);
  const retained = deduplicateCandidates([...candidates, ...fallback], duration)
    .filter((candidate) => candidate.score >= MIN_SCORE)
    .slice(0, maxRetainedClips(duration));

  return {
    promptVersion: PROMPT_VERSION,
    aiModel: MODEL,
    generationStatus: aiSucceeded ? 'generated' : 'fallback',
    minimumScore: MIN_SCORE,
    transcript: cleanTranscript(raw.transcript || segments.map((segment) => segment.text).join(' ')),
    segments,
    candidates: retained.map((candidate, index) => ({
      ...candidate,
      rank: index + 1,
      id: candidate.id || crypto.randomUUID(),
      editorialProposals: normalizeEditorialProposals(candidate.editorialProposals, candidate, raw),
    })),
  };
}

async function analyzeChunk(env, context) {
  if (!env?.AI || !context.chunk?.segments?.length) return [];
  const prompt = buildPrompt(context);
  try {
    const response = await env.AI.run(MODEL, {
      messages: [
        {
          role: 'system',
          content: 'Tu es le moteur éditorial et de sélection vidéo de Neptune Media. Réponds uniquement en JSON valide, sans markdown.',
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0.35,
      max_tokens: 12000,
      response_format: { type: 'json_object' },
    });
    const parsed = parseModelJson(response);
    return normalizeCandidates(parsed?.candidates, context);
  } catch (error) {
    console.error('video_ai_chunk_analysis_failed', {
      name: error?.name || 'Error',
      message: String(error?.message || error || 'unknown').slice(0, 500),
      chunkStart: context.chunk.start,
      chunkEnd: context.chunk.end,
    });
    return [];
  }
}

function buildPrompt(context) {
  const client = [context.company, context.clientName].filter(Boolean).join(' · ') || 'Client Neptune Media';
  const objective = cleanText(context.objective, 800) || 'Créer le maximum de shorts cohérents et performants sans conserver de contenu faible ou redondant.';
  const visual = context.visualProfile && typeof context.visualProfile === 'object' ? context.visualProfile : {};
  const transcript = context.chunk.segments.map((segment) => `[${formatTime(segment.start)} → ${formatTime(segment.end)}] ${segment.text}`).join('\n');

  return `
MISSION
Analyser un extrait horodaté d'une vidéo longue afin d'identifier uniquement les meilleurs passages autonomes pouvant devenir des shorts verticaux Neptune Media.

CONTEXTE
Client : ${client}
Projet : ${cleanText(context.orderTitle || context.projectTitle, 300) || 'Passage Neptune Media'}
Objectif : ${objective}
Durée totale : ${Math.round(context.durationSeconds || 0)} secondes
Fenêtre analysée : ${formatTime(context.chunk.start)} à ${formatTime(context.chunk.end)}
Profil visuel : luminosité=${numberOr(visual.luminance, 0.5)}, contraste=${numberOr(visual.contrast, 0.5)}, visages=${numberOr(visual.faceCount, 1)}.

STRATÉGIE DE SÉLECTION
- Extraire autant de passages réellement exploitables que la matière le permet, sans quota artificiel.
- Un passage doit pouvoir être compris sans le reste de l'interview.
- Le début doit créer une tension, une curiosité, une contradiction, une promesse, une émotion ou une preuve.
- La fin doit résoudre l'idée ou laisser une question naturelle, sans couper une phrase.
- Écarter les salutations, transitions, répétitions, digressions, contenus trop génériques et passages dépendant d'un contexte absent.
- Durée cible : 18 à 90 secondes.
- Éviter deux candidats racontant essentiellement la même chose.
- Ne jamais inventer de propos, résultat, chiffre ou information qui ne figure pas dans la transcription.

CLASSIFICATION
TOFU : portée large, opinion, surprise, erreur fréquente, émotion, récit ou potentiel de partage.
MOFU : expertise, méthode, explication, objection, conseil applicable ou démonstration.
BOFU : preuve, résultat, différenciation, offre, processus, bénéfice ou objection d'achat.
Choisir une catégorie principale unique.

SCORING SUR 100
hook 0-20 ; autonomy 0-15 ; value 0-15 ; retention 0-15 ; emotion 0-10 ; originality 0-10 ; marketing 0-10 ; technical 0-5.
Le total doit être la somme exacte. 0 signifie aucun potentiel exploitable. 100 signifie un passage exceptionnel selon les signaux observables, sans garantir la viralité.
Ne proposer que des candidats dont le score estimé est au moins 60.

RÉDACTION SOCIALE
Pour chaque candidat, produire exactement trois propositions :
1. direct : directe et provocante ;
2. humour : humoristique et situationnelle ;
3. expertise : professionnelle et conversationnelle.
Chaque proposition contient : hook, description, cta sous forme de question, 3 à 6 hashtags et fullPost.
Utiliser des mécaniques de communication réactive, simple, audacieuse et conversationnelle, sans imiter littéralement une personne identifiable et sans copier une marque.
Les textes doivent être fidèles au passage, lisibles sur mobile et immédiatement publiables sur Instagram et LinkedIn.

SOUS-TITRES
Choisir captionPreset parmi : neptune-contrast, neptune-light, neptune-boxed, neptune-premium.
- neptune-contrast : scène complexe ou mobile, lisibilité maximale.
- neptune-light : arrière-plan sombre et stable.
- neptune-boxed : contraste local insuffisant.
- neptune-premium : scène sobre et professionnelle.

FORMAT JSON STRICT
{
  "candidates": [
    {
      "startSeconds": 0,
      "endSeconds": 45,
      "title": "nom interne court",
      "funnel": "TOFU",
      "scoreBreakdown": {"hook":0,"autonomy":0,"value":0,"retention":0,"emotion":0,"originality":0,"marketing":0,"technical":0},
      "rationale": "raison concise et vérifiable",
      "hookMoment": "phrase ou idée qui arrête le scroll",
      "captionPreset": "neptune-contrast",
      "editorialProposals": [
        {"id":"direct","label":"Directe et provocante","hook":"","description":"","cta":"?","hashtags":["#..."],"fullPost":""},
        {"id":"humour","label":"Humoristique et situationnelle","hook":"","description":"","cta":"?","hashtags":["#..."],"fullPost":""},
        {"id":"expertise","label":"Professionnelle et conversationnelle","hook":"","description":"","cta":"?","hashtags":["#..."],"fullPost":""}
      ]
    }
  ]
}

TRANSCRIPTION HORODATÉE
${transcript}`.trim();
}

function normalizeCandidates(value, context) {
  const list = Array.isArray(value) ? value : [];
  const output = [];
  for (const raw of list.slice(0, 12)) {
    const start = clampNumber(raw?.startSeconds, context.chunk.start, context.chunk.end);
    const end = clampNumber(raw?.endSeconds, start + MIN_DURATION, Math.min(context.chunk.end, start + MAX_DURATION));
    if (!Number.isFinite(start) || !Number.isFinite(end) || end - start < MIN_DURATION) continue;
    const breakdown = normalizeScoreBreakdown(raw?.scoreBreakdown);
    const score = scoreTotal(breakdown);
    if (score < MIN_SCORE) continue;
    const transcriptSegments = context.chunk.segments.filter((segment) => segment.end > start && segment.start < end);
    const transcript = cleanTranscript(transcriptSegments.map((segment) => segment.text).join(' '));
    if (transcript.split(/\s+/u).filter(Boolean).length < 25) continue;
    output.push({
      id: crypto.randomUUID(),
      startSeconds: round2(start),
      endSeconds: round2(end),
      durationSeconds: round2(end - start),
      title: cleanText(raw?.title, 140) || titleFromTranscript(transcript),
      funnel: FUNNELS.has(String(raw?.funnel || '').toUpperCase()) ? String(raw.funnel).toUpperCase() : inferFunnel(transcript),
      score,
      scoreBreakdown: breakdown,
      rationale: cleanText(raw?.rationale, 600) || fallbackRationale(breakdown),
      hookMoment: cleanText(raw?.hookMoment, 280) || transcript.split(/[.!?]/u)[0]?.trim().slice(0, 280) || '',
      captionPreset: normalizeCaptionPreset(raw?.captionPreset, context.visualProfile),
      transcript,
      transcriptSegments,
      editorialProposals: raw?.editorialProposals,
    });
  }
  return output;
}

function fallbackCandidates(segments, duration, context) {
  if (!segments.length) return [];
  const windows = [];
  let cursor = 0;
  while (cursor < segments.length) {
    const startIndex = cursor;
    const start = segments[startIndex].start;
    let endIndex = startIndex;
    while (endIndex + 1 < segments.length && segments[endIndex].end - start < 52) endIndex += 1;
    const selected = segments.slice(startIndex, endIndex + 1);
    const text = cleanTranscript(selected.map((item) => item.text).join(' '));
    const words = text.split(/\s+/u).filter(Boolean);
    if (words.length >= 45) {
      const breakdown = heuristicBreakdown(text, selected, context);
      const score = scoreTotal(breakdown);
      if (score >= MIN_SCORE) {
        windows.push({
          id: crypto.randomUUID(),
          startSeconds: round2(selected[0].start),
          endSeconds: round2(selected.at(-1).end),
          durationSeconds: round2(selected.at(-1).end - selected[0].start),
          title: titleFromTranscript(text),
          funnel: inferFunnel(text),
          score,
          scoreBreakdown: breakdown,
          rationale: fallbackRationale(breakdown),
          hookMoment: text.split(/[.!?]/u)[0]?.trim().slice(0, 280) || '',
          captionPreset: normalizeCaptionPreset('', context.visualProfile),
          transcript: text,
          transcriptSegments: selected,
          editorialProposals: [],
        });
      }
    }
    cursor = Math.max(cursor + 1, endIndex - 1);
  }
  return windows.slice(0, maxRetainedClips(duration));
}

function heuristicBreakdown(text, segments, context) {
  const normalized = text.toLowerCase();
  const question = /\?/u.test(text);
  const contrast = /\b(mais|pourtant|contrairement|erreur|jamais|toujours|vraiment|problème|secret|personne|tout le monde)\b/iu.test(text);
  const proof = /\b(résultat|client|chiffre|euros?|pourcent|fois|avant|après|preuve|cas concret)\b/iu.test(text);
  const action = /\b(comment|méthode|étape|conseil|faire|éviter|comprendre|solution)\b/iu.test(text);
  const offer = /\b(offre|service|accompagnement|processus|acheter|choisir|réserver|décision)\b/iu.test(text);
  const emotional = /\b(peur|envie|frustr|fatigu|fier|heureux|difficile|incroyable|surpris|colère)\b/iu.test(text);
  const density = Math.min(1, text.split(/\s+/u).length / Math.max(1, segments.at(-1).end - segments[0].start) / 2.8);
  const technical = numberOr(context?.visualProfile?.technicalQuality, 0.8);
  return {
    hook: clampInt(10 + (question ? 3 : 0) + (contrast ? 5 : 0), 0, 20),
    autonomy: clampInt(11 + (/[.!?]$/u.test(text) ? 3 : 0), 0, 15),
    value: clampInt(8 + (action ? 4 : 0) + (proof ? 3 : 0), 0, 15),
    retention: clampInt(8 + Math.round(density * 4) + (contrast ? 2 : 0), 0, 15),
    emotion: clampInt(4 + (emotional ? 4 : 0) + (question ? 1 : 0), 0, 10),
    originality: clampInt(5 + (contrast ? 3 : 0), 0, 10),
    marketing: clampInt(5 + (offer ? 3 : 0) + (proof ? 2 : 0), 0, 10),
    technical: clampInt(Math.round(technical * 5), 0, 5),
  };
}

function normalizeEditorialProposals(value, candidate, context) {
  const source = Array.isArray(value) ? value : [];
  return PROPOSAL_ANGLES.map(([id, label], index) => {
    const raw = source.find((item) => String(item?.id || '').toLowerCase() === id) || source[index] || {};
    const fallback = fallbackProposal(id, candidate, context);
    const hook = cleanText(raw.hook, 220) || fallback.hook;
    const description = cleanMultiline(raw.description, 1800) || fallback.description;
    const cta = ensureQuestion(cleanText(raw.cta, 280) || fallback.cta);
    const hashtags = normalizeHashtags(raw.hashtags).length >= 3 ? normalizeHashtags(raw.hashtags) : fallback.hashtags;
    return {
      id,
      label,
      hook,
      description,
      cta,
      hashtags,
      fullPost: cleanMultiline(raw.fullPost, 2600) || buildPost(hook, description, cta, hashtags),
    };
  });
}

function fallbackProposal(angle, candidate, context) {
  const company = cleanText(context.company, 80) || 'votre entreprise';
  const topic = candidate.hookMoment || candidate.title;
  if (angle === 'humour') {
    const hook = `Le moment où « on verra plus tard » coûte plus cher que prévu.`;
    const description = `${topic}\n\nOn sourit, mais le fond est sérieux : les décisions repoussées deviennent rarement plus simples. Ce passage remet le vrai sujet au centre, sans détour inutile.`;
    const cta = `Quelle décision avez-vous trop longtemps repoussée ?`;
    const hashtags = ['#Entrepreneuriat', '#Communication', '#Business'];
    return { hook, description, cta, hashtags, fullPost: buildPost(hook, description, cta, hashtags) };
  }
  if (angle === 'expertise') {
    const hook = `Une bonne décision commence souvent par une question plus précise.`;
    const description = `${topic}\n\nCe passage montre comment transformer une intuition en choix exploitable pour ${company}. L'enjeu n'est pas de complexifier : il est d'identifier ce qui change réellement le résultat.`;
    const cta = `Quel indicateur guide vos décisions aujourd'hui ?`;
    const hashtags = ['#Stratégie', '#Marketing', '#Entreprise'];
    return { hook, description, cta, hashtags, fullPost: buildPost(hook, description, cta, hashtags) };
  }
  const hook = candidate.hookMoment || `Le problème n'est pas toujours celui que l'on croit.`;
  const description = `${candidate.transcript.slice(0, 620)}${candidate.transcript.length > 620 ? '…' : ''}\n\nUn passage direct, autonome et utile : il met en évidence le point qui mérite réellement une décision.`;
  const cta = `Vous êtes plutôt d'accord ou pas du tout ?`;
  const hashtags = ['#Business', '#Entrepreneuriat', '#NeptuneMedia'];
  return { hook, description, cta, hashtags, fullPost: buildPost(hook, description, cta, hashtags) };
}

function deduplicateCandidates(items, duration) {
  const sorted = items
    .filter((item) => item && Number.isFinite(item.startSeconds) && Number.isFinite(item.endSeconds))
    .map((item) => ({ ...item, score: clampInt(item.score, 0, 100) }))
    .sort((a, b) => b.score - a.score || a.startSeconds - b.startSeconds);
  const kept = [];
  for (const candidate of sorted) {
    candidate.startSeconds = clampNumber(candidate.startSeconds, 0, Math.max(0, duration - MIN_DURATION));
    candidate.endSeconds = clampNumber(candidate.endSeconds, candidate.startSeconds + MIN_DURATION, Math.min(duration || Infinity, candidate.startSeconds + MAX_DURATION));
    candidate.durationSeconds = round2(candidate.endSeconds - candidate.startSeconds);
    if (candidate.durationSeconds < MIN_DURATION) continue;
    const duplicate = kept.some((existing) => overlapRatio(candidate, existing) > 0.52 || textSimilarity(candidate.transcript, existing.transcript) > 0.78);
    if (!duplicate) kept.push(candidate);
  }
  return kept.sort((a, b) => b.score - a.score || a.startSeconds - b.startSeconds);
}

function buildAnalysisChunks(segments, duration) {
  if (!segments.length) return [];
  const chunks = [];
  let current = [];
  let chars = 0;
  for (const segment of segments) {
    const wouldExceed = current.length && (chars + segment.text.length > 15000 || segment.end - current[0].start > 900);
    if (wouldExceed) {
      chunks.push(chunkFrom(current));
      current = current.slice(-3);
      chars = current.reduce((sum, item) => sum + item.text.length, 0);
    }
    current.push(segment);
    chars += segment.text.length;
  }
  if (current.length) chunks.push(chunkFrom(current));
  if (!chunks.length && duration) chunks.push({ start: 0, end: duration, segments });
  return chunks;
}

function chunkFrom(segments) {
  return { start: segments[0].start, end: segments.at(-1).end, segments: [...segments] };
}

function normalizeSegments(value, transcript) {
  const list = Array.isArray(value) ? value : [];
  const normalized = list.map((raw, index) => {
    const start = positiveNumber(raw?.start ?? raw?.startSeconds ?? raw?.timestamp?.[0]) ?? index * 5;
    const end = positiveNumber(raw?.end ?? raw?.endSeconds ?? raw?.timestamp?.[1]) ?? start + 5;
    return {
      start: round2(Math.max(0, start)),
      end: round2(Math.max(start + 0.2, end)),
      text: cleanTranscript(raw?.text || raw?.transcript || ''),
      confidence: Number.isFinite(Number(raw?.confidence)) ? Number(raw.confidence) : null,
    };
  }).filter((segment) => segment.text);
  if (normalized.length) return normalized.sort((a, b) => a.start - b.start);
  const text = cleanTranscript(transcript);
  if (!text) return [];
  const sentences = text.split(/(?<=[.!?])\s+/u).filter(Boolean);
  return sentences.map((sentence, index) => ({ start: index * 6, end: (index + 1) * 6, text: sentence, confidence: null }));
}

function normalizeScoreBreakdown(raw = {}) {
  return {
    hook: clampInt(raw.hook, 0, 20),
    autonomy: clampInt(raw.autonomy, 0, 15),
    value: clampInt(raw.value, 0, 15),
    retention: clampInt(raw.retention, 0, 15),
    emotion: clampInt(raw.emotion, 0, 10),
    originality: clampInt(raw.originality, 0, 10),
    marketing: clampInt(raw.marketing, 0, 10),
    technical: clampInt(raw.technical, 0, 5),
  };
}

function scoreTotal(breakdown) {
  return Object.values(breakdown).reduce((sum, value) => sum + Number(value || 0), 0);
}

function inferFunnel(text) {
  const normalized = String(text || '').toLowerCase();
  if (/\b(offre|service|client|résultat|preuve|accompagnement|réserver|acheter|tarif|processus)\b/iu.test(normalized)) return 'BOFU';
  if (/\b(comment|méthode|étape|conseil|solution|comprendre|expliquer|éviter)\b/iu.test(normalized)) return 'MOFU';
  return 'TOFU';
}

function normalizeCaptionPreset(value, visual = {}) {
  const allowed = new Set(['neptune-contrast', 'neptune-light', 'neptune-boxed', 'neptune-premium']);
  const direct = String(value || '').toLowerCase();
  if (allowed.has(direct)) return direct;
  const luminance = numberOr(visual?.luminance, 0.5);
  const contrast = numberOr(visual?.contrast, 0.5);
  if (contrast < 0.32) return 'neptune-boxed';
  if (luminance < 0.38) return 'neptune-light';
  if (contrast > 0.65 && numberOr(visual?.motion, 0.3) < 0.35) return 'neptune-premium';
  return 'neptune-contrast';
}

function normalizeHashtags(value) {
  const raw = Array.isArray(value) ? value : String(value || '').split(/[\s,]+/u);
  const result = [];
  for (const item of raw) {
    const clean = `#${String(item || '').replace(/^#+/u, '').replace(/[^\p{L}\p{N}_]/gu, '')}`;
    if (clean.length > 2 && !result.includes(clean)) result.push(clean.slice(0, 60));
  }
  return result.slice(0, 6);
}

function buildPost(hook, description, cta, hashtags) {
  return [hook, description, cta, hashtags.join(' ')].filter(Boolean).join('\n\n').trim();
}

function parseModelJson(response) {
  if (!response) return null;
  if (typeof response === 'object' && !Array.isArray(response)) {
    if (response.response && typeof response.response === 'string') return safeJson(response.response);
    if (response.result && typeof response.result === 'object') return response.result;
    if (response.candidates) return response;
  }
  return safeJson(String(response));
}

function safeJson(value) {
  const text = String(value || '').trim().replace(/^```(?:json)?\s*/iu, '').replace(/\s*```$/u, '');
  try { return JSON.parse(text); } catch {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try { return JSON.parse(text.slice(start, end + 1)); } catch { return null; }
    }
    return null;
  }
}

function overlapRatio(a, b) {
  const intersection = Math.max(0, Math.min(a.endSeconds, b.endSeconds) - Math.max(a.startSeconds, b.startSeconds));
  return intersection / Math.max(1, Math.min(a.durationSeconds || a.endSeconds - a.startSeconds, b.durationSeconds || b.endSeconds - b.startSeconds));
}

function textSimilarity(a, b) {
  const left = new Set(tokens(a));
  const right = new Set(tokens(b));
  if (!left.size || !right.size) return 0;
  let shared = 0;
  for (const token of left) if (right.has(token)) shared += 1;
  return shared / Math.max(left.size, right.size);
}

function tokens(value) {
  return String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/gu, '').split(/[^a-z0-9]+/u).filter((token) => token.length > 3);
}

function maxRetainedClips(duration) {
  const minutes = Math.max(1, Number(duration || 0) / 60);
  return clampInt(Math.round(minutes / 2.5), 4, 36);
}

function titleFromTranscript(text) {
  const sentence = String(text || '').split(/[.!?]/u).find((item) => item.trim().length > 15) || String(text || 'Moment fort');
  return sentence.trim().replace(/^["'«»\s]+|["'«»\s]+$/gu, '').slice(0, 120) || 'Moment fort';
}

function fallbackRationale(breakdown) {
  const strongest = Object.entries(breakdown).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([key]) => ({ hook: 'accroche', autonomy: 'autonomie', value: 'valeur', retention: 'rétention', emotion: 'émotion', originality: 'originalité', marketing: 'utilité marketing', technical: 'qualité technique' })[key]);
  return `Passage retenu pour sa ${strongest.filter(Boolean).join(', sa ')} et sa compréhension sans contexte extérieur.`;
}

function ensureQuestion(value) {
  const text = cleanText(value, 280).replace(/[.!…]+$/u, '').trim();
  return `${text || 'Qu’en pensez-vous'} ?`.replace(/\s+\?/u, ' ?');
}

function cleanTranscript(value) {
  return String(value || '').replace(/<[^>]+>/gu, ' ').replace(/\s+/gu, ' ').trim().slice(0, 180000);
}

function cleanText(value, max = 400) {
  return String(value || '').replace(/[\u0000-\u001F\u007F]/gu, ' ').replace(/\s+/gu, ' ').trim().slice(0, max);
}

function cleanMultiline(value, max = 2200) {
  return String(value || '').replace(/\r/gu, '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/gu, '').split('\n').map((line) => line.trim()).join('\n').replace(/\n{3,}/gu, '\n\n').trim().slice(0, max);
}

function inferDuration(segments) { return segments.length ? segments.at(-1).end : 0; }
function positiveNumber(value) { const number = Number(value); return Number.isFinite(number) && number >= 0 ? number : null; }
function numberOr(value, fallback) { const number = Number(value); return Number.isFinite(number) ? number : fallback; }
function clampInt(value, min, max) { const number = Number(value); return Math.min(max, Math.max(min, Number.isFinite(number) ? Math.round(number) : min)); }
function clampNumber(value, min, max) { const number = Number(value); return Math.min(max, Math.max(min, Number.isFinite(number) ? number : min)); }
function round2(value) { return Math.round(Number(value || 0) * 100) / 100; }
function formatTime(seconds) { const total = Math.max(0, Math.round(Number(seconds || 0))); const minutes = Math.floor(total / 60); return `${String(minutes).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`; }
