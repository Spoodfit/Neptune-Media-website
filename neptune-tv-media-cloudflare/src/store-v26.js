import { StudioStore as LegacyStore } from './store-v25.js';
import { driveUploadTargetV94 } from './portal-drive-upload-v94.js';
import { json } from './security.js';

export class StudioStore extends LegacyStore {
  async fetch(request) {
    const url = new URL(request.url);
    const method = request.method.toUpperCase();
    if (method === 'POST' && url.pathname === '/portal/drive-upload-target-v94') {
      const body = await request.clone().json().catch(() => ({}));
      try {
        return await driveUploadTargetV94(this, body);
      } catch (error) {
        console.error('drive_upload_target_v94_failed', safeError(error));
        return json({ error: 'drive_upload_target_failed' }, 500);
      }
    }
    return super.fetch(request);
  }
}

function safeError(error) {
  return {
    name: String(error?.name || 'Error').slice(0, 120),
    message: String(error?.message || error || 'unknown').slice(0, 500),
  };
}
