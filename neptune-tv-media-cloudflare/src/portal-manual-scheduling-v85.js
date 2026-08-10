import { ensurePortalSchema } from './portal-schema.js';
import { syncSteps } from './portal-utils.js';
import { json, sanitizeText, sanitizeUrl } from './security.js';
import {
  ADMIN_EMAIL,
  SUPPLIER_EMAIL,
  SUPPLIER_NAME,
  ensureWorkflowSchema,
  isHorsNorme,
  latestCalendarAppointment,
  normalizeEmail,
  recordEvent,
  requireOperator,
  safeParse,
} from './workflow-db-v5.js';

const FINISHED = new Set(['filmed','videos_pending','videos_received','editing','approval','delivered','completed']);

export function ensureManualWorkflowForOrder(store, orderId, raw = {}) {
  ensurePortalSchema(store);
  ensureWorkflowSchema(store);
  const id = sanitizeText(orderId, 100);
  if (!id) return { workflowCreated: false };

  const order = store.sql.exec(`
    SELECT o.id,o.title,o.format,o.status,o.appointment_at AS appointmentAt,o.filming_at AS filmingAt,
           c.email,c.full_name AS fullName,c.company
    FROM portal_orders o JOIN portal_clients c ON c.id=o.client_id
    WHERE o.id=? LIMIT 1
  `, id).toArray()[0];
  if (!order) return { workflowCreated: false };

  const existing = store.sql.exec('SELECT order_id AS orderId FROM portal_workflows WHERE order_id=? LIMIT 1', id).toArray()[0];
  if (existing) return { workflowCreated: false };

  const now = new Date().toISOString();
  const filmingConfirmed = raw.filmingConfirmed === true || raw.filming_confirmed === true;
  const sourceType = sanitizeText(raw.sourceType || raw.source_type || raw.manualSource || 'manual', 60) || 'manual';
  const supplierEmail = normalizeEmail(raw.supplierEmail || raw.supplier_email || store.env?.STUDIO_SUPPLIER_EMAIL || SUPPLIER_EMAIL);
  const supplierName = sanitizeText(raw.supplierName || raw.supplier_name || store.env?.STUDIO_SUPPLIER_NAME || SUPPLIER_NAME, 160) || SUPPLIER_NAME;
  const supplierStatus = !isHorsNorme(order.format)
    ? 'not_required'
    : filmingConfirmed && order.filmingAt
      ? 'confirmed'
      : 'pending';
  const preparationStatus = order.appointmentAt ? 'booked' : 'to_book';

  store.sql.exec(`
    INSERT INTO portal_workflows(
      order_id,requested_filming_at,supplier_status,supplier_email,supplier_name,
      supplier_token_hash,supplier_token_expires_at,supplier_response_at,supplier_note,
      preparation_status,preparation_completed_at,source_delivery_due_at,source_received_at,
      source_qc_status,editing_started_at,delivery_due_at,delivered_at,broadcast_status,
      broadcast_at,broadcast_url,broadcast_published_at,created_at,updated_at
    ) VALUES(?,?,?,?,?,NULL,NULL,?,?,?,NULL,NULL,NULL,'not_started',NULL,NULL,NULL,'not_scheduled',NULL,'',NULL,?,?)
  `,
  id,
  order.filmingAt || null,
  supplierStatus,
  supplierEmail,
  supplierName,
  supplierStatus === 'confirmed' ? now : null,
  filmingConfirmed ? 'Date déjà convenue en amont et enregistrée depuis le Studio Neptune.' : '',
  preparationStatus,
  now,
  now);

  let status = String(order.status || 'reservation_confirmed');
  let nextAction = '';
  if (order.filmingAt && (supplierStatus === 'confirmed' || supplierStatus === 'not_required')) {
    status = 'filming_scheduled';
    nextAction = order.appointmentAt
      ? 'Votre rendez-vous de préparation et votre passage sont planifiés.'
      : 'Votre passage est planifié. Le rendez-vous de préparation reste à organiser.';
  } else if (isHorsNorme(order.format) && order.filmingAt) {
    status = 'studio_date_confirmation_pending';
    nextAction = 'La date du passage doit encore être confirmée par le studio fournisseur.';
  } else if (order.appointmentAt) {
    status = 'appointment_booked';
    nextAction = 'Votre rendez-vous de préparation est planifié.';
  } else {
    status = 'preparation_booking_pending';
    nextAction = 'Le rendez-vous de préparation reste à organiser.';
  }

  store.sql.exec('UPDATE portal_orders SET status=?,next_action=?,updated_at=? WHERE id=?', status, nextAction, now, id);
  syncSteps(store, id, status, now);

  recordEvent(store, id, 'manual_passage_created', 'admin', ADMIN_EMAIL, {
    sourceType,
    filmingConfirmed,
    appointmentAt: order.appointmentAt || null,
    filmingAt: order.filmingAt || null,
  });
  if (order.appointmentAt) {
    recordEvent(store, id, 'preparation_appointment_booked', 'admin', ADMIN_EMAIL, {
      appointmentAt: order.appointmentAt,
      source: 'manual',
      title: order.title,
    });
  }

  return { workflowCreated: true, status, supplierStatus, preparationStatus, sourceType };
}

export async function manualScheduleContext(store, body = {}) {
  ensurePortalSchema(store);
  ensureWorkflowSchema(store);
  const access = await requireOperator(store, body);
  if (!access.ok) return access.response;
  const orderId = sanitizeText(body.payload?.orderId || body.orderId, 100);
  if (!orderId) return json({ error: 'invalid_order' }, 400);

  const order = store.sql.exec(`
    SELECT o.id,o.title,o.format,o.status,o.appointment_at AS appointmentAt,o.filming_at AS filmingAt,
           o.preparation_url AS preparationUrl,o.updated_at AS updatedAt,
           c.email,c.full_name AS fullName,c.company,
           w.supplier_status AS supplierStatus,w.preparation_status AS preparationStatus
    FROM portal_orders o
    JOIN portal_clients c ON c.id=o.client_id
    LEFT JOIN portal_workflows w ON w.order_id=o.id
    WHERE o.id=? LIMIT 1
  `, orderId).toArray()[0];
  if (!order) return json({ error: 'order_not_found' }, 404);

  const calendar = latestCalendarAppointment(store, orderId);
  return json({
    ok: true,
    order: {
      ...order,
      calendarEventId: calendar?.calendarEventId || '',
      calendarSource: calendar?.source || '',
      calendarSyncedAt: calendar?.syncedAt || null,
    },
  });
}

export async function syncPreparationCalendar(store, body = {}) {
  ensurePortalSchema(store);
  ensureWorkflowSchema(store);
  const access = await requireOperator(store, body);
  if (!access.ok) return access.response;
  const payload = body.payload && typeof body.payload === 'object' ? body.payload : {};
  const orderId = sanitizeText(payload.orderId, 100);
  const appointmentAt = validIso(payload.appointmentAt);
  const meetingUrl = sanitizeUrl(payload.meetingUrl, 1500);
  const calendarHtmlUrl = sanitizeUrl(payload.calendarHtmlUrl, 1500);
  const calendarEventId = sanitizeText(payload.calendarEventId, 300);
  if (!orderId || !appointmentAt || !calendarEventId) return json({ error: 'invalid_calendar_sync' }, 400);

  let order = getOrder(store, orderId);
  if (!order) return json({ error: 'order_not_found' }, 404);

  const workflow = store.sql.exec('SELECT order_id AS orderId FROM portal_workflows WHERE order_id=? LIMIT 1', orderId).toArray()[0];
  if (!workflow) {
    ensureManualWorkflowForOrder(store, orderId, {
      sourceType: 'studio',
      filmingConfirmed: Boolean(order.filmingAt),
    });
    order = getOrder(store, orderId);
  }

  const currentWorkflow = store.sql.exec(`
    SELECT supplier_status AS supplierStatus,preparation_status AS preparationStatus
    FROM portal_workflows WHERE order_id=? LIMIT 1
  `, orderId).toArray()[0] || {};
  const now = new Date().toISOString();
  let status = order.status;
  if (!FINISHED.has(status)) {
    if (order.filmingAt && ['confirmed','not_required'].includes(currentWorkflow.supplierStatus)) status = 'filming_scheduled';
    else if (order.filmingAt && isHorsNorme(order.format)) status = 'studio_date_confirmation_pending';
    else status = 'appointment_booked';
  }
  const nextAction = order.filmingAt
    ? 'Votre visio de préparation et votre passage sont planifiés.'
    : 'Votre visio de préparation est planifiée. La date du passage reste à finaliser.';

  store.sql.exec(`
    UPDATE portal_orders
    SET appointment_at=?,preparation_url=CASE WHEN ?<>'' THEN ? ELSE preparation_url END,
        status=?,next_action=?,updated_at=?
    WHERE id=?
  `, appointmentAt, meetingUrl, meetingUrl, status, nextAction, now, orderId);
  store.sql.exec(`
    UPDATE portal_workflows SET preparation_status='booked',preparation_completed_at=NULL,updated_at=? WHERE order_id=?
  `, now, orderId);
  syncSteps(store, orderId, status, now);

  recordEvent(store, orderId, 'preparation_appointment_booked', 'admin', access.actor.email || ADMIN_EMAIL, {
    appointmentAt,
    calendarEventId,
    title: order.title,
    source: 'google_calendar',
    meetingUrl,
    calendarHtmlUrl,
  });
  store.audit?.(access.actor.id || 'studio', 'preparation_calendar_synced_v85', 'portal_order', orderId, {
    calendarEventId,
    appointmentAt,
    meetingUrlPresent: Boolean(meetingUrl),
  });

  return json({
    ok: true,
    orderId,
    appointmentAt,
    preparationUrl: meetingUrl,
    meetingUrl,
    calendarHtmlUrl,
    calendarEventId,
    appointmentSource: 'google_calendar',
    status,
    nextAction,
    updatedAt: now,
  });
}

export async function clearPreparationCalendar(store, body = {}) {
  ensurePortalSchema(store);
  ensureWorkflowSchema(store);
  const access = await requireOperator(store, body);
  if (!access.ok) return access.response;
  const payload = body.payload && typeof body.payload === 'object' ? body.payload : {};
  const orderId = sanitizeText(payload.orderId, 100);
  const oldPreparationUrl = sanitizeUrl(payload.oldPreparationUrl, 1500);
  if (!orderId) return json({ error: 'invalid_order' }, 400);

  const order = getOrder(store, orderId);
  if (!order) return json({ error: 'order_not_found' }, 404);
  const workflow = store.sql.exec(`SELECT supplier_status AS supplierStatus FROM portal_workflows WHERE order_id=? LIMIT 1`, orderId).toArray()[0] || {};
  const now = new Date().toISOString();
  let status = order.status;
  if (!FINISHED.has(status)) {
    if (order.filmingAt && ['confirmed','not_required'].includes(workflow.supplierStatus)) status = 'filming_scheduled';
    else if (order.filmingAt && isHorsNorme(order.format)) status = 'studio_date_confirmation_pending';
    else status = 'preparation_booking_pending';
  }
  const nextAction = order.filmingAt
    ? 'Le rendez-vous de préparation doit être replanifié. La date du passage reste enregistrée.'
    : 'Le rendez-vous de préparation doit être planifié.';

  store.sql.exec(`
    UPDATE portal_orders SET appointment_at=NULL,
      preparation_url=CASE WHEN ?<>'' AND preparation_url=? THEN '' ELSE preparation_url END,
      status=?,next_action=?,updated_at=? WHERE id=?
  `, oldPreparationUrl, oldPreparationUrl, status, nextAction, now, orderId);
  store.sql.exec(`UPDATE portal_workflows SET preparation_status='to_book',preparation_completed_at=NULL,updated_at=? WHERE order_id=?`, now, orderId);

  const events = store.sql.exec(`SELECT id,payload FROM portal_workflow_events WHERE order_id=? AND event_key='preparation_appointment_booked'`, orderId).toArray();
  for (const event of events) {
    const parsed = safeParse(event.payload);
    if (parsed?.appointmentAt || parsed?.calendarEventId || parsed?.eventId) {
      store.sql.exec('DELETE FROM portal_workflow_events WHERE id=?', event.id);
    }
  }
  recordEvent(store, orderId, 'preparation_appointment_cancelled', 'admin', access.actor.email || ADMIN_EMAIL, {
    calendarEventId: sanitizeText(payload.calendarEventId, 300),
    previousAppointmentAt: validIso(payload.previousAppointmentAt),
  });
  syncSteps(store, orderId, status, now);
  store.audit?.(access.actor.id || 'studio', 'preparation_calendar_cleared_v85', 'portal_order', orderId, { status });

  return json({ ok: true, orderId, appointmentAt: null, status, nextAction, updatedAt: now });
}

function getOrder(store, orderId) {
  return store.sql.exec(`
    SELECT o.id,o.title,o.format,o.status,o.appointment_at AS appointmentAt,o.filming_at AS filmingAt,
           o.preparation_url AS preparationUrl,c.email,c.full_name AS fullName,c.company
    FROM portal_orders o JOIN portal_clients c ON c.id=o.client_id WHERE o.id=? LIMIT 1
  `, orderId).toArray()[0];
}

function validIso(value) {
  const date = new Date(value || '');
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
