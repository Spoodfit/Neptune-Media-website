import { ensurePortalSchema } from './portal-schema.js';
import { ensureCrmV86Schema } from './portal-crm-v86.js';
import { createSteps, nextActionForStatus, syncSteps } from './portal-utils.js';
import { ensureManualWorkflowForOrder } from './portal-manual-scheduling-v85.js';
import { ensureWorkflowSchema, recordEvent, requireOperator } from './workflow-db-v5.js';
import { json, sanitizeText } from './security.js';

const PAID = new Set(['paid', 'succeeded', 'complete', 'completed', 'no_payment_required']);

export function ensureStripeJourneySchema(store) {
  ensurePortalSchema(store);
  ensureWorkflowSchema(store);
  ensureCrmV86Schema(store);
  if (store.stripeJourneyV90Ready) return;
  store.sql.exec(`
    CREATE TABLE IF NOT EXISTS portal_stripe_events_v90(
      event_id TEXT PRIMARY KEY,
      event_type TEXT NOT NULL DEFAULT '',
      session_id TEXT NOT NULL DEFAULT '',
      order_id TEXT,
      received_at TEXT NOT NULL,
      applied_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_stripe_events_session_v90
      ON portal_stripe_events_v90(session_id,received_at DESC);
  `);
  store.stripeJourneyV90Ready = true;
}

export async function stripeTargetV90(store, body = {}) {
  ensureStripeJourneySchema(store);
  const access = await requireOperator(store, body);
  if (!access.ok) return access.response;
  const payload = body.payload && typeof body.payload === 'object' ? body.payload : body;
  const target = resolveTarget(store, payload);
  if (!target.client) return json({ error: 'stripe_target_not_found' }, 404);
  return json({ ok: true, ...target });
}

export async function stripeApplyV90(store, body = {}) {
  ensureStripeJourneySchema(store);
  const access = body.system === true
    ? { ok: true, actor: { id: 'stripe', email: 'stripe@system', role: 'system' } }
    : await requireOperator(store, body);
  if (!access.ok) return access.response;

  const session = body.session && typeof body.session === 'object' ? body.session : {};
  const paymentStatus = String(session.paymentStatus || '').toLowerCase();
  if (!PAID.has(paymentStatus)) return json({ error: 'stripe_payment_not_paid' }, 409);
  const externalPaymentId = sanitizeText(session.externalPaymentId || session.id, 220);
  if (!externalPaymentId) return json({ error: 'stripe_session_missing' }, 400);

  const eventId = sanitizeText(body.eventId, 220);
  const eventType = sanitizeText(body.eventType, 120);
  if (eventId) {
    const duplicate = store.sql.exec(
      'SELECT event_id AS eventId,order_id AS orderId,applied_at AS appliedAt FROM portal_stripe_events_v90 WHERE event_id=? LIMIT 1',
      eventId,
    ).toArray()[0];
    if (duplicate?.appliedAt) return json({ ok: true, duplicate: true, orderId: duplicate.orderId || null });
    if (!duplicate) {
      store.sql.exec(
        'INSERT INTO portal_stripe_events_v90(event_id,event_type,session_id,order_id,received_at,applied_at) VALUES(?,?,?,?,?,NULL)',
        eventId, eventType, externalPaymentId, null, new Date().toISOString(),
      );
    }
  }

  const explicit = body.target && typeof body.target === 'object' ? body.target : {};
  const reference = session.reference && typeof session.reference === 'object' ? session.reference : {};
  let target = resolveTarget(store, {
    orderId: explicit.orderId || reference.orderId,
    opportunityId: explicit.opportunityId || reference.opportunityId,
    clientId: explicit.clientId || reference.clientId,
    prospectId: explicit.prospectId || reference.prospectId,
    email: session.email,
    amountTotal: session.amountTotal,
    currency: session.currency,
  });

  const existingByStripeId = store.sql.exec(
    `SELECT o.id,o.client_id AS clientId FROM portal_orders o
     WHERE o.external_payment_id=? LIMIT 1`,
    externalPaymentId,
  ).toArray()[0];
  if (existingByStripeId) {
    target = resolveTarget(store, { orderId: existingByStripeId.id });
  }

  if (!target.order && !target.opportunity) {
    const inferred = inferUniqueTarget(store, session);
    if (inferred) target = resolveTarget(store, inferred);
  }

  if (!target.order && !target.opportunity) {
    markWebhook(store, eventId, null, false);
    return json({
      ok: false,
      error: 'stripe_payment_unmatched',
      requiresManualMatch: true,
      email: session.email || '',
      amountTotal: Number(session.amountTotal || 0),
      currency: session.currency || 'eur',
      externalPaymentId,
    }, 409);
  }

  let result;
  if (target.order) result = applyToOrder(store, target, session, access.actor);
  else result = createOrderFromOpportunity(store, target, session, access.actor);

  if (result.ok) {
    markWebhook(store, eventId, result.orderId, true);
    return json(result);
  }
  markWebhook(store, eventId, result.orderId || null, false);
  return json(result, result.status || 409);
}

function applyToOrder(store, target, session, actor) {
  const order = target.order;
  const conflicting = store.sql.exec(
    'SELECT id FROM portal_orders WHERE external_payment_id=? AND id<>? LIMIT 1',
    session.externalPaymentId, order.id,
  ).toArray()[0];
  if (conflicting) return { ok: false, error: 'stripe_payment_already_linked', orderId: conflicting.id, status: 409 };

  const amountTotal = Math.max(0, Math.round(Number(session.amountTotal || order.amountTotal || 0)));
  const currency = sanitizeText(session.currency || order.currency || 'eur', 10).toLowerCase() || 'eur';
  const now = new Date().toISOString();
  const changed = String(order.paymentStatus || '').toLowerCase() !== 'paid'
    || order.externalPaymentId !== session.externalPaymentId
    || Number(order.amountTotal || 0) !== amountTotal
    || String(order.currency || '').toLowerCase() !== currency;

  if (changed) {
    store.sql.exec(`
      UPDATE portal_orders
      SET external_payment_id=?,payment_status='paid',amount_total=?,currency=?,
          order_reference=CASE WHEN order_reference='' AND ?<>'' THEN ? ELSE order_reference END,
          product_code=CASE WHEN product_code='' AND ?<>'' THEN ? ELSE product_code END,
          updated_at=?
      WHERE id=?
    `,
    session.externalPaymentId, amountTotal, currency,
    sanitizeText(session.clientReferenceId, 160), sanitizeText(session.clientReferenceId, 160),
    sanitizeText(session.productCode, 100), sanitizeText(session.productCode, 100),
    now, order.id);
    syncSteps(store, order.id, order.status, now);
    recordEvent(store, order.id, 'stripe_payment_verified', 'system', '', {
      sessionId: session.id,
      paymentIntentId: session.paymentIntentId || '',
      paymentLinkId: session.paymentLinkId || '',
      amountTotal,
      currency,
      previousPaymentStatus: order.paymentStatus || '',
    });
  }

  const client = target.client;
  updateClientIdentity(store, client?.id, session, now);
  convertOpportunity(store, target.opportunity, order.id, now);
  linkProspect(store, target.prospect || target.opportunity?.prospect, order.id, now);
  store.audit?.(actor.id || 'stripe', 'stripe_payment_verified_v90', 'portal_order', order.id, {
    sessionId: session.id, amountTotal, currency, changed,
  });
  return { ok: true, orderId: order.id, changed, paymentStatus: 'paid', amountTotal, currency };
}

function createOrderFromOpportunity(store, target, session, actor) {
  const opportunity = target.opportunity;
  const client = target.client;
  if (!opportunity || !client) return { ok: false, error: 'stripe_opportunity_missing', status: 409 };

  const existing = store.sql.exec(
    'SELECT id FROM portal_orders WHERE external_payment_id=? LIMIT 1',
    session.externalPaymentId,
  ).toArray()[0];
  if (existing) return { ok: true, orderId: existing.id, changed: false, paymentStatus: 'paid' };

  const now = new Date().toISOString();
  const orderId = crypto.randomUUID();
  const amountTotal = Math.max(0, Math.round(Number(session.amountTotal || opportunity.amountTotal || 0)));
  const currency = sanitizeText(session.currency || opportunity.currency || 'eur', 10).toLowerCase() || 'eur';
  const title = sanitizeText(session.title || opportunity.title || 'Passage Neptune Media', 200) || 'Passage Neptune Media';
  const format = sanitizeText(session.format || opportunity.format || 'Hors Norme', 100);
  const productCode = sanitizeText(session.productCode, 100);
  const status = 'reservation_confirmed';
  const bookingUrl = sanitizeText(store.env?.PREPARATION_BOOKING_URL || store.env?.BOOKING_URL || '', 1200);
  const nextAction = nextActionForStatus(status);

  store.sql.exec(`
    INSERT INTO portal_orders(
      id,client_id,external_payment_id,order_reference,product_code,title,format,payment_status,
      amount_total,currency,status,appointment_at,filming_at,next_action,preparation_url,booking_url,created_at,updated_at
    ) VALUES(?,?,?,?,?,?,?,'paid',?,?,?,NULL,NULL,?,'',?,?,?)
  `,
  orderId, client.id, session.externalPaymentId, sanitizeText(session.clientReferenceId, 160),
  productCode, title, format, amountTotal, currency, status, nextAction, bookingUrl, now, now);
  createSteps(store, orderId, status, now);
  ensureManualWorkflowForOrder(store, orderId, { sourceType: opportunity.sourceType || 'stripe', filmingConfirmed: false });
  updateClientIdentity(store, client.id, session, now);
  convertOpportunity(store, opportunity, orderId, now);
  linkProspect(store, target.prospect || opportunity.prospect, orderId, now);
  recordEvent(store, orderId, 'stripe_payment_verified', 'system', '', {
    sessionId: session.id,
    paymentIntentId: session.paymentIntentId || '',
    paymentLinkId: session.paymentLinkId || '',
    amountTotal,
    currency,
    createdFromOpportunity: opportunity.id,
  });
  store.audit?.(actor.id || 'stripe', 'stripe_payment_created_order_v90', 'portal_order', orderId, {
    sessionId: session.id, opportunityId: opportunity.id, amountTotal, currency,
  });
  return { ok: true, orderId, created: true, changed: true, paymentStatus: 'paid', amountTotal, currency };
}

function resolveTarget(store, payload = {}) {
  const orderId = sanitizeText(payload.orderId, 100);
  const opportunityId = sanitizeText(payload.opportunityId, 100);
  const clientId = sanitizeText(payload.clientId, 100);
  const prospectId = sanitizeText(payload.prospectId, 100);
  const email = String(payload.email || '').trim().toLowerCase();

  let order = orderId ? getOrder(store, orderId) : null;
  let opportunity = opportunityId ? getOpportunity(store, opportunityId) : null;
  let prospect = prospectId ? getProspect(store, prospectId) : null;
  let client = null;

  const resolvedClientId = clientId || order?.clientId || opportunity?.clientId || prospect?.clientId || '';
  if (resolvedClientId) client = getClient(store, resolvedClientId);
  if (!client && email) client = getClientByEmail(store, email);
  if (!order && client) order = latestActiveOrder(store, client.id);
  if (!opportunity && client) opportunity = latestOpenOpportunity(store, client.id);
  if (!prospect && opportunity?.prospectId) prospect = getProspect(store, opportunity.prospectId);
  if (!prospect && client) prospect = latestOpenProspect(store, client.id);

  const amountTotal = Number(order?.amountTotal || opportunity?.amountTotal || payload.amountTotal || 0);
  const currency = String(order?.currency || opportunity?.currency || payload.currency || 'eur').toLowerCase();
  return {
    client,
    order,
    opportunity,
    prospect,
    orderId: order?.id || '',
    opportunityId: opportunity?.id || '',
    clientId: client?.id || '',
    prospectId: prospect?.id || '',
    email: client?.email || email,
    amountTotal,
    currency,
    format: order?.format || opportunity?.format || '',
    productCode: order?.productCode || '',
    externalPaymentId: order?.externalPaymentId || '',
  };
}

function inferUniqueTarget(store, session) {
  const email = String(session.email || '').toLowerCase();
  const amountTotal = Math.max(0, Math.round(Number(session.amountTotal || 0)));
  const currency = String(session.currency || 'eur').toLowerCase();
  if (!email) return null;
  const client = getClientByEmail(store, email);
  if (!client) return null;

  const orders = store.sql.exec(`
    SELECT o.id,o.amount_total AS amountTotal,o.currency,o.payment_status AS paymentStatus
    FROM portal_orders o
    WHERE o.client_id=? AND o.status NOT IN ('completed','delivered')
    ORDER BY o.updated_at DESC LIMIT 6
  `, client.id).toArray().filter((row) => !PAID.has(String(row.paymentStatus || '').toLowerCase()));
  const exactOrders = orders.filter((row) => Number(row.amountTotal || 0) === amountTotal && String(row.currency || '').toLowerCase() === currency);
  if (exactOrders.length === 1) return { orderId: exactOrders[0].id };

  const opportunities = store.sql.exec(`
    SELECT id,amount_total AS amountTotal,currency FROM portal_crm_opportunities_v86
    WHERE client_id=? AND status NOT IN ('cancelled','converted')
    ORDER BY updated_at DESC LIMIT 6
  `, client.id).toArray();
  const exactOpportunities = opportunities.filter((row) => Number(row.amountTotal || 0) === amountTotal && String(row.currency || '').toLowerCase() === currency);
  return exactOpportunities.length === 1 ? { opportunityId: exactOpportunities[0].id } : null;
}

function getOrder(store, id) {
  return store.sql.exec(`
    SELECT o.id,o.client_id AS clientId,o.external_payment_id AS externalPaymentId,o.order_reference AS orderReference,
           o.product_code AS productCode,o.title,o.format,o.payment_status AS paymentStatus,o.amount_total AS amountTotal,
           o.currency,o.status,o.appointment_at AS appointmentAt,o.filming_at AS filmingAt,o.preparation_url AS preparationUrl,
           o.booking_url AS bookingUrl,o.next_action AS nextAction,o.created_at AS createdAt,o.updated_at AS updatedAt
    FROM portal_orders o WHERE o.id=? LIMIT 1
  `, id).toArray()[0] || null;
}

function getOpportunity(store, id) {
  const row = store.sql.exec(`
    SELECT x.id,x.client_id AS clientId,x.prospect_id AS prospectId,x.source_type AS sourceType,x.title,x.format,
           x.amount_total AS amountTotal,x.currency,x.payment_mode AS paymentMode,x.status,
           p.status AS prospectStatus,p.order_id AS paidOrderId
    FROM portal_crm_opportunities_v86 x
    LEFT JOIN portal_prospects p ON p.id=x.prospect_id
    WHERE x.id=? LIMIT 1
  `, id).toArray()[0] || null;
  if (row?.prospectId) row.prospect = getProspect(store, row.prospectId);
  return row;
}

function latestOpenOpportunity(store, clientId) {
  const row = store.sql.exec(`
    SELECT x.id,x.client_id AS clientId,x.prospect_id AS prospectId,x.source_type AS sourceType,x.title,x.format,
           x.amount_total AS amountTotal,x.currency,x.payment_mode AS paymentMode,x.status,
           p.status AS prospectStatus,p.order_id AS paidOrderId
    FROM portal_crm_opportunities_v86 x
    LEFT JOIN portal_prospects p ON p.id=x.prospect_id
    WHERE x.client_id=? AND x.status NOT IN ('cancelled','converted')
    ORDER BY x.updated_at DESC LIMIT 1
  `, clientId).toArray()[0] || null;
  if (row?.prospectId) row.prospect = getProspect(store, row.prospectId);
  return row;
}

function getProspect(store, id) {
  return store.sql.exec(`
    SELECT id,client_id AS clientId,status,email,order_id AS orderId,paid_at AS paidAt
    FROM portal_prospects WHERE id=? LIMIT 1
  `, id).toArray()[0] || null;
}

function latestOpenProspect(store, clientId) {
  return store.sql.exec(`
    SELECT id,client_id AS clientId,status,email,order_id AS orderId,paid_at AS paidAt
    FROM portal_prospects
    WHERE client_id=? AND status IN ('captured','tunnel_started','paid')
    ORDER BY updated_at DESC LIMIT 1
  `, clientId).toArray()[0] || null;
}

function getClient(store, id) {
  return store.sql.exec(
    'SELECT id,email,full_name AS fullName,company FROM portal_clients WHERE id=? LIMIT 1',
    id,
  ).toArray()[0] || null;
}

function getClientByEmail(store, email) {
  return store.sql.exec(
    'SELECT id,email,full_name AS fullName,company FROM portal_clients WHERE email=? LIMIT 1',
    email,
  ).toArray()[0] || null;
}

function latestActiveOrder(store, clientId) {
  return store.sql.exec(`
    SELECT o.id,o.client_id AS clientId,o.external_payment_id AS externalPaymentId,o.order_reference AS orderReference,
           o.product_code AS productCode,o.title,o.format,o.payment_status AS paymentStatus,o.amount_total AS amountTotal,
           o.currency,o.status,o.appointment_at AS appointmentAt,o.filming_at AS filmingAt,o.preparation_url AS preparationUrl,
           o.booking_url AS bookingUrl,o.next_action AS nextAction,o.created_at AS createdAt,o.updated_at AS updatedAt
    FROM portal_orders o WHERE o.client_id=? AND o.status NOT IN ('completed','delivered')
    ORDER BY o.updated_at DESC LIMIT 1
  `, clientId).toArray()[0] || null;
}

function updateClientIdentity(store, clientId, session, now) {
  if (!clientId) return;
  const fullName = sanitizeText(session.fullName, 160);
  const company = sanitizeText(session.company, 180);
  if (!fullName && !company) return;
  store.sql.exec(`
    UPDATE portal_clients SET
      full_name=CASE WHEN full_name='' AND ?<>'' THEN ? ELSE full_name END,
      company=CASE WHEN company='' AND ?<>'' THEN ? ELSE company END,
      updated_at=?
    WHERE id=?
  `, fullName, fullName, company, company, now, clientId);
}

function convertOpportunity(store, opportunity, orderId, now) {
  if (!opportunity?.id) return;
  store.sql.exec(
    `UPDATE portal_crm_opportunities_v86 SET status='converted',updated_at=? WHERE id=? AND status<>'converted'`,
    now, opportunity.id,
  );
  if (opportunity.prospectId) linkProspect(store, opportunity.prospect || getProspect(store, opportunity.prospectId), orderId, now);
}

function linkProspect(store, prospect, orderId, now) {
  if (!prospect?.id) return;
  store.sql.exec(`
    UPDATE portal_prospects SET status='paid',paid_at=COALESCE(paid_at,?),order_id=COALESCE(order_id,?),updated_at=?
    WHERE id=?
  `, now, orderId, now, prospect.id);
}

function markWebhook(store, eventId, orderId, applied) {
  if (!eventId) return;
  const now = new Date().toISOString();
  store.sql.exec(
    `UPDATE portal_stripe_events_v90 SET order_id=?,applied_at=CASE WHEN ?=1 THEN ? ELSE applied_at END WHERE event_id=?`,
    orderId || null, applied ? 1 : 0, now, eventId,
  );
}
