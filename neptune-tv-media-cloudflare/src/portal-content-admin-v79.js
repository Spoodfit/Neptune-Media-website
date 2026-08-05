import { ensurePortalSchema } from './portal-schema.js';
import { ensureDriveSchema } from './portal-drive.js';
import { json, sanitizeText } from './security.js';

const SHORT_TYPES = new Set(['short', 'shorts', 'reel', 'teaser']);
const NETWORKS = new Set(['youtube', 'tiktok', 'instagram']);
const MIN_REUSE_DAYS = 30;
const MIN_REUSE_MS = MIN_REUSE_DAYS * 86_400_000;

export function adminContentCalendar(store, payload = {}) {
  ensurePortalSchema(store);
  ensureDriveSchema(store);
  const orderId = sanitizeText(payload.orderId, 100);
  if (!orderId) return json({ error: 'invalid_order' }, 400);
  const order = store.sql.exec(`
    SELECT o.id,o.client_id AS clientId,o.title,o.format,c.full_name AS clientName,c.company
    FROM portal_orders o JOIN portal_clients c ON c.id=o.client_id WHERE o.id=? LIMIT 1
  `, orderId).toArray()[0];
  if (!order) return json({ error: 'order_not_found' }, 404);

  const files = store.sql.exec(`
    SELECT f.id AS fileId,f.name,f.file_type AS fileType,f.size_label AS sizeLabel,f.storage_key AS storageKey,
           f.external_url AS externalUrl,f.created_at AS createdAt,a.title AS aiTitle,a.description AS aiDescription,
           a.hashtags,a.generation_status AS generationStatus,d.drive_file_id AS driveFileId,d.mime_type AS mimeType,
           d.modified_at AS modifiedAt,d.download_url AS driveDownloadUrl,d.web_view_url AS webViewUrl
    FROM portal_files f
    LEFT JOIN portal_content_ai a ON a.file_id=f.id
    LEFT JOIN portal_drive_files d ON d.portal_file_id=f.id
    WHERE f.order_id=? ORDER BY f.created_at DESC
  `, orderId).toArray().map((row) => ({
    ...row,
    hashtags: parseArray(row.hashtags),
    kind: contentKind(row.fileType),
    orientation: SHORT_TYPES.has(String(row.fileType || '').toLowerCase()) ? 'portrait' : 'landscape',
  }));

  const occurrences = store.sql.exec(`
    SELECT x.id AS occurrenceId,x.file_id AS fileId,x.source_schedule_id AS sourceScheduleId,x.publish_at AS publishAt,
           x.network,x.status,x.title,x.description,x.hashtags,x.caption,x.use_index AS useIndex,
           x.created_at AS createdAt,x.updated_at AS updatedAt
    FROM portal_content_occurrences x WHERE x.order_id=? ORDER BY x.publish_at ASC
  `, orderId).toArray().map((row) => ({
    ...row,
    networks: normalizeNetworks(row.network),
    hashtags: parseArray(row.hashtags),
  }));

  const publicationRows = store.sql.exec(`
    SELECT p.occurrence_id AS occurrenceId,p.platform,p.status,p.published_url AS publishedUrl,p.published_at AS publishedAt
    FROM portal_content_occurrence_publications p
    JOIN portal_content_occurrences x ON x.id=p.occurrence_id WHERE x.order_id=?
  `, orderId).toArray();
  const publications = groupPublications(publicationRows);
  const now = Date.now();
  const enrichedFiles = files.map((file) => {
    const uses = occurrences.filter((item) => item.fileId === file.fileId);
    const published = uses.some((item) => (publications[item.occurrenceId] || []).some((entry) => entry.status === 'published'));
    const next = uses.filter((item) => new Date(item.publishAt).getTime() >= now).sort(byPublishAt)[0] || null;
    const last = [...uses].sort(byPublishAt).at(-1) || null;
    return {
      ...file,
      usageCount: uses.length,
      scheduleStatus: published ? 'published' : next ? 'scheduled' : 'unscheduled',
      nextPublishAt: next?.publishAt || null,
      lastPublishAt: last?.publishAt || null,
      nextReuseAt: last ? new Date(new Date(last.publishAt).getTime() + MIN_REUSE_MS).toISOString() : new Date().toISOString(),
      occurrenceId: next?.occurrenceId || last?.occurrenceId || null,
    };
  });

  const publishedCount = enrichedFiles.filter((file) => file.scheduleStatus === 'published').length;
  const scheduledCount = enrichedFiles.filter((file) => file.scheduleStatus === 'scheduled').length;
  const unscheduledCount = enrichedFiles.filter((file) => file.scheduleStatus === 'unscheduled').length;
  return json({
    ok: true,
    order,
    files: enrichedFiles,
    occurrences: occurrences.map((item) => ({ ...item, publications: publications[item.occurrenceId] || [] })),
    metrics: { total: files.length, unscheduled: unscheduledCount, scheduled: scheduledCount, published: publishedCount },
    minimumReuseDays: MIN_REUSE_DAYS,
    supportedNetworks: [...NETWORKS],
  });
}

export function adminContentScheduleUpsert(store, payload = {}) {
  ensurePortalSchema(store);
  const orderId = sanitizeText(payload.orderId, 100);
  const fileId = sanitizeText(payload.fileId, 100);
  const requestedOccurrenceId = sanitizeText(payload.occurrenceId, 100);
  const publishAt = normalizeIso(payload.publishAt);
  if (!orderId || !fileId || !publishAt) return json({ error: 'invalid_schedule' }, 400);

  const file = store.sql.exec(`
    SELECT f.id,f.order_id AS orderId,f.name,a.title AS aiTitle,a.description AS aiDescription,a.hashtags
    FROM portal_files f LEFT JOIN portal_content_ai a ON a.file_id=f.id
    WHERE f.id=? AND f.order_id=? LIMIT 1
  `, fileId, orderId).toArray()[0];
  if (!file) return json({ error: 'content_not_found' }, 404);

  let occurrence = requestedOccurrenceId ? store.sql.exec(`
    SELECT id AS occurrenceId,source_schedule_id AS sourceScheduleId FROM portal_content_occurrences
    WHERE id=? AND order_id=? AND file_id=? LIMIT 1
  `, requestedOccurrenceId, orderId, fileId).toArray()[0] : null;
  if (!occurrence) occurrence = store.sql.exec(`
    SELECT id AS occurrenceId,source_schedule_id AS sourceScheduleId FROM portal_content_occurrences
    WHERE order_id=? AND file_id=? ORDER BY publish_at ASC LIMIT 1
  `, orderId, fileId).toArray()[0] || null;

  const spacing = validateSpacing(store, fileId, publishAt, occurrence?.occurrenceId || '');
  if (!spacing.ok) return json({ error: 'reuse_too_soon', nextAllowedAt: spacing.nextAllowedAt, minimumDays: MIN_REUSE_DAYS }, 409);

  const networks = normalizeNetworks(payload.networks || payload.network);
  const title = sanitizeText(payload.title, 140) || sanitizeText(file.aiTitle, 140) || cleanFilename(file.name);
  const description = sanitizeText(payload.description, 1800) || sanitizeText(file.aiDescription, 1800);
  const hashtags = normalizeHashtags(payload.hashtags?.length ? payload.hashtags : parseArray(file.hashtags));
  const caption = buildCaption(title, description, hashtags);
  const now = new Date().toISOString();
  let scheduleId = occurrence?.sourceScheduleId || null;

  if (!occurrence) {
    const existingSchedule = store.sql.exec('SELECT id FROM portal_content_schedule WHERE file_id=? LIMIT 1', fileId).toArray()[0];
    scheduleId = existingSchedule?.id || crypto.randomUUID();
    if (existingSchedule) {
      store.sql.exec(`UPDATE portal_content_schedule SET publish_at=?,network=?,status='ready',caption=?,updated_at=? WHERE id=?`, publishAt, networks.join(','), caption, now, scheduleId);
    } else {
      store.sql.exec(`
        INSERT INTO portal_content_schedule(id,order_id,file_id,publish_at,network,status,caption,created_at,updated_at)
        VALUES(?,?,?,?,?,'ready',?,?,?)
      `, scheduleId, orderId, fileId, publishAt, networks.join(','), caption, now, now);
    }
    const occurrenceId = `occ-${scheduleId}`;
    const existingOccurrence = store.sql.exec('SELECT id FROM portal_content_occurrences WHERE source_schedule_id=? LIMIT 1', scheduleId).toArray()[0];
    if (existingOccurrence) {
      occurrence = { occurrenceId: existingOccurrence.id, sourceScheduleId: scheduleId };
    } else {
      store.sql.exec(`
        INSERT INTO portal_content_occurrences
          (id,order_id,file_id,source_schedule_id,publish_at,network,status,title,description,hashtags,caption,use_index,created_at,updated_at)
        VALUES(?,?,?,?,?,?,'ready',?,?,?,?,1,?,?)
      `, occurrenceId, orderId, fileId, scheduleId, publishAt, networks.join(','), title, description, JSON.stringify(hashtags), caption, now, now);
      occurrence = { occurrenceId, sourceScheduleId: scheduleId };
    }
  }

  store.sql.exec(`
    UPDATE portal_content_occurrences
    SET publish_at=?,network=?,status='ready',title=?,description=?,hashtags=?,caption=?,updated_at=? WHERE id=?
  `, publishAt, networks.join(','), title, description, JSON.stringify(hashtags), caption, now, occurrence.occurrenceId);
  if (occurrence.sourceScheduleId) {
    store.sql.exec(`
      UPDATE portal_content_schedule SET publish_at=?,network=?,status='ready',caption=?,updated_at=? WHERE id=?
    `, publishAt, networks.join(','), caption, now, occurrence.sourceScheduleId);
  }
  store.audit?.('studio', 'portal_content_schedule_upsert', 'portal_file', fileId, { occurrenceId: occurrence.occurrenceId, publishAt, networks });
  return json({ ok: true, occurrenceId: occurrence.occurrenceId, scheduleId: occurrence.sourceScheduleId, fileId, publishAt, networks, title, description, hashtags, caption });
}

export function adminContentScheduleDelete(store, payload = {}) {
  ensurePortalSchema(store);
  const orderId = sanitizeText(payload.orderId, 100);
  const occurrenceId = sanitizeText(payload.occurrenceId, 100);
  if (!orderId || !occurrenceId) return json({ error: 'invalid_schedule' }, 400);
  const occurrence = store.sql.exec(`
    SELECT id,source_schedule_id AS sourceScheduleId,file_id AS fileId FROM portal_content_occurrences
    WHERE id=? AND order_id=? LIMIT 1
  `, occurrenceId, orderId).toArray()[0];
  if (!occurrence) return json({ error: 'content_not_found' }, 404);
  store.sql.exec('DELETE FROM portal_content_occurrences WHERE id=?', occurrenceId);
  if (occurrence.sourceScheduleId) store.sql.exec('DELETE FROM portal_content_schedule WHERE id=?', occurrence.sourceScheduleId);
  store.audit?.('studio', 'portal_content_schedule_delete', 'portal_file', occurrence.fileId, { occurrenceId });
  return json({ ok: true, occurrenceId, fileId: occurrence.fileId });
}

export function adminContentFileSource(store, payload = {}) {
  ensurePortalSchema(store);
  ensureDriveSchema(store);
  const fileId = sanitizeText(payload.fileId, 100);
  if (!fileId) return json({ error: 'invalid_file' }, 400);
  const file = store.sql.exec(`
    SELECT f.id AS fileId,f.name,f.file_type AS fileType,f.storage_key AS storageKey,f.external_url AS externalUrl,
           d.drive_file_id AS driveFileId,d.mime_type AS mimeType,d.download_url AS driveDownloadUrl,d.web_view_url AS webViewUrl
    FROM portal_files f LEFT JOIN portal_drive_files d ON d.portal_file_id=f.id WHERE f.id=? LIMIT 1
  `, fileId).toArray()[0];
  return file ? json({ ok: true, file }) : json({ error: 'content_not_found' }, 404);
}

function validateSpacing(store, fileId, publishAt, excludedId) {
  const target = new Date(publishAt).getTime();
  const rows = store.sql.exec('SELECT id,publish_at AS publishAt FROM portal_content_occurrences WHERE file_id=? AND id<>?', fileId, excludedId || '').toArray();
  const conflict = rows.map((row) => ({ ...row, time: new Date(row.publishAt).getTime() }))
    .filter((row) => Number.isFinite(row.time) && Math.abs(row.time - target) < MIN_REUSE_MS)
    .sort((a, b) => Math.abs(a.time - target) - Math.abs(b.time - target))[0];
  return conflict ? { ok: false, nextAllowedAt: new Date(conflict.time + MIN_REUSE_MS).toISOString() } : { ok: true };
}

function groupPublications(rows) {
  return rows.reduce((accumulator, row) => {
    (accumulator[row.occurrenceId] ||= []).push(row);
    return accumulator;
  }, {});
}
function byPublishAt(a, b) { return new Date(a.publishAt) - new Date(b.publishAt); }
function contentKind(type) {
  const value = String(type || '').toLowerCase();
  if (SHORT_TYPES.has(value)) return 'short';
  if (['final', 'long', 'long-form', 'episode'].includes(value)) return 'long';
  if (['rush', 'rushes'].includes(value)) return 'rush';
  if (value === 'document') return 'document';
  return 'other';
}
function normalizeIso(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
function normalizeNetworks(value) {
  const values = Array.isArray(value) ? value : String(value || '').split(',');
  const normalized = [...new Set(values.map((item) => String(item || '').trim().toLowerCase()).filter((item) => NETWORKS.has(item)))];
  return normalized.length ? normalized : ['youtube', 'tiktok', 'instagram'];
}
function normalizeHashtags(value) {
  const values = Array.isArray(value) ? value : String(value || '').split(/[\s,]+/u);
  return [...new Set(values.map((item) => String(item || '').trim().replace(/^#+/u, '')).filter(Boolean).slice(0, 12))];
}
function parseArray(value) {
  if (Array.isArray(value)) return value;
  try { const parsed = JSON.parse(String(value || '[]')); return Array.isArray(parsed) ? parsed : []; } catch { return []; }
}
function buildCaption(title, description, hashtags) {
  return [title, description, hashtags.map((tag) => `#${tag}`).join(' ')].filter(Boolean).join('\n\n').trim();
}
function cleanFilename(value) {
  return sanitizeText(String(value || '').replace(/\.[a-z0-9]{2,5}$/iu, '').replace(/[_-]+/gu, ' '), 140) || 'Contenu Neptune Media';
}
