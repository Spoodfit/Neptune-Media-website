import { ensureWorkflowSchema, normalizeEmail, requireViewer, safeParse } from './workflow-db-v5.js';
import { json, sanitizeText } from './security.js';

const STATUS_RANK = {
  queued: 0,
  sent: 10,
  delivered: 20,
  opened: 30,
  clicked: 40,
  delayed: 15,
  suppressed: 80,
  failed: 81,
  bounced: 82,
  complained: 83,
};
const FAILURE_STATUSES = new Set(['failed', 'bounced', 'complained', 'suppressed']);

export function ensureEmailTrackingSchema(store) {
  ensureWorkflowSchema(store);
  if (store.emailTrackingV82Ready) return;
  store.sql.exec(`
    CREATE TABLE IF NOT EXISTS portal_email_tracking(
      id TEXT PRIMARY KEY,
      email_id TEXT UNIQUE,
      outbox_id TEXT NOT NULL DEFAULT '',
      order_id TEXT NOT NULL DEFAULT '',
      message_key TEXT NOT NULL DEFAULT '',
      recipient_type TEXT NOT NULL DEFAULT '',
      to_email TEXT NOT NULL DEFAULT '',
      subject TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'queued',
      sent_at TEXT,
      delivered_at TEXT,
      opened_at TEXT,
      clicked_at TEXT,
      delayed_at TEXT,
      failed_at TEXT,
      bounced_at TEXT,
      complained_at TEXT,
      suppressed_at TEXT,
      last_event_at TEXT,
      open_count INTEGER NOT NULL DEFAULT 0,
      click_count INTEGER NOT NULL DEFAULT 0,
      last_click_url TEXT NOT NULL DEFAULT '',
      last_error TEXT NOT NULL DEFAULT '',
      payload TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS portal_email_webhook_receipts(
      svix_id TEXT PRIMARY KEY,
      event_type TEXT NOT NULL DEFAULT '',
      email_id TEXT NOT NULL DEFAULT '',
      received_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_portal_email_tracking_order ON portal_email_tracking(order_id,created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_portal_email_tracking_status ON portal_email_tracking(status,last_event_at DESC);
    CREATE INDEX IF NOT EXISTS idx_portal_email_tracking_provider ON portal_email_tracking(email_id);
  `);
  backfillEmailTracking(store);
  store.emailTrackingV82Ready = true;
}

export function trackEmailAttempt(store, body = {}) {
  ensureEmailTrackingSchema(store);
  const now = new Date().toISOString();
  const emailId = sanitizeText(body.emailId, 220);
  const outboxId = sanitizeText(body.outboxId, 120);
  const outcome = body.outcome === 'sent' ? 'sent' : 'failed';
  const id = emailId ? `email:${emailId}` : `outbox:${outboxId || crypto.randomUUID()}`;
  const sentAt = outcome === 'sent' ? normalizeIso(body.sentAt) || now : null;
  const failedAt = outcome === 'failed' ? normalizeIso(body.sentAt) || now : null;
  const orderId = sanitizeText(body.orderId, 120);
  const messageKey = sanitizeText(body.messageKey, 180);
  const recipientType = sanitizeText(body.recipientType, 40);
  const toEmail = normalizeEmail(body.toEmail);
  const subject = sanitizeText(body.subject, 320);
  const error = sanitizeText(body.error, 700);
  const payload = safeObject(body.payload);

  store.sql.exec(`
    INSERT INTO portal_email_tracking(
      id,email_id,outbox_id,order_id,message_key,recipient_type,to_email,subject,status,
      sent_at,failed_at,last_event_at,last_error,payload,created_at,updated_at
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET
      email_id=CASE WHEN excluded.email_id<>'' THEN excluded.email_id ELSE portal_email_tracking.email_id END,
      outbox_id=CASE WHEN excluded.outbox_id<>'' THEN excluded.outbox_id ELSE portal_email_tracking.outbox_id END,
      order_id=CASE WHEN excluded.order_id<>'' THEN excluded.order_id ELSE portal_email_tracking.order_id END,
      message_key=CASE WHEN excluded.message_key<>'' THEN excluded.message_key ELSE portal_email_tracking.message_key END,
      recipient_type=CASE WHEN excluded.recipient_type<>'' THEN excluded.recipient_type ELSE portal_email_tracking.recipient_type END,
      to_email=CASE WHEN excluded.to_email<>'' THEN excluded.to_email ELSE portal_email_tracking.to_email END,
      subject=CASE WHEN excluded.subject<>'' THEN excluded.subject ELSE portal_email_tracking.subject END,
      status=CASE WHEN excluded.status='failed' THEN 'failed' WHEN portal_email_tracking.status IN('opened','clicked','bounced','complained','suppressed') THEN portal_email_tracking.status ELSE excluded.status END,
      sent_at=COALESCE(portal_email_tracking.sent_at,excluded.sent_at),
      failed_at=COALESCE(portal_email_tracking.failed_at,excluded.failed_at),
      last_event_at=MAX(COALESCE(portal_email_tracking.last_event_at,''),COALESCE(excluded.last_event_at,'')),
      last_error=CASE WHEN excluded.last_error<>'' THEN excluded.last_error ELSE portal_email_tracking.last_error END,
      payload=CASE WHEN excluded.payload<>'{}' THEN excluded.payload ELSE portal_email_tracking.payload END,
      updated_at=excluded.updated_at
  `,
  id, emailId || null, outboxId, orderId, messageKey, recipientType, toEmail, subject, outcome,
  sentAt, failedAt, sentAt || failedAt || now, error, JSON.stringify(payload), now, now);

  return json({ ok: true, id, emailId, status: outcome });
}

export function applyResendWebhookEvent(store, body = {}) {
  ensureEmailTrackingSchema(store);
  const event = safeObject(body.event);
  const type = sanitizeText(event.type || body.type, 100).toLowerCase();
  const data = safeObject(event.data || body.data);
  const emailId = sanitizeText(data.email_id || data.emailId || data.id || body.emailId, 220);
  const svixId = sanitizeText(body.svixId, 220);
  const eventAt = normalizeIso(event.created_at || event.createdAt || data.created_at || data.createdAt) || new Date().toISOString();
  if (!type || !emailId) return json({ error: 'invalid_resend_event' }, 400);

  if (svixId) {
    const duplicate = store.sql.exec('SELECT svix_id FROM portal_email_webhook_receipts WHERE svix_id=? LIMIT 1', svixId).toArray()[0];
    if (duplicate) return json({ ok: true, duplicate: true, emailId, eventType: type });
    store.sql.exec('INSERT INTO portal_email_webhook_receipts(svix_id,event_type,email_id,received_at) VALUES(?,?,?,?)', svixId, type, emailId, new Date().toISOString());
  }

  const mapped = statusFromEvent(type);
  const id = `email:${emailId}`;
  const current = store.sql.exec('SELECT * FROM portal_email_tracking WHERE email_id=? OR id=? LIMIT 1', emailId, id).toArray()[0] || {};
  const nextStatus = chooseStatus(current.status || 'queued', mapped);
  const toEmail = normalizeEmail(Array.isArray(data.to) ? data.to[0] : data.to);
  const subject = sanitizeText(data.subject, 320);
  const clickUrl = sanitizeText(data.click?.link || data.click?.url || data.url, 1600);
  const now = new Date().toISOString();

  const fields = eventFields(mapped, eventAt, current);
  store.sql.exec(`
    INSERT INTO portal_email_tracking(
      id,email_id,order_id,to_email,subject,status,sent_at,delivered_at,opened_at,clicked_at,
      delayed_at,failed_at,bounced_at,complained_at,suppressed_at,last_event_at,open_count,click_count,
      last_click_url,last_error,payload,created_at,updated_at
    ) VALUES(?,?, '',?,?, ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, ?,?)
    ON CONFLICT(id) DO UPDATE SET
      to_email=CASE WHEN excluded.to_email<>'' THEN excluded.to_email ELSE portal_email_tracking.to_email END,
      subject=CASE WHEN excluded.subject<>'' THEN excluded.subject ELSE portal_email_tracking.subject END,
      status=excluded.status,
      sent_at=COALESCE(portal_email_tracking.sent_at,excluded.sent_at),
      delivered_at=COALESCE(portal_email_tracking.delivered_at,excluded.delivered_at),
      opened_at=COALESCE(portal_email_tracking.opened_at,excluded.opened_at),
      clicked_at=COALESCE(portal_email_tracking.clicked_at,excluded.clicked_at),
      delayed_at=COALESCE(portal_email_tracking.delayed_at,excluded.delayed_at),
      failed_at=COALESCE(portal_email_tracking.failed_at,excluded.failed_at),
      bounced_at=COALESCE(portal_email_tracking.bounced_at,excluded.bounced_at),
      complained_at=COALESCE(portal_email_tracking.complained_at,excluded.complained_at),
      suppressed_at=COALESCE(portal_email_tracking.suppressed_at,excluded.suppressed_at),
      last_event_at=MAX(COALESCE(portal_email_tracking.last_event_at,''),excluded.last_event_at),
      open_count=portal_email_tracking.open_count+excluded.open_count,
      click_count=portal_email_tracking.click_count+excluded.click_count,
      last_click_url=CASE WHEN excluded.last_click_url<>'' THEN excluded.last_click_url ELSE portal_email_tracking.last_click_url END,
      last_error=CASE WHEN excluded.last_error<>'' THEN excluded.last_error ELSE portal_email_tracking.last_error END,
      updated_at=excluded.updated_at
  `,
  id, emailId, toEmail, subject, nextStatus,
  fields.sentAt, fields.deliveredAt, fields.openedAt, fields.clickedAt, fields.delayedAt,
  fields.failedAt, fields.bouncedAt, fields.complainedAt, fields.suppressedAt, eventAt,
  mapped === 'opened' ? 1 : 0, mapped === 'clicked' ? 1 : 0, clickUrl,
  sanitizeText(data.error || data.reason || data.bounce?.message, 700), JSON.stringify({ providerEvent: type }),
  current.created_at || eventAt, now);

  return json({ ok: true, emailId, eventType: type, status: nextStatus, eventAt });
}

export async function listEmailHistory(store, body = {}) {
  ensureEmailTrackingSchema(store);
  const access = await requireViewer(store, body);
  if (!access.ok) return access.response;
  const orderId = sanitizeText(body.orderId, 120);
  const limit = Math.max(1, Math.min(250, Number(body.limit || 100)));
  const rows = orderId
    ? store.sql.exec(historyQuery('WHERE t.order_id=?'), orderId, limit).toArray()
    : store.sql.exec(historyQuery(''), limit).toArray();
  const items = rows.map(decorateTrackingRow);
  return json({
    ok: true,
    orderId,
    items,
    summary: summarize(items),
    tracking: {
      provider: 'resend',
      providerSyncAvailable: Boolean(store.env?.RESEND_API_KEY),
      webhookConfigured: Boolean(store.env?.RESEND_WEBHOOK_SECRET),
      openSignal: 'indicative-not-proof-of-human-reading',
    },
  });
}

export function syncProviderSnapshots(store, body = {}) {
  ensureEmailTrackingSchema(store);
  const snapshots = Array.isArray(body.snapshots) ? body.snapshots.slice(0, 40) : [];
  const now = new Date().toISOString();
  let updated = 0;
  for (const snapshot of snapshots) {
    const emailId = sanitizeText(snapshot.emailId || snapshot.id, 220);
    const mapped = statusFromEvent(`email.${sanitizeText(snapshot.lastEvent || snapshot.last_event, 80).toLowerCase()}`);
    if (!emailId || mapped === 'queued') continue;
    const row = store.sql.exec('SELECT * FROM portal_email_tracking WHERE email_id=? LIMIT 1', emailId).toArray()[0];
    if (!row) continue;
    const status = chooseStatus(row.status || 'queued', mapped);
    const fields = eventFields(mapped, now, row);
    store.sql.exec(`UPDATE portal_email_tracking SET status=?,sent_at=COALESCE(sent_at,?),delivered_at=COALESCE(delivered_at,?),opened_at=COALESCE(opened_at,?),clicked_at=COALESCE(clicked_at,?),delayed_at=COALESCE(delayed_at,?),failed_at=COALESCE(failed_at,?),bounced_at=COALESCE(bounced_at,?),complained_at=COALESCE(complained_at,?),suppressed_at=COALESCE(suppressed_at,?),last_event_at=?,subject=CASE WHEN ?<>'' THEN ? ELSE subject END,to_email=CASE WHEN ?<>'' THEN ? ELSE to_email END,updated_at=? WHERE email_id=?`,
      status, fields.sentAt, fields.deliveredAt, fields.openedAt, fields.clickedAt, fields.delayedAt,
      fields.failedAt, fields.bouncedAt, fields.complainedAt, fields.suppressedAt, now,
      sanitizeText(snapshot.subject, 320), sanitizeText(snapshot.subject, 320),
      normalizeEmail(Array.isArray(snapshot.to) ? snapshot.to[0] : snapshot.to), normalizeEmail(Array.isArray(snapshot.to) ? snapshot.to[0] : snapshot.to),
      now, emailId);
    updated += 1;
  }
  return json({ ok: true, updated });
}

function historyQuery(where) {
  return `SELECT t.*,o.title AS passage_title,o.format,c.full_name,c.company
    FROM portal_email_tracking t
    LEFT JOIN portal_orders o ON o.id=t.order_id
    LEFT JOIN portal_clients c ON c.id=o.client_id
    ${where}
    ORDER BY COALESCE(t.last_event_at,t.sent_at,t.created_at) DESC
    LIMIT ?`;
}

function decorateTrackingRow(row) {
  return {
    id: row.id,
    emailId: row.email_id || '',
    outboxId: row.outbox_id || '',
    orderId: row.order_id || '',
    messageKey: row.message_key || '',
    recipientType: row.recipient_type || '',
    toEmail: row.to_email || '',
    subject: row.subject || subjectFromMessageKey(row.message_key),
    status: row.status || 'queued',
    sentAt: row.sent_at || null,
    deliveredAt: row.delivered_at || null,
    openedAt: row.opened_at || null,
    clickedAt: row.clicked_at || null,
    delayedAt: row.delayed_at || null,
    failedAt: row.failed_at || null,
    bouncedAt: row.bounced_at || null,
    complainedAt: row.complained_at || null,
    suppressedAt: row.suppressed_at || null,
    lastEventAt: row.last_event_at || null,
    openCount: Number(row.open_count || 0),
    clickCount: Number(row.click_count || 0),
    lastClickUrl: row.last_click_url || '',
    lastError: row.last_error || '',
    payload: safeParse(row.payload),
    passageTitle: row.passage_title || '',
    format: row.format || '',
    clientName: row.full_name || row.company || '',
    createdAt: row.created_at,
  };
}

function summarize(items) {
  return {
    total: items.length,
    sent: items.filter((item) => item.sentAt).length,
    delivered: items.filter((item) => item.deliveredAt || ['delivered', 'opened', 'clicked'].includes(item.status)).length,
    opened: items.filter((item) => item.openedAt || ['opened', 'clicked'].includes(item.status)).length,
    clicked: items.filter((item) => item.clickedAt || item.status === 'clicked').length,
    failed: items.filter((item) => FAILURE_STATUSES.has(item.status)).length,
    pending: items.filter((item) => ['queued', 'delayed'].includes(item.status)).length,
  };
}

function backfillEmailTracking(store) {
  if (store.emailTrackingV82Backfilled) return;
  const sentEvents = store.sql.exec(`SELECT e.order_id AS orderId,e.payload,e.created_at AS createdAt FROM portal_workflow_events e WHERE e.event_key='email_sent' ORDER BY e.created_at DESC LIMIT 600`).toArray();
  for (const event of sentEvents) {
    const payload = safeParse(event.payload);
    const emailId = sanitizeText(payload.emailId, 220);
    if (!emailId) continue;
    const outbox = store.sql.exec(`SELECT id,message_key AS messageKey,recipient_type AS recipientType,to_email AS toEmail,payload FROM portal_email_outbox WHERE order_id=? AND message_key=? AND to_email=? ORDER BY sent_at DESC LIMIT 1`, event.orderId, sanitizeText(payload.messageKey, 180), normalizeEmail(payload.toEmail)).toArray()[0] || {};
    const id = `email:${emailId}`;
    store.sql.exec(`INSERT OR IGNORE INTO portal_email_tracking(id,email_id,outbox_id,order_id,message_key,recipient_type,to_email,subject,status,sent_at,last_event_at,payload,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?, 'sent',?,?,?,?,?,?)`,
      id, emailId, outbox.id || '', event.orderId || '', payload.messageKey || outbox.messageKey || '', outbox.recipientType || '', normalizeEmail(payload.toEmail || outbox.toEmail), subjectFromMessageKey(payload.messageKey || outbox.messageKey), event.createdAt, event.createdAt, outbox.payload || '{}', event.createdAt, event.createdAt);
  }
  const failedRows = store.sql.exec(`SELECT id,order_id AS orderId,message_key AS messageKey,recipient_type AS recipientType,to_email AS toEmail,payload,last_error AS lastError,updated_at AS updatedAt,created_at AS createdAt FROM portal_email_outbox WHERE status='failed' ORDER BY updated_at DESC LIMIT 300`).toArray();
  for (const row of failedRows) {
    store.sql.exec(`INSERT OR IGNORE INTO portal_email_tracking(id,outbox_id,order_id,message_key,recipient_type,to_email,subject,status,failed_at,last_event_at,last_error,payload,created_at,updated_at) VALUES(?,?,?,?,?,?,?,'failed',?,?,?,?,?,?)`,
      `outbox:${row.id}`, row.id, row.orderId || '', row.messageKey || '', row.recipientType || '', normalizeEmail(row.toEmail), subjectFromMessageKey(row.messageKey), row.updatedAt, row.updatedAt, row.lastError || '', row.payload || '{}', row.createdAt || row.updatedAt, row.updatedAt);
  }
  store.emailTrackingV82Backfilled = true;
}

function eventFields(status, at, current = {}) {
  return {
    sentAt: status === 'sent' ? at : current.sent_at || null,
    deliveredAt: status === 'delivered' ? at : current.delivered_at || null,
    openedAt: status === 'opened' ? at : current.opened_at || null,
    clickedAt: status === 'clicked' ? at : current.clicked_at || null,
    delayedAt: status === 'delayed' ? at : current.delayed_at || null,
    failedAt: status === 'failed' ? at : current.failed_at || null,
    bouncedAt: status === 'bounced' ? at : current.bounced_at || null,
    complainedAt: status === 'complained' ? at : current.complained_at || null,
    suppressedAt: status === 'suppressed' ? at : current.suppressed_at || null,
  };
}

function chooseStatus(current, incoming) {
  if (FAILURE_STATUSES.has(incoming)) return incoming;
  if (FAILURE_STATUSES.has(current)) return current;
  return (STATUS_RANK[incoming] || 0) >= (STATUS_RANK[current] || 0) ? incoming : current;
}

function statusFromEvent(type) {
  const value = String(type || '').toLowerCase().replace(/^email\./u, '');
  return ({
    sent: 'sent',
    delivered: 'delivered',
    opened: 'opened',
    clicked: 'clicked',
    delivery_delayed: 'delayed',
    delayed: 'delayed',
    failed: 'failed',
    bounced: 'bounced',
    complained: 'complained',
    suppressed: 'suppressed',
  })[value] || 'queued';
}

function subjectFromMessageKey(key) {
  const value = String(key || '').replace(/_[0-9]{4}-[0-9]{2}-[0-9]{2}.*$/u, '').replace(/_/gu, ' ').trim();
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : 'Notification Neptune Media';
}

function safeObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function normalizeIso(value) {
  const date = new Date(value || '');
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
