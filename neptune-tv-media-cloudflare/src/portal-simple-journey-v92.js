import { ensurePortalSchema } from './portal-schema.js';
import { ensureCrmV86Schema } from './portal-crm-v86.js';
import { syncSteps } from './portal-utils.js';
import { json, sanitizeText, sanitizeUrl } from './security.js';
import {
  addBusinessDays,
  ensureWorkflowSchema,
  fileInventory,
  isHorsNorme,
  queueEmail,
  recordEvent,
  requireOperator,
  safeParse,
} from './workflow-db-v5.js';

const FIFTEEN_DAYS = 15 * 24 * 60 * 60 * 1000;
const PREPARATION_URL = 'https://calendar.app.google/X9q1T5JT9ngMfZY67';
const RESERVATION_URL = 'https://media.neptunebusiness.com/reserver';
const SOURCE_TYPES = new Set(['rushes', 'raw', 'source', 'video']);
const FINAL_TYPES = new Set(['final', 'emission', 'full', 'master', 'episode']);
const SHORT_TYPES = new Set(['short', 'shorts', 'reel', 'teaser']);

export function ensureSimpleJourneyV92(store) {
  ensurePortalSchema(store);
  ensureWorkflowSchema(store);
  ensureCrmV86Schema(store);
}

export async function simpleJourneyContextV92(store, body = {}) {
  ensureSimpleJourneyV92(store);
  const access = await requireOperator(store, body);
  if (!access.ok) return access.response;
  const payload = body.payload && typeof body.payload === 'object' ? body.payload : {};
  const orderId = sanitizeText(payload.orderId || body.orderId, 100);
  if (!orderId) return json({ error: 'invalid_order' }, 400);

  let order = readOrder(store, orderId);
  if (!order) return json({ error: 'order_not_found' }, 404);

  const automation = applyDriveAutomation(store, order);
  if (automation.changed) order = readOrder(store, orderId);

  const siblings = store.sql.exec(`
    SELECT o.id,o.title,o.format,o.status,o.payment_status AS paymentStatus,o.amount_total AS amountTotal,
      o.currency,o.appointment_at AS appointmentAt,o.filming_at AS filmingAt,o.created_at AS createdAt,o.updated_at AS updatedAt
    FROM portal_orders o WHERE o.client_id=? ORDER BY o.created_at DESC,o.id DESC
  `, order.clientId).toArray();

  const agenda = store.sql.exec(`
    SELECT o.id AS orderId,o.title,o.format,o.status,o.appointment_at AS appointmentAt,o.filming_at AS filmingAt,
      c.id AS clientId,c.email,c.full_name AS fullName,c.company
    FROM portal_orders o JOIN portal_clients c ON c.id=o.client_id
    WHERE c.active=1 AND (o.appointment_at IS NOT NULL OR o.filming_at IS NOT NULL)
    ORDER BY COALESCE(o.filming_at,o.appointment_at) ASC
  `).toArray();

  const messages = store.sql.exec(`
    SELECT message_key AS messageKey,recipient_type AS recipientType,to_email AS toEmail,status,
      scheduled_at AS scheduledAt,sent_at AS sentAt,last_error AS lastError,created_at AS createdAt,payload
    FROM portal_email_outbox WHERE order_id=? ORDER BY created_at DESC LIMIT 120
  `, orderId).toArray().map((item) => ({ ...item, payload: safeParse(item.payload) }));

  const preference = store.sql.exec(`
    SELECT status,preferences_json AS preferencesJson,submitted_at AS submittedAt,applied_at AS appliedAt
    FROM portal_filming_preferences_v86 WHERE order_id=? ORDER BY submitted_at DESC LIMIT 1
  `, orderId).toArray()[0];

  const supplierRequest = messages.find((item) => item.recipientType === 'supplier' && /supplier_date_confirmation/u.test(item.messageKey || '')) || null;
  const filmingDate = validDate(order.filmingAt);
  const now = Date.now();
  const canClientChangeDate = Boolean(filmingDate && filmingDate.getTime() - now >= FIFTEEN_DAYS);
  const dateLocked = Boolean(filmingDate && filmingDate.getTime() - now < FIFTEEN_DAYS);
  const supplierWaitSince = supplierRequest?.sentAt || supplierRequest?.createdAt || (order.supplierStatus === 'pending' ? order.workflowUpdatedAt : null);
  const supplierWaitHours = supplierWaitSince ? Math.max(0, (now - new Date(supplierWaitSince).getTime()) / 3600000) : 0;
  const formatSelected = isFormatSelected(order.format);
  const inventory = fileInventory(store, orderId, order.filmingAt || order.createdAt);
  const sourceMailSent = messages.some((item) => String(item.messageKey || '').includes('sources_received_client') && item.status === 'sent');

  return json({
    ok: true,
    release: 'neptune-simple-client-journey-20260810-v92',
    order: {
      ...order,
      formatSelected,
      canClientChangeDate,
      dateLocked,
      supplierWaitSince,
      supplierWaitHours,
      supplierRelaunchAvailable: order.supplierStatus === 'pending' && supplierWaitHours >= 48,
      preparationBookingUrl: PREPARATION_URL,
      reservationUrl: RESERVATION_URL,
      inventory,
      sourceMailSent,
    },
    siblings,
    agenda,
    messages,
    preference: preference ? {
      ...preference,
      preferences: safeParse(preference.preferencesJson),
    } : null,
    automation,
    generatedAt: new Date().toISOString(),
  });
}

export async function simpleJourneyActionV92(store, body = {}) {
  ensureSimpleJourneyV92(store);
  const access = await requireOperator(store, body);
  if (!access.ok) return access.response;
  const payload = body.payload && typeof body.payload === 'object' ? body.payload : {};
  const orderId = sanitizeText(payload.orderId, 100);
  const action = sanitizeText(payload.action, 80);
  if (!orderId || !action) return json({ error: 'invalid_action' }, 400);
  const order = readOrder(store, orderId);
  if (!order) return json({ error: 'order_not_found' }, 404);

  if (action === 'send_reservation_link') {
    const queued = queueEmail(store, orderId, uniqueKey('journey_action_required_reservation_link'), 'client', order.email, {
      reservationUrl: RESERVATION_URL,
      fullName: order.fullName,
      company: order.company,
      title: order.title,
      format: order.format,
    });
    return actionResult(store, order, action, queued);
  }

  if (action === 'send_payment_link') {
    const paymentUrl = stripeUrl(payload.paymentUrl);
    if (!paymentUrl) return json({ error: 'invalid_payment_link' }, 400);
    const queued = queueEmail(store, orderId, uniqueKey('journey_action_required_payment_link'), 'client', order.email, {
      paymentUrl,
      paymentName: sanitizeText(payload.paymentName, 180),
      fullName: order.fullName,
      company: order.company,
      title: order.title,
      format: order.format,
      amountTotal: order.amountTotal,
      currency: order.currency,
    });
    return actionResult(store, order, action, queued);
  }

  if (action === 'send_preparation_link') {
    const queued = queueEmail(store, orderId, uniqueKey('journey_action_required_preparation_link'), 'client', order.email, {
      preparationUrl: PREPARATION_URL,
      fullName: order.fullName,
      company: order.company,
      title: order.title,
      format: order.format,
      filmingAt: order.filmingAt,
    });
    return actionResult(store, order, action, queued);
  }

  if (action === 'send_sources_received') {
    const inv = fileInventory(store, orderId, order.filmingAt || order.createdAt);
    if (!inv.hasSource && !order.sourceReceivedAt) return json({ error: 'sources_not_received' }, 409);
    const queued = queueEmail(store, orderId, uniqueKey('journey_confirmation_sources_received_client'), 'client', order.email, {
      fullName: order.fullName,
      title: order.title,
      format: order.format,
      sourceReceivedAt: order.sourceReceivedAt || new Date().toISOString(),
    });
    return actionResult(store, order, action, queued);
  }

  if (action === 'set_format') {
    const format = sanitizeText(payload.format, 100);
    if (!format || !isFormatSelected(format)) return json({ error: 'format_required' }, 400);
    const now = new Date().toISOString();
    store.sql.exec('UPDATE portal_orders SET format=?,updated_at=? WHERE id=?', format, now, orderId);
    recordEvent(store, orderId, 'journey_format_changed_v92', 'admin', access.actor.email || '', { before: order.format, after: format });
    return json({ ok: true, action, orderId, format, updatedAt: now });
  }

  if (action === 'set_filming_date') {
    const filmingAt = iso(payload.filmingAt);
    if (!filmingAt || new Date(filmingAt).getTime() <= Date.now()) return json({ error: 'filming_date_invalid' }, 400);
    if (order.appointmentAt && new Date(order.appointmentAt).getTime() > new Date(filmingAt).getTime()) {
      return json({ error: 'filming_before_preparation' }, 400);
    }
    const existing = validDate(order.filmingAt);
    if (existing && existing.getTime() - Date.now() < FIFTEEN_DAYS && payload.forceMajeure !== true) {
      return json({ error: 'date_change_locked_15_days', filmingAt: order.filmingAt }, 409);
    }
    const now = new Date().toISOString();
    const supplierStatus = isHorsNorme(order.format) ? 'pending' : 'not_required';
    const status = supplierStatus === 'pending' ? 'studio_date_confirmation_pending' : 'filming_scheduled';
    const nextAction = supplierStatus === 'pending'
      ? 'La date souhaitée est envoyée au studio fournisseur pour confirmation sous 48 heures.'
      : 'Le passage est planifié.';
    store.sql.exec('UPDATE portal_orders SET filming_at=?,status=?,next_action=?,updated_at=? WHERE id=?', filmingAt, status, nextAction, now, orderId);
    store.sql.exec(`UPDATE portal_workflows SET requested_filming_at=?,supplier_status=?,supplier_response_at=NULL,supplier_note='',updated_at=? WHERE order_id=?`, filmingAt, supplierStatus, now, orderId);
    syncSteps(store, orderId, status, now);
    recordEvent(store, orderId, 'journey_filming_date_requested_v92', 'admin', access.actor.email || '', { filmingAt, previousFilmingAt: order.filmingAt || null });
    if (supplierStatus === 'not_required') {
      queueEmail(store, orderId, uniqueKey('journey_confirmation_filming_date_confirmed_client'), 'client', order.email, {
        fullName: order.fullName, title: order.title, format: order.format, filmingAt,
      });
    }
    return json({ ok: true, action, orderId, filmingAt, status, supplierStatus, workflowAction: supplierStatus === 'pending' ? 'resend_supplier_confirmation' : '' });
  }

  if (action === 'set_appointment') {
    const appointmentAt = iso(payload.appointmentAt);
    if (!appointmentAt) return json({ error: 'appointment_invalid' }, 400);
    if (order.filmingAt && new Date(appointmentAt).getTime() > new Date(order.filmingAt).getTime()) {
      return json({ error: 'appointment_after_filming' }, 400);
    }
    const now = new Date().toISOString();
    store.sql.exec('UPDATE portal_orders SET appointment_at=?,updated_at=? WHERE id=?', appointmentAt, now, orderId);
    store.sql.exec("UPDATE portal_workflows SET preparation_status='booked',preparation_completed_at=NULL,updated_at=? WHERE order_id=?", now, orderId);
    recordEvent(store, orderId, 'journey_preparation_set_v92', 'admin', access.actor.email || '', { appointmentAt });
    return json({ ok: true, action, orderId, appointmentAt, calendarSyncRecommended: payload.createCalendar !== false });
  }

  if (action === 'force_majeure_reschedule') {
    const note = sanitizeText(payload.note, 1200);
    if (!note) return json({ error: 'force_majeure_reason_required' }, 400);
    const currentDate = validDate(order.filmingAt);
    if (!currentDate) return json({ error: 'filming_date_missing' }, 409);
    if (currentDate.getTime() - Date.now() >= FIFTEEN_DAYS) {
      return json({ error: 'normal_reschedule_available', message: 'La date est encore modifiable normalement car elle est à plus de 15 jours.' }, 409);
    }
    const now = new Date().toISOString();
    store.sql.exec(`UPDATE portal_orders SET filming_at=NULL,status='studio_date_confirmation_pending',next_action=?,updated_at=? WHERE id=?`, 'Report exceptionnel demandé. Une nouvelle date de passage doit être organisée.', now, orderId);
    store.sql.exec(`UPDATE portal_workflows SET requested_filming_at=NULL,supplier_status='pending',supplier_response_at=NULL,supplier_note=?,updated_at=? WHERE order_id=?`, `Force majeure : ${note}`, now, orderId);
    syncSteps(store, orderId, 'studio_date_confirmation_pending', now);
    recordEvent(store, orderId, 'journey_force_majeure_reschedule_v92', 'admin', access.actor.email || '', { reason: note, previousFilmingAt: order.filmingAt });
    const queued = queueEmail(store, orderId, uniqueKey('journey_action_required_force_majeure_supplier'), 'supplier', order.supplierEmail, {
      fullName: order.fullName,
      company: order.company,
      title: order.title,
      format: order.format,
      previousFilmingAt: order.filmingAt,
      reason: note,
    });
    return actionResult(store, order, action, queued, { restartedDateSelection: true });
  }

  return json({ error: 'action_not_available' }, 409);
}

function readOrder(store, orderId) {
  return store.sql.exec(`
    SELECT o.id,o.client_id AS clientId,o.external_payment_id AS externalPaymentId,o.order_reference AS orderReference,
      o.product_code AS productCode,o.title,o.format,o.payment_status AS paymentStatus,o.amount_total AS amountTotal,o.currency,
      o.status,o.appointment_at AS appointmentAt,o.filming_at AS filmingAt,o.next_action AS nextAction,
      o.preparation_url AS preparationUrl,o.booking_url AS bookingUrl,o.created_at AS createdAt,o.updated_at AS updatedAt,
      c.email,c.full_name AS fullName,c.company,
      w.requested_filming_at AS requestedFilmingAt,w.supplier_status AS supplierStatus,w.supplier_email AS supplierEmail,
      w.supplier_name AS supplierName,w.supplier_response_at AS supplierResponseAt,w.supplier_note AS supplierNote,
      w.preparation_status AS preparationStatus,w.preparation_completed_at AS preparationCompletedAt,
      w.source_delivery_due_at AS sourceDeliveryDueAt,w.source_received_at AS sourceReceivedAt,w.source_qc_status AS sourceQcStatus,
      w.editing_started_at AS editingStartedAt,w.delivery_due_at AS deliveryDueAt,w.delivered_at AS deliveredAt,
      w.updated_at AS workflowUpdatedAt
    FROM portal_orders o JOIN portal_clients c ON c.id=o.client_id
    LEFT JOIN portal_workflows w ON w.order_id=o.id
    WHERE o.id=? LIMIT 1
  `, orderId).toArray()[0] || null;
}

function applyDriveAutomation(store, order) {
  if (!order) return { changed: false, events: [] };
  const paymentAllowed = order.paymentStatus === 'no_payment_required'
    || (['paid', 'succeeded', 'complete', 'completed'].includes(String(order.paymentStatus || '').toLowerCase()) && Boolean(order.externalPaymentId));
  if (!paymentAllowed) return { changed: false, events: [] };
  const inventory = fileInventory(store, order.id, order.filmingAt || order.createdAt);
  const events = [];
  const now = new Date().toISOString();
  let changed = false;

  const sourceAt = latestFileAt(store, order.id, SOURCE_TYPES) || order.sourceReceivedAt;
  if (inventory.hasSource && sourceAt && (!order.sourceReceivedAt || (!order.editingStartedAt && order.sourceQcStatus !== 'failed'))) {
    const due = addBusinessDays(sourceAt, 7).toISOString();
    store.sql.exec(`
      UPDATE portal_workflows SET source_received_at=COALESCE(source_received_at,?),source_qc_status=CASE WHEN source_qc_status='failed' THEN source_qc_status ELSE 'passed' END,
        editing_started_at=CASE WHEN source_qc_status='failed' THEN editing_started_at ELSE COALESCE(editing_started_at,?) END,
        delivery_due_at=CASE WHEN source_qc_status='failed' THEN delivery_due_at ELSE COALESCE(delivery_due_at,?) END,updated_at=? WHERE order_id=?
    `, sourceAt, sourceAt, due, now, order.id);
    if (order.sourceQcStatus !== 'failed') {
      store.sql.exec(`UPDATE portal_orders SET status='editing',next_action='Les vidéos ont été détectées dans le Drive client. Le montage est en cours.',updated_at=? WHERE id=?`, now, order.id);
      syncSteps(store, order.id, 'editing', now);
    }
    recordEvent(store, order.id, 'drive_sources_auto_detected_v92', 'system', '', { sourceReceivedAt: sourceAt, deliveryDueAt: due, inventory });
    events.push('drive_sources_detected');
    changed = true;
  }

  const refreshed = changed ? readOrder(store, order.id) : order;
  const deliverableAt = latestFileAt(store, order.id, new Set([...FINAL_TYPES, ...SHORT_TYPES]));
  if (inventory.hasFinal && inventory.hasShort && refreshed?.editingStartedAt && !refreshed.deliveredAt) {
    const deliveredAt = deliverableAt || now;
    store.sql.exec('UPDATE portal_workflows SET delivered_at=?,updated_at=? WHERE order_id=?', deliveredAt, now, order.id);
    store.sql.exec(`UPDATE portal_orders SET status='delivered',next_action='Le passage est terminé : les livrables sont disponibles dans le Drive client.',updated_at=? WHERE id=?`, now, order.id);
    syncSteps(store, order.id, 'delivered', now);
    recordEvent(store, order.id, 'drive_deliverables_auto_detected_v92', 'system', '', { deliveredAt, inventory });
    events.push('drive_deliverables_detected');
    changed = true;
  }
  return { changed, events };
}

function latestFileAt(store, orderId, types) {
  const rows = store.sql.exec('SELECT lower(file_type) AS fileType,created_at AS createdAt FROM portal_files WHERE order_id=? ORDER BY created_at DESC', orderId).toArray();
  return rows.find((row) => types.has(row.fileType))?.createdAt || null;
}

function actionResult(store, order, action, queued, extra = {}) {
  recordEvent(store, order.id, action, 'admin', '', { queued, ...extra });
  return json({ ok: true, action, orderId: order.id, queued, ...extra });
}

function uniqueKey(prefix) {
  return `${prefix}_${new Date().toISOString().replace(/\D/gu, '').slice(0, 14)}_${crypto.randomUUID().slice(0, 8)}`;
}

function stripeUrl(value) {
  try {
    const url = new URL(sanitizeUrl(value, 1800));
    if (!['https:'].includes(url.protocol) || !['buy.stripe.com', 'book.stripe.com'].includes(url.hostname)) return '';
    return url.toString();
  } catch {
    return '';
  }
}

function isFormatSelected(value) {
  const text = String(value || '').trim().toLowerCase();
  return Boolean(text) && !['à choisir', 'a choisir', 'format à choisir', 'format a choisir', 'non défini', 'non defini'].includes(text);
}

function validDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function iso(value) {
  const date = validDate(value);
  return date ? date.toISOString() : null;
}
