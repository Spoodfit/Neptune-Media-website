import { ensureWorkflowSchema, safeParse } from './workflow-db-v5.js';
import { json, sanitizeText } from './security.js';

export const TEST_CLIENT_EMAIL = 'contact@neptunebusiness.com';
export const NOTIFICATION_COOLDOWN_MINUTES = 45;
const COOLDOWN_MS = NOTIFICATION_COOLDOWN_MINUTES * 60 * 1000;
const ACTIVE_CHANGE_STATUSES = new Set(['pending_neptune', 'pending_supplier', 'supplier_alternate']);

const ORDER_STAGE = new Map([
  ['reservation_confirmed', 10],
  ['studio_date_confirmation_pending', 20],
  ['filming_scheduled', 30],
  ['filming_confirmed', 30],
  ['preparation_complete', 40],
  ['filmed', 50],
  ['videos_pending', 50],
  ['videos_received', 60],
  ['editing', 70],
  ['approval', 80],
  ['delivered', 90],
  ['completed', 100],
]);

export function smartWorkflowEmailDue(store) {
  ensureWorkflowSchema(store);
  const now = new Date();
  const nowIso = now.toISOString();
  const changeTableReady = tableExists(store, 'portal_change_requests');
  const changeSelect = changeTableReady
    ? `(SELECT r.status FROM portal_change_requests r
        WHERE r.order_id=e.order_id
          AND r.status IN ('pending_neptune','pending_supplier','supplier_alternate')
        ORDER BY r.updated_at DESC LIMIT 1) AS activeChangeStatus,`
    : `NULL AS activeChangeStatus,`;

  const rows = store.sql.exec(`
    SELECT e.id,e.order_id AS orderId,e.message_key AS messageKey,
      e.recipient_type AS recipientType,e.to_email AS toEmail,e.payload,
      e.attempts,e.scheduled_at AS scheduledAt,e.created_at AS createdAt,
      o.status AS orderStatus,o.title,o.format,o.appointment_at AS appointmentAt,
      o.filming_at AS filmingAt,o.next_action AS nextAction,o.client_id AS clientId,
      c.email AS clientEmail,c.full_name AS fullName,c.company,
      w.requested_filming_at AS requestedFilmingAt,w.supplier_status AS supplierStatus,
      w.preparation_status AS preparationStatus,w.source_qc_status AS sourceQcStatus,
      w.source_delivery_due_at AS sourceDeliveryDueAt,w.delivery_due_at AS deliveryDueAt,
      w.delivered_at AS deliveredAt,w.broadcast_status AS broadcastStatus,
      w.broadcast_at AS broadcastAt,w.broadcast_url AS broadcastUrl,
      ${changeSelect}
      w.supplier_name AS supplierName,w.supplier_email AS supplierEmail
    FROM portal_email_outbox e
    JOIN portal_orders o ON o.id=e.order_id
    JOIN portal_clients c ON c.id=o.client_id
    LEFT JOIN portal_workflows w ON w.order_id=o.id
    WHERE e.status IN ('pending','failed')
      AND e.attempts<6
      AND e.scheduled_at<=?
    ORDER BY e.scheduled_at ASC,e.created_at ASC
    LIMIT 180
  `, nowIso).toArray().map((row) => ({
    ...row,
    payload: safeParse(row.payload),
  }));

  const groups = new Map();
  let redirected = 0;
  let superseded = 0;

  for (const row of rows) {
    const effectiveEmail = safeRecipient(row);
    if (!effectiveEmail) {
      markSuperseded(store, row.id, nowIso, 'recipient_missing');
      superseded += 1;
      continue;
    }
    if (effectiveEmail !== row.toEmail) {
      const payload = {
        ...row.payload,
        recipientOverride: 'test-account-supplier-protection-v84',
        originalToEmail: row.toEmail,
      };
      store.sql.exec(
        'UPDATE portal_email_outbox SET to_email=?,payload=?,updated_at=? WHERE id=?',
        effectiveEmail,
        JSON.stringify(payload),
        nowIso,
        row.id,
      );
      row.toEmail = effectiveEmail;
      row.payload = payload;
      redirected += 1;
    }

    const intent = classify(row);
    if (!isRelevant(row, intent)) {
      markSuperseded(store, row.id, nowIso, 'state_no_longer_relevant');
      superseded += 1;
      continue;
    }

    const groupKey = recipientGroup(row);
    if (!groups.has(groupKey)) groups.set(groupKey, []);
    groups.get(groupKey).push({ row, intent });
  }

  const items = [];
  let deferred = 0;

  for (const candidates of groups.values()) {
    candidates.sort(compareCandidates);
    const chosen = candidates[0];
    const lastSentAt = latestSentAt(store, chosen.row);
    const earliest = lastSentAt ? new Date(lastSentAt).getTime() + COOLDOWN_MS : 0;

    if (earliest > now.getTime()) {
      const nextAt = new Date(earliest).toISOString();
      for (const candidate of candidates) {
        defer(store, candidate.row.id, nextAt, nowIso, 'recipient_cooldown');
        deferred += 1;
      }
      continue;
    }

    items.push({
      ...chosen.row,
      notificationPolicy: {
        release: 'neptune-smart-email-governor-20260806-v84',
        category: chosen.intent.category,
        stage: chosen.intent.stage,
        priority: chosen.intent.priority,
        cooldownMinutes: NOTIFICATION_COOLDOWN_MINUTES,
        testRecipientOverride: chosen.row.clientEmail === TEST_CLIENT_EMAIL
          && chosen.row.recipientType === 'supplier',
      },
    });

    let slot = 1;
    for (const candidate of candidates.slice(1)) {
      if (sameFamily(chosen, candidate)) {
        markSuperseded(store, candidate.row.id, nowIso, 'newer_or_more_useful_message_selected');
        superseded += 1;
        continue;
      }
      const nextAt = new Date(now.getTime() + COOLDOWN_MS * slot).toISOString();
      defer(store, candidate.row.id, nextAt, nowIso, 'waiting_for_previous_message');
      deferred += 1;
      slot += 1;
    }
  }

  return json({
    ok: true,
    items,
    policy: {
      release: 'neptune-smart-email-governor-20260806-v84',
      cooldownMinutes: NOTIFICATION_COOLDOWN_MINUTES,
      oneUsefulEmailPerRecipientContext: true,
      testClientSupplierRecipient: TEST_CLIENT_EMAIL,
      selected: items.length,
      redirected,
      deferred,
      superseded,
    },
  });
}

export function notificationPolicyState(store, body = {}) {
  const orderId = sanitizeText(body.orderId, 120);
  const where = orderId ? 'WHERE e.order_id=?' : '';
  const params = orderId ? [orderId] : [];
  const rows = store.sql.exec(`
    SELECT e.order_id AS orderId,e.message_key AS messageKey,e.recipient_type AS recipientType,
      e.to_email AS toEmail,e.status,e.scheduled_at AS scheduledAt,e.sent_at AS sentAt,
      e.last_error AS lastError,e.created_at AS createdAt
    FROM portal_email_outbox e
    ${where}
    ORDER BY e.created_at DESC
    LIMIT 200
  `, ...params).toArray();
  return json({
    ok: true,
    orderId,
    policy: {
      release: 'neptune-smart-email-governor-20260806-v84',
      cooldownMinutes: NOTIFICATION_COOLDOWN_MINUTES,
      testClientSupplierRecipient: TEST_CLIENT_EMAIL,
    },
    items: rows,
  });
}

function safeRecipient(row) {
  const current = String(row.toEmail || '').trim().toLowerCase();
  const client = String(row.clientEmail || '').trim().toLowerCase();
  if (client === TEST_CLIENT_EMAIL && row.recipientType === 'supplier') return TEST_CLIENT_EMAIL;
  return current;
}

function recipientGroup(row) {
  const client = String(row.clientEmail || '').trim().toLowerCase();
  const target = String(row.toEmail || '').trim().toLowerCase();
  if (client === TEST_CLIENT_EMAIL) return `test-client:${TEST_CLIENT_EMAIL}`;
  return `${row.orderId}:${row.recipientType}:${target}`;
}

function classify(row) {
  const key = String(row.messageKey || '').toLowerCase();
  let category = 'progress';
  let priority = 40;
  if (/alternate|action|required|confirmation|confirm|qc_failed|rejected|change_request_supplier_date/u.test(key)) {
    category = 'action_required';
    priority = 100;
  } else if (/approved|booked|delivery_ready|date_confirmed|completed|published/u.test(key)) {
    category = 'confirmation';
    priority = 80;
  } else if (/reminder|rappel|due|pending/u.test(key)) {
    category = 'reminder';
    priority = 55;
  } else if (/ack|received|new_booking|payment_received/u.test(key)) {
    category = 'acknowledgement';
    priority = 35;
  }

  let stage = 10;
  if (/change_request|supplier_date|date_confirmed|date_alternate|filming_scheduled/u.test(key)) stage = 30;
  if (/appointment|preparation/u.test(key)) stage = 40;
  if (/filming_completed|source_delivery|videos_pending|qc_failed/u.test(key)) stage = 50;
  if (/source_received/u.test(key)) stage = 60;
  if (/editing/u.test(key)) stage = 70;
  if (/approval/u.test(key)) stage = 80;
  if (/delivery_ready|delivered/u.test(key)) stage = 90;
  if (/broadcast/u.test(key)) stage = 100;

  return { category, priority, stage, family: familyFor(key) };
}

function isRelevant(row, intent) {
  const key = String(row.messageKey || '').toLowerCase();
  const orderStage = ORDER_STAGE.get(String(row.orderStatus || '')) || 0;
  const changeStatus = String(row.activeChangeStatus || '');

  if (key.startsWith('change_request_')) {
    if (/supplier_date(?:_reminder)?/u.test(key)) return changeStatus === 'pending_supplier';
    if (/supplier_alternate/u.test(key)) return changeStatus === 'supplier_alternate';
    if (/request_received|client_forwarded/u.test(key)) return ACTIVE_CHANGE_STATUSES.has(changeStatus);
    return true;
  }
  if (/supplier_date_confirmation/u.test(key)) return row.supplierStatus === 'pending';
  if (/preparation.*reminder|appointment.*reminder/u.test(key)) return row.preparationStatus !== 'completed';
  if (/source_delivery_requested/u.test(key)) return !row.deliveredAt && ['not_started', 'pending', 'failed'].includes(String(row.sourceQcStatus || 'not_started'));
  if (/editing_started/u.test(key)) return orderStage >= 60 && orderStage < 90;
  if (/delivery_ready/u.test(key)) return orderStage >= 90;
  if (/broadcast_scheduled/u.test(key)) return row.broadcastStatus === 'scheduled';
  if (/broadcast_published/u.test(key)) return row.broadcastStatus === 'published';

  if (intent.category === 'action_required' || intent.category === 'confirmation') return true;
  return !(orderStage && intent.stage + 15 < orderStage);
}

function compareCandidates(left, right) {
  if (right.intent.priority !== left.intent.priority) return right.intent.priority - left.intent.priority;
  if (right.intent.stage !== left.intent.stage) return right.intent.stage - left.intent.stage;
  return new Date(right.row.createdAt || 0).getTime() - new Date(left.row.createdAt || 0).getTime();
}

function sameFamily(left, right) {
  return left.intent.family === right.intent.family
    && left.row.recipientType === right.row.recipientType;
}

function familyFor(key) {
  return key
    .replace(/\d{4}-\d{2}-\d{2}/gu, '')
    .replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gu, '')
    .replace(/_(client|admin|supplier)_/gu, '_')
    .replace(/_+/gu, '_')
    .replace(/^_|_$/gu, '');
}

function latestSentAt(store, row) {
  if (String(row.clientEmail || '').toLowerCase() === TEST_CLIENT_EMAIL) {
    return store.sql.exec(`
      SELECT MAX(e.sent_at) AS sentAt
      FROM portal_email_outbox e
      JOIN portal_orders o ON o.id=e.order_id
      JOIN portal_clients c ON c.id=o.client_id
      WHERE c.email=? AND e.to_email=? AND e.status='sent'
    `, TEST_CLIENT_EMAIL, TEST_CLIENT_EMAIL).toArray()[0]?.sentAt || null;
  }
  return store.sql.exec(`
    SELECT MAX(sent_at) AS sentAt
    FROM portal_email_outbox
    WHERE order_id=? AND to_email=? AND status='sent'
  `, row.orderId, row.toEmail).toArray()[0]?.sentAt || null;
}

function defer(store, id, scheduledAt, now, reason) {
  store.sql.exec(`
    UPDATE portal_email_outbox
    SET status='pending',scheduled_at=?,last_error=?,updated_at=?
    WHERE id=?
  `, scheduledAt, `notification_governor:${reason}`, now, id);
}

function markSuperseded(store, id, now, reason) {
  store.sql.exec(`
    UPDATE portal_email_outbox
    SET status='superseded',last_error=?,updated_at=?
    WHERE id=?
  `, `notification_governor:${reason}`, now, id);
}

function tableExists(store, name) {
  return Boolean(store.sql.exec(
    "SELECT name FROM sqlite_master WHERE type='table' AND name=? LIMIT 1",
    name,
  ).toArray()[0]);
}
