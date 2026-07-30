import { json, sanitizeText, sanitizeUrl } from './security.js';
import { ensureDriveSchema } from './portal-drive.js';

const VIDEO_TYPES = new Set([
  'video/mp4',
  'video/quicktime',
  'video/x-m4v',
  'video/webm',
  'application/zip',
  'application/octet-stream',
]);
const FILE_HEARTBEAT_MS = 24 * 60 * 60 * 1000;
const PASSAGE_HEARTBEAT_MS = 60 * 60 * 1000;

export function driveFilesUpsert(store, raw = {}) {
  ensureDriveSchema(store);
  const orderId = sanitizeText(raw.orderId, 100);
  const mapping = store.sql.exec(`
    SELECT dp.order_id AS orderId,dp.client_id AS clientId,dp.passage_number AS passageNumber,dp.folder_url AS passageFolderUrl,
           dp.sync_status AS syncStatus,dp.last_scan_at AS lastScanAt,
           c.email,c.full_name AS fullName,c.company,o.title,o.format
    FROM portal_drive_passages dp
    JOIN portal_orders o ON o.id=dp.order_id
    JOIN portal_clients c ON c.id=dp.client_id
    WHERE dp.order_id=? AND dp.sync_status='ready'
  `, orderId).toArray()[0];
  if (!mapping) return json({ error: 'drive_passage_not_provisioned' }, 404);

  const now = new Date().toISOString();
  const scannedAt = safeIso(raw.scannedAt) || now;
  const files = Array.isArray(raw.files) ? raw.files.slice(0, 250) : [];
  let accepted = 0;
  let changed = 0;

  for (const rawFile of files) {
    const driveFileId = sanitizeText(rawFile.driveFileId || rawFile.id, 240);
    const name = sanitizeText(rawFile.name, 240);
    const mimeType = sanitizeText(rawFile.mimeType, 160).toLowerCase();
    const modifiedAt = safeIso(rawFile.modifiedAt || rawFile.modifiedTime);
    const category = normalizeCategory(rawFile.category || rawFile.folderType);
    if (!driveFileId || !name || !modifiedAt || !category) continue;
    if (mimeType && !mimeType.startsWith('video/') && !VIDEO_TYPES.has(mimeType)) continue;

    const webViewUrl = sanitizeUrl(rawFile.webViewUrl, 1500)
      || `https://drive.google.com/file/d/${encodeURIComponent(driveFileId)}/view`;
    const downloadUrl = sanitizeUrl(rawFile.downloadUrl, 1500)
      || `https://drive.google.com/uc?export=download&id=${encodeURIComponent(driveFileId)}`;
    const sizeBytes = Math.max(0, Math.round(Number(rawFile.sizeBytes || rawFile.size || 0)));
    const sizeLabel = formatBytes(sizeBytes);
    const fileType = category === 'short' ? 'short' : 'final';
    const externalUrl = downloadUrl || webViewUrl;

    const existing = store.sql.exec(`
      SELECT df.drive_file_id AS driveFileId,df.order_id AS currentOrderId,
             df.portal_file_id AS portalFileId,df.category,
             df.file_name AS fileName,df.mime_type AS mimeType,df.modified_at AS modifiedAt,
             df.version,df.web_view_url AS webViewUrl,df.download_url AS downloadUrl,
             df.size_bytes AS sizeBytes,df.last_seen_at AS lastSeenAt,
             pf.order_id AS portalOrderId,pf.name AS portalName,pf.file_type AS portalFileType,
             pf.external_url AS portalExternalUrl,pf.size_label AS portalSizeLabel
      FROM portal_drive_files df
      JOIN portal_files pf ON pf.id=df.portal_file_id
      WHERE df.drive_file_id=?
    `, driveFileId).toArray()[0];

    const portalFileId = existing?.portalFileId || crypto.randomUUID();
    if (!existing) {
      store.sql.exec(`
        INSERT INTO portal_files(id,order_id,name,file_type,storage_key,external_url,size_label,created_at)
        VALUES(?,?,?,?,'',?,?,?)
      `, portalFileId, orderId, name, fileType, externalUrl, sizeLabel, now);
      if (category === 'short') ensureShortSchedule(store, orderId, portalFileId, name, mapping.title, now);
      store.sql.exec(`
        INSERT INTO portal_drive_files(
          drive_file_id,order_id,portal_file_id,category,file_name,mime_type,modified_at,version,
          web_view_url,download_url,size_bytes,first_seen_at,last_seen_at
        ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)
      `, driveFileId, orderId, portalFileId, category, name, mimeType, modifiedAt, 1,
      webViewUrl, downloadUrl, sizeBytes, now, now);
      store.sql.exec(`
        INSERT OR IGNORE INTO portal_drive_events(
          id,drive_file_id,order_id,modified_at,category,file_name,event_type,created_at,notified_at
        ) VALUES(?,?,?,?,?,?,?, ?,NULL)
      `, crypto.randomUUID(), driveFileId, orderId, modifiedAt, category, name, 'added', now);
      changed += 1;
      accepted += 1;
      continue;
    }

    const orderMoved = existing.currentOrderId !== orderId || existing.portalOrderId !== orderId;
    const categoryChanged = existing.category !== category;
    const portalChanged = orderMoved
      || existing.portalName !== name
      || existing.portalFileType !== fileType
      || existing.portalExternalUrl !== externalUrl
      || existing.portalSizeLabel !== sizeLabel;
    const driveChanged = orderMoved
      || categoryChanged
      || existing.fileName !== name
      || existing.mimeType !== mimeType
      || existing.modifiedAt !== modifiedAt
      || existing.webViewUrl !== webViewUrl
      || existing.downloadUrl !== downloadUrl
      || Number(existing.sizeBytes || 0) !== sizeBytes;
    const contentVersionChanged = existing.modifiedAt !== modifiedAt;
    const structuralChanged = orderMoved || categoryChanged;

    if (categoryChanged && category === 'long') {
      store.sql.exec('DELETE FROM portal_content_occurrences WHERE file_id=?', portalFileId);
      store.sql.exec('DELETE FROM portal_content_schedule WHERE file_id=?', portalFileId);
      store.sql.exec('DELETE FROM portal_content_ai WHERE file_id=?', portalFileId);
    }

    if (portalChanged) {
      store.sql.exec(`
        UPDATE portal_files
        SET order_id=?,name=?,file_type=?,external_url=?,size_label=?
        WHERE id=?
      `, orderId, name, fileType, externalUrl, sizeLabel, portalFileId);
    }

    if (orderMoved && category === 'short') {
      store.sql.exec('UPDATE portal_content_schedule SET order_id=?,updated_at=? WHERE file_id=?', orderId, now, portalFileId);
      store.sql.exec('UPDATE portal_content_ai SET order_id=?,updated_at=? WHERE file_id=?', orderId, now, portalFileId);
      store.sql.exec('UPDATE portal_content_occurrences SET order_id=?,updated_at=? WHERE file_id=?', orderId, now, portalFileId);
    }

    if (category === 'short') ensureShortSchedule(store, orderId, portalFileId, name, mapping.title, now);

    if (driveChanged) {
      const version = contentVersionChanged ? Number(existing.version || 1) + 1 : Number(existing.version || 1);
      store.sql.exec(`
        UPDATE portal_drive_files
        SET order_id=?,category=?,file_name=?,mime_type=?,modified_at=?,version=?,
            web_view_url=?,download_url=?,size_bytes=?,last_seen_at=?
        WHERE drive_file_id=?
      `, orderId, category, name, mimeType, modifiedAt, version,
      webViewUrl, downloadUrl, sizeBytes, now, driveFileId);
    } else if (heartbeatDue(existing.lastSeenAt, FILE_HEARTBEAT_MS)) {
      store.sql.exec('UPDATE portal_drive_files SET last_seen_at=? WHERE drive_file_id=?', now, driveFileId);
    }

    if (contentVersionChanged || structuralChanged) {
      const eventModifiedAt = contentVersionChanged ? modifiedAt : now;
      const eventType = orderMoved ? 'moved' : contentVersionChanged ? 'updated' : 'reclassified';
      store.sql.exec(`
        INSERT OR IGNORE INTO portal_drive_events(
          id,drive_file_id,order_id,modified_at,category,file_name,event_type,created_at,notified_at
        ) VALUES(?,?,?,?,?,?,?, ?,NULL)
      `, crypto.randomUUID(), driveFileId, orderId, eventModifiedAt, category, name, eventType, now);
    }

    if (portalChanged || driveChanged) changed += 1;
    accepted += 1;
  }

  if (changed > 0 || mapping.syncStatus !== 'ready') {
    store.sql.exec(
      "UPDATE portal_drive_passages SET last_scan_at=?,sync_status='ready',updated_at=? WHERE order_id=?",
      scannedAt,
      now,
      orderId,
    );
  } else if (heartbeatDue(mapping.lastScanAt, PASSAGE_HEARTBEAT_MS)) {
    store.sql.exec('UPDATE portal_drive_passages SET last_scan_at=? WHERE order_id=?', scannedAt, orderId);
  }

  const pending = store.sql.exec(`
    SELECT id,drive_file_id AS driveFileId,category,file_name AS name,event_type AS eventType,
           modified_at AS modifiedAt,created_at AS createdAt
    FROM portal_drive_events
    WHERE order_id=? AND notified_at IS NULL
    ORDER BY created_at ASC LIMIT 250
  `, orderId).toArray();
  const summary = driveSummary(store, orderId);

  return json({
    ok: true,
    orderId,
    clientId: mapping.clientId,
    email: mapping.email,
    fullName: mapping.fullName || '',
    company: mapping.company || '',
    title: mapping.title || mapping.format || 'Passage Neptune Media',
    format: mapping.format || '',
    passageNumber: Number(mapping.passageNumber || 1),
    passageFolderUrl: mapping.passageFolderUrl || '',
    accepted,
    changed,
    pendingEvents: pending,
    summary,
    scannedAt,
  });
}

function heartbeatDue(value, intervalMs) {
  const date = new Date(value || '');
  return Number.isNaN(date.getTime()) || Date.now() - date.getTime() >= intervalMs;
}

function driveSummary(store, orderId) {
  if (!orderId) return { longCount: 0, shortCount: 0, totalCount: 0, latestContentAt: null };
  const row = store.sql.exec(`
    SELECT SUM(CASE WHEN category='long' THEN 1 ELSE 0 END) AS longCount,
           SUM(CASE WHEN category='short' THEN 1 ELSE 0 END) AS shortCount,
           COUNT(*) AS totalCount,MAX(modified_at) AS latestContentAt
    FROM portal_drive_files WHERE order_id=?
  `, orderId).toArray()[0] || {};
  return {
    longCount: Number(row.longCount || 0),
    shortCount: Number(row.shortCount || 0),
    totalCount: Number(row.totalCount || 0),
    latestContentAt: row.latestContentAt || null,
  };
}

function ensureShortSchedule(store, orderId, fileId, name, orderTitle, now) {
  const existing = store.sql.exec('SELECT id FROM portal_content_schedule WHERE file_id=?', fileId).toArray()[0];
  if (existing) return;
  const row = store.sql.exec('SELECT COUNT(*) AS count FROM portal_content_schedule WHERE order_id=?', orderId).toArray()[0];
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + 1 + Number(row?.count || 0) * 2);
  date.setUTCHours(9, 0, 0, 0);
  const caption = `Nouveau contenu Neptune Media : ${name}${orderTitle ? ` · ${orderTitle}` : ''}`.slice(0, 500);
  store.sql.exec(`
    INSERT INTO portal_content_schedule(id,order_id,file_id,publish_at,network,status,caption,created_at,updated_at)
    VALUES(?,?,?,?,?,'ready',?,?,?)
  `, crypto.randomUUID(), orderId, fileId, date.toISOString(), 'À choisir', caption, now, now);
}

function normalizeCategory(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (['short', 'shorts', 'reel', 'teaser', 'vertical'].includes(normalized)) return 'short';
  if (['long', 'long_format', 'long-format', 'final', 'emission', 'full', 'master'].includes(normalized)) return 'long';
  return '';
}

function safeIso(value) {
  const date = new Date(value || '');
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function formatBytes(bytes) {
  const value = Number(bytes || 0);
  if (!value) return '';
  if (value < 1024) return `${value} o`;
  if (value < 1024 ** 2) return `${(value / 1024).toFixed(1).replace('.', ',')} Ko`;
  if (value < 1024 ** 3) return `${(value / 1024 ** 2).toFixed(1).replace('.', ',')} Mo`;
  return `${(value / 1024 ** 3).toFixed(1).replace('.', ',')} Go`;
}
