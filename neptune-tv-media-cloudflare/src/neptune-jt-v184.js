import { json, sanitizeText } from './security.js';
import { sendEmail } from './email-service.js';
import { requireOperator } from './workflow-db-v5.js';
import {
  ensureNeptuneJtSchema,
  handleNeptuneJtStore as handleNeptuneJtStoreV183,
  handleNeptuneJtStripeWebhook as handleNeptuneJtStripeWebhookV183,
  reconcileNeptuneJtCheckoutSession as reconcileNeptuneJtCheckoutSessionV183,
  runNeptuneJtScheduled as runNeptuneJtScheduledV183,
  sendNeptuneJtCancellationNotifications as sendNeptuneJtCancellationNotificationsV183,
  sendNeptuneJtReservationEmails as sendNeptuneJtReservationEmailsV183,
} from './neptune-jt-v183.js';

export const NEPTUNE_JT_RELEASE = 'neptune-jt-20260914-v184-release-hardening';

const MIN_PARTICIPANTS = 4;
const MAX_PARTICIPANTS = 6;
const ACTIVE_EDITION_META = 'neptune_jt_active_edition_v183';
const PAYMENT_LINK_FALLBACK = 'https://buy.stripe.com/bJe28rcdngXw0586qi73G0d';
const REF_PREFIX = 'NPJTE_';
const LIVE_STATUSES = new Set(['pre_registered', 'payment_requested', 'confirmed']);

export async function handleNeptuneJtStore(store, request) {
  ensureNeptuneJtSchema(store);
  ensureHardeningSchema(store);
  const hardened = await hardeningResponse(store, request);
  if (hardened) return hardened;
  return handleNeptuneJtStoreV183(store, request);
}

export function handleNeptuneJtStripeWebhook(request, env, storeCall) {
  return handleNeptuneJtStripeWebhookV183(request, env, storeCall);
}

export function reconcileNeptuneJtCheckoutSession(env, sessionId, storeCall) {
  return reconcileNeptuneJtCheckoutSessionV183(env, sessionId, storeCall);
}

export function runNeptuneJtScheduled(env, storeCall) {
  return runNeptuneJtScheduledV183(env, storeCall);
}

export function sendNeptuneJtReservationEmails(env, internal = {}) {
  return sendNeptuneJtReservationEmailsV183(env, internal);
}

export async function sendNeptuneJtCancellationNotifications(env, internal = {}, storeCall) {
  if (internal.paymentRecipients?.length) {
    await sendNeptuneJtReservationEmailsV183(env, { paymentRecipients: internal.paymentRecipients });
  }
  return sendNeptuneJtCancellationNotificationsV183(env, internal, storeCall);
}

function ensureHardeningSchema(store) {
  if (store.neptuneJtV184Ready) return;
  store.sql.exec(`
    CREATE TABLE IF NOT EXISTS neptune_jt_financial_alerts_v184(
      id TEXT PRIMARY KEY,
      fingerprint TEXT NOT NULL UNIQUE,
      reservation_id TEXT NOT NULL DEFAULT '',
      edition_id TEXT NOT NULL DEFAULT '',
      kind TEXT NOT NULL,
      stripe_session_id TEXT NOT NULL DEFAULT '',
      amount_cents INTEGER NOT NULL DEFAULT 0,
      currency TEXT NOT NULL DEFAULT 'eur',
      details TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      resolved_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_neptune_jt_financial_alerts_open_v184
      ON neptune_jt_financial_alerts_v184(resolved_at,created_at DESC);
  `);
  store.neptuneJtV184Ready = true;
}

async function hardeningResponse(store, request) {
  const url = new URL(request.url);
  const method = request.method.toUpperCase();
  const path = url.pathname;
  const body = method === 'POST' ? await request.clone().json().catch(() => ({})) : {};

  if (method === 'GET' && path === '/neptune-jt-v183/status') {
    repairActiveEdition(store);
    return publicStatus(store);
  }

  if (method === 'POST' && path === '/neptune-jt-v183/pre-register') {
    repairActiveEdition(store);
    return preRegisterGuard(store, body);
  }

  if (method === 'POST' && (path === '/neptune-jt-v183/mark-paid' || path === '/neptune-jt-v183/reconcile-session')) {
    return paymentGuard(store, body);
  }

  if (method === 'POST' && path === '/neptune-jt-v183/admin-dashboard') {
    repairActiveEdition(store);
    return null;
  }

  if (method === 'POST' && path === '/neptune-jt-v183/admin-save-edition') {
    return saveEditionGuard(store, body);
  }

  if (method === 'POST' && path === '/neptune-jt-v183/admin-edition-action') {
    return editionActionGuard(store, body);
  }

  if (method === 'POST' && path === '/neptune-jt-v183/admin-reservation-action') {
    return reservationActionGuard(store, body);
  }

  if (method === 'POST' && path === '/neptune-jt-v183/cutoff') {
    prepareDueCutoffs(store, body);
    return null;
  }

  return null;
}

function publicStatus(store) {
  const edition = activeEdition(store);
  if (!edition) {
    return json({
      ok: true,
      release: NEPTUNE_JT_RELEASE,
      edition: null,
      counts: emptyCounts(),
      minimumParticipants: MIN_PARTICIPANTS,
      maximumParticipants: MAX_PARTICIPANTS,
      remainingPreRegistrationPlaces: MAX_PARTICIPANTS,
      registrationOpen: false,
      registrationReason: 'edition_not_ready',
    });
  }

  const counts = reservationCounts(store, edition.id);
  const readiness = registrationReadiness(edition, counts);
  return json({
    ok: true,
    release: NEPTUNE_JT_RELEASE,
    edition: safePublicEdition(edition),
    counts,
    minimumParticipants: MIN_PARTICIPANTS,
    maximumParticipants: MAX_PARTICIPANTS,
    remainingPreRegistrationPlaces: Math.max(0, MAX_PARTICIPANTS - counts.total),
    registrationOpen: readiness.open,
    registrationReason: readiness.reason,
  });
}

function preRegisterGuard(store, body) {
  const honeypot = sanitizeText(body._companyWebsite, 300).trim();
  if (honeypot) return json({ error: 'request_rejected' }, 400);

  const startedAt = Number(body._formStartedAt || 0);
  if (startedAt > 0 && Date.now() - startedAt < 1800) return json({ error: 'request_rejected' }, 400);

  const edition = activeEdition(store);
  if (!edition) return json({ error: 'edition_not_ready' }, 409);
  const counts = reservationCounts(store, edition.id);
  const readiness = registrationReadiness(edition, counts);
  if (!readiness.open) return json({ error: readiness.reason || 'registrations_closed' }, 409);

  const email = String(body.email || '').trim().toLowerCase().slice(0, 240);
  if (email) {
    const existing = store.sql.exec(
      'SELECT id,status FROM neptune_jt_reservations_v182 WHERE edition_id=? AND email=? LIMIT 1',
      edition.id,
      email,
    ).toArray()[0];
    if (existing) return json({ error: 'already_registered', reservationId: existing.id, status: existing.status }, 409);
  }
  return null;
}

async function paymentGuard(store, body) {
  const session = body.session && typeof body.session === 'object' ? body.session : {};
  if (String(session.paymentStatus || '').toLowerCase() !== 'paid') return null;

  const reservationId = reservationIdFromReference(session.clientReferenceId || session.reference?.raw || '');
  if (!reservationId) return null;
  const row = reservationById(store, reservationId);
  if (!row) return null;
  const edition = editionById(store, row.editionId);
  const sessionId = sanitizeText(session.id || session.externalPaymentId, 220).trim();
  const amountCents = Number(session.amountTotal || 0);
  const currency = String(session.currency || '').trim().toLowerCase();

  if (row.status === 'confirmed' && row.stripeSessionId === sessionId) return null;

  let kind = '';
  if (row.status === 'confirmed' && row.stripeSessionId && row.stripeSessionId !== sessionId) kind = 'duplicate_paid_session';
  else if (row.status !== 'payment_requested') kind = `payment_on_${sanitizeText(row.status, 60) || 'unexpected_status'}`;
  else if (!edition || ['cancelled', 'archived'].includes(edition.status)) kind = 'payment_on_unavailable_edition';
  else if (amountCents !== 20000 || currency !== 'eur') kind = 'payment_amount_or_currency_mismatch';
  else if (reservationCounts(store, row.editionId).confirmed >= MAX_PARTICIPANTS) kind = 'payment_after_capacity_reached';

  if (!kind) return null;

  await recordFinancialAlert(store, {
    kind,
    reservation: row,
    sessionId,
    amountCents,
    currency,
    details: `status=${row.status}; edition=${edition?.status || 'missing'}`,
  });

  return json({
    ok: true,
    reservationId,
    confirmed: row.status === 'confirmed',
    financialReviewRequired: true,
    anomaly: kind,
  });
}

async function saveEditionGuard(store, body) {
  const access = await requireOperator(store, body);
  if (!access.ok) return access.response;

  const eventAt = normalizeIso(body.eventAt);
  if (eventAt && new Date(eventAt).getTime() <= Date.now()) return json({ error: 'edition_date_must_be_future' }, 409);

  const paymentLink = String(body.paymentLink || PAYMENT_LINK_FALLBACK).trim();
  if (paymentLink && !validPaymentLink(paymentLink)) return json({ error: 'stripe_payment_link_invalid' }, 400);
  return null;
}

async function editionActionGuard(store, body) {
  const access = await requireOperator(store, body);
  if (!access.ok) return access.response;

  const id = sanitizeText(body.editionId, 100).trim();
  const action = sanitizeText(body.action, 40).trim();
  const edition = editionById(store, id);
  if (!edition) return json({ error: 'edition_not_found' }, 404);

  if (edition.status === 'archived') return json({ error: 'archived_edition_read_only' }, 409);
  if (edition.status === 'cancelled' && action !== 'archive') return json({ error: 'cancelled_edition_read_only' }, 409);

  if (['activate', 'reopen'].includes(action)) {
    const readiness = editionTimeReadiness(edition);
    if (!readiness.open) return json({ error: readiness.reason }, 409);
  }

  if (action === 'maintain') return maintainEdition(store, edition);
  if (action === 'unmaintain') return unmaintainEdition(store, edition);

  if (action === 'cancel') markPreviouslyInactiveCancellationRecipients(store, edition.id);
  return null;
}

async function reservationActionGuard(store, body) {
  const access = await requireOperator(store, body);
  if (!access.ok) return access.response;

  const id = sanitizeText(body.reservationId, 100).trim();
  const action = sanitizeText(body.action, 40).trim();
  const row = reservationById(store, id);
  if (!row) return json({ error: 'reservation_not_found' }, 404);

  if (['cancel', 'move', 'resend'].includes(action) && !LIVE_STATUSES.has(row.status)) {
    return json({ error: 'reservation_action_not_available' }, 409);
  }

  if (action === 'move') {
    if (row.status === 'confirmed' || Number(row.amountPaidCents || 0) > 0) return null;
    const targetId = sanitizeText(body.targetEditionId, 100).trim();
    if (!targetId || targetId === row.editionId) return json({ error: 'target_edition_invalid' }, 409);
    const target = editionById(store, targetId);
    if (!target) return json({ error: 'target_edition_unavailable' }, 409);
    const readiness = registrationReadiness(target, reservationCounts(store, targetId));
    if (!readiness.open) return json({ error: readiness.reason || 'target_edition_unavailable' }, 409);
  }

  if (action === 'cancel' && Number(row.amountPaidCents || 0) > 0 && body.confirmPaidRisk === true) {
    await recordFinancialAlert(store, {
      kind: 'paid_participant_cancelled',
      reservation: row,
      sessionId: row.stripeSessionId,
      amountCents: Number(row.amountPaidCents || 0),
      currency: 'eur',
      details: 'Cancellation requested from Neptune Studio; refund or written carry-over must be processed manually.',
    });
  }

  return null;
}

function maintainEdition(store, edition) {
  const counts = reservationCounts(store, edition.id);
  if (counts.total < 1) return json({ error: 'edition_has_no_participants' }, 409);

  const now = new Date().toISOString();
  const nextStatus = counts.confirmed >= MIN_PARTICIPANTS ? 'confirmed' : 'payment_open';
  store.sql.exec(
    'UPDATE neptune_jt_editions_v182 SET force_maintained=1,status=?,payment_opened_at=COALESCE(payment_opened_at,?),updated_at=? WHERE id=?',
    nextStatus,
    now,
    now,
    edition.id,
  );

  const candidates = store.sql.exec(
    "SELECT id,first_name AS firstName,last_name AS lastName,email,company,status,referral_code AS referralCode FROM neptune_jt_reservations_v182 WHERE edition_id=? AND status='pre_registered' ORDER BY created_at ASC",
    edition.id,
  ).toArray();
  const paymentRecipients = [];
  for (const row of candidates) {
    store.sql.exec("UPDATE neptune_jt_reservations_v182 SET status='payment_requested',payment_sent_at=?,updated_at=? WHERE id=?", now, now, row.id);
    paymentRecipients.push({
      ...row,
      status: 'payment_requested',
      editionLabel: edition.label,
      paymentUrl: buildPaymentUrl(edition.paymentLink, row.id, row.email),
    });
  }

  return json({
    ok: true,
    action: 'maintain',
    internal: { paymentRecipients, cancellationRecipients: [] },
  });
}

function unmaintainEdition(store, edition) {
  const now = new Date().toISOString();
  const counts = reservationCounts(store, edition.id);
  if (counts.total < MIN_PARTICIPANTS) {
    store.sql.exec(
      "UPDATE neptune_jt_reservations_v182 SET status='pre_registered',payment_sent_at=NULL,updated_at=? WHERE edition_id=? AND status='payment_requested'",
      now,
      edition.id,
    );
  }
  const refreshed = reservationCounts(store, edition.id);
  const nextStatus = refreshed.confirmed >= MIN_PARTICIPANTS
    ? 'confirmed'
    : refreshed.total >= MIN_PARTICIPANTS
      ? 'payment_open'
      : 'collecting';
  store.sql.exec(
    'UPDATE neptune_jt_editions_v182 SET force_maintained=0,status=?,payment_opened_at=CASE WHEN ?=\'collecting\' THEN NULL ELSE payment_opened_at END,updated_at=? WHERE id=?',
    nextStatus,
    nextStatus,
    now,
    edition.id,
  );
  return json({ ok: true, action: 'unmaintain' });
}

function prepareDueCutoffs(store, body) {
  const now = normalizeIso(body.now) || new Date().toISOString();
  const due = store.sql.exec(
    "SELECT id FROM neptune_jt_editions_v182 WHERE cutoff_at IS NOT NULL AND cutoff_at<=? AND status NOT IN ('cancelled','archived')",
    now,
  ).toArray();
  for (const item of due) {
    store.sql.exec(
      'UPDATE neptune_jt_editions_v182 SET registrations_closed_at=COALESCE(registrations_closed_at,?),updated_at=? WHERE id=?',
      now,
      now,
      item.id,
    );
    markPreviouslyInactiveCancellationRecipients(store, item.id, now);
  }
}

function repairActiveEdition(store) {
  const now = new Date().toISOString();
  const activeId = getMeta(store, ACTIVE_EDITION_META);
  const active = editionById(store, activeId);
  if (active && !['cancelled', 'archived'].includes(active.status) && active.eventAt && active.eventAt > now) return active;

  const future = store.sql.exec(
    "SELECT id FROM neptune_jt_editions_v182 WHERE status NOT IN ('cancelled','archived') AND event_at IS NOT NULL AND event_at>? ORDER BY event_at ASC,created_at DESC LIMIT 1",
    now,
  ).toArray()[0];
  if (future?.id) {
    setMeta(store, ACTIVE_EDITION_META, future.id);
    return editionById(store, future.id);
  }
  return active;
}

function activeEdition(store) {
  const id = getMeta(store, ACTIVE_EDITION_META);
  return editionById(store, id);
}

function registrationReadiness(edition, counts) {
  if (!edition) return { open: false, reason: 'edition_not_ready' };
  if (['cancelled', 'archived'].includes(edition.status)) return { open: false, reason: 'edition_unavailable' };
  const time = editionTimeReadiness(edition);
  if (!time.open) return time;
  if (edition.registrationsClosedAt) return { open: false, reason: 'registrations_closed' };
  if (Number(counts?.total || 0) >= MAX_PARTICIPANTS) return { open: false, reason: 'edition_full' };
  return { open: true, reason: '' };
}

function editionTimeReadiness(edition) {
  if (!edition?.eventAt) return { open: false, reason: 'edition_not_ready' };
  const now = Date.now();
  const event = new Date(edition.eventAt).getTime();
  if (!Number.isFinite(event) || event <= now) return { open: false, reason: 'edition_date_passed' };
  if (!edition.cutoffAt) return { open: false, reason: 'edition_not_ready' };
  const cutoff = new Date(edition.cutoffAt).getTime();
  if (!Number.isFinite(cutoff) || cutoff <= now) return { open: false, reason: 'registrations_closed' };
  return { open: true, reason: '' };
}

function markPreviouslyInactiveCancellationRecipients(store, editionId, now = new Date().toISOString()) {
  store.sql.exec(
    "UPDATE neptune_jt_reservations_v182 SET cancellation_email_sent_at=COALESCE(cancellation_email_sent_at,?),updated_at=? WHERE edition_id=? AND status IN ('cancelled_participant','moved')",
    now,
    now,
    editionId,
  );
}

async function recordFinancialAlert(store, alert) {
  const reservation = alert.reservation || {};
  const sessionId = sanitizeText(alert.sessionId, 220).trim();
  const fingerprint = [alert.kind, reservation.id || '', sessionId || 'no-session'].join(':').slice(0, 500);
  const existing = store.sql.exec('SELECT id FROM neptune_jt_financial_alerts_v184 WHERE fingerprint=? LIMIT 1', fingerprint).toArray()[0];
  if (existing) return existing.id;

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  store.sql.exec(
    'INSERT INTO neptune_jt_financial_alerts_v184(id,fingerprint,reservation_id,edition_id,kind,stripe_session_id,amount_cents,currency,details,created_at,resolved_at) VALUES(?,?,?,?,?,?,?,?,?,?,NULL)',
    id,
    fingerprint,
    reservation.id || '',
    reservation.editionId || '',
    sanitizeText(alert.kind, 120),
    sessionId,
    Math.max(0, Number(alert.amountCents || 0)),
    sanitizeText(alert.currency || 'eur', 12).toLowerCase(),
    sanitizeText(alert.details, 1200),
    now,
  );

  const subject = `Action requise · Neptune JT · ${sanitizeText(alert.kind, 100)}`;
  const text = [
    'Une anomalie financière Neptune JT nécessite un contrôle humain.',
    '',
    `Type : ${alert.kind}`,
    `Participant : ${reservation.firstName || ''} ${reservation.lastName || ''}`.trim(),
    `E-mail : ${reservation.email || ''}`,
    `Entreprise : ${reservation.company || ''}`,
    `Réservation : ${reservation.id || ''}`,
    `Édition : ${reservation.editionId || ''}`,
    `Session Stripe : ${sessionId || 'non renseignée'}`,
    `Montant observé : ${Math.max(0, Number(alert.amountCents || 0))} ${String(alert.currency || 'eur').toUpperCase()}`,
    `Détail : ${alert.details || ''}`,
    '',
    'Ne pas considérer ce dossier comme soldé tant que Stripe et la situation client n’ont pas été vérifiés.',
  ].join('\n');
  await sendEmail(store.env || {}, {
    to: ['contact@neptunebusiness.com'],
    subject,
    text,
    idempotencyKey: `neptune-jt-financial-${fingerprint}`.slice(0, 240),
  });
  return id;
}

function reservationById(store, id) {
  return store.sql.exec(
    `SELECT id,edition_id AS editionId,first_name AS firstName,last_name AS lastName,email,company,status,
      stripe_session_id AS stripeSessionId,stripe_payment_intent_id AS stripePaymentIntentId,
      amount_paid_cents AS amountPaidCents,paid_at AS paidAt
     FROM neptune_jt_reservations_v182 WHERE id=? LIMIT 1`,
    id,
  ).toArray()[0] || null;
}

function editionById(store, id) {
  if (!id) return null;
  return store.sql.exec(
    `SELECT id,label,event_at AS eventAt,cutoff_at AS cutoffAt,location,status,payment_link AS paymentLink,
      payment_opened_at AS paymentOpenedAt,cancelled_at AS cancelledAt,
      registrations_closed_at AS registrationsClosedAt,force_maintained AS forceMaintained,notes,
      created_at AS createdAt,updated_at AS updatedAt
     FROM neptune_jt_editions_v182 WHERE id=? LIMIT 1`,
    id,
  ).toArray()[0] || null;
}

function reservationCounts(store, editionId) {
  const row = store.sql.exec(
    `SELECT
      SUM(CASE WHEN status IN ('pre_registered','payment_requested','confirmed') THEN 1 ELSE 0 END) AS total,
      SUM(CASE WHEN status='confirmed' THEN 1 ELSE 0 END) AS confirmed,
      SUM(CASE WHEN status='payment_requested' THEN 1 ELSE 0 END) AS paymentRequested,
      SUM(CASE WHEN status='pre_registered' THEN 1 ELSE 0 END) AS preRegistered,
      SUM(CASE WHEN amount_paid_cents>0 THEN 1 ELSE 0 END) AS paidEver,
      SUM(CASE WHEN amount_paid_cents>0 THEN amount_paid_cents ELSE 0 END) AS revenueCents
     FROM neptune_jt_reservations_v182 WHERE edition_id=?`,
    editionId,
  ).toArray()[0] || {};
  return {
    total: Number(row.total || 0),
    confirmed: Number(row.confirmed || 0),
    paymentRequested: Number(row.paymentRequested || 0),
    preRegistered: Number(row.preRegistered || 0),
    paidEver: Number(row.paidEver || 0),
    revenueCents: Number(row.revenueCents || 0),
  };
}

function safePublicEdition(edition) {
  return {
    id: edition.id,
    label: edition.label,
    eventAt: edition.eventAt || null,
    cutoffAt: edition.cutoffAt || null,
    location: edition.location || '',
    status: edition.status,
    registrationsClosedAt: edition.registrationsClosedAt || null,
    forceMaintained: Boolean(Number(edition.forceMaintained || 0)),
    minimumParticipants: MIN_PARTICIPANTS,
    maximumParticipants: MAX_PARTICIPANTS,
  };
}

function emptyCounts() {
  return { total: 0, confirmed: 0, paymentRequested: 0, preRegistered: 0, paidEver: 0, revenueCents: 0 };
}

function validPaymentLink(value) {
  try {
    const url = new URL(String(value || ''));
    return url.protocol === 'https:' && url.hostname === 'buy.stripe.com';
  } catch {
    return false;
  }
}

function buildPaymentUrl(base, reservationId, email) {
  const url = new URL(base || PAYMENT_LINK_FALLBACK);
  url.searchParams.set('client_reference_id', `${REF_PREFIX}${reservationId}`);
  url.searchParams.set('locked_prefilled_email', email);
  url.searchParams.set('utm_source', 'neptune_jt');
  url.searchParams.set('utm_medium', 'email');
  url.searchParams.set('utm_campaign', 'reservation_confirmation');
  return url.toString();
}

function reservationIdFromReference(value) {
  const raw = String(value || '').trim();
  if (!raw.startsWith(REF_PREFIX)) return '';
  const id = raw.slice(REF_PREFIX.length);
  return /^[0-9a-f-]{20,100}$/iu.test(id) ? id : '';
}

function getMeta(store, key) {
  return String(store.sql.exec('SELECT value FROM meta WHERE key=? LIMIT 1', key).toArray()[0]?.value || '');
}

function setMeta(store, key, value) {
  store.sql.exec(
    'INSERT INTO meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',
    key,
    String(value || ''),
  );
}

function normalizeIso(value) {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}
