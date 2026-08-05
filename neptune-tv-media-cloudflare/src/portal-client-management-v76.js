import { ensurePortalSchema } from './portal-schema.js';
import { json, sanitizeText } from './security.js';

const ACTIONS = new Set(['update', 'archive', 'activate', 'delete']);

export async function managePortalClient(store, body = {}) {
  ensurePortalSchema(store);
  const actor = await store.requireSession(body.token);
  if (!actor || !['admin', 'editor'].includes(actor.role)) return json({ error: 'unauthorized' }, 401);
  if (!body.csrfToken || body.csrfToken !== actor.csrfToken) return json({ error: 'csrf_failed' }, 403);

  const payload = body.payload && typeof body.payload === 'object' ? body.payload : {};
  const action = sanitizeText(payload.action, 24).toLowerCase();
  const clientId = sanitizeText(payload.clientId, 100);
  if (!ACTIONS.has(action) || !clientId) return json({ error: 'invalid_client_action' }, 400);

  const client = store.sql.exec(
    `SELECT id,email,full_name AS fullName,company,active,created_at AS createdAt,updated_at AS updatedAt
     FROM portal_clients WHERE id=? LIMIT 1`,
    clientId,
  ).toArray()[0];
  if (!client) return json({ error: 'client_not_found' }, 404);

  if (action === 'update') return updateClient(store, actor, client, payload);
  if (action === 'archive') return setClientActive(store, actor, client, false);
  if (action === 'activate') return setClientActive(store, actor, client, true);
  return deleteClient(store, actor, client, payload);
}

function updateClient(store, actor, client, payload) {
  const email = normalizeEmail(payload.email || client.email);
  const fullName = sanitizeText(payload.fullName, 180);
  const company = sanitizeText(payload.company, 180);
  if (!validEmail(email)) return json({ error: 'invalid_client_email' }, 400);

  const duplicate = store.sql.exec(
    'SELECT id FROM portal_clients WHERE email=? AND id<>? LIMIT 1',
    email,
    client.id,
  ).toArray()[0];
  if (duplicate) return json({ error: 'client_email_already_used' }, 409);

  const now = new Date().toISOString();
  store.sql.exec(
    'UPDATE portal_clients SET email=?,full_name=?,company=?,updated_at=? WHERE id=?',
    email,
    fullName,
    company,
    now,
    client.id,
  );
  if (email !== client.email) {
    store.sql.exec('DELETE FROM portal_sessions WHERE client_id=?', client.id);
    store.sql.exec('DELETE FROM portal_codes WHERE email IN (?,?)', client.email, email);
    store.sql.exec('DELETE FROM portal_auth_attempts WHERE email IN (?,?)', client.email, email);
    safeExec(store, 'UPDATE portal_prospects SET email=?,updated_at=? WHERE client_id=?', email, now, client.id);
  }
  store.audit(actor.id, 'portal_client_update', 'portal_client', client.id, {
    previousEmail: client.email,
    email,
    fullName,
    company,
  });
  return json({
    ok: true,
    action: 'update',
    client: { id: client.id, email, fullName, company, active: Number(client.active) === 1, updatedAt: now },
  });
}

function setClientActive(store, actor, client, active) {
  const now = new Date().toISOString();
  store.sql.exec('UPDATE portal_clients SET active=?,updated_at=? WHERE id=?', active ? 1 : 0, now, client.id);
  if (!active) {
    store.sql.exec('DELETE FROM portal_sessions WHERE client_id=?', client.id);
    store.sql.exec('DELETE FROM portal_codes WHERE email=? AND used_at IS NULL', client.email);
  }
  store.audit(actor.id, active ? 'portal_client_activate' : 'portal_client_archive', 'portal_client', client.id, {
    email: client.email,
  });
  return json({
    ok: true,
    action: active ? 'activate' : 'archive',
    client: {
      id: client.id,
      email: client.email,
      fullName: client.fullName,
      company: client.company,
      active,
      updatedAt: now,
    },
  });
}

function deleteClient(store, actor, client, payload) {
  if (actor.role !== 'admin') return json({ error: 'admin_required' }, 403);
  const expected = clientIdentity(client);
  const confirmation = String(payload.confirmation || '').trim();
  if (!confirmation || confirmation.localeCompare(expected, 'fr', { sensitivity: 'accent' }) !== 0) {
    return json({ error: 'client_delete_confirmation_failed', expected }, 400);
  }

  const orderIds = store.sql.exec('SELECT id FROM portal_orders WHERE client_id=?', client.id).toArray().map((row) => row.id);
  const files = store.sql.exec(
    `SELECT f.id,f.storage_key AS storageKey
     FROM portal_files f JOIN portal_orders o ON o.id=f.order_id
     WHERE o.client_id=?`,
    client.id,
  ).toArray();
  const fileIds = files.map((file) => file.id);
  const storageKeys = files.map((file) => String(file.storageKey || '')).filter(Boolean);

  for (const fileId of fileIds) safeExec(store, 'DELETE FROM portal_editorial_drafts WHERE file_id=?', fileId);
  for (const orderId of orderIds) {
    safeExec(store, 'DELETE FROM video_ai_jobs WHERE order_id=?', orderId);
    safeExec(store, 'DELETE FROM portal_workflow_events WHERE order_id=?', orderId);
    safeExec(store, 'DELETE FROM portal_workflow_outbox WHERE order_id=?', orderId);
  }

  store.audit(actor.id, 'portal_client_delete', 'portal_client', client.id, {
    email: client.email,
    orderCount: orderIds.length,
    fileCount: files.length,
    driveFilesDeleted: false,
  });
  store.sql.exec('DELETE FROM portal_codes WHERE email=?', client.email);
  store.sql.exec('DELETE FROM portal_auth_attempts WHERE email=?', client.email);
  store.sql.exec('DELETE FROM portal_clients WHERE id=?', client.id);

  return json({
    ok: true,
    action: 'delete',
    clientId: client.id,
    deleted: { orders: orderIds.length, files: files.length },
    storageKeys,
    driveFilesDeleted: false,
    drivePolicy: 'Google Drive files and folders were intentionally preserved.',
  });
}

function clientIdentity(client) {
  return String(client.fullName || client.company || client.email || '').trim();
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase().slice(0, 240);
}

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(value);
}

function safeExec(store, statement, ...params) {
  try {
    store.sql.exec(statement, ...params);
  } catch (error) {
    const message = String(error?.message || error || '');
    if (!/no such table/iu.test(message)) throw error;
  }
}
