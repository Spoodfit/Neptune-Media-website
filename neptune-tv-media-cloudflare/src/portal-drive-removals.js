import { json, sanitizeText } from './security.js';
import { ensureDriveSchema } from './portal-drive.js';

export function driveFilesRemove(store, raw = {}) {
  ensureDriveSchema(store);
  const ids = normalizedIds(raw.driveFileIds, 250);
  const removed = removeDriveRows(store, ids);
  return json({ ok: true, removed: removed.length, files: removed });
}

export function driveOrderPrune(store, raw = {}) {
  ensureDriveSchema(store);
  const orderId = sanitizeText(raw.orderId, 100);
  if (!orderId) return json({ error: 'order_id_required' }, 400);
  const current = new Set(normalizedIds(raw.currentDriveFileIds, 5000));
  const known = store.sql.exec(`
    SELECT drive_file_id AS driveFileId
    FROM portal_drive_files
    WHERE order_id=?
  `, orderId).toArray();
  const missing = known.map((item) => item.driveFileId).filter((id) => !current.has(id));
  const removed = removeDriveRows(store, missing);
  return json({ ok: true, orderId, known: known.length, current: current.size, removed: removed.length, files: removed });
}

function removeDriveRows(store, ids) {
  const removed = [];
  for (const driveFileId of ids) {
    const row = store.sql.exec(`
      SELECT df.portal_file_id AS portalFileId,df.order_id AS orderId,df.file_name AS name,df.category
      FROM portal_drive_files df
      WHERE df.drive_file_id=?
    `, driveFileId).toArray()[0];
    if (!row) continue;
    store.sql.exec('DELETE FROM portal_files WHERE id=? AND order_id=?', row.portalFileId, row.orderId);
    removed.push({ driveFileId, orderId: row.orderId, name: row.name || '', category: row.category || '' });
  }
  return removed;
}

function normalizedIds(values, limit) {
  return Array.isArray(values)
    ? [...new Set(values.map((value) => sanitizeText(value, 240)).filter(Boolean))].slice(0, limit)
    : [];
}
