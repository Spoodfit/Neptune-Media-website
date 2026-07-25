import { json, sanitizeText, sanitizeUrl } from './security.js';

const PAID_STATUSES = new Set(['paid', 'succeeded', 'complete', 'completed', 'no_payment_required']);
const VIDEO_TYPES = new Set(['video/mp4', 'video/quicktime', 'video/x-m4v', 'video/webm', 'application/zip', 'application/octet-stream']);

export function ensureDriveSchema(store) {
  if (store.driveSchemaReady) return;
  store.sql.exec(`
    CREATE TABLE IF NOT EXISTS portal_drive_clients(
      client_id TEXT PRIMARY KEY REFERENCES portal_clients(id) ON DELETE CASCADE,
      folder_id TEXT NOT NULL DEFAULT '',
      folder_url TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS portal_drive_passages(
      order_id TEXT PRIMARY KEY REFERENCES portal_orders(id) ON DELETE CASCADE,
      client_id TEXT NOT NULL REFERENCES portal_clients(id) ON DELETE CASCADE,
      passage_number INTEGER NOT NULL DEFAULT 1,
      folder_id TEXT NOT NULL DEFAULT '',
      folder_url TEXT NOT NULL DEFAULT '',
      long_folder_id TEXT NOT NULL DEFAULT '',
      shorts_folder_id TEXT NOT NULL DEFAULT '',
      sync_status TEXT NOT NULL DEFAULT 'pending',
      last_scan_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS portal_drive_files(
      drive_file_id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL REFERENCES portal_orders(id) ON DELETE CASCADE,
      portal_file_id TEXT NOT NULL UNIQUE REFERENCES portal_files(id) ON DELETE CASCADE,
      category TEXT NOT NULL,
      file_name TEXT NOT NULL,
      mime_type TEXT NOT NULL DEFAULT '',
      modified_at TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
      web_view_url TEXT NOT NULL DEFAULT '',
      download_url TEXT NOT NULL DEFAULT '',
      size_bytes INTEGER NOT NULL DEFAULT 0,
      first_seen_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS portal_drive_events(
      id TEXT PRIMARY KEY,
      drive_file_id TEXT NOT NULL REFERENCES portal_drive_files(drive_file_id) ON DELETE CASCADE,
      order_id TEXT NOT NULL REFERENCES portal_orders(id) ON DELETE CASCADE,
      modified_at TEXT NOT NULL,
      category TEXT NOT NULL,
      file_name TEXT NOT NULL,
      event_type TEXT NOT NULL DEFAULT 'added',
      created_at TEXT NOT NULL,
      notified_at TEXT,
      UNIQUE(drive_file_id, modified_at)
    );
    CREATE INDEX IF NOT EXISTS idx_drive_passages_client ON portal_drive_passages(client_id, passage_number);
    CREATE INDEX IF NOT EXISTS idx_drive_passages_status ON portal_drive_passages(sync_status, updated_at);
    CREATE INDEX IF NOT EXISTS idx_drive_files_order ON portal_drive_files(order_id, category, modified_at DESC);
    CREATE INDEX IF NOT EXISTS idx_drive_events_pending ON portal_drive_events(order_id, notified_at, created_at);
  `);
  store.driveSchemaReady = true;
}

export function driveSyncPlan(store) {
  ensureDriveSchema(store);
  const rows = store.sql.exec(`
    SELECT o.id,o.client_id AS clientId,o.title,o.format,o.payment_status AS paymentStatus,o.status,
           o.created_at AS createdAt,c.email,c.full_name AS fullName,c.company,
           dc.folder_id AS clientFolderId,dc.folder_url AS clientFolderUrl,
           dp.passage_number AS passageNumber,dp.folder_id AS passageFolderId,dp.folder_url AS passageFolderUrl,
           dp.long_folder_id AS longFolderId,dp.shorts_folder_id AS shortsFolderId,
           dp.sync_status AS driveSyncStatus,dp.last_scan_at AS driveLastScanAt
    FROM portal_orders o
    JOIN portal_clients c ON c.id=o.client_id
    LEFT JOIN portal_drive_clients dc ON dc.client_id=o.client_id
    LEFT JOIN portal_drive_passages dp ON dp.order_id=o.id
    ORDER BY o.client_id ASC,o.created_at ASC,o.id ASC
  `).toArray();

  const counters = new Map();
  const provision = [];
  const passages = [];
  for (const row of rows) {
    if (!PAID_STATUSES.has(String(row.paymentStatus || '').toLowerCase())) continue;
    if (['cancelled', 'refunded'].includes(String(row.status || '').toLowerCase())) continue;
    const count = (counters.get(row.clientId) || 0) + 1;
    counters.set(row.clientId, count);
    const passageNumber = Number(row.passageNumber || count);
    const item = {
      orderId: row.id,
      clientId: row.clientId,
      email: row.email,
      fullName: row.fullName || '',
      company: row.company || '',
      title: row.title || row.format || 'Passage Neptune Media',
      format: row.format || '',
      createdAt: row.createdAt,
      passageNumber,
      clientFolderId: row.clientFolderId || '',
      clientFolderUrl: row.clientFolderUrl || '',
      passageFolderId: row.passageFolderId || '',
      passageFolderUrl: row.passageFolderUrl || '',
      longFolderId: row.longFolderId || '',
      shortsFolderId: row.shortsFolderId || '',
      driveSyncStatus: row.driveSyncStatus || 'pending',
      driveLastScanAt: row.driveLastScanAt || null,
    };
    if (item.driveSyncStatus === 'ready' && item.passageFolderId && item.longFolderId && item.shortsFolderId) passages.push(item);
    else provision.push(item);
  }
  return json({ ok: true, provision, passages, generatedAt: new Date().toISOString() });
}

export function driveProvisioned(store, raw = {}) {
  ensureDriveSchema(store);
  const orderId = sanitizeText(raw.orderId, 100);
  const order = store.sql.exec(`
    SELECT o.id,o.client_id AS clientId,c.email,c.full_name AS fullName,c.company
    FROM portal_orders o JOIN portal_clients c ON c.id=o.client_id WHERE o.id=?
  `, orderId).toArray()[0];
  if (!order) return json({ error: 'order_not_found' }, 404);

  const clientFolderId = sanitizeText(raw.clientFolderId, 240);
  const passageFolderId = sanitizeText(raw.passageFolderId, 240);
  const longFolderId = sanitizeText(raw.longFolderId, 240);
  const shortsFolderId = sanitizeText(raw.shortsFolderId, 240);
  if (!clientFolderId || !passageFolderId || !longFolderId || !shortsFolderId) return json({ error: 'drive_folder_mapping_incomplete' }, 400);

  const now = new Date().toISOString();
  const passageNumber = Math.max(1, Number(raw.passageNumber || 1));
  const clientFolderUrl = sanitizeUrl(raw.clientFolderUrl, 1500) || folderUrl(clientFolderId);
  const passageFolderUrl = sanitizeUrl(raw.passageFolderUrl, 1500) || folderUrl(passageFolderId);

  store.sql.exec(`
    INSERT INTO portal_drive_clients(client_id,folder_id,folder_url,created_at,updated_at)
    VALUES(?,?,?,?,?)
    ON CONFLICT(client_id) DO UPDATE SET folder_id=excluded.folder_id,folder_url=excluded.folder_url,updated_at=excluded.updated_at
  `, order.clientId, clientFolderId, clientFolderUrl, now, now);
  store.sql.exec(`
    INSERT INTO portal_drive_passages(order_id,client_id,passage_number,folder_id,folder_url,long_folder_id,shorts_folder_id,sync_status,last_scan_at,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,'ready',NULL,?,?)
    ON CONFLICT(order_id) DO UPDATE SET passage_number=excluded.passage_number,folder_id=excluded.folder_id,folder_url=excluded.folder_url,
      long_folder_id=excluded.long_folder_id,shorts_folder_id=excluded.shorts_folder_id,sync_status='ready',updated_at=excluded.updated_at
  `, order.id, order.clientId, passageNumber, passageFolderId, passageFolderUrl, longFolderId, shortsFolderId, now, now);

  return json({
    ok: true,
    orderId: order.id,
    clientId: order.clientId,
    email: order.email,
    passageNumber,
    clientFolderId,
    clientFolderUrl,
    passageFolderId,
    passageFolderUrl,
    longFolderId,
    shortsFolderId,
  });
}

export function driveFilesUpsert(store, raw = {}) {
  ensureDriveSchema(store);
  const orderId = sanitizeText(raw.orderId, 100);
  const mapping = store.sql.exec(`
    SELECT dp.order_id AS orderId,dp.client_id AS clientId,dp.passage_number AS passageNumber,dp.folder_url AS passageFolderUrl,
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
  for (const rawFile of files) {
    const driveFileId = sanitizeText(rawFile.driveFileId || rawFile.id, 240);
    const name = sanitizeText(rawFile.name, 240);
    const mimeType = sanitizeText(rawFile.mimeType, 160).toLowerCase();
    const modifiedAt = safeIso(rawFile.modifiedAt || rawFile.modifiedTime);
    const category = normalizeCategory(rawFile.category || rawFile.folderType);
    if (!driveFileId || !name || !modifiedAt || !category) continue;
    if (mimeType && !mimeType.startsWith('video/') && !VIDEO_TYPES.has(mimeType)) continue;

    const webViewUrl = sanitizeUrl(rawFile.webViewUrl, 1500) || `https://drive.google.com/file/d/${encodeURIComponent(driveFileId)}/view`;
    const downloadUrl = sanitizeUrl(rawFile.downloadUrl, 1500) || `https://drive.google.com/uc?export=download&id=${encodeURIComponent(driveFileId)}`;
    const sizeBytes = Math.max(0, Math.round(Number(rawFile.sizeBytes || rawFile.size || 0)));
    const sizeLabel = formatBytes(sizeBytes);
    const fileType = category === 'short' ? 'short' : 'final';
    const existing = store.sql.exec(`
      SELECT drive_file_id AS driveFileId,portal_file_id AS portalFileId,modified_at AS modifiedAt,version
      FROM portal_drive_files WHERE drive_file_id=?
    `, driveFileId).toArray()[0];

    let portalFileId = existing?.portalFileId || crypto.randomUUID();
    const eventType = existing ? 'updated' : 'added';
    if (!existing) {
      store.sql.exec(`
        INSERT INTO portal_files(id,order_id,name,file_type,storage_key,external_url,size_label,created_at)
        VALUES(?,?,?,?,'',?,?,?)
      `, portalFileId, orderId, name, fileType, downloadUrl || webViewUrl, sizeLabel, now);
      if (category === 'short') ensureShortSchedule(store, orderId, portalFileId, name, mapping.title, now);
      store.sql.exec(`
        INSERT INTO portal_drive_files(drive_file_id,order_id,portal_file_id,category,file_name,mime_type,modified_at,version,web_view_url,download_url,size_bytes,first_seen_at,last_seen_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)
      `, driveFileId, orderId, portalFileId, category, name, mimeType, modifiedAt, 1, webViewUrl, downloadUrl, sizeBytes, now, now);
    } else {
      const version = modifiedAt !== existing.modifiedAt ? Number(existing.version || 1) + 1 : Number(existing.version || 1);
      store.sql.exec(`
        UPDATE portal_files SET name=?,file_type=?,external_url=?,size_label=? WHERE id=? AND order_id=?
      `, name, fileType, downloadUrl || webViewUrl, sizeLabel, portalFileId, orderId);
      store.sql.exec(`
        UPDATE portal_drive_files SET order_id=?,category=?,file_name=?,mime_type=?,modified_at=?,version=?,web_view_url=?,download_url=?,size_bytes=?,last_seen_at=? WHERE drive_file_id=?
      `, orderId, category, name, mimeType, modifiedAt, version, webViewUrl, downloadUrl, sizeBytes, now, driveFileId);
    }

    store.sql.exec(`
      INSERT OR IGNORE INTO portal_drive_events(id,drive_file_id,order_id,modified_at,category,file_name,event_type,created_at,notified_at)
      VALUES(?,?,?,?,?,?,?,?,NULL)
    `, crypto.randomUUID(), driveFileId, orderId, modifiedAt, category, name, eventType, now);
    accepted += 1;
  }

  store.sql.exec('UPDATE portal_drive_passages SET last_scan_at=?,sync_status=\'ready\',updated_at=? WHERE order_id=?', scannedAt, now, orderId);
  const pending = store.sql.exec(`
    SELECT id,drive_file_id AS driveFileId,category,file_name AS name,event_type AS eventType,modified_at AS modifiedAt,created_at AS createdAt
    FROM portal_drive_events WHERE order_id=? AND notified_at IS NULL ORDER BY created_at ASC LIMIT 250
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
    pendingEvents: pending,
    summary,
    scannedAt,
  });
}

export function driveMarkNotified(store, raw = {}) {
  ensureDriveSchema(store);
  const eventIds = Array.isArray(raw.eventIds) ? raw.eventIds.map((value) => sanitizeText(value, 100)).filter(Boolean).slice(0, 250) : [];
  const notifiedAt = safeIso(raw.notifiedAt) || new Date().toISOString();
  for (const id of eventIds) store.sql.exec('UPDATE portal_drive_events SET notified_at=? WHERE id=? AND notified_at IS NULL', notifiedAt, id);
  return json({ ok: true, marked: eventIds.length, notifiedAt });
}

export function enrichDriveOrders(store, orders = []) {
  ensureDriveSchema(store);
  return orders.map((order) => {
    const passage = store.sql.exec(`
      SELECT passage_number AS passageNumber,folder_id AS passageFolderId,folder_url AS passageFolderUrl,
             long_folder_id AS longFolderId,shorts_folder_id AS shortsFolderId,sync_status AS syncStatus,last_scan_at AS lastScanAt
      FROM portal_drive_passages WHERE order_id=?
    `, order.id || order.orderId).toArray()[0] || null;
    const summary = driveSummary(store, order.id || order.orderId);
    return { ...order, drive: passage ? { ...passage, ...summary } : { syncStatus: 'pending', ...summary } };
  });
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

function folderUrl(id) {
  return `https://drive.google.com/drive/folders/${encodeURIComponent(id)}`;
}

function formatBytes(bytes) {
  const value = Number(bytes || 0);
  if (!value) return '';
  if (value < 1024) return `${value} o`;
  if (value < 1024 ** 2) return `${(value / 1024).toFixed(1).replace('.', ',')} Ko`;
  if (value < 1024 ** 3) return `${(value / 1024 ** 2).toFixed(1).replace('.', ',')} Mo`;
  return `${(value / 1024 ** 3).toFixed(1).replace('.', ',')} Go`;
}
