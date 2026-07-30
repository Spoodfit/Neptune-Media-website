const MIN_SCORE = 60;
const MIN_DURATION = 18;
const MAX_DURATION = 90;

const TOFU = /\b(erreur|jamais|toujours|personne|tout le monde|incroyable|surpris|peur|frustr|problème|secret|contrairement|pourtant)\b/iu;
const MOFU = /\b(comment|méthode|étape|conseil|comprendre|solution|processus|éviter|apprendre|expliquer)\b/iu;
const BOFU = /\b(client|résultat|preuve|offre|service|accompagnement|acheter|réserver|décision|euros?|pourcent|avant|après)\b/iu;

export function normalizeTranscriptionResults(results) {
  const words = [];
  const textParts = [];
  for (const item of results) {
    const offset = Number(item.offsetSeconds || 0);
    const result = item.result || {};
    const text = clean(result.text);
    if (text) textParts.push(text);
    for (const chunk of Array.isArray(result.chunks) ? result.chunks : []) {
      const timestamp = Array.isArray(chunk.timestamp) ? chunk.timestamp : [];
      const start = Number(timestamp[0]);
      const end = Number(timestamp[1]);
      const word = clean(chunk.text);
      if (!word || !Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
      words.push({ start: round(start + offset), end: round(end + offset), text: word });
    }
  }
  words.sort((a, b) => a.start - b.start);
  return { transcript: clean(textParts.join(' ')), words };
}

export function buildLocalCandidates(words, durationSeconds, visualProfile = {}, objective = '') {
  const sentences = buildSentences(words);
  if (!sentences.length) return [];
  const raw = [];
  for (let startIndex = 0; startIndex < sentences.length; startIndex += 1) {
    const selected = [];
    let endIndex = startIndex;
    while (endIndex < sentences.length) {
      selected.push(sentences[endIndex]);
      const duration = selected.at(-1).end - selected[0].start;
      if (duration >= MIN_DURATION) {
        const text = clean(selected.map((sentence) => sentence.text).join(' '));
        const breakdown = scoreText(text, duration, visualProfile, objective);
        const score = Object.values(breakdown).reduce((sum, value) => sum + value, 0);
        if (score >= MIN_SCORE && text.split(/\s+/u).length >= 28) {
          const funnel = inferFunnel(text, objective);
          raw.push({
            id: crypto.randomUUID(),
            startSeconds: round(selected[0].start),
            endSeconds: round(selected.at(-1).end),
            durationSeconds: round(duration),
            title: titleFromText(text),
            funnel,
            score,
            scoreBreakdown: breakdown,
            rationale: rationaleFromBreakdown(breakdown, funnel),
            hookMoment: firstSentence(text),
            transcript: text,
            transcriptSegments: selected.map(({ start, end, text: sentenceText }) => ({ start, end, text: sentenceText })),
            captionPreset: captionPreset(visualProfile),
            editorialProposals: proposalsFor(text, funnel),
          });
        }
      }
      if (duration >= 64 || duration >= MAX_DURATION) break;
      endIndex += 1;
    }
  }
  return deduplicate(raw)
    .sort((a, b) => b.score - a.score || a.startSeconds - b.startSeconds)
    .slice(0, Math.max(4, Math.min(36, Math.ceil(Number(durationSeconds || 0) / 150))))
    .map((candidate, index) => ({ ...candidate, rank: index + 1 }));
}

export function mergeAssistedCandidates(localCandidates, assistedCandidates, durationSeconds) {
  const normalized = [...localCandidates];
  for (const raw of Array.isArray(assistedCandidates) ? assistedCandidates : []) {
    const start = Math.max(0, Number(raw.startSeconds || 0));
    const end = Math.min(Number(durationSeconds || Infinity), Number(raw.endSeconds || 0));
    if (!Number.isFinite(start) || !Number.isFinite(end) || end - start < MIN_DURATION || end - start > MAX_DURATION) continue;
    const score = Math.max(0, Math.min(100, Math.round(Number(raw.score || sumBreakdown(raw.scoreBreakdown)))));
    if (score < MIN_SCORE) continue;
    const proposals = normalizeProposals(raw.editorialProposals, raw.transcript || raw.hookMoment || raw.title, raw.funnel);
    normalized.push({
      ...raw,
      id: String(raw.id || crypto.randomUUID()),
      startSeconds: round(start),
      endSeconds: round(end),
      durationSeconds: round(end - start),
      score,
      funnel: ['TOFU', 'MOFU', 'BOFU'].includes(String(raw.funnel).toUpperCase()) ? String(raw.funnel).toUpperCase() : inferFunnel(raw.transcript || '', ''),
      editorialProposals: proposals,
    });
  }
  return deduplicate(normalized)
    .sort((a, b) => b.score - a.score || a.startSeconds - b.startSeconds)
    .slice(0, Math.max(4, Math.min(36, Math.ceil(Number(durationSeconds || 0) / 150))))
    .map((candidate, index) => ({ ...candidate, rank: index + 1 }));
}

function buildSentences(words) {
  const sentences = [];
  let current = [];
  for (const word of words) {
    const previous = current.at(-1);
    const gap = previous ? word.start - previous.end : 0;
    if (current.length && gap > 1.15) flush();
    current.push(word);
    if (/[.!?…][”’"']?$/u.test(word.text) || current.length >= 38) flush();
  }
  flush();
  return sentences;

  function flush() {
    if (!current.length) return;
    sentences.push({ start: current[0].start, end: current.at(-1).end, text: clean(current.map((item) => item.text).join(' ')) });
    current = [];
  }
}

function scoreText(text, duration, visual, objective) {
  const question = /\?/u.test(text);
  const contrast = TOFU.test(text);
  const method = MOFU.test(text);
  const proof = BOFU.test(text);
  const emotion = /\b(peur|envie|frustr|fatigu|fier|heureux|difficile|incroyable|surpris|colère|honte)\b/iu.test(text);
  const numbers = /\b\d+[\d ,.]*\b/u.test(text);
  const words = text.split(/\s+/u).filter(Boolean).length;
  const density = Math.min(1, words / Math.max(1, duration) / 2.7);
  const technical = Number.isFinite(Number(visual.technicalQuality)) ? Number(visual.technicalQuality) : 0.78;
  const objectiveBoost = inferFunnel(text, objective) === objectiveFunnel(objective) ? 1 : 0;
  return {
    hook: clamp(10 + (contrast ? 5 : 0) + (question ? 2 : 0) + (numbers ? 2 : 0), 0, 20),
    autonomy: clamp(11 + (/[.!?…]$/u.test(text) ? 3 : 0), 0, 15),
    value: clamp(8 + (method ? 4 : 0) + (proof ? 3 : 0), 0, 15),
    retention: clamp(8 + Math.round(density * 4) + (contrast ? 2 : 0), 0, 15),
    emotion: clamp(4 + (emotion ? 4 : 0) + (question ? 1 : 0), 0, 10),
    originality: clamp(5 + (contrast ? 3 : 0) + (numbers ? 1 : 0), 0, 10),
    marketing: clamp(5 + (proof ? 3 : 0) + objectiveBoost, 0, 10),
    technical: clamp(Math.round(technical * 5), 0, 5),
  };
}

function inferFunnel(text, objective) {
  const scores = {
    TOFU: (text.match(new RegExp(TOFU.source, 'giu')) || []).length + (objectiveFunnel(objective) === 'TOFU' ? 2 : 0),
    MOFU: (text.match(new RegExp(MOFU.source, 'giu')) || []).length + (objectiveFunnel(objective) === 'MOFU' ? 2 : 0),
    BOFU: (text.match(new RegExp(BOFU.source, 'giu')) || []).length + (objectiveFunnel(objective) === 'BOFU' ? 2 : 0),
  };
  return Object.entries(scores).sort((a, b) => b[1] - a[1])[0][0];
}

function objectiveFunnel(objective) {
  if (/TOFU|visibil|portée/iu.test(objective)) return 'TOFU';
  if (/MOFU|expertise|méthode/iu.test(objective)) return 'MOFU';
  if (/BOFU|conversion|preuve/iu.test(objective)) return 'BOFU';
  return '';
}

function proposalsFor(text, funnel) {
  const hook = firstSentence(text).replace(/[.!?…]+$/u, '');
  const context = text.length > 420 ? `${text.slice(0, 417).trim()}…` : text;
  const topic = titleFromText(text).toLowerCase();
  return normalizeProposals([
    { id: 'direct', label: 'Directe et provocante', hook: hook || `On vous a mal expliqué ${topic}.`, description: context, cta: 'Vous êtes plutôt d’accord ou pas du tout ?', hashtags: hashtags(funnel, 'direct') },
    { id: 'humour', label: 'Humoristique et situationnelle', hook: `Le moment où ${topic} décide enfin de dire la vérité.`, description: `${context}\n\nComme quoi, le sujet était moins compliqué qu’on voulait nous le faire croire.`, cta: 'Ça vous est déjà arrivé aussi ?', hashtags: hashtags(funnel, 'humour') },
    { id: 'expertise', label: 'Professionnelle et conversationnelle', hook: `Ce qu’il faut réellement comprendre sur ${topic}.`, description: `${context}\n\nUn point concret à intégrer dans votre réflexion, sans théorie inutile.`, cta: 'Quelle partie mérite selon vous d’être approfondie ?', hashtags: hashtags(funnel, 'expertise') },
  ], text, funnel);
}

function normalizeProposals(value, text, funnel) {
  const byId = new Map((Array.isArray(value) ? value : []).map((item) => [String(item?.id || ''), item]));
  const fallback = proposalsFallback(text, funnel);
  return ['direct', 'humour', 'expertise'].map((id) => {
    const raw = byId.get(id) || fallback[id];
    const hook = clean(raw.hook) || fallback[id].hook;
    const description = clean(raw.description) || fallback[id].description;
    const cta = ensureQuestion(raw.cta || fallback[id].cta);
    const tags = (Array.isArray(raw.hashtags) ? raw.hashtags : fallback[id].hashtags).map((tag) => String(tag).startsWith('#') ? String(tag) : `#${tag}`).slice(0, 6);
    return { id, label: fallback[id].label, hook, description, cta, hashtags: tags, fullPost: [hook, description, cta, tags.join(' ')].filter(Boolean).join('\n\n') };
  });
}

function proposalsFallback(text, funnel) {
  const title = titleFromText(text).toLowerCase();
  return {
    direct: { label: 'Directe et provocante', hook: firstSentence(text) || `Arrêtez de compliquer ${title}.`, description: clean(text).slice(0, 500), cta: 'Vous partagez ce constat ?', hashtags: hashtags(funnel, 'direct') },
    humour: { label: 'Humoristique et situationnelle', hook: `Quand ${title} devient soudain beaucoup plus clair.`, description: clean(text).slice(0, 500), cta: 'Qui s’est déjà reconnu dans cette situation ?', hashtags: hashtags(funnel, 'humour') },
    expertise: { label: 'Professionnelle et conversationnelle', hook: `Le point essentiel à retenir sur ${title}.`, description: clean(text).slice(0, 500), cta: 'Quelle serait votre prochaine étape ?', hashtags: hashtags(funnel, 'expertise') },
  };
}

function hashtags(funnel, angle) { return ['#NeptuneMedia', `#${funnel}`, angle === 'expertise' ? '#Expertise' : angle === 'humour' ? '#Communication' : '#Business']; }
function captionPreset(visual) { const luminance = Number(visual.luminance ?? 0.5); const contrast = Number(visual.contrast ?? 0.5); return contrast < 0.28 ? 'neptune-boxed' : luminance < 0.38 ? 'neptune-light' : luminance > 0.76 ? 'neptune-premium' : 'neptune-contrast'; }
function rationaleFromBreakdown(breakdown, funnel) { const leaders = Object.entries(breakdown).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([key]) => ({ hook: 'accroche', autonomy: 'autonomie', value: 'valeur', retention: 'rétention', emotion: 'émotion', originality: 'originalité', marketing: 'utilité marketing', technical: 'qualité technique' })[key] || key); return `Passage ${funnel} retenu pour sa ${leaders.join(' et sa ')}.`; }
function deduplicate(candidates) { const kept = []; for (const candidate of candidates) { if (kept.some((item) => overlap(item, candidate) > 0.58 || similarity(item.transcript, candidate.transcript) > 0.72)) continue; kept.push(candidate); } return kept; }
function overlap(a, b) { const intersection = Math.max(0, Math.min(a.endSeconds, b.endSeconds) - Math.max(a.startSeconds, b.startSeconds)); return intersection / Math.max(1, Math.min(a.durationSeconds, b.durationSeconds)); }
function similarity(a, b) { const left = new Set(tokens(a)); const right = new Set(tokens(b)); const intersection = [...left].filter((token) => right.has(token)).length; return intersection / Math.max(1, Math.min(left.size, right.size)); }
function tokens(value) { return clean(value).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/gu, '').split(/[^a-z0-9]+/u).filter((token) => token.length > 3); }
function titleFromText(text) { const words = clean(text).replace(/[.!?…]/gu, '').split(/\s+/u).filter(Boolean).slice(0, 9); return words.join(' ') || 'Short Neptune'; }
function firstSentence(text) { return clean(text).split(/(?<=[.!?…])\s+/u)[0]?.slice(0, 220) || ''; }
function ensureQuestion(value) { const text = clean(value).replace(/[.!]+$/u, ''); return `${text || 'Qu’en pensez-vous'}?`; }
function sumBreakdown(value) { return value && typeof value === 'object' ? Object.values(value).reduce((sum, item) => sum + Number(item || 0), 0) : 0; }
function clean(value) { return String(value ?? '').replace(/\s+/gu, ' ').trim(); }
function clamp(value, min, max) { return Math.max(min, Math.min(max, Math.round(Number(value || 0)))); }
function round(value) { return Math.round(Number(value || 0) * 1000) / 1000; }
