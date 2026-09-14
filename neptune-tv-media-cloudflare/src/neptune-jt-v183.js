import { json, sanitizeText } from './security.js';
import { sendEmail } from './email-service.js';
import { normalizeStripeCheckoutSession, verifyStripeWebhook } from './stripe-journey-v90.js';
import { requireOperator, requireViewer } from './workflow-db-v5.js';

export const NEPTUNE_JT_RELEASE = 'neptune-jt-20260914-v183-studio';
const MIN_PARTICIPANTS = 4;
const MAX_PARTICIPANTS = 6;
const PAYMENT_LINK_FALLBACK = 'https://buy.stripe.com/bJe28rcdngXw0586qi73G0d';
const DEFAULT_ORIGIN = 'https://tv.neptunebusiness.com';
const REF_PREFIX = 'NPJTE_';
const ACTIVE_EDITION_META = 'neptune_jt_active_edition_v183';
const LIVE_RESERVATION_STATUSES = new Set(['pre_registered', 'payment_requested', 'confirmed']);

export function ensureNeptuneJtSchema(store) {
  if (store.neptuneJtV183Ready) return;
  store.sql.exec(`
    CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS neptune_jt_editions_v182(
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      event_at TEXT,
      cutoff_at TEXT,
      location TEXT NOT NULL DEFAULT '',
      minimum_participants INTEGER NOT NULL DEFAULT 4,
      maximum_participants INTEGER NOT NULL DEFAULT 6,
      status TEXT NOT NULL DEFAULT 'collecting',
      payment_link TEXT NOT NULL DEFAULT '',
      payment_opened_at TEXT,
      cancelled_at TEXT,
      registrations_closed_at TEXT,
      force_maintained INTEGER NOT NULL DEFAULT 0,
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS neptune_jt_reservations_v182(
      id TEXT PRIMARY KEY,
      edition_id TEXT NOT NULL REFERENCES neptune_jt_editions_v182(id),
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT NOT NULL DEFAULT '',
      company TEXT NOT NULL DEFAULT '',
      role TEXT NOT NULL DEFAULT '',
      website TEXT NOT NULL DEFAULT '',
      member_status TEXT NOT NULL DEFAULT 'unknown',
      topic TEXT NOT NULL DEFAULT '',
      topic_context TEXT NOT NULL DEFAULT '',
      source_link TEXT NOT NULL DEFAULT '',
      commercial_cta TEXT NOT NULL DEFAULT '',
      referral_code TEXT NOT NULL UNIQUE,
      referred_by TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pre_registered',
      stripe_session_id TEXT NOT NULL DEFAULT '',
      stripe_payment_intent_id TEXT NOT NULL DEFAULT '',
      amount_paid_cents INTEGER NOT NULL DEFAULT 0,
      paid_at TEXT,
      payment_sent_at TEXT,
      cancellation_email_sent_at TEXT,
      terms_accepted_at TEXT NOT NULL,
      media_rights_accepted_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(edition_id,email)
    );
    CREATE INDEX IF NOT EXISTS idx_neptune_jt_reservations_edition_v182 ON neptune_jt_reservations_v182(edition_id,status,created_at);
    CREATE INDEX IF NOT EXISTS idx_neptune_jt_reservations_stripe_v182 ON neptune_jt_reservations_v182(stripe_session_id);
  `);
  ensureEditionColumn(store, 'registrations_closed_at', 'TEXT');
  ensureEditionColumn(store, 'force_maintained', 'INTEGER NOT NULL DEFAULT 0');
  ensureEditionColumn(store, 'notes', "TEXT NOT NULL DEFAULT ''");
  seedInitialEdition(store);
  store.neptuneJtV183Ready = true;
}

export async function handleNeptuneJtStore(store, request) {
  ensureNeptuneJtSchema(store);
  const url = new URL(request.url);
  const method = request.method.toUpperCase();
  const body = method === 'POST' ? await request.clone().json().catch(() => ({})) : {};

  if (method === 'GET' && url.pathname === '/neptune-jt-v183/status') return publicStatus(store);
  if (method === 'POST' && url.pathname === '/neptune-jt-v183/pre-register') return preRegister(store, body);
  if (method === 'POST' && url.pathname === '/neptune-jt-v183/mark-paid') return markPaid(store, body);
  if (method === 'POST' && url.pathname === '/neptune-jt-v183/reconcile-session') return markPaid(store, body);
  if (method === 'POST' && url.pathname === '/neptune-jt-v183/cutoff') return processDueCutoffs(store, body);
  if (method === 'POST' && url.pathname === '/neptune-jt-v183/cancellation-email-mark') return markCancellationEmail(store, body);

  if (method === 'POST' && url.pathname === '/neptune-jt-v183/admin-dashboard') return adminDashboard(store, body);
  if (method === 'POST' && url.pathname === '/neptune-jt-v183/admin-save-edition') return adminSaveEdition(store, body);
  if (method === 'POST' && url.pathname === '/neptune-jt-v183/admin-edition-action') return adminEditionAction(store, body);
  if (method === 'POST' && url.pathname === '/neptune-jt-v183/admin-reservation-action') return adminReservationAction(store, body);
  return null;
}

export async function handleNeptuneJtStripeWebhook(request, env, storeCall) {
  const signature = request.headers.get('stripe-signature') || '';
  const secret = String(env.STRIPE_WEBHOOK_SECRET || '').trim();
  if (!secret) return null;
  const raw = await request.clone().text();
  const verified = await verifyStripeWebhook(raw, signature, secret);
  if (!verified) return null;
  let event;
  try { event = JSON.parse(raw); } catch { return null; }
  const type = String(event?.type || '');
  if (!['checkout.session.completed', 'checkout.session.async_payment_succeeded'].includes(type)) return null;
  const session = event?.data?.object || {};
  const ref = String(session.client_reference_id || '');
  if (!ref.startsWith(REF_PREFIX)) return null;
  const normalized = normalizeStripeCheckoutSession(session);
  const response = await storeCall('/neptune-jt-v183/mark-paid', { eventId: String(event.id || ''), session: normalized });
  const data = await response.clone().json().catch(() => ({}));
  if (response.ok && data.internal?.confirmation) await sendPaymentConfirmationEmail(env, data.internal.confirmation);
  delete data.internal;
  return json({ received: true, neptuneJt: true, ...data }, response.ok ? 200 : response.status);
}

export async function reconcileNeptuneJtCheckoutSession(env, sessionId, storeCall) {
  const safeSessionId = String(sessionId || '').trim();
  if (!/^cs_[A-Za-z0-9_]+$/u.test(safeSessionId)) return json({ error: 'invalid_session_id' }, 400);
  const secret = String(env.STRIPE_SECRET_KEY || '').trim();
  if (!secret) return json({ error: 'stripe_not_configured' }, 503);
  const response = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(safeSessionId)}`, {
    headers: { Authorization: `Bearer ${secret}`, Accept: 'application/json' },
  });
  const session = await response.json().catch(() => ({}));
  if (!response.ok) return json({ error: 'stripe_session_unavailable' }, 502);
  const ref = String(session.client_reference_id || '');
  if (!ref.startsWith(REF_PREFIX)) return json({ error: 'session_not_neptune_jt' }, 404);
  const normalized = normalizeStripeCheckoutSession(session);
  const result = await storeCall('/neptune-jt-v183/reconcile-session', { session: normalized });
  const data = await result.json().catch(() => ({}));
  if (result.ok && data.internal?.confirmation) await sendPaymentConfirmationEmail(env, data.internal.confirmation);
  delete data.internal;
  return json({ ...data, paymentStatus: normalized.paymentStatus || String(session.payment_status || '') }, result.status);
}

export async function sendNeptuneJtReservationEmails(env, internal = {}) {
  const origin = String(env.PUBLIC_ORIGIN || DEFAULT_ORIGIN).replace(/\/$/u, '');
  const tasks = [];
  const paymentRecipients = internal.paymentRecipients || [];
  if (internal.acknowledgement && !paymentRecipients.some((recipient) => recipient.id === internal.acknowledgement.id)) {
    tasks.push(sendPreRegistrationEmail(env, origin, internal.acknowledgement));
  }
  for (const recipient of paymentRecipients) tasks.push(sendPaymentEmail(env, origin, recipient));
  if (internal.participantCancelled) tasks.push(sendParticipantCancellationEmail(env, internal.participantCancelled));
  const results = await Promise.allSettled(tasks);
  for (const result of results) if (result.status === 'rejected') console.error('neptune_jt_email_failed', String(result.reason?.message || result.reason));
  return results;
}

export async function sendNeptuneJtCancellationNotifications(env, internal = {}, storeCall) {
  const recipients = internal.cancellationRecipients || [];
  for (const recipient of recipients) {
    const sent = await sendCancellationEmail(env, recipient);
    if (sent.ok && storeCall) await storeCall('/neptune-jt-v183/cancellation-email-mark', { reservationId: recipient.id });
  }
  if (Number(internal.paidCount || 0) > 0) {
    await sendEmail(env, {
      to: ['contact@neptunebusiness.com'],
      subject: `Action requise · remboursement Neptune JT · ${internal.label || ''}`,
      text: `${internal.paidCount} règlement(s) ont été encaissé(s) pour une édition Neptune JT annulée. Effectuer les remboursements Stripe ou convenir d'un report avec les clients.`,
      idempotencyKey: `neptune-jt-refund-alert-${internal.editionId}-${internal.cancelledAt || 'manual'}`,
    });
  }
}

export async function runNeptuneJtScheduled(env, storeCall) {
  const response = await storeCall('/neptune-jt-v183/cutoff', { now: new Date().toISOString() });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) return data;
  for (const cancellation of data.cancellations || []) {
    await sendNeptuneJtCancellationNotifications(env, cancellation, storeCall);
  }
  return data;
}

function ensureEditionColumn(store, name, definition) {
  const columns = store.sql.exec('PRAGMA table_info(neptune_jt_editions_v182)').toArray().map((row) => String(row.name || ''));
  if (columns.includes(name)) return;
  store.sql.exec(`ALTER TABLE neptune_jt_editions_v182 ADD COLUMN ${name} ${definition}`);
}

function seedInitialEdition(store) {
  const existing = store.sql.exec('SELECT id FROM neptune_jt_editions_v182 ORDER BY created_at ASC LIMIT 1').toArray()[0];
  if (!existing) {
    const env = store.env || {};
    const id = sanitizeText(env.NEPTUNE_JT_EDITION_ID || 'neptune-jt-next', 100) || 'neptune-jt-next';
    const now = new Date().toISOString();
    const label = sanitizeText(env.NEPTUNE_JT_EDITION_LABEL || 'Prochaine édition · Toulouse', 180) || 'Prochaine édition · Toulouse';
    const eventAt = normalizeIso(env.NEPTUNE_JT_EVENT_AT);
    const cutoffAt = cutoffFromEvent(eventAt);
    const location = sanitizeText(env.NEPTUNE_JT_LOCATION || env.STUDIO_ADDRESS || 'Toulouse', 300);
    const paymentLink = sanitizeText(env.NEPTUNE_JT_PAYMENT_LINK || PAYMENT_LINK_FALLBACK, 1000);
    store.sql.exec(`INSERT INTO neptune_jt_editions_v182(id,label,event_at,cutoff_at,location,minimum_participants,maximum_participants,status,payment_link,payment_opened_at,cancelled_at,registrations_closed_at,force_maintained,notes,created_at,updated_at) VALUES(?,?,?,?,?,4,6,'collecting',?,NULL,NULL,NULL,0,'',?,?)`, id, label, eventAt, cutoffAt, location, paymentLink, now, now);
  }
  const active = getMeta(store, ACTIVE_EDITION_META);
  if (!active || !editionById(store, active)) {
    const preferred = sanitizeText(store.env?.NEPTUNE_JT_EDITION_ID || '', 100);
    const candidate = (preferred && editionById(store, preferred))
      || store.sql.exec("SELECT id FROM neptune_jt_editions_v182 WHERE status NOT IN ('cancelled','archived') ORDER BY CASE WHEN event_at IS NULL THEN 1 ELSE 0 END,event_at ASC,created_at DESC LIMIT 1").toArray()[0]
      || store.sql.exec('SELECT id FROM neptune_jt_editions_v182 ORDER BY created_at DESC LIMIT 1').toArray()[0];
    if (candidate?.id) setMeta(store, ACTIVE_EDITION_META, candidate.id);
  }
}

function publicStatus(store) {
  const edition = currentEdition(store);
  if (!edition) return json({ error: 'edition_not_found' }, 404);
  const counts = reservationCounts(store, edition.id);
  return json({
    ok: true,
    release: NEPTUNE_JT_RELEASE,
    edition: safeEdition(edition),
    counts,
    minimumParticipants: MIN_PARTICIPANTS,
    maximumParticipants: MAX_PARTICIPANTS,
    remainingPreRegistrationPlaces: Math.max(0, MAX_PARTICIPANTS - counts.total),
  });
}

function preRegister(store, raw = {}) {
  const edition = currentEdition(store);
  if (!edition) return json({ error: 'edition_not_found' }, 404);
  if (['cancelled', 'archived'].includes(edition.status)) return json({ error: 'edition_unavailable' }, 409);
  if (edition.registrationsClosedAt) return json({ error: 'registrations_closed' }, 409);
  if (edition.cutoffAt && Date.now() >= new Date(edition.cutoffAt).getTime()) return json({ error: 'registrations_closed' }, 409);
  const countsBefore = reservationCounts(store, edition.id);
  if (countsBefore.total >= MAX_PARTICIPANTS) return json({ error: 'edition_full', counts: countsBefore }, 409);

  const firstName = sanitizeText(raw.firstName, 80).trim();
  const lastName = sanitizeText(raw.lastName, 100).trim();
  const email = String(raw.email || '').trim().toLowerCase().slice(0, 240);
  const phone = sanitizeText(raw.phone, 50).trim();
  const company = sanitizeText(raw.company, 160).trim();
  const role = sanitizeText(raw.role, 160).trim();
  const website = sanitizeText(raw.website, 600).trim();
  const memberStatus = ['member', 'non_member'].includes(String(raw.memberStatus)) ? String(raw.memberStatus) : 'unknown';
  const topic = sanitizeText(raw.topic, 1200).trim();
  const topicContext = sanitizeText(raw.topicContext, 1800).trim();
  const sourceLink = sanitizeText(raw.sourceLink, 1000).trim();
  const commercialCta = sanitizeText(raw.commercialCta, 1000).trim();
  const referredBy = sanitizeText(raw.referredBy, 80).trim();
  if (!firstName || !lastName || !validEmail(email) || !company || !topic) return json({ error: 'required_fields_missing' }, 400);
  if (raw.acceptTerms !== true || raw.acceptMediaRights !== true) return json({ error: 'consent_required' }, 400);
  const duplicate = store.sql.exec("SELECT id,status FROM neptune_jt_reservations_v182 WHERE edition_id=? AND email=? AND status NOT IN ('cancelled_event','cancelled_participant','moved') LIMIT 1", edition.id, email).toArray()[0];
  if (duplicate) return json({ error: 'already_registered', reservationId: duplicate.id, status: duplicate.status }, 409);

  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const referralCode = makeReferralCode();
  store.sql.exec(`INSERT INTO neptune_jt_reservations_v182(id,edition_id,first_name,last_name,email,phone,company,role,website,member_status,topic,topic_context,source_link,commercial_cta,referral_code,referred_by,status,stripe_session_id,stripe_payment_intent_id,amount_paid_cents,paid_at,payment_sent_at,cancellation_email_sent_at,terms_accepted_at,media_rights_accepted_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'','',0,NULL,NULL,NULL,?,?,?,?)`, id, edition.id, firstName, lastName, email, phone, company, role, website, memberStatus, topic, topicContext, sourceLink, commercialCta, referralCode, referredBy, 'pre_registered', now, now, now, now);

  let updatedEdition = editionById(store, edition.id);
  let counts = reservationCounts(store, edition.id);
  let paymentRecipients = [];
  let thresholdJustReached = false;
  if (counts.total >= MIN_PARTICIPANTS && updatedEdition.status === 'collecting') {
    thresholdJustReached = true;
    store.sql.exec("UPDATE neptune_jt_editions_v182 SET status='payment_open',payment_opened_at=?,updated_at=? WHERE id=?", now, now, edition.id);
    updatedEdition = editionById(store, edition.id);
    paymentRecipients = openPaymentForEligible(store, updatedEdition, now);
  } else if (['payment_open', 'confirmed'].includes(updatedEdition.status)) {
    paymentRecipients = openPaymentForReservation(store, updatedEdition, id, now);
  }
  counts = reservationCounts(store, edition.id);
  const acknowledgement = reservationEmailPayload(store, id, updatedEdition);
  return json({
    ok: true,
    release: NEPTUNE_JT_RELEASE,
    reservationId: id,
    status: paymentRecipients.some((recipient) => recipient.id === id) ? 'payment_requested' : 'pre_registered',
    thresholdJustReached,
    counts,
    edition: safeEdition(updatedEdition),
    referralCode,
    sharePath: `/reserver/neptune-jt/?ref=${encodeURIComponent(referralCode)}`,
    internal: { acknowledgement, paymentRecipients },
  });
}

function markPaid(store, raw = {}) {
  const session = raw.session && typeof raw.session === 'object' ? raw.session : {};
  const sessionId = sanitizeText(session.id || session.externalPaymentId, 220).trim();
  const ref = String(session.clientReferenceId || session.reference?.raw || '').trim();
  const reservationId = reservationIdFromReference(ref);
  if (!reservationId) return json({ error: 'reservation_reference_invalid' }, 400);
  if (String(session.paymentStatus || '').toLowerCase() !== 'paid') return json({ ok: true, pending: true, reservationId });
  if (Number(session.amountTotal || 0) !== 20000 || String(session.currency || '').toLowerCase() !== 'eur') return json({ error: 'payment_amount_mismatch', reservationId }, 409);
  const row = reservationById(store, reservationId);
  if (!row) return json({ error: 'reservation_not_found' }, 404);
  const edition = editionById(store, row.editionId);
  if (!edition) return json({ error: 'edition_not_found' }, 404);
  if (['cancelled', 'archived'].includes(edition.status)) return json({ error: 'edition_cancelled_payment_requires_refund', reservationId }, 409);
  if (row.status === 'confirmed' && row.stripeSessionId === sessionId) return json({ ok: true, duplicate: true, reservationId, confirmed: true });
  const countsBefore = reservationCounts(store, row.editionId);
  if (countsBefore.confirmed >= MAX_PARTICIPANTS && row.status !== 'confirmed') return json({ error: 'edition_capacity_reached_payment_requires_refund', reservationId }, 409);
  const now = new Date().toISOString();
  store.sql.exec(`UPDATE neptune_jt_reservations_v182 SET status='confirmed',stripe_session_id=?,stripe_payment_intent_id=?,amount_paid_cents=?,paid_at=?,updated_at=? WHERE id=?`, sessionId, sanitizeText(session.paymentIntentId, 220), Math.max(0, Number(session.amountTotal || 0)), now, now, reservationId);
  const counts = reservationCounts(store, row.editionId);
  if (counts.confirmed >= MIN_PARTICIPANTS && edition.status !== 'confirmed') store.sql.exec("UPDATE neptune_jt_editions_v182 SET status='confirmed',updated_at=? WHERE id=?", now, row.editionId);
  return json({ ok: true, reservationId, confirmed: true, counts, edition: safeEdition(editionById(store, row.editionId)), internal: { confirmation: { id: row.id, firstName: row.firstName, email: row.email } } });
}

async function adminDashboard(store, body = {}) {
  const access = await requireViewer(store, body);
  if (!access.ok) return access.response;
  const requestedEditionId = sanitizeText(body.editionId, 100);
  const activeEditionId = getMeta(store, ACTIVE_EDITION_META);
  const editions = store.sql.exec(`SELECT id,label,event_at AS eventAt,cutoff_at AS cutoffAt,location,status,payment_opened_at AS paymentOpenedAt,cancelled_at AS cancelledAt,registrations_closed_at AS registrationsClosedAt,force_maintained AS forceMaintained,notes,created_at AS createdAt,updated_at AS updatedAt FROM neptune_jt_editions_v182 ORDER BY CASE WHEN status='archived' THEN 1 ELSE 0 END,CASE WHEN event_at IS NULL THEN 1 ELSE 0 END,event_at DESC,created_at DESC`).toArray().map((edition) => ({
    ...edition,
    forceMaintained: Boolean(Number(edition.forceMaintained || 0)),
    counts: reservationCounts(store, edition.id),
  }));
  const selected = editionById(store, requestedEditionId) || editionById(store, activeEditionId) || currentEdition(store) || editions[0] || null;
  const reservations = selected ? reservationsForEdition(store, selected.id) : [];
  const counts = selected ? reservationCounts(store, selected.id) : emptyCounts();
  return json({
    ok: true,
    release: NEPTUNE_JT_RELEASE,
    user: { id: access.actor.id, email: access.actor.email, fullName: access.actor.fullName || access.actor.email, role: access.actor.role },
    canEdit: ['admin', 'editor'].includes(access.actor.role),
    activeEditionId,
    selectedEdition: selected ? safeAdminEdition(selected) : null,
    editions,
    counts,
    reservations,
    paymentLinkFallback: PAYMENT_LINK_FALLBACK,
  });
}

async function adminSaveEdition(store, body = {}) {
  const access = await requireOperator(store, body);
  if (!access.ok) return access.response;
  const id = sanitizeText(body.id, 100).trim();
  const label = sanitizeText(body.label, 180).trim();
  const eventAt = normalizeIso(body.eventAt);
  const location = sanitizeText(body.location, 300).trim();
  const paymentLink = sanitizeText(body.paymentLink || store.env?.NEPTUNE_JT_PAYMENT_LINK || PAYMENT_LINK_FALLBACK, 1000).trim();
  const notes = sanitizeText(body.notes, 2400).trim();
  if (!label || !eventAt || !location || !validPaymentLink(paymentLink)) return json({ error: 'edition_fields_invalid' }, 400);
  const cutoffAt = cutoffFromEvent(eventAt);
  const now = new Date().toISOString();
  let editionId = id;
  if (id) {
    const existing = editionById(store, id);
    if (!existing) return json({ error: 'edition_not_found' }, 404);
    if (existing.status === 'archived') return json({ error: 'archived_edition_read_only' }, 409);
    store.sql.exec('UPDATE neptune_jt_editions_v182 SET label=?,event_at=?,cutoff_at=?,location=?,payment_link=?,notes=?,updated_at=? WHERE id=?', label, eventAt, cutoffAt, location, paymentLink, notes, now, id);
  } else {
    editionId = `jt-${crypto.randomUUID()}`;
    store.sql.exec(`INSERT INTO neptune_jt_editions_v182(id,label,event_at,cutoff_at,location,minimum_participants,maximum_participants,status,payment_link,payment_opened_at,cancelled_at,registrations_closed_at,force_maintained,notes,created_at,updated_at) VALUES(?,?,?,?,?,4,6,'collecting',?,NULL,NULL,NULL,0,?,?,?)`, editionId, label, eventAt, cutoffAt, location, paymentLink, notes, now, now);
  }
  if (body.activate === true || !getMeta(store, ACTIVE_EDITION_META)) setMeta(store, ACTIVE_EDITION_META, editionId);
  return json({ ok: true, edition: safeAdminEdition(editionById(store, editionId)), activeEditionId: getMeta(store, ACTIVE_EDITION_META) });
}

async function adminEditionAction(store, body = {}) {
  const access = await requireOperator(store, body);
  if (!access.ok) return access.response;
  const id = sanitizeText(body.editionId, 100).trim();
  const action = sanitizeText(body.action, 40).trim();
  const edition = editionById(store, id);
  if (!edition) return json({ error: 'edition_not_found' }, 404);
  const now = new Date().toISOString();
  let internal = null;

  if (action === 'activate') {
    if (['cancelled', 'archived'].includes(edition.status)) return json({ error: 'edition_not_activatable' }, 409);
    setMeta(store, ACTIVE_EDITION_META, id);
  } else if (action === 'close') {
    store.sql.exec('UPDATE neptune_jt_editions_v182 SET registrations_closed_at=?,updated_at=? WHERE id=?', now, now, id);
  } else if (action === 'reopen') {
    if (['cancelled', 'archived'].includes(edition.status)) return json({ error: 'edition_not_reopenable' }, 409);
    if (edition.cutoffAt && Date.now() >= new Date(edition.cutoffAt).getTime()) return json({ error: 'cutoff_already_reached' }, 409);
    store.sql.exec('UPDATE neptune_jt_editions_v182 SET registrations_closed_at=NULL,updated_at=? WHERE id=?', now, id);
  } else if (action === 'maintain') {
    store.sql.exec("UPDATE neptune_jt_editions_v182 SET force_maintained=1,status=CASE WHEN status='collecting' THEN 'confirmed' ELSE status END,updated_at=? WHERE id=?", now, id);
  } else if (action === 'unmaintain') {
    store.sql.exec('UPDATE neptune_jt_editions_v182 SET force_maintained=0,updated_at=? WHERE id=?', now, id);
  } else if (action === 'cancel') {
    const counts = reservationCounts(store, id);
    if (counts.confirmed > 0 && body.confirmPaidRisk !== true) return json({ error: 'paid_participants_require_refund_confirmation', paidCount: counts.confirmed }, 409);
    internal = cancelEdition(store, edition, now);
  } else if (action === 'archive') {
    if (LIVE_RESERVATION_STATUSES.size && reservationCounts(store, id).total > 0 && !['cancelled'].includes(edition.status)) return json({ error: 'active_reservations_prevent_archive' }, 409);
    store.sql.exec("UPDATE neptune_jt_editions_v182 SET status='archived',registrations_closed_at=COALESCE(registrations_closed_at,?),updated_at=? WHERE id=?", now, now, id);
    if (getMeta(store, ACTIVE_EDITION_META) === id) activateBestFallback(store, id);
  } else {
    return json({ error: 'unknown_edition_action' }, 400);
  }
  return json({ ok: true, action, edition: safeAdminEdition(editionById(store, id)), activeEditionId: getMeta(store, ACTIVE_EDITION_META), internal });
}

async function adminReservationAction(store, body = {}) {
  const access = await requireOperator(store, body);
  if (!access.ok) return access.response;
  const id = sanitizeText(body.reservationId, 100).trim();
  const action = sanitizeText(body.action, 40).trim();
  const row = reservationById(store, id);
  if (!row) return json({ error: 'reservation_not_found' }, 404);
  const edition = editionById(store, row.editionId);
  if (!edition) return json({ error: 'edition_not_found' }, 404);
  const now = new Date().toISOString();
  let internal = null;

  if (action === 'resend') {
    const nonce = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
    if (row.status === 'payment_requested') {
      internal = { paymentRecipients: [{ ...row, editionLabel: edition.label, paymentUrl: buildPaymentUrl(edition.paymentLink, row.id, row.email), messageNonce: nonce }] };
    } else if (row.status === 'pre_registered') {
      internal = { acknowledgement: { ...reservationEmailPayload(store, row.id, edition), messageNonce: nonce } };
    } else if (row.status === 'confirmed') {
      internal = { confirmation: { id: row.id, firstName: row.firstName, email: row.email, messageNonce: nonce } };
    } else return json({ error: 'reservation_message_not_available' }, 409);
  } else if (action === 'cancel') {
    if (row.status === 'confirmed' && body.confirmPaidRisk !== true) return json({ error: 'paid_reservation_requires_refund_confirmation' }, 409);
    store.sql.exec("UPDATE neptune_jt_reservations_v182 SET status='cancelled_participant',updated_at=? WHERE id=?", now, id);
    internal = { participantCancelled: { id: row.id, firstName: row.firstName, email: row.email, paid: Number(row.amountPaidCents || 0) > 0, messageNonce: `${Date.now()}` } };
  } else if (action === 'move') {
    if (row.status === 'confirmed' || Number(row.amountPaidCents || 0) > 0) return json({ error: 'paid_reservation_cannot_be_moved_automatically' }, 409);
    const targetId = sanitizeText(body.targetEditionId, 100).trim();
    const target = editionById(store, targetId);
    if (!target || ['cancelled', 'archived'].includes(target.status)) return json({ error: 'target_edition_unavailable' }, 409);
    if (target.registrationsClosedAt || reservationCounts(store, targetId).total >= MAX_PARTICIPANTS) return json({ error: 'target_edition_full_or_closed' }, 409);
    const duplicate = store.sql.exec("SELECT id FROM neptune_jt_reservations_v182 WHERE edition_id=? AND email=? AND status NOT IN ('cancelled_event','cancelled_participant','moved') LIMIT 1", targetId, row.email).toArray()[0];
    if (duplicate) return json({ error: 'target_edition_duplicate_email' }, 409);
    store.sql.exec("UPDATE neptune_jt_reservations_v182 SET edition_id=?,status='pre_registered',payment_sent_at=NULL,updated_at=? WHERE id=?", targetId, now, id);
    let targetEdition = editionById(store, targetId);
    const targetCounts = reservationCounts(store, targetId);
    let paymentRecipients = [];
    if (targetCounts.total >= MIN_PARTICIPANTS && targetEdition.status === 'collecting') {
      store.sql.exec("UPDATE neptune_jt_editions_v182 SET status='payment_open',payment_opened_at=COALESCE(payment_opened_at,?),updated_at=? WHERE id=?", now, now, targetId);
      targetEdition = editionById(store, targetId);
      paymentRecipients = openPaymentForEligible(store, targetEdition, now);
    } else if (['payment_open', 'confirmed'].includes(targetEdition.status)) {
      paymentRecipients = openPaymentForReservation(store, targetEdition, id, now);
    }
    internal = paymentRecipients.length ? { paymentRecipients } : { acknowledgement: { ...reservationEmailPayload(store, id, targetEdition), messageNonce: `${Date.now()}` } };
  } else {
    return json({ error: 'unknown_reservation_action' }, 400);
  }
  return json({ ok: true, action, reservation: reservationById(store, id), counts: reservationCounts(store, action === 'move' ? sanitizeText(body.targetEditionId, 100) : row.editionId), internal });
}

function processDueCutoffs(store, raw = {}) {
  const now = normalizeIso(raw.now) || new Date().toISOString();
  const due = store.sql.exec("SELECT id FROM neptune_jt_editions_v182 WHERE cutoff_at IS NOT NULL AND cutoff_at<=? AND status NOT IN ('cancelled','archived') ORDER BY cutoff_at ASC", now).toArray();
  const cancellations = [];
  const maintained = [];
  for (const item of due) {
    const edition = editionById(store, item.id);
    const counts = reservationCounts(store, edition.id);
    if (edition.forceMaintained || counts.confirmed >= MIN_PARTICIPANTS) {
      if (edition.status !== 'confirmed') store.sql.exec("UPDATE neptune_jt_editions_v182 SET status='confirmed',registrations_closed_at=COALESCE(registrations_closed_at,?),updated_at=? WHERE id=?", now, now, edition.id);
      maintained.push({ editionId: edition.id, paidCount: counts.confirmed, forced: Boolean(edition.forceMaintained) });
      continue;
    }
    cancellations.push(cancelEdition(store, edition, now));
  }
  return json({ ok: true, cancellations, maintained });
}

function cancelEdition(store, edition, now) {
  const counts = reservationCounts(store, edition.id);
  store.sql.exec("UPDATE neptune_jt_editions_v182 SET status='cancelled',cancelled_at=?,registrations_closed_at=COALESCE(registrations_closed_at,?),updated_at=? WHERE id=?", now, now, now, edition.id);
  store.sql.exec("UPDATE neptune_jt_reservations_v182 SET status='cancelled_event',updated_at=? WHERE edition_id=? AND status IN ('pre_registered','payment_requested','confirmed')", now, edition.id);
  const recipients = store.sql.exec(`SELECT id,first_name AS firstName,last_name AS lastName,email,amount_paid_cents AS amountPaidCents,stripe_session_id AS stripeSessionId FROM neptune_jt_reservations_v182 WHERE edition_id=? AND cancellation_email_sent_at IS NULL ORDER BY created_at ASC`, edition.id).toArray();
  if (getMeta(store, ACTIVE_EDITION_META) === edition.id) activateBestFallback(store, edition.id);
  return { editionId: edition.id, label: edition.label, paidCount: counts.confirmed, cancelledAt: now, cancellationRecipients: recipients };
}

function markCancellationEmail(store, raw = {}) {
  const id = sanitizeText(raw.reservationId, 100).trim();
  if (!id) return json({ error: 'reservation_id_required' }, 400);
  const now = new Date().toISOString();
  store.sql.exec('UPDATE neptune_jt_reservations_v182 SET cancellation_email_sent_at=?,updated_at=? WHERE id=?', now, now, id);
  return json({ ok: true });
}

function openPaymentForEligible(store, edition, now) {
  const rows = store.sql.exec("SELECT id FROM neptune_jt_reservations_v182 WHERE edition_id=? AND status='pre_registered' ORDER BY created_at ASC LIMIT ?", edition.id, MAX_PARTICIPANTS).toArray();
  const recipients = [];
  for (const row of rows) recipients.push(...openPaymentForReservation(store, edition, row.id, now));
  return recipients;
}

function openPaymentForReservation(store, edition, id, now) {
  const row = reservationById(store, id);
  if (!row || row.editionId !== edition.id || row.status !== 'pre_registered') return [];
  store.sql.exec("UPDATE neptune_jt_reservations_v182 SET status='payment_requested',payment_sent_at=?,updated_at=? WHERE id=?", now, now, id);
  return [{ ...row, status: 'payment_requested', editionLabel: edition.label, paymentUrl: buildPaymentUrl(edition.paymentLink, row.id, row.email) }];
}

function reservationEmailPayload(store, id, edition) {
  const row = reservationById(store, id);
  if (!row) return null;
  const counts = reservationCounts(store, edition.id);
  return { ...row, editionLabel: edition.label, counts, eventAt: edition.eventAt, cutoffAt: edition.cutoffAt };
}

function reservationsForEdition(store, editionId) {
  return store.sql.exec(`SELECT r.id,r.edition_id AS editionId,r.first_name AS firstName,r.last_name AS lastName,r.email,r.phone,r.company,r.role,r.website,r.member_status AS memberStatus,r.topic,r.topic_context AS topicContext,r.source_link AS sourceLink,r.commercial_cta AS commercialCta,r.referral_code AS referralCode,r.referred_by AS referredBy,r.status,r.stripe_session_id AS stripeSessionId,r.stripe_payment_intent_id AS stripePaymentIntentId,r.amount_paid_cents AS amountPaidCents,r.paid_at AS paidAt,r.payment_sent_at AS paymentSentAt,r.terms_accepted_at AS termsAcceptedAt,r.media_rights_accepted_at AS mediaRightsAcceptedAt,r.created_at AS createdAt,r.updated_at AS updatedAt,ref.first_name AS referrerFirstName,ref.last_name AS referrerLastName,ref.company AS referrerCompany FROM neptune_jt_reservations_v182 r LEFT JOIN neptune_jt_reservations_v182 ref ON ref.referral_code=r.referred_by WHERE r.edition_id=? ORDER BY CASE r.status WHEN 'confirmed' THEN 1 WHEN 'payment_requested' THEN 2 WHEN 'pre_registered' THEN 3 ELSE 4 END,r.created_at ASC`, editionId).toArray();
}

function reservationById(store, id) {
  return store.sql.exec(`SELECT id,edition_id AS editionId,first_name AS firstName,last_name AS lastName,email,phone,company,role,website,member_status AS memberStatus,topic,topic_context AS topicContext,source_link AS sourceLink,commercial_cta AS commercialCta,referral_code AS referralCode,referred_by AS referredBy,status,stripe_session_id AS stripeSessionId,stripe_payment_intent_id AS stripePaymentIntentId,amount_paid_cents AS amountPaidCents,paid_at AS paidAt,payment_sent_at AS paymentSentAt,created_at AS createdAt,updated_at AS updatedAt FROM neptune_jt_reservations_v182 WHERE id=? LIMIT 1`, id).toArray()[0] || null;
}

function reservationCounts(store, editionId) {
  const row = store.sql.exec(`SELECT
    SUM(CASE WHEN status IN ('pre_registered','payment_requested','confirmed') THEN 1 ELSE 0 END) AS total,
    SUM(CASE WHEN status='confirmed' THEN 1 ELSE 0 END) AS confirmed,
    SUM(CASE WHEN status='payment_requested' THEN 1 ELSE 0 END) AS paymentRequested,
    SUM(CASE WHEN status='pre_registered' THEN 1 ELSE 0 END) AS preRegistered,
    SUM(CASE WHEN amount_paid_cents>0 THEN 1 ELSE 0 END) AS paidEver,
    SUM(CASE WHEN amount_paid_cents>0 THEN amount_paid_cents ELSE 0 END) AS revenueCents
    FROM neptune_jt_reservations_v182 WHERE edition_id=?`, editionId).toArray()[0] || {};
  return {
    total: Number(row.total || 0),
    confirmed: Number(row.confirmed || 0),
    paymentRequested: Number(row.paymentRequested || 0),
    preRegistered: Number(row.preRegistered || 0),
    paidEver: Number(row.paidEver || 0),
    revenueCents: Number(row.revenueCents || 0),
  };
}

function emptyCounts() { return { total: 0, confirmed: 0, paymentRequested: 0, preRegistered: 0, paidEver: 0, revenueCents: 0 }; }

function currentEdition(store) {
  const activeId = getMeta(store, ACTIVE_EDITION_META);
  const active = activeId ? editionById(store, activeId) : null;
  if (active && !['cancelled', 'archived'].includes(active.status)) return active;
  activateBestFallback(store, activeId);
  const fallbackId = getMeta(store, ACTIVE_EDITION_META);
  return fallbackId ? editionById(store, fallbackId) : null;
}

function activateBestFallback(store, excludedId = '') {
  const candidate = store.sql.exec("SELECT id FROM neptune_jt_editions_v182 WHERE id<>? AND status NOT IN ('cancelled','archived') ORDER BY CASE WHEN event_at IS NULL THEN 1 ELSE 0 END,event_at ASC,created_at DESC LIMIT 1", excludedId || '__none__').toArray()[0];
  if (candidate?.id) setMeta(store, ACTIVE_EDITION_META, candidate.id);
  else setMeta(store, ACTIVE_EDITION_META, '');
}

function editionById(store, id) {
  if (!id) return null;
  return store.sql.exec(`SELECT id,label,event_at AS eventAt,cutoff_at AS cutoffAt,location,minimum_participants AS minimumParticipants,maximum_participants AS maximumParticipants,status,payment_link AS paymentLink,payment_opened_at AS paymentOpenedAt,cancelled_at AS cancelledAt,registrations_closed_at AS registrationsClosedAt,force_maintained AS forceMaintained,notes,created_at AS createdAt,updated_at AS updatedAt FROM neptune_jt_editions_v182 WHERE id=? LIMIT 1`, id).toArray()[0] || null;
}

function safeEdition(edition) {
  if (!edition) return null;
  return {
    id: edition.id,
    label: edition.label,
    eventAt: edition.eventAt || null,
    cutoffAt: edition.cutoffAt || null,
    location: edition.location,
    status: edition.status,
    registrationsClosedAt: edition.registrationsClosedAt || null,
    forceMaintained: Boolean(Number(edition.forceMaintained || 0)),
    minimumParticipants: Number(edition.minimumParticipants || MIN_PARTICIPANTS),
    maximumParticipants: Number(edition.maximumParticipants || MAX_PARTICIPANTS),
  };
}

function safeAdminEdition(edition) {
  return { ...safeEdition(edition), paymentLink: edition.paymentLink, paymentOpenedAt: edition.paymentOpenedAt || null, cancelledAt: edition.cancelledAt || null, notes: edition.notes || '', createdAt: edition.createdAt, updatedAt: edition.updatedAt };
}

async function sendPreRegistrationEmail(env, origin, recipient) {
  if (!recipient?.email) return { ok: false };
  const shareUrl = `${origin}/reserver/neptune-jt/?ref=${encodeURIComponent(recipient.referralCode || '')}`;
  const reached = Number(recipient.counts?.total || 0) >= MIN_PARTICIPANTS;
  const subject = reached ? 'Neptune JT · Le minimum est atteint' : `Neptune JT · Pré-réservation enregistrée (${recipient.counts?.total || 1}/4)`;
  const text = reached
    ? `Bonjour ${recipient.firstName},\n\nVotre pré-réservation Neptune JT est enregistrée. Le seuil minimum de 4 participants est atteint : vous allez recevoir le lien de paiement de 200 € TTC pour confirmer définitivement votre place.\n\nÀ bientôt,\nNeptune Media`
    : `Bonjour ${recipient.firstName},\n\nVotre pré-réservation Neptune JT est enregistrée. Nous sommes actuellement à ${recipient.counts?.total || 1}/4 participant(s) nécessaires pour maintenir l'édition. Aucun paiement n'est demandé tant que le seuil de 4 n'est pas atteint.\n\nVous pouvez partager ce lien à un entrepreneur dont l'actualité mérite le plateau :\n${shareUrl}\n\nDès 4 pré-réservations, nous envoyons le lien de règlement à tous les participants.\n\nÀ bientôt,\nNeptune Media`;
  return sendEmail(env, { to: [recipient.email], subject, text, idempotencyKey: mailKey('prereg', recipient) });
}

async function sendPaymentEmail(env, origin, recipient) {
  if (!recipient?.email || !recipient?.paymentUrl) return { ok: false };
  const text = `Bonjour ${recipient.firstName},\n\nBonne nouvelle : le minimum de 4 participants est atteint pour ${recipient.editionLabel || 'la prochaine édition de Neptune JT'}.\n\nVotre pré-réservation peut maintenant être confirmée. Réglez votre place de 200 € TTC ici :\n${recipient.paymentUrl}\n\nVotre place n'est définitive qu'après paiement. L'édition accueille au maximum 6 participants.\n\nAprès paiement, vous serez redirigé vers votre page de confirmation.\n\nÀ bientôt sur le plateau,\nNeptune Media`;
  return sendEmail(env, { to: [recipient.email], subject: 'Neptune JT · Confirmez maintenant votre passage', text, idempotencyKey: mailKey('payment', recipient) });
}

async function sendPaymentConfirmationEmail(env, recipient) {
  if (!recipient?.email) return { ok: false };
  return sendEmail(env, {
    to: [recipient.email],
    subject: 'Neptune JT · Votre place est confirmée',
    text: `Bonjour ${recipient.firstName},\n\nVotre règlement de 200 € TTC est validé : votre place au Neptune JT est confirmée.\n\nNeptune vous recontactera pour le formulaire éditorial et l'appel de préparation.\n\nÀ bientôt sur le plateau,\nNeptune Media`,
    idempotencyKey: mailKey('paid', recipient),
  });
}

async function sendCancellationEmail(env, recipient) {
  if (!recipient?.email) return { ok: false };
  const paid = Number(recipient.amountPaidCents || 0) > 0;
  const text = paid
    ? `Bonjour ${recipient.firstName},\n\nL'édition Neptune JT est annulée : le minimum de 4 participants confirmés n'a pas été atteint ou l'édition a dû être annulée par Neptune. Votre règlement ne sera pas conservé au titre d'une annulation de votre part : Neptune vous contactera pour le remboursement ou, avec votre accord, le report sur une prochaine édition.\n\nNeptune Media`
    : `Bonjour ${recipient.firstName},\n\nL'édition Neptune JT est annulée. Aucun paiement n'est dû. Nous vous proposerons une prochaine édition dès qu'elle sera ouverte.\n\nNeptune Media`;
  return sendEmail(env, { to: [recipient.email], subject: 'Neptune JT · Édition annulée', text, idempotencyKey: `neptune-jt-cancel-${recipient.id}` });
}

async function sendParticipantCancellationEmail(env, recipient) {
  if (!recipient?.email) return { ok: false };
  const text = recipient.paid
    ? `Bonjour ${recipient.firstName},\n\nVotre participation à Neptune JT a été annulée depuis le Studio Neptune. Un règlement est associé à votre dossier : l'équipe Neptune vous contactera pour le traitement financier ou un éventuel report.\n\nNeptune Media`
    : `Bonjour ${recipient.firstName},\n\nVotre pré-réservation Neptune JT a été annulée. Aucun paiement n'est dû.\n\nNeptune Media`;
  return sendEmail(env, { to: [recipient.email], subject: 'Neptune JT · Mise à jour de votre participation', text, idempotencyKey: mailKey('participant-cancel', recipient) });
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

function reservationIdFromReference(ref) {
  const value = String(ref || '').trim();
  if (!value.startsWith(REF_PREFIX)) return '';
  const id = value.slice(REF_PREFIX.length);
  return /^[0-9a-f-]{20,100}$/iu.test(id) ? id : '';
}

function getMeta(store, key) {
  return String(store.sql.exec('SELECT value FROM meta WHERE key=? LIMIT 1', key).toArray()[0]?.value || '');
}
function setMeta(store, key, value) {
  store.sql.exec('INSERT INTO meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', key, String(value || ''));
}
function cutoffFromEvent(eventAt) { return eventAt ? new Date(new Date(eventAt).getTime() - 7 * 86400000).toISOString() : null; }
function makeReferralCode() { return crypto.randomUUID().replace(/-/gu, '').slice(0, 10).toUpperCase(); }
function validEmail(value) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/u.test(String(value || '')); }
function validPaymentLink(value) { try { const url = new URL(String(value || '')); return url.protocol === 'https:' && /(^|\.)stripe\.com$/u.test(url.hostname); } catch { return false; } }
function normalizeIso(value) { if (!value) return null; const date = new Date(String(value)); return Number.isFinite(date.getTime()) ? date.toISOString() : null; }
function mailKey(kind, recipient) { return `neptune-jt-${kind}-${recipient.id}-${recipient.messageNonce || 'auto'}`.slice(0, 240); }
