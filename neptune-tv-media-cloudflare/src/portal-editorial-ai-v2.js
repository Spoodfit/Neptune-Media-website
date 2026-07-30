const DEFAULT_MODEL = '@cf/openai/gpt-oss-120b';
const LABELS = ['Directe et provocatrice', 'Drôle et situationnelle', 'Professionnelle et conversationnelle'];
const ANGLES = ['direct', 'humoristique', 'professionnel_conversationnel'];

export async function generateEditorialProposals(env, input = {}) {
  const fallback = fallbackProposals(input);
  if (!env.AI) {
    return {
      proposals: fallback,
      selectedProposalId: fallback[0].id,
      generationStatus: 'fallback',
      aiModel: 'deterministic-fallback',
      promptVersion: 'neptune-social-v2',
    };
  }

  const system = `Tu es le moteur éditorial de Neptune Media. Tu transformes un extrait vidéo professionnel en trois publications immédiatement publiables sur Instagram et LinkedIn.

DIRECTION ÉDITORIALE OBLIGATOIRE
- Applique la logique de communication de Burger King France : humour fondé sur une situation réelle, détournement intelligent, réactivité lorsqu'un fait actuel vérifié est fourni, audace maîtrisée, autodérision et conversation plutôt que publicité classique.
- Applique des mécanismes rédactionnels observables dans les meilleurs contenus marketing LinkedIn francophones : accroche orale ou provocatrice, phrases courtes, paragraphes aérés, contraste entre ce que les gens pensent et ce qui se passe réellement, opinion assumée, exemple concret, progression nette et question finale facile à commenter.
- Le résultat doit conserver une touche professionnelle et crédible.
- Ne copie aucune phrase existante et n'imite pas littéralement la voix d'une personne identifiable. Utilise uniquement les mécanismes éditoriaux décrits.

MISSION
Produis exactement trois compositions réellement différentes :
1. directe et provocatrice ;
2. drôle et fondée sur une situation concrète ;
3. professionnelle, humaine et conversationnelle.

Chaque composition contient obligatoirement :
- hook : une accroche qui interrompt le défilement par l'intrigue, le contraste, le choc maîtrisé ou l'humour ;
- description : un développement utile, fidèle au contenu, qui pousse l'audience à se reconnaître ou à prendre position ;
- cta : une question naturelle destinée aux commentaires ;
- hashtags : 3 à 6 hashtags précis et pertinents ;
- fullPost : hook, description, cta et hashtags assemblés avec des paragraphes aérés.

RÈGLES DE QUALITÉ
- Ne laisse jamais un champ vide.
- N'invente jamais une information absente du contexte.
- N'utilise une actualité que si elle est explicitement fournie dans les signaux vérifiés.
- Si la transcription est absente, reste volontairement prudent et base-toi sur le titre du fichier, le contexte de l'entreprise et l'angle éditorial fourni.
- Ne répète pas mot pour mot le nom du fichier dans les trois accroches.
- Évite les banalités du type « passez à l'action pour réussir » sans idée concrète.
- Ne commence pas par « Dans cette vidéo ».
- Le CTA est uniquement une question et se termine par un point d'interrogation.
- 0 à 3 emojis maximum par proposition. Aucun emoji n'est obligatoire.
- Les descriptions font entre 280 et 900 caractères, sauf si le contexte disponible est trop limité pour rester exact.
- Les trois angles doivent être nettement différents.
- Le texte doit être lisible sur mobile et naturel à voix haute.
- Ne cite pas Burger King ni une personne de référence dans le texte final, sauf si le sujet de la vidéo les concerne réellement.

Réponds uniquement avec un JSON strict de cette forme :
{"proposals":[{"id":"proposal_1","angle":"direct","label":"Directe et provocatrice","hook":"...","description":"...","cta":"...?","hashtags":["..."],"fullPost":"..."},{"id":"proposal_2","angle":"humoristique","label":"Drôle et situationnelle","hook":"...","description":"...","cta":"...?","hashtags":["..."],"fullPost":"..."},{"id":"proposal_3","angle":"professionnel_conversationnel","label":"Professionnelle et conversationnelle","hook":"...","description":"...","cta":"...?","hashtags":["..."],"fullPost":"..."}]}`;

  const sourceContext = buildSourceContext(input);
  const userPayload = {
    filename: clean(input.filename, 240),
    orderTitle: clean(input.orderTitle, 240),
    format: clean(input.format, 160),
    clientName: clean(input.clientName, 160),
    company: clean(input.company, 180),
    transcription: multiline(input.transcription || input.transcript || '', 12000),
    editorialContext: multiline(input.editorialContext || '', 4000),
    existingEditorialSummary: multiline(input.aiDescription || input.sourceContext || '', 3000),
    previousTitles: Array.isArray(input.previousTitles) ? input.previousTitles.slice(-8).map((value) => clean(value, 180)) : [],
    reuseIndex: Math.max(1, Number(input.reuseIndex || 1)),
    verifiedTrendSummary: clean(input.trendSummary, 1200),
    verifiedTrendSources: Array.isArray(input.trendSources) ? input.trendSources.slice(0, 12).map((value) => clean(value, 120)) : [],
    sourceContext,
  };

  try {
    const result = await env.AI.run(env.AI_MODEL || DEFAULT_MODEL, {
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: JSON.stringify(userPayload) },
      ],
      temperature: 0.62,
      max_tokens: 2600,
      response_format: { type: 'json_object' },
    });
    const content = result?.response || result?.result?.response || result?.choices?.[0]?.message?.content || '';
    const parsed = parseJsonObject(content);
    const proposals = normalizeProposals(parsed.proposals, fallback);
    return {
      proposals,
      selectedProposalId: proposals[0].id,
      generationStatus: 'generated',
      aiModel: env.AI_MODEL || DEFAULT_MODEL,
      promptVersion: 'neptune-social-v2',
    };
  } catch (error) {
    console.error('editorial_ai_v2_failed', {
      name: error?.name || 'Error',
      message: String(error?.message || error || 'unknown').slice(0, 500),
    });
    return {
      proposals: fallback,
      selectedProposalId: fallback[0].id,
      generationStatus: 'fallback',
      aiModel: env.AI_MODEL || DEFAULT_MODEL,
      promptVersion: 'neptune-social-v2',
    };
  }
}

function normalizeProposals(value, fallback) {
  const raw = Array.isArray(value) ? value : [];
  const normalized = [];
  for (let index = 0; index < 3; index += 1) {
    const item = raw[index] || fallback[index];
    const backup = fallback[index];
    const hook = clean(item?.hook, 180) || backup.hook;
    const description = multiline(item?.description, 1800) || backup.description;
    const cta = ensureQuestion(clean(item?.cta, 280) || backup.cta);
    const hashtags = normalizeHashtags(item?.hashtags, backup.hashtags);
    normalized.push({
      id: `proposal_${index + 1}`,
      angle: ANGLES[index],
      label: LABELS[index],
      hook,
      description,
      cta,
      hashtags,
      fullPost: buildPost(hook, description, cta, hashtags),
    });
  }
  return normalized;
}

function fallbackProposals(input) {
  const topic = topicFromInput(input);
  const company = clean(input.company, 120);
  const subject = topic || 'ce sujet';
  const directHook = `${capitalize(subject)} : le vrai risque, c’est d’attendre d’être parfaitement prêt.`;
  const humorousHook = `Le plan était simple : réfléchir encore un peu. Puis encore un peu. Puis ne rien publier.`;
  const professionalHook = `La clarté n’arrive pas toujours avant l’action. Souvent, elle arrive grâce à elle.`;
  const contextLine = company ? `Pour ${company}, comme pour beaucoup d’entreprises,` : 'Pour beaucoup d’entreprises,';

  return [
    proposal(0, directHook,
      `${contextLine} le blocage ne vient pas forcément d’un manque d’idées. Il vient souvent de la recherche de la formulation parfaite, du bon moment et de la certitude absolue.\n\nLe problème : pendant que tout est encore en validation, la visibilité reste à zéro. Une première publication utile donne déjà des retours, des objections et des pistes pour progresser.`,
      `Quelle décision repoussez-vous encore alors que vous avez déjà assez d’informations pour avancer ?`,
      tagsFor(input, ['communication', 'entrepreneuriat', 'passagealaction', 'marketing'])),
    proposal(1, humorousHook,
      `On connaît tous cette réunion où l’on cherche le mot parfait, la miniature parfaite et le créneau parfait. À la fin, le café est froid et la publication n’existe toujours pas.\n\nLa perfection rassure. Le test, lui, apprend quelque chose. Publier une version claire, observer les réactions et améliorer ensuite reste souvent plus rentable que de polir une idée invisible.`,
      `Vous êtes plutôt équipe « je publie et j’ajuste » ou équipe « encore une dernière modification » ?`,
      tagsFor(input, ['communication', 'humour', 'marketingdigital', 'creationdecontenu'])),
    proposal(2, professionalHook,
      `Agir vite ne signifie pas agir au hasard. Cela signifie définir une idée, une cible et un message suffisamment solides pour obtenir un retour réel.\n\nUne publication n’est pas un verdict définitif sur votre entreprise. C’est un point de contact. Plus il est clair, plus vous apprenez rapidement ce qui intéresse réellement votre audience.`,
      `Quel petit test pourriez-vous publier cette semaine pour mieux comprendre votre audience ?`,
      tagsFor(input, ['strategie', 'linkedin', 'instagram', 'communication'])),
  ];
}

function proposal(index, hook, description, cta, hashtags) {
  const safeCta = ensureQuestion(cta);
  return {
    id: `proposal_${index + 1}`,
    angle: ANGLES[index],
    label: LABELS[index],
    hook,
    description,
    cta: safeCta,
    hashtags,
    fullPost: buildPost(hook, description, safeCta, hashtags),
  };
}

function buildSourceContext(input) {
  const transcript = multiline(input.transcription || input.transcript || '', 12000);
  if (transcript) return `Transcription disponible (${transcript.length} caractères).`;
  const editorial = multiline(input.editorialContext || input.aiDescription || input.sourceContext || '', 4000);
  if (editorial) return `Contexte éditorial disponible (${editorial.length} caractères), sans transcription complète.`;
  return `Aucune transcription fournie. Génération prudente à partir du nom du contenu et du contexte de l’entreprise.`;
}

function topicFromInput(input) {
  const filename = String(input.filename || '').replace(/\.[a-z0-9]{2,5}$/iu, '').replace(/[_-]+/gu, ' ');
  const candidate = [input.editorialContext, input.orderTitle, filename]
    .map((value) => clean(value, 180)).filter(Boolean)[0] || 'ce sujet';
  return candidate.replace(/[.!?]+$/u, '').slice(0, 110);
}

function tagsFor(input, fallback) {
  const topic = topicFromInput(input).normalize('NFD').replace(/[\u0300-\u036f]/gu, '')
    .toLowerCase().split(/[^a-z0-9]+/u).filter((part) => part.length >= 5 && part.length <= 24);
  return normalizeHashtags([...topic.slice(0, 2), ...fallback], fallback);
}

function normalizeHashtags(value, fallback = []) {
  const values = Array.isArray(value) ? value : String(value || '').split(/[\s,]+/u);
  const cleaned = values.map((tag) => String(tag || '').trim().replace(/^#+/u, '').normalize('NFD')
    .replace(/[\u0300-\u036f]/gu, '').replace(/[^\p{L}\p{N}_]/gu, '').slice(0, 48)).filter(Boolean);
  const unique = [...new Set(cleaned)];
  const completed = unique.length >= 3 ? unique : [...new Set([...unique, ...fallback])];
  return completed.slice(0, 6);
}

function buildPost(hook, description, cta, hashtags) {
  return [hook, description, ensureQuestion(cta), normalizeHashtags(hashtags).map((tag) => `#${tag}`).join(' ')]
    .filter(Boolean).join('\n\n').slice(0, 3000);
}

function ensureQuestion(value) {
  const text = String(value || '').trim();
  return /\?$/u.test(text) ? text : `${text.replace(/[.!]+$/u, '')} ?`;
}

function multiline(value, limit) {
  return String(value || '').replace(/\r\n?/gu, '\n').replace(/[ \t]+/gu, ' ')
    .replace(/\n{3,}/gu, '\n\n').trim().slice(0, limit);
}

function clean(value, limit) {
  return String(value || '').replace(/\s+/gu, ' ').trim().slice(0, limit);
}

function capitalize(value) {
  const text = String(value || '');
  return text ? text[0].toUpperCase() + text.slice(1) : text;
}

function parseJsonObject(value) {
  if (value && typeof value === 'object') return value;
  const text = String(value || '').trim();
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/u);
    if (!match) return {};
    try { return JSON.parse(match[0]); } catch { return {}; }
  }
}
