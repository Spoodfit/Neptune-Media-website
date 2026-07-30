import { generateEditorialProposals } from './portal-editorial-ai-v2.js';
import { clientToken } from './portal-http-utils.js';
import { isSameOrigin, json } from './security.js';

const EDITORIAL_PATHS = new Set([
  '/api/client/editorial/context',
  '/api/client/editorial/generate',
  '/api/client/editorial/select',
  '/api/client/editorial/publish',
  '/api/client/content-calendar/reuse',
]);

export async function handleEditorialRoute(request, env, studio) {
  const url = new URL(request.url);
  if (!EDITORIAL_PATHS.has(url.pathname)) return null;

  if (url.pathname === '/api/client/editorial/context' && request.method === 'GET') {
    return editorialContext(request, studio);
  }
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, { Allow: 'GET, POST' });
  if (!isSameOrigin(request)) return json({ error: 'origin_forbidden' }, 403);

  if (url.pathname === '/api/client/editorial/generate') return generateEditorial(request, env, studio);
  if (url.pathname === '/api/client/editorial/select') return proxyPayload(request, studio, '/portal/editorial-select');
  if (url.pathname === '/api/client/editorial/publish') return proxyPayload(request, studio, '/portal/editorial-publish-log');
  return createEditorialReuse(request, env, studio);
}

async function editorialContext(request, studio) {
  const url = new URL(request.url);
  const response = await callStore(studio, '/portal/editorial-context', {
    token: clientToken(request),
    fileId: url.searchParams.get('fileId') || '',
    occurrenceId: url.searchParams.get('occurrenceId') || '',
  });
  return response;
}

async function generateEditorial(request, env, studio) {
  const payload = await request.json().catch(() => ({}));
  const token = clientToken(request);
  const contextResponse = await callStore(studio, '/portal/editorial-context', {
    token,
    fileId: payload.fileId,
    occurrenceId: payload.occurrenceId,
  });
  const context = await contextResponse.json().catch(() => ({}));
  if (!contextResponse.ok) return json(context, contextResponse.status);

  const cached = Array.isArray(context.editorial?.proposals) && context.editorial.proposals.length === 3;
  if (cached && payload.force !== true) return json({ ok: true, cached: true, ...context });

  const item = context.item || {};
  const occurrence = context.occurrence || null;
  const generated = await generateEditorialProposals(env, {
    ...item,
    filename: item.name,
    occurrenceId: occurrence?.occurrenceId || '',
    previousTitles: context.previousTitles || [],
    reuseIndex: occurrence?.useIndex || Math.max(1, Number(context.usageCount || 0) + 1),
    editorialContext: payload.editorialContext || item.editorialContext || '',
    sourceContext: item.aiDescription || '',
  });

  const saveResponse = await callStore(studio, '/portal/editorial-save-proposals', {
    token,
    payload: {
      fileId: item.fileId,
      occurrenceId: payload.occurrenceId || '',
      proposals: generated.proposals,
      selectedProposalId: generated.selectedProposalId,
      aiModel: generated.aiModel,
      generationStatus: generated.generationStatus,
      sourceContext: sourceLabel(item, payload),
    },
  });
  const saved = await saveResponse.json().catch(() => ({}));
  if (!saveResponse.ok) return json(saved, saveResponse.status);

  return json({
    ok: true,
    cached: false,
    item,
    occurrence,
    previousTitles: context.previousTitles || [],
    usageCount: context.usageCount || 0,
    nextReuseAt: context.nextReuseAt,
    minimumReuseDays: context.minimumReuseDays || 30,
    editorial: saved.editorial || {
      proposals: generated.proposals,
      selectedProposalId: generated.selectedProposalId,
      generationStatus: generated.generationStatus,
      aiModel: generated.aiModel,
    },
  });
}

async function createEditorialReuse(request, env, studio) {
  const payload = await request.json().catch(() => ({}));
  const token = clientToken(request);
  const contextResponse = await callStore(studio, '/portal/content-reuse-context', {
    token,
    payload: { fileId: payload.fileId },
  });
  const context = await contextResponse.json().catch(() => ({}));
  if (!contextResponse.ok || !context.item) return json(context, contextResponse.status);

  const item = context.item;
  const generated = await generateEditorialProposals(env, {
    ...item,
    filename: item.name,
    previousTitles: item.previousTitles || [],
    reuseIndex: item.reuseIndex || 2,
    editorialContext: [
      `Réutilisation n°${item.reuseIndex || 2} du même contenu, espacée d'au moins 30 jours.`,
      `Créer un angle, une promesse et une question différents des utilisations précédentes.`,
      payload.editorialContext || '',
    ].filter(Boolean).join(' '),
    sourceContext: item.aiDescription || '',
  });
  const selected = generated.proposals[0];
  const createResponse = await callStore(studio, '/portal/content-reuse-create', {
    token,
    payload: {
      fileId: item.fileId,
      publishAt: payload.publishAt || item.nextAllowedAt,
      networks: payload.networks,
      title: selected.hook,
      description: [selected.description, selected.cta].filter(Boolean).join('\n\n'),
      hashtags: selected.hashtags,
    },
  });
  const created = await createResponse.json().catch(() => ({}));
  if (!createResponse.ok || !created.occurrence) return json(created, createResponse.status);

  const saveResponse = await callStore(studio, '/portal/editorial-save-proposals', {
    token,
    payload: {
      fileId: item.fileId,
      occurrenceId: created.occurrence.occurrenceId,
      proposals: generated.proposals,
      selectedProposalId: generated.selectedProposalId,
      aiModel: generated.aiModel,
      generationStatus: generated.generationStatus,
      sourceContext: `Réutilisation ${item.reuseIndex || 2} · ${item.name || 'contenu Neptune Media'}`,
    },
  });
  const saved = await saveResponse.json().catch(() => ({}));
  if (!saveResponse.ok) return json({ ...created, editorialWarning: saved.error || 'editorial_save_failed' }, 200);

  return json({
    ...created,
    editorial: saved.editorial,
  });
}

async function proxyPayload(request, studio, path) {
  const payload = await request.json().catch(() => ({}));
  return callStore(studio, path, {
    token: clientToken(request),
    payload,
  });
}

function sourceLabel(item, payload) {
  if (payload.editorialContext) return 'Contexte éditorial fourni dans la demande.';
  if (item.aiDescription) return 'Contexte éditorial existant et métadonnées du contenu.';
  return 'Nom du fichier et contexte de l’entreprise, sans transcription complète.';
}

function callStore(studio, path, body) {
  return studio.fetch(`https://store${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
}
