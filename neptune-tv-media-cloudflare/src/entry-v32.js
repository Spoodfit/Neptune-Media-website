import base from './entry-v31.js';
import { StudioStore } from './store-v26.js';
import { adminAuth, safeFilename } from './portal-http-utils.js';
import { isSameOrigin, json } from './security.js';

export { StudioStore };

const RELEASE = 'neptune-studio-drive-upload-20260811-v94';
const TARGET_PATH = '/api/admin/drive-upload-v94/target';
const SESSION_PATH = '/api/admin/drive-upload-v94/session';
const REGISTER_PATH = '/api/admin/drive-upload-v94/register';
const DRIVE_UPLOAD_JS = '/studio/drive-upload-v94.js?v=1';
const DRIVE_UPLOAD_CSS = '/studio/drive-upload-v94.css?v=1';
const DRIVE_UPLOAD_ORIGIN = 'https://www.googleapis.com';
const MAX_FILE_BYTES = 5 * 1024 ** 4;
const STAGING_PREFIX = '.__neptune_uploading__';
const UPLOAD_STATE_UPLOADING = 'uploading';
const UPLOAD_STATE_COMPLETE = 'complete';
const ALLOWED_CATEGORIES = new Set(['long', 'short']);
const ALLOWED_EXACT_MIME = new Set([
  'application/octet-stream',
  'application/zip',
  'video/mp4',
  'video/quicktime',
  'video/webm',
  'video/x-m4v',
]);

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const studio = env.STUDIO.get(env.STUDIO.idFromName('neptune-media-main'));

    if (request.method === 'POST' && [TARGET_PATH, SESSION_PATH, REGISTER_PATH].includes(url.pathname)) {
      if (!isSameOrigin(request)) return secureApi(json({ error: 'origin_forbidden' }, 403));
      let response;
      if (url.pathname === TARGET_PATH) response = await uploadTarget(request, studio);
      else if (url.pathname === SESSION_PATH) response = await createUploadSession(request, studio);
      else response = await registerUploadedFile(request, studio);
      return secureApi(response);
    }

    let response = await base.fetch(request, env, ctx);
    if (request.method === 'GET' && url.pathname === '/api/public/release' && response.ok) {
      response = await augmentRelease(response);
    }
    if (request.method === 'GET' && response.ok && isStudioClientsPath(url.pathname)
      && (response.headers.get('Content-Type') || '').includes('text/html')) {
      response = await injectDriveUpload(response);
    }
    return response;
  },

  async scheduled(controller, env, ctx) {
    if (typeof base.scheduled === 'function') return base.scheduled(controller, env, ctx);
  },
};

async function uploadTarget(request, studio) {
  const payload = await request.json().catch(() => ({}));
  const orderId = cleanId(payload.orderId);
  if (!orderId) return json({ error: 'invalid_order' }, 400);
  const target = await readTarget(request, studio, orderId, '');
  if (!target.ok) return target.response;
  return json(publicTarget(target.data));
}

async function createUploadSession(request, studio) {
  const payload = await request.json().catch(() => ({}));
  const orderId = cleanId(payload.orderId);
  const category = cleanCategory(payload.category);
  const name = safeFilename(payload.name || 'video');
  const mimeType = cleanMime(payload.mimeType);
  const size = Number(payload.size || 0);
  if (!orderId || !category || !name || !validFileSize(size) || !mimeType) {
    return json({ error: 'invalid_upload_metadata' }, 400);
  }

  const target = await readTarget(request, studio, orderId, category);
  if (!target.ok) return target.response;
  const credential = await readDriveCredential(studio);
  if (!credential.ok) return credential.response;

  const folderId = target.data.targetFolderId;
  if (!folderId) return json({ error: 'drive_target_missing' }, 409);

  const googleUrl = new URL('https://www.googleapis.com/upload/drive/v3/files');
  googleUrl.searchParams.set('uploadType', 'resumable');
  googleUrl.searchParams.set('supportsAllDrives', 'true');
  googleUrl.searchParams.set('fields', 'id,name,mimeType,size,modifiedTime,webViewLink,parents,appProperties');
  const metadata = {
    name: stagingFilename(name),
    mimeType,
    parents: [folderId],
    appProperties: {
      neptuneOrderId: orderId,
      neptuneCategory: category,
      neptuneSource: 'studio-v94',
      neptuneExpectedSize: String(Math.trunc(size)),
      neptuneUploadState: UPLOAD_STATE_UPLOADING,
    },
  };
  const googleResponse = await fetch(googleUrl.toString(), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${credential.accessToken}`,
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Type': mimeType,
      'X-Upload-Content-Length': String(Math.trunc(size)),
    },
    body: JSON.stringify(metadata),
  });
  if (!googleResponse.ok) {
    const provider = await googleResponse.json().catch(() => ({}));
    console.error('drive_upload_session_failed', {
      orderId,
      category,
      providerStatus: googleResponse.status,
      providerError: String(provider?.error?.message || '').slice(0, 300),
    });
    return json({ error: googleResponse.status === 401 ? 'drive_access_expired' : 'drive_upload_session_failed', providerStatus: googleResponse.status }, 502);
  }
  const uploadUrl = googleResponse.headers.get('Location') || '';
  if (!uploadUrl.startsWith(`${DRIVE_UPLOAD_ORIGIN}/upload/`)) {
    return json({ error: 'drive_upload_session_missing' }, 502);
  }

  return json({
    ok: true,
    release: RELEASE,
    orderId,
    category,
    name,
    mimeType,
    size: Math.trunc(size),
    uploadUrl,
    passageNumber: target.data.passageNumber,
    passageFolderUrl: target.data.passageFolderUrl || '',
    expiresHint: 'session_resumable_google_drive',
  });
}

async function registerUploadedFile(request, studio) {
  const payload = await request.json().catch(() => ({}));
  const orderId = cleanId(payload.orderId);
  const category = cleanCategory(payload.category);
  const fileId = cleanDriveFileId(payload.fileId);
  if (!orderId || !category || !fileId) return json({ error: 'invalid_registration' }, 400);

  const target = await readTarget(request, studio, orderId, category);
  if (!target.ok) return target.response;
  const credential = await readDriveCredential(studio);
  if (!credential.ok) return credential.response;

  const verified = await readGoogleDriveFile(credential.accessToken, fileId);
  if (!verified.ok) return verified.response;
  let file = verified.file;

  const parents = Array.isArray(file.parents) ? file.parents.map(String) : [];
  if (!parents.includes(target.data.targetFolderId)) {
    return json({ error: 'drive_file_wrong_folder' }, 409);
  }

  const properties = file.appProperties && typeof file.appProperties === 'object' ? file.appProperties : {};
  if (String(properties.neptuneOrderId || '') !== orderId
    || String(properties.neptuneCategory || '') !== category
    || String(properties.neptuneSource || '') !== 'studio-v94') {
    return json({ error: 'drive_file_metadata_mismatch' }, 409);
  }

  const actualSize = Math.max(0, Math.trunc(Number(file.size || 0)));
  const expectedSize = Math.max(0, Math.trunc(Number(properties.neptuneExpectedSize || 0)));
  const uploadState = String(properties.neptuneUploadState || '');
  if (!validFileSize(actualSize) || !validFileSize(expectedSize) || actualSize !== expectedSize) {
    console.warn('drive_upload_size_mismatch', { orderId, fileId, expectedSize, actualSize });
    return json({ error: 'drive_file_metadata_mismatch' }, 409);
  }
  if (![UPLOAD_STATE_UPLOADING, UPLOAD_STATE_COMPLETE].includes(uploadState)) {
    return json({ error: 'drive_file_metadata_mismatch' }, 409);
  }

  const originalName = originalFilename(file.name);
  if (!originalName) return json({ error: 'drive_file_metadata_mismatch' }, 409);

  // Phase 1: Neptune records the fully received bytes before the Drive object becomes deliverable.
  const provisional = await registerDriveInventory(studio, orderId, category, file, {
    name: originalName,
    sizeBytes: actualSize,
  });
  if (!provisional.ok) return provisional.response;

  // Phase 2: only after Neptune has accepted the file do we remove the staging marker in Drive.
  if (uploadState !== UPLOAD_STATE_COMPLETE || String(file.name || '') !== originalName) {
    const finalized = await finalizeGoogleDriveFile(credential.accessToken, file, originalName);
    if (!finalized.ok) return finalized.response;
    file = finalized.file;
  }

  // Reconcile the final Drive metadata. This is idempotent and makes a lost HTTP response safe to retry.
  const committed = await registerDriveInventory(studio, orderId, category, file, {
    name: originalName,
    sizeBytes: actualSize,
  });
  if (!committed.ok) return committed.response;

  return json({
    ok: true,
    release: RELEASE,
    orderId,
    category,
    file: {
      id: String(file.id || ''),
      name: originalName,
      mimeType: String(file.mimeType || ''),
      size: actualSize,
      modifiedTime: validIso(file.modifiedTime) || new Date().toISOString(),
      webViewLink: String(file.webViewLink || ''),
    },
    drive: committed.data.summary || provisional.data.summary || null,
    changed: Number(committed.data.changed || provisional.data.changed || 0),
    registered: Number(committed.data.accepted || provisional.data.accepted || 0) > 0,
    deliveryReady: true,
  });
}

async function readGoogleDriveFile(accessToken, fileId) {
  const googleUrl = new URL(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`);
  googleUrl.searchParams.set('supportsAllDrives', 'true');
  googleUrl.searchParams.set('fields', 'id,name,mimeType,size,modifiedTime,webViewLink,parents,appProperties');
  const response = await fetch(googleUrl.toString(), {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
  });
  const file = await response.json().catch(() => ({}));
  if (!response.ok) {
    return { ok: false, response: json({ error: 'drive_file_verification_failed', providerStatus: response.status }, 502) };
  }
  return { ok: true, file };
}

async function finalizeGoogleDriveFile(accessToken, file, originalName) {
  const fileId = cleanDriveFileId(file?.id);
  if (!fileId) return { ok: false, response: json({ error: 'drive_file_verification_failed' }, 502) };
  const googleUrl = new URL(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`);
  googleUrl.searchParams.set('supportsAllDrives', 'true');
  googleUrl.searchParams.set('fields', 'id,name,mimeType,size,modifiedTime,webViewLink,parents,appProperties');
  const appProperties = {
    ...(file.appProperties && typeof file.appProperties === 'object' ? file.appProperties : {}),
    neptuneUploadState: UPLOAD_STATE_COMPLETE,
  };
  const response = await fetch(googleUrl.toString(), {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
      'Content-Type': 'application/json; charset=UTF-8',
    },
    body: JSON.stringify({ name: originalName, appProperties }),
  });
  const finalized = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error('drive_upload_finalize_failed', { fileId, providerStatus: response.status });
    return { ok: false, response: json({ error: 'drive_file_verification_failed', providerStatus: response.status }, 502) };
  }
  const expectedSize = Math.max(0, Math.trunc(Number(appProperties.neptuneExpectedSize || 0)));
  const actualSize = Math.max(0, Math.trunc(Number(finalized.size || 0)));
  if (!validFileSize(actualSize) || actualSize !== expectedSize
    || String(finalized.appProperties?.neptuneUploadState || '') !== UPLOAD_STATE_COMPLETE
    || String(finalized.name || '') !== originalName) {
    return { ok: false, response: json({ error: 'drive_file_metadata_mismatch' }, 409) };
  }
  return { ok: true, file: finalized };
}

async function registerDriveInventory(studio, orderId, category, file, overrides = {}) {
  const modifiedAt = validIso(file.modifiedTime) || new Date().toISOString();
  const response = await callStore(studio, '/portal/drive-files', {
    orderId,
    scannedAt: new Date().toISOString(),
    files: [{
      driveFileId: file.id,
      name: overrides.name || originalFilename(file.name),
      mimeType: file.mimeType || 'application/octet-stream',
      modifiedAt,
      category,
      webViewUrl: file.webViewLink || '',
      sizeBytes: Number(overrides.sizeBytes || file.size || 0),
    }],
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    return { ok: false, response: json({ error: data.error || 'drive_registration_failed' }, response.status), data };
  }
  return { ok: true, data };
}

async function readTarget(request, studio, orderId, category) {
  const response = await callStore(studio, '/portal/drive-upload-target-v94', {
    ...adminAuth(request),
    payload: { orderId, category },
  });
  const data = await response.json().catch(() => ({}));
  return response.ok ? { ok: true, data } : { ok: false, response: json(data, response.status) };
}

async function readDriveCredential(studio) {
  const response = await callStore(studio, '/portal/drive-token-get', {});
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.accessToken) {
    return { ok: false, response: json({ error: 'drive_access_missing' }, 503) };
  }
  return { ok: true, accessToken: data.accessToken };
}

function publicTarget(target) {
  return {
    ok: true,
    release: RELEASE,
    ready: target.ready === true,
    orderId: target.orderId,
    passageNumber: Number(target.passageNumber || 1),
    passageFolderUrl: target.passageFolderUrl || '',
    syncStatus: target.syncStatus || 'pending',
    lastScanAt: target.lastScanAt || null,
    title: target.title || 'Passage Neptune Media',
    format: target.format || '',
    client: target.client || {},
    destinations: {
      long: 'Long format',
      short: 'Shorts',
    },
  };
}

function callStore(studio, path, body) {
  return studio.fetch(`https://store${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
}

function stagingFilename(name) {
  return `${STAGING_PREFIX}${String(name || 'video')}`;
}

function originalFilename(name) {
  const value = String(name || '');
  return safeFilename(value.startsWith(STAGING_PREFIX) ? value.slice(STAGING_PREFIX.length) : value);
}

function cleanId(value) {
  return String(value || '').trim().slice(0, 100);
}

function cleanCategory(value) {
  const category = String(value || '').trim().toLowerCase();
  return ALLOWED_CATEGORIES.has(category) ? category : '';
}

function cleanMime(value) {
  const mime = String(value || 'application/octet-stream').trim().toLowerCase().slice(0, 160) || 'application/octet-stream';
  return mime.startsWith('video/') || ALLOWED_EXACT_MIME.has(mime) ? mime : '';
}

function cleanDriveFileId(value) {
  const id = String(value || '').trim();
  return /^[A-Za-z0-9_-]{10,240}$/u.test(id) ? id : '';
}

function validFileSize(value) {
  return Number.isSafeInteger(value) && value > 0 && value <= MAX_FILE_BYTES;
}

function validIso(value) {
  const date = new Date(value || '');
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

async function augmentRelease(response) {
  const current = await response.json().catch(() => ({}));
  return new Response(JSON.stringify({
    ...current,
    studioDriveUpload: RELEASE,
    studioDriveUploadMode: 'direct-resumable-google-drive-v94',
    studioDriveUploadStorage: 'google-drive-source-of-truth',
  }), {
    status: response.status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

async function injectDriveUpload(response) {
  let body = await response.text();
  body = body.replace(/<link\b[^>]*href=["'][^"']*\/studio\/drive-upload-v94\.css[^"']*["'][^>]*>\s*/giu, '');
  body = body.replace(/<script\b[^>]*src=["'][^"']*\/studio\/drive-upload-v94\.js[^"']*["'][^>]*>\s*<\/script>\s*/giu, '');
  body = body.replace('</head>', `<link rel="stylesheet" href="${DRIVE_UPLOAD_CSS}"></head>`);
  body = body.replace('</body>', `<script type="module" src="${DRIVE_UPLOAD_JS}"></script></body>`);
  const headers = new Headers(response.headers);
  headers.delete('Content-Length');
  headers.set('Cache-Control', 'private, no-store, max-age=0');
  allowGoogleApiConnect(headers);
  headers.set('X-Neptune-Drive-Upload', RELEASE);
  return new Response(body, { status: response.status, statusText: response.statusText, headers });
}

function allowGoogleApiConnect(headers) {
  const csp = headers.get('Content-Security-Policy') || '';
  if (!csp || csp.includes(DRIVE_UPLOAD_ORIGIN)) return;
  headers.set('Content-Security-Policy', csp.replace(/connect-src\s+([^;]+)/u, (match, sources) => `connect-src ${sources} ${DRIVE_UPLOAD_ORIGIN}`));
}

function secureApi(response) {
  const headers = new Headers(response.headers);
  headers.set('Cache-Control', 'no-store');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Neptune-Drive-Upload', RELEASE);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function isStudioClientsPath(pathname) {
  return pathname === '/studio/clients' || pathname === '/studio/clients/' || pathname === '/studio/clients.html';
}
