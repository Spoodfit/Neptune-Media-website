import { StudioStore as LegacyStore } from './store-v6.js';
import { json } from './security.js';
import { ensurePortalSchema } from './portal-schema.js';
import { ensureDriveSchema } from './portal-drive.js';
import { driveFilesUpsert } from './portal-drive-v2.js';
import { driveFilesRemove, driveOrderPrune } from './portal-drive-removals.js';

const DRIVE_V7_PATHS = new Set([
  '/portal/drive-files',
  '/portal/drive-removed',
  '/portal/drive-prune',
]);

export class StudioStore extends LegacyStore {
  async fetch(request) {
    const url = new URL(request.url);
    const method = request.method.toUpperCase();
    if (method === 'POST' && DRIVE_V7_PATHS.has(url.pathname)) {
      ensurePortalSchema(this);
      ensureDriveSchema(this);
      const body = await request.clone().json().catch(() => ({}));
      try {
        if (url.pathname === '/portal/drive-files') return driveFilesUpsert(this, body);
        if (url.pathname === '/portal/drive-prune') return driveOrderPrune(this, body);
        return driveFilesRemove(this, body);
      } catch (error) {
        console.error('drive_store_v7_failed', {
          path: url.pathname,
          orderId: String(body?.orderId || '').slice(0, 100),
          name: error?.name || 'Error',
          message: String(error?.message || error || 'unknown').slice(0, 500),
        });
        return json({ error: 'drive_operation_failed' }, 500);
      }
    }
    return super.fetch(request);
  }
}
