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
const MEDIA_V7_PATHS = new Set([
  '/portal/session-media',
  '/portal/file-authorize-media',
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

    if (method === 'POST' && MEDIA_V7_PATHS.has(url.pathname)) {
      ensurePortalSchema(this);
      ensureDriveSchema(this);
      const body = await request.clone().json().catch(() => ({}));
      try {
        if (url.pathname === '/portal/session-media') return this.sessionWithMedia(body);
        return this.authorizeFileWithMedia(body);
      } catch (error) {
        console.error('client_media_store_v7_failed', {
          path: url.pathname,
          fileId: String(body?.fileId || '').slice(0, 100),
          name: error?.name || 'Error',
          message: String(error?.message || error || 'unknown').slice(0, 500),
        });
        return json({ error: 'client_media_store_failed' }, 500);
      }
    }

    return super.fetch(request);
  }

  async sessionWithMedia(body) {
    const response = await super.fetch(new Request('https://store/portal/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
    }));
    const result = await response.json().catch(() => ({}));
    if (!response.ok) return json(result, response.status);

    for (const order of result.orders || []) {
      order.files = this.sql.exec(`
        SELECT pf.id,pf.name,pf.file_type AS fileType,pf.storage_key AS storageKey,
               pf.external_url AS externalUrl,pf.size_label AS sizeLabel,pf.created_at AS createdAt,
               df.drive_file_id AS driveFileId,df.mime_type AS mimeType,df.modified_at AS modifiedAt,
               df.web_view_url AS webViewUrl,df.download_url AS driveDownloadUrl,df.version AS driveVersion
        FROM portal_files pf
        LEFT JOIN portal_drive_files df ON df.portal_file_id=pf.id
        WHERE pf.order_id=?
        ORDER BY COALESCE(df.modified_at,pf.created_at) DESC
      `, order.id).toArray().map((file) => mediaFile(file));
    }

    return json(result);
  }

  async authorizeFileWithMedia(body) {
    const response = await super.fetch(new Request('https://store/portal/file-authorize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
    }));
    const result = await response.json().catch(() => ({}));
    if (!response.ok) return json(result, response.status);

    const enriched = this.sql.exec(`
      SELECT pf.id,pf.name,pf.file_type AS fileType,pf.storage_key AS storageKey,
             pf.external_url AS externalUrl,pf.size_label AS sizeLabel,pf.created_at AS createdAt,
             df.drive_file_id AS driveFileId,df.mime_type AS mimeType,df.modified_at AS modifiedAt,
             df.web_view_url AS webViewUrl,df.download_url AS driveDownloadUrl,df.version AS driveVersion
      FROM portal_files pf
      LEFT JOIN portal_drive_files df ON df.portal_file_id=pf.id
      WHERE pf.id=? LIMIT 1
    `, result.file?.id || body.fileId || '').toArray()[0];

    return enriched ? json({ ok: true, file: mediaFile(enriched) }) : json(result);
  }
}

function mediaFile(file) {
  const id = String(file.id || '');
  const driveFileId = String(file.driveFileId || '');
  return {
    ...file,
    driveFileId: driveFileId || null,
    driveVersion: Number(file.driveVersion || 0),
    source: file.storageKey ? 'r2' : driveFileId ? 'google-drive' : file.externalUrl ? 'external' : 'unknown',
    downloadUrl: id ? `/api/client/files/${encodeURIComponent(id)}?download=1` : '',
    previewUrl: id ? `/api/client/files/${encodeURIComponent(id)}?inline=1` : '',
    thumbnailUrl: driveFileId && id ? `/api/client/files/${encodeURIComponent(id)}?thumbnail=1` : '',
  };
}
