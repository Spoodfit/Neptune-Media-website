import { StudioStore as LegacyStore } from './store-v7.js';
import { requireClient } from './portal-auth.js';
import { ensurePortalSchema } from './portal-schema.js';
import { json, sanitizeText } from './security.js';

const EDITORIAL_PATHS = new Set([
  '/portal/editorial-context',
  '/portal/editorial-save-proposals',
  '/portal/editorial-select',
  '/portal/editorial-publish-log',
]);
const SOCIAL_PLATFORMS = new Set(['instagram', 'linkedin', 'tiktok', 'youtube']);

export class StudioStore extends LegacyStore {
  async fetch(request) {
    const url = new URL(request.url);
    const method = request.method.toUpperCase();
    if (method === 'POST' && EDITORIAL_PATHS.has(url.pathname)) {
      const body = await request.clone().json().catch(() => ({}));
      try {
        ensurePortalSchema(this);
        this.ensureEditorialSchema();
        if (url.pathname === '/portal/editorial-context') return await this.editorialContext(body);
        if (url.pathname === '/portal/editorial-save-proposals') return await this.editorialSaveProposals(body);
        if (url.pathname === '/portal/editorial-select') return await this.editorialSelect(body);
        return await this.editorialPublishLog(body);
      } catch (error) {
        console.error('editorial_store_v8_failed', {
          path: url.pathname,
          name: error?.name || 'Error',
          message: String(error?.message || error || 'unknown').slice(0, 500),
        });
        return json({ error: 'editorial_operation_failed' }, 500);
      }
    }
    return super.fetch(request);
  }

  ensureEditorialSchema() {
    if (this.editorialSchemaReady) return;
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS portal_editorial_drafts(
        scope_type TEXT NOT NULL,
        scope_id TEXT NOT NULL,
        file_id TEXT NOT NULL,
        occurrence_id TEXT NOT NULL DEFAULT '',
        proposals TEXT NOT NULL DEFAULT '[]',
        selected_proposal_id TEXT NOT NULL DEFAULT '',
        final_hook TEXT NOT NULL DEFAULT '',
        final_description TEXT NOT NULL DEFAULT '',
        final_cta TEXT NOT NULL DEFAULT '',
        final_hashtags TEXT NOT NULL DEFAULT '[]',
        final_post TEXT NOT NULL DEFAULT '',
        prompt_version TEXT NOT NULL DEFAULT 'neptune-social-v2',
        ai_model TEXT NOT NULL DEFAULT '',
        generation_status TEXT NOT NULL DEFAULT 'pending',
        source_context TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY(scope_type,scope_id)
      );
      CREATE INDEX IF NOT EXISTS idx_portal_editorial_file ON portal_editorial_drafts(file_id,updated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_portal_editorial_occurrence ON portal_editorial_drafts(occurrence_id,updated_at DESC);
    `);
    this.editorialSchemaReady = true;
  }

  async editorialContext(body) {
    const client = await requireClient(this, body.token);
    if (!client) return json({ error: 'unauthorized' }, 401);
    const requestedFileId = sanitizeText(body.fileId, 100);
    const requestedOccurrenceId = sanitizeText(body.occurrenceId, 100);

    let occurrence = null;
    let fileId = requestedFileId;
    if (requestedOccurrenceId) {
      occurrence = this.sql.exec(`
        SELECT x.id AS occurrenceId,x.file_id AS fileId,x.order_id AS orderId,x.publish_at AS publishAt,
               x.network,x.status,x.title,x.description,x.hashtags,x.caption,x.use_index AS useIndex,
               x.created_at AS createdAt,x.updated_at AS updatedAt
        FROM portal_content_occurrences x
        JOIN portal_orders o ON o.id=x.order_id
        WHERE x.id=? AND o.client_id=? LIMIT 1
      `, requestedOccurrenceId, client.id).toArray()[0] || null;
      if (!occurrence) return json({ error: 'content_not_found' }, 404);
      fileId = occurrence.fileId;
      occurrence = normalizeOccurrence(occurrence);
    }

    const item = this.sql.exec(`
      SELECT f.id AS fileId,f.name,f.file_type AS fileType,f.size_label AS sizeLabel,f.created_at AS createdAt,
             o.id AS orderId,o.title AS orderTitle,o.format,o.filming_at AS filmingAt,
             c.full_name AS clientName,c.company,
             a.title AS aiTitle,a.description AS aiDescription,a.hashtags AS aiHashtags,
             a.trend_sources AS trendSources,a.trend_summary AS trendSummary,
             a.generation_status AS legacyGenerationStatus,a.ai_model AS legacyAiModel,
             s.id AS scheduleId,s.publish_at AS scheduledAt,s.network AS scheduledNetworks
      FROM portal_files f
      JOIN portal_orders o ON o.id=f.order_id
      JOIN portal_clients c ON c.id=o.client_id
      LEFT JOIN portal_content_ai a ON a.file_id=f.id
      LEFT JOIN portal_content_schedule s ON s.file_id=f.id
      WHERE f.id=? AND o.client_id=? LIMIT 1
    `, fileId, client.id).toArray()[0];
    if (!item) return json({ error: 'content_not_found' }, 404);

    if (!occurrence) {
      const primary = this.sql.exec(`
        SELECT id AS occurrenceId,file_id AS fileId,order_id AS orderId,publish_at AS publishAt,
               network,status,title,description,hashtags,caption,use_index AS useIndex,created_at AS createdAt,updated_at AS updatedAt
        FROM portal_content_occurrences WHERE file_id=? ORDER BY publish_at ASC LIMIT 1
      `, item.fileId).toArray()[0];
      occurrence = primary ? normalizeOccurrence(primary) : null;
    }

    const scopeType = requestedOccurrenceId ? 'occurrence' : 'file';
    const scopeId = requestedOccurrenceId || item.fileId;
    let draft = this.readEditorialDraft(scopeType, scopeId);
    if (!draft && requestedOccurrenceId) draft = this.readEditorialDraft('file', item.fileId);

    const previousTitles = this.sql.exec(`
      SELECT title FROM portal_content_occurrences WHERE file_id=? AND title<>'' ORDER BY publish_at ASC
    `, item.fileId).toArray().map((row) => row.title).filter(Boolean).slice(-8);
    const usageCount = Number(this.sql.exec(
      'SELECT COUNT(*) AS count FROM portal_content_occurrences WHERE file_id=?',
      item.fileId,
    ).one().count || 0);
    const nextReuseAt = nextReusableAt(this, item.fileId);

    const legacyHashtags = parseArray(item.aiHashtags);
    const legacyCopy = splitLegacyDescription(occurrence?.description || item.aiDescription || '');
    const editorial = draft || {
      proposals: [],
      selectedProposalId: '',
      finalHook: occurrence?.title || item.aiTitle || cleanFilename(item.name),
      finalDescription: legacyCopy.description,
      finalCta: legacyCopy.cta,
      finalHashtags: occurrence?.hashtags?.length ? occurrence.hashtags : legacyHashtags,
      finalPost: occurrence?.caption || buildPost(
        occurrence?.title || item.aiTitle || cleanFilename(item.name),
        legacyCopy.description,
        legacyCopy.cta,
        occurrence?.hashtags?.length ? occurrence.hashtags : legacyHashtags,
      ),
      promptVersion: 'neptune-social-v2',
      aiModel: item.legacyAiModel || '',
      generationStatus: item.legacyGenerationStatus || 'missing',
      sourceContext: item.aiDescription || '',
      updatedAt: null,
    };

    return json({
      ok: true,
      item: {
        ...item,
        aiHashtags: legacyHashtags,
        trendSources: parseArray(item.trendSources),
        downloadUrl: `/api/client/files/${encodeURIComponent(item.fileId)}?download=1`,
        previewUrl: `/api/client/files/${encodeURIComponent(item.fileId)}?inline=1`,
        scheduledNetworks: normalizeNetworks(item.scheduledNetworks),
      },
      occurrence,
      editorial,
      previousTitles,
      usageCount,
      nextReuseAt,
      minimumReuseDays: 30,
    });
  }

  async editorialSaveProposals(body) {
    const client = await requireClient(this, body.token);
    if (!client) return json({ error: 'unauthorized' }, 401);
    const payload = body.payload && typeof body.payload === 'object' ? body.payload : {};
    const fileId = sanitizeText(payload.fileId, 100);
    const occurrenceId = sanitizeText(payload.occurrenceId, 100);
    const owned = this.ownedEditorialTarget(client.id, fileId, occurrenceId);
    if (!owned) return json({ error: 'content_not_found' }, 404);

    const proposals = normalizeProposals(payload.proposals);
    if (proposals.length !== 3) return json({ error: 'invalid_editorial_proposals' }, 400);
    const selected = proposals.find((proposal) => proposal.id === payload.selectedProposalId) || proposals[0];
    const now = new Date().toISOString();
    const scopeType = occurrenceId ? 'occurrence' : 'file';
    const scopeId = occurrenceId || fileId;
    const model = sanitizeText(payload.aiModel, 120);
    const status = sanitizeText(payload.generationStatus, 40) || 'generated';
    const sourceContext = sanitizeText(payload.sourceContext, 3000);

    this.sql.exec(`
      INSERT INTO portal_editorial_drafts(
        scope_type,scope_id,file_id,occurrence_id,proposals,selected_proposal_id,
        final_hook,final_description,final_cta,final_hashtags,final_post,
        prompt_version,ai_model,generation_status,source_context,created_at,updated_at
      ) VALUES(?,?,?,?,?,?,?,?,?,?,?,'neptune-social-v2',?,?,?,?,?)
      ON CONFLICT(scope_type,scope_id) DO UPDATE SET
        proposals=excluded.proposals,selected_proposal_id=excluded.selected_proposal_id,
        final_hook=excluded.final_hook,final_description=excluded.final_description,final_cta=excluded.final_cta,
        final_hashtags=excluded.final_hashtags,final_post=excluded.final_post,
        prompt_version=excluded.prompt_version,ai_model=excluded.ai_model,generation_status=excluded.generation_status,
        source_context=excluded.source_context,updated_at=excluded.updated_at
    `,
    scopeType, scopeId, fileId, occurrenceId, JSON.stringify(proposals), selected.id,
    selected.hook, selected.description, selected.cta, JSON.stringify(selected.hashtags), selected.fullPost,
    model, status, sourceContext, now, now);

    if (!occurrenceId) {
      const combined = joinDescription(selected.description, selected.cta);
      this.sql.exec(`
        INSERT INTO portal_content_ai(
          file_id,order_id,title,description,hashtags,trend_sources,trend_summary,ai_model,
          generation_status,prompt_version,created_at,updated_at
        ) VALUES(?,?,?,?,?,'[]','',?,?,'neptune-social-v2',?,?)
        ON CONFLICT(file_id) DO UPDATE SET title=excluded.title,description=excluded.description,
          hashtags=excluded.hashtags,ai_model=excluded.ai_model,generation_status=excluded.generation_status,
          prompt_version=excluded.prompt_version,updated_at=excluded.updated_at
      `, fileId, owned.orderId, selected.hook, combined, JSON.stringify(selected.hashtags), model, status, now, now);
    }

    return json({
      ok: true,
      editorial: this.readEditorialDraft(scopeType, scopeId),
    });
  }

  async editorialSelect(body) {
    const client = await requireClient(this, body.token);
    if (!client) return json({ error: 'unauthorized' }, 401);
    const payload = body.payload && typeof body.payload === 'object' ? body.payload : {};
    const fileId = sanitizeText(payload.fileId, 100);
    const occurrenceId = sanitizeText(payload.occurrenceId, 100);
    const owned = this.ownedEditorialTarget(client.id, fileId, occurrenceId);
    if (!owned) return json({ error: 'content_not_found' }, 404);

    const hook = sanitizeText(payload.hook, 180);
    const description = sanitizeMultiline(payload.description, 1800);
    const cta = ensureQuestion(sanitizeText(payload.cta, 280));
    const hashtags = normalizeHashtags(payload.hashtags);
    if (!hook || !description || !cta || hashtags.length < 3) return json({ error: 'editorial_fields_incomplete' }, 400);
    const finalPost = buildPost(hook, description, cta, hashtags);
    const selectedProposalId = sanitizeText(payload.selectedProposalId, 80) || 'custom';
    const scopeType = occurrenceId ? 'occurrence' : 'file';
    const scopeId = occurrenceId || fileId;
    const existing = this.readEditorialDraft(scopeType, scopeId) || this.readEditorialDraft('file', fileId);
    const proposals = existing?.proposals || [];
    const now = new Date().toISOString();

    this.sql.exec(`
      INSERT INTO portal_editorial_drafts(
        scope_type,scope_id,file_id,occurrence_id,proposals,selected_proposal_id,
        final_hook,final_description,final_cta,final_hashtags,final_post,
        prompt_version,ai_model,generation_status,source_context,created_at,updated_at
      ) VALUES(?,?,?,?,?,?,?,?,?,?,?,'neptune-social-v2',?,'selected','',?,?)
      ON CONFLICT(scope_type,scope_id) DO UPDATE SET
        selected_proposal_id=excluded.selected_proposal_id,final_hook=excluded.final_hook,
        final_description=excluded.final_description,final_cta=excluded.final_cta,
        final_hashtags=excluded.final_hashtags,final_post=excluded.final_post,
        generation_status='selected',updated_at=excluded.updated_at
    `,
    scopeType, scopeId, fileId, occurrenceId, JSON.stringify(proposals), selectedProposalId,
    hook, description, cta, JSON.stringify(hashtags), finalPost, existing?.aiModel || '', now, now);

    const combined = joinDescription(description, cta);
    if (occurrenceId) {
      const publishAt = normalizeIso(payload.publishAt) || owned.publishAt;
      const networks = normalizeNetworks(payload.networks?.length ? payload.networks : owned.network);
      this.sql.exec(`
        UPDATE portal_content_occurrences
        SET publish_at=?,network=?,title=?,description=?,hashtags=?,caption=?,status='ready',updated_at=?
        WHERE id=?
      `, publishAt, networks.join(','), hook, combined, JSON.stringify(hashtags), finalPost, now, occurrenceId);
      if (owned.sourceScheduleId) {
        this.sql.exec(`
          UPDATE portal_content_schedule SET publish_at=?,network=?,caption=?,updated_at=? WHERE id=?
        `, publishAt, networks.join(','), finalPost, now, owned.sourceScheduleId);
      }
    } else {
      this.sql.exec(`
        INSERT INTO portal_content_ai(
          file_id,order_id,title,description,hashtags,trend_sources,trend_summary,ai_model,
          generation_status,prompt_version,created_at,updated_at
        ) VALUES(?,?,?,?,?,'[]','',?,'selected','neptune-social-v2',?,?)
        ON CONFLICT(file_id) DO UPDATE SET title=excluded.title,description=excluded.description,
          hashtags=excluded.hashtags,generation_status='selected',prompt_version='neptune-social-v2',updated_at=excluded.updated_at
      `, fileId, owned.orderId, hook, combined, JSON.stringify(hashtags), existing?.aiModel || '', now, now);
    }

    return json({
      ok: true,
      fileId,
      occurrenceId: occurrenceId || null,
      selectedProposalId,
      hook,
      description,
      cta,
      hashtags,
      finalPost,
      publishAt: occurrenceId ? normalizeIso(payload.publishAt) || owned.publishAt : null,
      networks: occurrenceId ? normalizeNetworks(payload.networks?.length ? payload.networks : owned.network) : [],
      updatedAt: now,
    });
  }

  async editorialPublishLog(body) {
    const client = await requireClient(this, body.token);
    if (!client) return json({ error: 'unauthorized' }, 401);
    const payload = body.payload && typeof body.payload === 'object' ? body.payload : {};
    const occurrenceId = sanitizeText(payload.occurrenceId, 100);
    const platform = sanitizeText(payload.platform, 30).toLowerCase();
    if (!occurrenceId || !SOCIAL_PLATFORMS.has(platform)) return json({ error: 'invalid_publication_log' }, 400);
    const owned = this.sql.exec(`
      SELECT x.id FROM portal_content_occurrences x JOIN portal_orders o ON o.id=x.order_id
      WHERE x.id=? AND o.client_id=? LIMIT 1
    `, occurrenceId, client.id).toArray()[0];
    if (!owned) return json({ error: 'content_not_found' }, 404);
    const now = new Date().toISOString();
    this.sql.exec(`
      INSERT INTO portal_content_occurrence_publications(
        id,occurrence_id,platform,status,published_url,published_at,created_at,updated_at
      ) VALUES(?,?,?,'prepared','',NULL,?,?)
      ON CONFLICT(occurrence_id,platform) DO UPDATE SET status='prepared',updated_at=excluded.updated_at
    `, crypto.randomUUID(), occurrenceId, platform, now, now);
    return json({ ok: true, occurrenceId, platform, status: 'prepared', updatedAt: now });
  }

  ownedEditorialTarget(clientId, fileId, occurrenceId) {
    if (occurrenceId) {
      return this.sql.exec(`
        SELECT x.id AS occurrenceId,x.file_id AS fileId,x.order_id AS orderId,x.publish_at AS publishAt,
               x.network,x.source_schedule_id AS sourceScheduleId
        FROM portal_content_occurrences x JOIN portal_orders o ON o.id=x.order_id
        WHERE x.id=? AND x.file_id=? AND o.client_id=? LIMIT 1
      `, occurrenceId, fileId, clientId).toArray()[0] || null;
    }
    return this.sql.exec(`
      SELECT f.id AS fileId,f.order_id AS orderId FROM portal_files f
      JOIN portal_orders o ON o.id=f.order_id WHERE f.id=? AND o.client_id=? LIMIT 1
    `, fileId, clientId).toArray()[0] || null;
  }

  readEditorialDraft(scopeType, scopeId) {
    const row = this.sql.exec(`
      SELECT proposals,selected_proposal_id AS selectedProposalId,final_hook AS finalHook,
             final_description AS finalDescription,final_cta AS finalCta,final_hashtags AS finalHashtags,
             final_post AS finalPost,prompt_version AS promptVersion,ai_model AS aiModel,
             generation_status AS generationStatus,source_context AS sourceContext,updated_at AS updatedAt
      FROM portal_editorial_drafts WHERE scope_type=? AND scope_id=? LIMIT 1
    `, scopeType, scopeId).toArray()[0];
    if (!row) return null;
    return {
      ...row,
      proposals: normalizeProposals(parseArray(row.proposals)),
      finalHashtags: parseArray(row.finalHashtags),
    };
  }
}

function normalizeOccurrence(row) {
  return {
    ...row,
    hashtags: parseArray(row.hashtags),
    networks: normalizeNetworks(row.network),
  };
}

function normalizeProposals(value) {
  const values = Array.isArray(value) ? value : [];
  return values.slice(0, 3).map((item, index) => {
    const hook = sanitizeText(item?.hook, 180);
    const description = sanitizeMultiline(item?.description, 1800);
    const cta = ensureQuestion(sanitizeText(item?.cta, 280));
    const hashtags = normalizeHashtags(item?.hashtags);
    return {
      id: sanitizeText(item?.id, 80) || `proposal_${index + 1}`,
      angle: sanitizeText(item?.angle, 80) || ['direct', 'humoristique', 'professionnel_conversationnel'][index],
      label: sanitizeText(item?.label, 100) || ['Directe', 'Drôle', 'Professionnelle'][index],
      hook,
      description,
      cta,
      hashtags,
      fullPost: buildPost(hook, description, cta, hashtags),
    };
  }).filter((item) => item.hook && item.description && item.cta && item.hashtags.length >= 3);
}

function normalizeHashtags(value) {
  const values = Array.isArray(value) ? value : String(value || '').split(/[\s,]+/u);
  const cleaned = values.map((tag) => String(tag || '').trim().replace(/^#+/u, '').normalize('NFD')
    .replace(/[\u0300-\u036f]/gu, '').replace(/[^\p{L}\p{N}_]/gu, '').slice(0, 48)).filter(Boolean);
  return [...new Set(cleaned)].slice(0, 6);
}

function normalizeNetworks(value) {
  const values = Array.isArray(value) ? value : String(value || '').split(',');
  const cleaned = values.map((item) => String(item || '').trim().toLowerCase()).filter((item) => SOCIAL_PLATFORMS.has(item));
  return [...new Set(cleaned.length ? cleaned : ['instagram', 'linkedin'])];
}

function parseArray(value) {
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(String(value || '[]'));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function sanitizeMultiline(value, limit) {
  return String(value || '').replace(/\r\n?/gu, '\n').replace(/[ \t]+/gu, ' ')
    .replace(/\n{3,}/gu, '\n\n').trim().slice(0, limit);
}

function ensureQuestion(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  return /\?$/u.test(text) ? text : `${text.replace(/[.!]+$/u, '')} ?`;
}

function buildPost(hook, description, cta, hashtags) {
  return [hook, description, cta, normalizeHashtags(hashtags).map((tag) => `#${tag}`).join(' ')]
    .filter(Boolean).join('\n\n').slice(0, 3000);
}

function joinDescription(description, cta) {
  return [sanitizeMultiline(description, 1800), ensureQuestion(cta)].filter(Boolean).join('\n\n').slice(0, 1800);
}

function splitLegacyDescription(value) {
  const text = sanitizeMultiline(value, 1800);
  if (!text) return { description: '', cta: '' };
  const blocks = text.split(/\n\s*\n/gu).filter(Boolean);
  const last = blocks.at(-1) || '';
  if (/\?$/u.test(last)) return { description: blocks.slice(0, -1).join('\n\n'), cta: last };
  const match = text.match(/([^?]{8,280}\?)\s*$/u);
  if (!match) return { description: text, cta: '' };
  return { description: text.slice(0, match.index).trim(), cta: match[1].trim() };
}

function cleanFilename(value) {
  return String(value || '').replace(/\.[a-z0-9]{2,5}$/iu, '').replace(/[_-]+/gu, ' ').replace(/\s+/gu, ' ').trim();
}

function normalizeIso(value) {
  const date = new Date(value || '');
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function nextReusableAt(store, fileId) {
  const last = store.sql.exec(`
    SELECT publish_at AS publishAt FROM portal_content_occurrences WHERE file_id=? ORDER BY publish_at DESC LIMIT 1
  `, fileId).toArray()[0]?.publishAt;
  const base = last ? new Date(last) : new Date();
  if (Number.isNaN(base.getTime())) return new Date().toISOString();
  if (last) base.setUTCDate(base.getUTCDate() + 30);
  return base.toISOString();
}
