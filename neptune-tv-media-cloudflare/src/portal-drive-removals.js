import { json, sanitizeText } from './security.js';
import { ensureDriveSchema } from './portal-drive.js';

export function driveFilesRemove(store, raw = {}) {
  ensureDriveSchema(store);
  const ids = Array.isArray(raw.driveFileIds)
    ? [...new Set(raw.driveFileIds.map((value) => sanitizeText(value, 240)).filter(Boolean))].slice(0, 250)
    : [];
  if (!ids.length) return json({ ok: true, removed: 0, files: [] });

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

  return json({ ok: true, removed: removed.length, files: removed });
}
