import { StudioStore as LegacyStore } from './store-v6.js';
import { json } from './security.js';
import { ensurePortalSchema } from './portal-schema.js';
import { ensureDriveSchema } from './portal-drive.js';
import { driveFilesRemove } from './portal-drive-removals.js';

export class StudioStore extends LegacyStore {
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/portal/drive-removed' && request.method.toUpperCase() === 'POST') {
      ensurePortalSchema(this);
      ensureDriveSchema(this);
      const body = await request.clone().json().catch(() => ({}));
      try {
        return driveFilesRemove(this, body);
      } catch (error) {
        console.error('drive_removal_failed', {
          name: error?.name || 'Error',
          message: String(error?.message || error || 'unknown').slice(0, 500),
        });
        return json({ error: 'drive_removal_failed' }, 500);
      }
    }
    return super.fetch(request);
  }
}
