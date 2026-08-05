import { StudioStore as LegacyStore } from './store-v13.js';
import { managePortalClient } from './portal-client-management-v76.js';
import { ensureDriveSchema } from './portal-drive.js';
import { json } from './security.js';
import {
  adminContentCalendar,
  adminContentFileSource,
  adminContentScheduleDelete,
  adminContentScheduleUpsert,
} from './portal-content-admin-v79.js';

const ADMIN_CONTENT_ROUTES = new Map([
  ['/portal/admin-content-calendar', adminContentCalendar],
  ['/portal/admin-content-file-source', adminContentFileSource],
  ['/portal/admin-content-schedule-upsert', adminContentScheduleUpsert],
  ['/portal/admin-content-schedule-delete', adminContentScheduleDelete],
]);
const READ_ONLY_CONTENT_ROUTES = new Set([
  '/portal/admin-content-calendar',
  '/portal/admin-content-file-source',
]);

export class StudioStore extends LegacyStore {
  async fetch(request) {
    const url = new URL(request.url);
    const method = request.method.toUpperCase();

    if (method === 'POST' && url.pathname === '/portal/admin-client-manage') {
      const body = await request.clone().json().catch(() => ({}));
      try {
        return await managePortalClient(this, body);
      } catch (error) {
        console.error('portal_client_management_failed', {
          name: String(error?.name || 'Error').slice(0, 120),
          message: String(error?.message || error || 'unknown').slice(0, 500),
        });
        return json({ error: 'client_management_failed' }, 500);
      }
    }

    if (method === 'POST' && ADMIN_CONTENT_ROUTES.has(url.pathname)) {
      const body = await request.clone().json().catch(() => ({}));
      if (READ_ONLY_CONTENT_ROUTES.has(url.pathname)) {
        const actor = await this.requireSession(body.token);
        if (!actor || actor.role !== 'admin') return json({ error: 'unauthorized' }, 401);
      } else {
        const validation = await super.fetch(new Request('https://store/portal/admin-list', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }));
        if (!validation.ok) return validation;
      }
      try {
        return ADMIN_CONTENT_ROUTES.get(url.pathname)(this, body.payload || {});
      } catch (error) {
        console.error('portal_admin_content_failed', {
          route: url.pathname,
          name: String(error?.name || 'Error').slice(0, 120),
          message: String(error?.message || error || 'unknown').slice(0, 500),
        });
        return json({ error: 'content_management_failed' }, 500);
      }
    }

    if (method === 'POST' && url.pathname === '/portal/admin-list') {
      const response = await super.fetch(request);
      if (!response.ok) return response;
      const result = await response.json().catch(() => ({}));
      ensureDriveSchema(this);
      const activeClientIds = new Set(
        (result.clients || []).filter((client) => client.active !== false).map((client) => client.id),
      );
      const orders = (result.orders || [])
        .filter((order) => activeClientIds.has(order.clientId))
        .map((order) => ({ ...order, files: enrichAdminOrderFiles(this, order) }));
      return json({
        ...result,
        orders,
        archivedClients: (result.clients || []).filter((client) => client.active === false).length,
      });
    }

    return super.fetch(request);
  }
}

function enrichAdminOrderFiles(store, order) {
  const driveFiles = store.sql.exec(`
    SELECT drive_file_id AS driveFileId,portal_file_id AS portalFileId,mime_type AS mimeType,
           modified_at AS modifiedAt,version,web_view_url AS webViewUrl,download_url AS downloadUrl
    FROM portal_drive_files WHERE order_id=?
  `, order.id).toArray();
  const byPortalFile = new Map(driveFiles.map((file) => [file.portalFileId, file]));

  return (order.files || []).map((file) => {
    const drive = byPortalFile.get(file.id);
    if (!drive) {
      return {
        ...file,
        source: file.storageKey ? 'r2' : 'external',
        previewUrl: file.externalUrl || '',
        downloadUrl: file.externalUrl || '',
        thumbnailProxyUrl: `/api/admin/content-thumbnail?fileId=${encodeURIComponent(file.id)}`,
        mediaProxyUrl: `/api/admin/content-media?fileId=${encodeURIComponent(file.id)}`,
      };
    }
    const driveFileId = String(drive.driveFileId || '');
    return {
      ...file,
      source: 'google-drive',
      driveFileId,
      driveVersion: Number(drive.version || 1),
      mimeType: drive.mimeType || '',
      modifiedAt: drive.modifiedAt || file.createdAt,
      thumbnailUrl: driveFileId
        ? `https://drive.google.com/thumbnail?id=${encodeURIComponent(driveFileId)}&sz=w640`
        : '',
      thumbnailProxyUrl: `/api/admin/content-thumbnail?fileId=${encodeURIComponent(file.id)}`,
      mediaProxyUrl: `/api/admin/content-media?fileId=${encodeURIComponent(file.id)}`,
      previewUrl: drive.downloadUrl || file.externalUrl || drive.webViewUrl || '',
      downloadUrl: drive.downloadUrl || file.externalUrl || '',
      externalUrl: drive.webViewUrl || file.externalUrl || '',
    };
  });
}
