import { ensurePortalSchema } from './portal-schema.js';
import {
  nextActionForStatus,
  normalizeStatus,
  nullableIso,
  safeInteger,
  syncSteps,
} from './portal-utils.js';
import { json, sanitizeText, sanitizeUrl } from './security.js';

const PAYMENT_STATUSES = new Set(['paid', 'pending', 'refunded', 'failed', 'cancelled']);
const CURRENCIES = new Set(['eur', 'usd', 'gbp', 'chf']);

export function adminPassageUpdate(store, payload = {}) {
  ensurePortalSchema(store);

  const orderId = sanitizeText(payload.orderId, 100);
  if (!orderId) return json({ error: 'invalid_order' }, 400);

  const current = store.sql.exec(`
    SELECT id,title,format,status,appointment_at AS appointmentAt,filming_at AS filmingAt,
           preparation_url AS preparationUrl,booking_url AS bookingUrl,next_action AS nextAction,
           order_reference AS orderReference,product_code AS productCode,payment_status AS paymentStatus,
           amount_total AS amountTotal,currency,updated_at AS updatedAt
    FROM portal_orders WHERE id=? LIMIT 1
  `, orderId).toArray()[0];
  if (!current) return json({ error: 'order_not_found' }, 404);

  const expectedUpdatedAt = sanitizeText(payload.expectedUpdatedAt, 80);
  if (expectedUpdatedAt && current.updatedAt && expectedUpdatedAt !== current.updatedAt) {
    return json({ error: 'passage_conflict', updatedAt: current.updatedAt }, 409);
  }

  const title = sanitizeText(payload.title, 200);
  const format = sanitizeText(payload.format, 100);
  if (!title || !format) return json({ error: 'passage_required_fields' }, 400);

  const status = normalizeStatus(payload.status || current.status);
  const appointmentAt = nullableIso(payload.appointmentAt);
  const filmingAt = nullableIso(payload.filmingAt);
  if (appointmentAt && filmingAt && new Date(filmingAt).getTime() < new Date(appointmentAt).getTime()) {
    return json({ error: 'filming_before_preparation' }, 400);
  }
  if (['filming_scheduled', 'filming_confirmed'].includes(status) && !filmingAt) {
    return json({ error: 'filming_date_required' }, 400);
  }

  const preparationUrl = sanitizeUrl(payload.preparationUrl, 1200);
  const bookingUrl = sanitizeUrl(payload.bookingUrl, 1200);
  const orderReference = sanitizeText(payload.orderReference, 160);
  const productCode = sanitizeText(payload.productCode, 100);
  const requestedPaymentStatus = sanitizeText(payload.paymentStatus, 40).toLowerCase();
  const paymentStatus = PAYMENT_STATUSES.has(requestedPaymentStatus)
    ? requestedPaymentStatus
    : current.paymentStatus;
  const requestedCurrency = sanitizeText(payload.currency, 10).toLowerCase();
  const currency = CURRENCIES.has(requestedCurrency) ? requestedCurrency : current.currency || 'eur';
  const amountTotal = safeInteger(payload.amountTotal, 0, 1000000000);
  const requestedNextAction = sanitizeText(payload.nextAction, 320);
  const nextAction = requestedNextAction || nextActionForStatus(status, { filmingAt });
  const now = new Date().toISOString();

  store.sql.exec(`
    UPDATE portal_orders
    SET title=?,format=?,status=?,appointment_at=?,filming_at=?,preparation_url=?,booking_url=?,
        next_action=?,order_reference=?,product_code=?,payment_status=?,amount_total=?,currency=?,updated_at=?
    WHERE id=?
  `,
  title, format, status, appointmentAt, filmingAt, preparationUrl, bookingUrl,
  nextAction, orderReference, productCode, paymentStatus, amountTotal, currency, now, orderId);

  if (status !== current.status) syncSteps(store, orderId, status, now);
  store.audit?.('studio', 'portal_passage_update', 'portal_order', orderId, {
    status,
    format,
    appointmentAt,
    filmingAt,
    paymentStatus,
  });

  return json({
    ok: true,
    order: {
      id: orderId,
      title,
      format,
      status,
      appointmentAt,
      filmingAt,
      preparationUrl,
      bookingUrl,
      nextAction,
      orderReference,
      productCode,
      paymentStatus,
      amountTotal,
      currency,
      updatedAt: now,
    },
  });
}
