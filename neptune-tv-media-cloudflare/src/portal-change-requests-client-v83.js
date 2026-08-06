import { requireClient } from './portal-auth.js';
import {
  ADMIN_EMAIL,
  SUPPLIER_EMAIL,
  countPending,
  iso,
  queueEmail,
  recordEvent,
  safeParse,
} from './workflow-db-v5.js';
import { json, sanitizeText } from './security.js';
import {
  DECORS,
  FORMAT_LABELS,
  applyFilmingDate,
  decorCatalog,
  emailPayload,
  filmingChangeRules,
  getRequest,
  getRequestRow,
  normalizeFormat,
  object,
} from './portal-change-request-data-v83.js';

const CHANGE_TYPES = new Set(['filming_date', 'preparation_date', 'format']);

export function ensureChangeRequestSchema(store) {
  if (store.changeRequestsV83Ready) return;
  store.sql.exec(`
    CREATE TABLE IF NOT EXISTS portal_change_requests (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL REFERENCES portal_orders(id) ON DELETE CASCADE,
      request_type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending_neptune',
      requested_value TEXT NOT NULL DEFAULT '{}',
      proposed_value TEXT NOT NULL DEFAULT '{}',
      reason TEXT NOT NULL DEFAULT '',
      target_format TEXT NOT NULL DEFAULT '',
      decor_code TEXT NOT NULL DEFAULT '',
      concept_brief TEXT NOT NULL DEFAULT '',
      supplier_token_hash TEXT,
      supplier_token_expires_at TEXT,
      supplier_response_at TEXT,
      supplier_note TEXT NOT NULL DEFAULT '',
      client_response_at TEXT,
      admin_actor_email TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_portal_change_requests_order
      ON portal_change_requests(order_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_portal_change_requests_status
      ON portal_change_requests(status, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_portal_change_requests_supplier_token
      ON portal_change_requests(supplier_token_hash);
  `);
  store.changeRequestsV83Ready = true;
}

export async function clientChangeRequestState(store, body = {}) {
  ensureChangeRequestSchema(store);
  const client = await requireClient(store, body.token);
  if (!client) return json({ authenticated: false, error: 'unauthorized' }, 401);

  const orders = store.sql.exec(`
    SELECT id, title, format, status,
      appointment_at AS appointmentAt,
      filming_at AS filmingAt,
      preparation_url AS preparationUrl,
      booking_url AS bookingUrl,
      created_at AS createdAt,
      updated_at AS updatedAt
    FROM portal_orders
    WHERE client_id=?
    ORDER BY created_at DESC
  `, client.id).toArray().map((order) => ({
    ...order,
    changeRules: filmingChangeRules(order.filmingAt),
  }));

  const requests = listRequests(store, { clientId: client.id });
  return json({
    authenticated: true,
    orders,
    requests,
    decorCatalog: decorCatalog(),
    policies: {
      filmingDateMinimumNoticeDays: 15,
      preparationDateParties: ['client', 'neptune'],
      formatApprovalParties: ['client', 'neptune', 'supplier-after-approval'],
    },
  });
}

export async function clientSubmitChangeRequest(store, body = {}) {
  ensureChangeRequestSchema(store);
  const client = await requireClient(store, body.token);
  if (!client) return json({ error: 'unauthorized' }, 401);

  const payload = object(body.payload);
  const orderId = sanitizeText(payload.orderId, 120);
  const requestType = sanitizeText(payload.requestType, 60);
  if (!orderId || !CHANGE_TYPES.has(requestType)) return json({ error: 'invalid_change_request' }, 400);

  const order = store.sql.exec(`
    SELECT o.id,o.client_id AS clientId,o.title,o.format,o.status,
      o.appointment_at AS appointmentAt,o.filming_at AS filmingAt,
      o.preparation_url AS preparationUrl,o.booking_url AS bookingUrl,
      c.email,c.full_name AS fullName,c.company
    FROM portal_orders o
    JOIN portal_clients c ON c.id=o.client_id
    WHERE o.id=? AND o.client_id=?
    LIMIT 1
  `, orderId, client.id).toArray()[0];
  if (!order) return json({ error: 'order_not_found' }, 404);

  const duplicate = store.sql.exec(`
    SELECT id FROM portal_change_requests
    WHERE order_id=? AND request_type=?
      AND status IN ('pending_neptune','pending_supplier','supplier_alternate')
    LIMIT 1
  `, orderId, requestType).toArray()[0];
  if (duplicate) return json({ error: 'change_request_already_pending', requestId: duplicate.id }, 409);

  const reason = sanitizeText(payload.reason, 1600);
  const requestedAt = iso(payload.requestedAt);
  let requestedValue = {};
  let targetFormat = '';
  let decorCode = '';
  let conceptBrief = '';

  if (requestType === 'filming_date') {
    const rules = filmingChangeRules(order.filmingAt);
    if (!rules.allowed) {
      return json({
        error: rules.reason,
        minimumNoticeDays: 15,
        deadlineAt: rules.deadlineAt,
      }, 409);
    }
    if (!requestedAt || new Date(requestedAt).getTime() <= Date.now()) {
      return json({ error: 'requested_filming_date_invalid' }, 400);
    }
    requestedValue = { requestedAt, currentAt: iso(order.filmingAt) };
  } else if (requestType === 'preparation_date') {
    if (requestedAt && new Date(requestedAt).getTime() <= Date.now()) {
      return json({ error: 'requested_preparation_date_invalid' }, 400);
    }
    requestedValue = { requestedAt, currentAt: iso(order.appointmentAt) };
    if (!reason && !requestedAt) return json({ error: 'preparation_change_detail_required' }, 400);
  } else {
    targetFormat = normalizeFormat(payload.targetFormat);
    decorCode = sanitizeText(payload.decorCode, 100);
    conceptBrief = sanitizeText(payload.conceptBrief, 2400);
    const decor = DECORS[decorCode];
    if (!targetFormat || !decor || decor.format !== targetFormat) {
      return json({ error: 'format_or_decor_invalid' }, 400);
    }
    if (decorCode === 'concept-libre-sur-mesure' && conceptBrief.length < 20) {
      return json({ error: 'custom_concept_brief_required' }, 400);
    }
    requestedValue = {
      currentFormat: order.format || '',
      targetFormat: FORMAT_LABELS[targetFormat],
      decorCode,
      decorLabel: decor.label,
    };
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  store.sql.exec(`
    INSERT INTO portal_change_requests (
      id,order_id,request_type,status,requested_value,proposed_value,reason,
      target_format,decor_code,concept_brief,supplier_token_hash,
      supplier_token_expires_at,supplier_response_at,supplier_note,
      client_response_at,admin_actor_email,created_at,updated_at
    ) VALUES (?,?,?,'pending_neptune',?,'{}',?,?,?,?,NULL,NULL,NULL,'',NULL,'',?,?)
  `,
  id, orderId, requestType, JSON.stringify(requestedValue), reason,
  targetFormat, decorCode, conceptBrief, now, now);

  const common = emailPayload(order, {
    requestId: id,
    requestType,
    reason,
    requestedValue,
    targetFormat: FORMAT_LABELS[targetFormat] || '',
    decorCode,
    decorLabel: DECORS[decorCode]?.label || '',
    decorImage: DECORS[decorCode]?.image || '',
    conceptBrief,
  });
  queueEmail(store, orderId, `change_request_admin_received_${id}`, 'admin', ADMIN_EMAIL, {
    ...common,
    template: 'admin_request_received',
  });
  queueEmail(store, orderId, `change_request_client_received_${id}`, 'client', order.email, {
    ...common,
    template: 'client_request_received',
  });
  recordEvent(store, orderId, `client_change_request_${requestType}`, 'client', order.email, {
    requestId: id,
    requestedValue,
    targetFormat,
    decorCode,
  });

  return json({
    ok: true,
    request: getRequest(store, id),
    notificationsQueued: countPending(store, orderId),
  }, 201);
}

export async function clientRespondToAlternate(store, body = {}) {
  ensureChangeRequestSchema(store);
  const client = await requireClient(store, body.token);
  if (!client) return json({ error: 'unauthorized' }, 401);
  const payload = object(body.payload);
  const requestId = sanitizeText(payload.requestId, 120);
  const decision = sanitizeText(payload.decision, 40);
  if (!['accept', 'decline'].includes(decision)) return json({ error: 'invalid_response' }, 400);

  const row = getRequestRow(store, requestId);
  if (!row || row.clientId !== client.id) return json({ error: 'change_request_not_found' }, 404);
  if (row.requestType !== 'filming_date' || row.status !== 'supplier_alternate') {
    return json({ error: 'change_request_not_awaiting_client' }, 409);
  }

  const proposed = safeParse(row.proposedValue);
  const proposedAt = iso(proposed.proposedAt);
  if (!proposedAt) return json({ error: 'alternate_date_missing' }, 409);
  const now = new Date().toISOString();

  if (decision === 'accept') {
    store.sql.exec(`
      UPDATE portal_change_requests
      SET status='approved',client_response_at=?,updated_at=?
      WHERE id=?
    `, now, now, requestId);
    applyFilmingDate(store, row.orderId, proposedAt, now);
    const common = emailPayload(row, {
      requestId,
      requestType: row.requestType,
      requestedValue: safeParse(row.requestedValue),
      proposedValue: proposed,
    });
    queueEmail(store, row.orderId, `change_request_admin_alternate_accepted_${requestId}`, 'admin', ADMIN_EMAIL, {
      ...common,
      template: 'admin_alternate_accepted',
    });
    queueEmail(store, row.orderId, `change_request_supplier_alternate_accepted_${requestId}`, 'supplier', row.supplierEmail || SUPPLIER_EMAIL, {
      ...common,
      template: 'supplier_alternate_accepted',
    });
    queueEmail(store, row.orderId, `change_request_client_alternate_accepted_${requestId}`, 'client', row.email, {
      ...common,
      template: 'client_alternate_accepted',
    });
  } else {
    store.sql.exec(`
      UPDATE portal_change_requests
      SET status='pending_neptune',client_response_at=?,updated_at=?
      WHERE id=?
    `, now, now, requestId);
    queueEmail(store, row.orderId, `change_request_admin_alternate_declined_${requestId}`, 'admin', ADMIN_EMAIL, {
      ...emailPayload(row, {
        requestId,
        requestType: row.requestType,
        proposedValue: proposed,
      }),
      template: 'admin_alternate_declined',
    });
  }

  recordEvent(store, row.orderId, `client_alternate_${decision}`, 'client', row.email, {
    requestId,
    proposedAt,
  });
  return json({
    ok: true,
    decision,
    request: getRequest(store, requestId),
    notificationsQueued: countPending(store, row.orderId),
  });
}
