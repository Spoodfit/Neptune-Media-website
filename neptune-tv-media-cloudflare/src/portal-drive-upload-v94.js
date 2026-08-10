import { ensureDriveSchema } from './portal-drive.js';
import { ensurePortalSchema } from './portal-schema.js';
import { json, sanitizeText } from './security.js';
import { requireOperator } from './workflow-db-v5.js';

const CATEGORIES = new Set(['long', 'short']);

export async function driveUploadTargetV94(store, body = {}) {
  ensurePortalSchema(store);
  ensureDriveSchema(store);
  const access = await requireOperator(store, body);
  if (!access.ok) return access.response;

  const payload = body.payload && typeof body.payload === 'object' ? body.payload : {};
  const orderId = sanitizeText(payload.orderId || body.orderId, 100);
  const category = normalizeCategory(payload.category || body.category);
  if (!orderId) return json({ error: 'invalid_order' }, 400);
  if ((payload.category || body.category) && !category) return json({ error: 'invalid_drive_category' }, 400);

  const mapping = store.sql.exec(`
    SELECT dp.order_id AS orderId,dp.client_id AS clientId,dp.passage_number AS passageNumber,
      dp.folder_id AS passageFolderId,dp.folder_url AS passageFolderUrl,
      dp.long_folder_id AS longFolderId,dp.shorts_folder_id AS shortsFolderId,
      dp.sync_status AS syncStatus,dp.last_scan_at AS lastScanAt,
      c.email,c.full_name AS fullName,c.company,o.title,o.format
    FROM portal_drive_passages dp
    JOIN portal_orders o ON o.id=dp.order_id
    JOIN portal_clients c ON c.id=dp.client_id
    WHERE dp.order_id=? LIMIT 1
  `, orderId).toArray()[0];

  if (!mapping) {
    return json({
      error: 'drive_passage_not_provisioned',
      orderId,
      ready: false,
      syncStatus: 'pending',
    }, 409);
  }

  const ready = mapping.syncStatus === 'ready'
    && Boolean(mapping.passageFolderId && mapping.longFolderId && mapping.shortsFolderId);
  if (!ready) {
    return json({
      error: 'drive_passage_not_ready',
      orderId,
      ready: false,
      syncStatus: mapping.syncStatus || 'pending',
      passageNumber: Number(mapping.passageNumber || 1),
      passageFolderUrl: mapping.passageFolderUrl || '',
    }, 409);
  }

  const targetFolderId = category === 'long'
    ? mapping.longFolderId
    : category === 'short' ? mapping.shortsFolderId : '';

  return json({
    ok: true,
    ready: true,
    orderId,
    clientId: mapping.clientId,
    passageNumber: Number(mapping.passageNumber || 1),
    passageFolderId: mapping.passageFolderId,
    passageFolderUrl: mapping.passageFolderUrl || '',
    longFolderId: mapping.longFolderId,
    shortsFolderId: mapping.shortsFolderId,
    targetFolderId,
    category: category || null,
    syncStatus: mapping.syncStatus,
    lastScanAt: mapping.lastScanAt || null,
    client: {
      email: mapping.email || '',
      fullName: mapping.fullName || '',
      company: mapping.company || '',
    },
    title: mapping.title || mapping.format || 'Passage Neptune Media',
    format: mapping.format || '',
  });
}

export function normalizeDriveUploadCategoryV94(value) {
  return normalizeCategory(value);
}

function normalizeCategory(value) {
  const category = String(value || '').trim().toLowerCase();
  return CATEGORIES.has(category) ? category : '';
}
