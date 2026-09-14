import { json, sanitizeText } from './security.js';
import { sendEmail } from './email-service.js';
import { normalizeStripeCheckoutSession, verifyStripeWebhook } from './stripe-journey-v90.js';

export const NEPTUNE_JT_RELEASE = 'neptune-jt-20260914-v182';
const MIN_PARTICIPANTS = 4;
const MAX_PARTICIPANTS = 6;
const PAYMENT_LINK_FALLBACK = 'https://buy.stripe.com/bJe28rcdngXw0586qi73G0d';
const DEFAULT_ORIGIN = 'https://tv.neptunebusiness.com';
const REF_PREFIX = 'NPJTE_';

export function ensureNeptuneJtSchema(store) {
  if (store.neptuneJtV182Ready) return;
  store.sql.exec(`
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
  seedEdition(store);
  store.neptuneJtV182Ready = true;
}

export async function handleNeptuneJtStore(store, request) {
  ensureNeptuneJtSchema(store);
  const url = new URL(request.url);
  const method = request.method.toUpperCase();
  const body = method === 'POST' ? await request.clone().json().catch(() => ({})) : {};

  if (method === 'GET' && url.pathname === '/neptune-jt-v182/status') return publicStatus(store);
  if (method === 'POST' && url.pathname === '/neptune-jt-v182/pre-register') return preRegister(store, body);
  if (method === 'POST' && url.pathname === '/neptune-jt-v182/mark-paid') return markPaid(store, body);
  if (method === 'POST' && url.pathname === '/neptune-jt-v182/reconcile-session') return reconcilePaidSession(store, body);
  if (method === 'POST' && url.pathname === '/neptune-jt-v182/cutoff') return processCutoff(store, body);
  if (method === 'POST' && url.pathname === '/neptune-jt-v182/cancellation-email-mark') return markCancellationEmail(store, body);
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
  const response = await storeCall('/neptune-jt-v182/mark-paid', { eventId: String(event.id || ''), session: normalized });
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
  const result = await storeCall('/neptune-jt-v182/reconcile-session', { session: normalized });
  const data = await result.json().catch(() => ({}));
  if (result.ok && data.internal?.confirmation) await sendPaymentConfirmationEmail(env, data.internal.confirmation);
  delete data.internal;
  return json({ ...data, paymentStatus: normalized.paymentStatus || String(session.payment_status || '') }, result.status);
}

export async function sendNeptuneJtReservationEmails(env, internal = {}) {
  const origin = String(env.PUBLIC_ORIGIN || DEFAULT_ORIGIN).replace(/\/$/u, '');
  const tasks = [];
  const paymentRecipients = internal.paymentRecipients || [];
  if (internal.acknowledgement && !paymentRecipients.some((recipient) => recipient.id === internal.acknowledgement.id)) tasks.push(sendPreRegistrationEmail(env, origin, internal.acknowledgement));
  for (const recipient of paymentRecipients) tasks.push(sendPaymentEmail(env, origin, recipient));
  const results = await Promise.allSettled(tasks);
  for (const result of results) if (result.status === 'rejected') console.error('neptune_jt_email_failed', String(result.reason?.message || result.reason));
}

export async function runNeptuneJtScheduled(env, storeCall) {
  const response = await storeCall('/neptune-jt-v182/cutoff', { now: new Date().toISOString() });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.cancelled) return data;
  for (const recipient of data.cancellationRecipients || []) {
    const sent = await sendCancellationEmail(env, recipient);
    if (sent.ok) await storeCall('/neptune-jt-v182/cancellation-email-mark', { reservationId: recipient.id });
  }
  if ((data.paidCount || 0) > 0) {
    await sendEmail(env, {
      to: ['contact@neptunebusiness.com'],
      subject: `Action requise · remboursement Neptune JT · ${data.label || ''}`,
      text: `${data.paidCount} règlement(s) ont été encaissé(s) pour une édition Neptune JT annulée faute de minimum. Effectuer les remboursements Stripe ou convenir d'un report avec les clients.`,
      idempotencyKey: `neptune-jt-refund-alert-${data.editionId}`,
    });
  }
  return data;
}

function seedEdition(store) {
  const env = store.env || {};
  const id = sanitizeText(env.NEPTUNE_JT_EDITION_ID || 'neptune-jt-next', 100) || 'neptune-jt-next';
  const existing = store.sql.exec('SELECT id FROM neptune_jt_editions_v182 WHERE id=? LIMIT 1', id).toArray()[0];
  const now = new Date().toISOString();
  const label = sanitizeText(env.NEPTUNE_JT_EDITION_LABEL || 'Prochaine édition · Toulouse', 180) || 'Prochaine édition · Toulouse';
  const eventAt = normalizeIso(env.NEPTUNE_JT_EVENT_AT);
  const cutoffAt = eventAt ? new Date(new Date(eventAt).getTime() - 7 * 86400000).toISOString() : null;
  const location = sanitizeText(env.NEPTUNE_JT_LOCATION || env.STUDIO_ADDRESS || 'Toulouse', 300);
  const paymentLink = sanitizeText(env.NEPTUNE_JT_PAYMENT_LINK || PAYMENT_LINK_FALLBACK, 1000);
  if (!existing) {
    store.sql.exec(`INSERT INTO neptune_jt_editions_v182(id,label,event_at,cutoff_at,location,minimum_participants,maximum_participants,status,payment_link,payment_opened_at,cancelled_at,created_at,updated_at) VALUES(?,?,?,?,?,4,6,'collecting',?,NULL,NULL,?,?)`, id, label, eventAt, cutoffAt, location, paymentLink, now, now);
  } else {
    store.sql.exec(`UPDATE neptune_jt_editions_v182 SET label=?,event_at=?,cutoff_at=?,location=?,payment_link=?,updated_at=? WHERE id=? AND status NOT IN ('cancelled')`, label, eventAt, cutoffAt, location, paymentLink, now, id);
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
  if (edition.status === 'cancelled') return json({ error: 'edition_cancelled' }, 409);
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
  const duplicate = store.sql.exec('SELECT id,status FROM neptune_jt_reservations_v182 WHERE edition_id=? AND email=? LIMIT 1', edition.id, email).toArray()[0];
  if (duplicate) return json({ error: 'already_registered', reservationId: duplicate.id, status: duplicate.status }, 409);

  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const referralCode = makeReferralCode();
  store.sql.exec(`INSERT INTO neptune_jt_reservations_v182(id,edition_id,first_name,last_name,email,phone,company,role,website,member_status,topic,topic_context,source_link,commercial_cta,referral_code,referred_by,status,stripe_session_id,stripe_payment_intent_id,amount_paid_cents,paid_at,payment_sent_at,cancellation_email_sent_at,terms_accepted_at,media_rights_accepted_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'','',0,NULL,NULL,NULL,?,?,?,?)`, id, edition.id, firstName, lastName, email, phone, company, role, website, memberStatus, topic, topicContext, sourceLink, commercialCta, referralCode, referredBy, 'pre_registered', now, now, now, now);

  let updatedEdition = currentEdition(store);
  let counts = reservationCounts(store, edition.id);
  let paymentRecipients = [];
  let thresholdJustReached = false;
  if (counts.total >= MIN_PARTICIPANTS && updatedEdition.status === 'collecting') {
    thresholdJustReached = true;
    store.sql.exec("UPDATE neptune_jt_editions_v182 SET status='payment_open',payment_opened_at=?,updated_at=? WHERE id=?", now, now, edition.id);
    updatedEdition = currentEdition(store);
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
    status: paymentRecipients.some((r) => r.id === id) ? 'payment_requested' : 'pre_registered',
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
  const row = store.sql.exec('SELECT id,edition_id AS editionId,first_name AS firstName,email,status,stripe_session_id AS stripeSessionId FROM neptune_jt_reservations_v182 WHERE id=? LIMIT 1', reservationId).toArray()[0];
  if (!row) return json({ error: 'reservation_not_found' }, 404);
  const edition = editionById(store, row.editionId);
  if (!edition) return json({ error: 'edition_not_found' }, 404);
  if (edition.status === 'cancelled') return json({ error: 'edition_cancelled_payment_requires_refund', reservationId }, 409);
  if (row.status === 'confirmed' && row.stripeSessionId === sessionId) return json({ ok: true, duplicate: true, reservationId, confirmed: true });
  const confirmedBefore = reservationCounts(store, row.editionId).confirmed;
  if (confirmedBefore >= MAX_PARTICIPANTS && row.status !== 'confirmed') return json({ error: 'edition_capacity_reached_payment_requires_refund', reservationId }, 409);
  const now = new Date().toISOString();
  store.sql.exec(`UPDATE neptune_jt_reservations_v182 SET status='confirmed',stripe_session_id=?,stripe_payment_intent_id=?,amount_paid_cents=?,paid_at=?,updated_at=? WHERE id=?`, sessionId, sanitizeText(session.paymentIntentId, 220), Math.max(0, Number(session.amountTotal || 0)), now, now, reservationId);
  const counts = reservationCounts(store, row.editionId);
  if (counts.confirmed >= MIN_PARTICIPANTS && edition.status !== 'confirmed') store.sql.exec("UPDATE neptune_jt_editions_v182 SET status='confirmed',updated_at=? WHERE id=?", now, row.editionId);
  return json({ ok: true, reservationId, confirmed: true, counts, edition: safeEdition(editionById(store, row.editionId)), internal: { confirmation: { id: row.id, firstName: row.firstName, email: row.email } } });
}

function reconcilePaidSession(store, raw = {}) {
  return markPaid(store, raw);
}

function processCutoff(store, raw = {}) {
  const edition = currentEdition(store);
  if (!edition || !edition.cutoffAt || edition.status === 'cancelled') return json({ ok: true, skipped: true });
  const now = normalizeIso(raw.now) || new Date().toISOString();
  if (new Date(now).getTime() < new Date(edition.cutoffAt).getTime()) return json({ ok: true, skipped: true, cutoffAt: edition.cutoffAt });
  const counts = reservationCounts(store, edition.id);
  if (counts.confirmed >= MIN_PARTICIPANTS) {
    if (edition.status !== 'confirmed') store.sql.exec("UPDATE neptune_jt_editions_v182 SET status='confirmed',updated_at=? WHERE id=?", now, edition.id);
    return json({ ok: true, maintained: true, paidCount: counts.confirmed, editionId: edition.id });
  }
  store.sql.exec("UPDATE neptune_jt_editions_v182 SET status='cancelled',cancelled_at=?,updated_at=? WHERE id=?", now, now, edition.id);
  store.sql.exec("UPDATE neptune_jt_reservations_v182 SET status='cancelled_event',updated_at=? WHERE edition_id=? AND status<>'cancelled_event'", now, edition.id);
  const recipients = store.sql.exec(`SELECT id,first_name AS firstName,last_name AS lastName,email,amount_paid_cents AS amountPaidCents,stripe_session_id AS stripeSessionId FROM neptune_jt_reservations_v182 WHERE edition_id=? AND cancellation_email_sent_at IS NULL ORDER BY created_at ASC`, edition.id).toArray();
  return json({ ok: true, cancelled: true, editionId: edition.id, label: edition.label, paidCount: counts.confirmed, cancellationRecipients: recipients });
}

function markCancellationEmail(store, raw = {}) {
  const id = sanitizeText(raw.reservationId, 100).trim();
  if (!id) return json({ error: 'reservation_id_required' }, 400);
  const now = new Date().toISOString();
  store.sql.exec('UPDATE neptune_jt_reservations_v182 SET cancellation_email_sent_at=?,updated_at=? WHERE id=?', now, now, id);
  return json({ ok: true });
}

function openPaymentForEligible(store, edition, now) {
  const rows = store.sql.exec(`SELECT id FROM neptune_jt_reservations_v182 WHERE edition_id=? AND status='pre_registered' ORDER BY created_at ASC LIMIT ?`, edition.id, MAX_PARTICIPANTS).toArray();
  const recipients = [];
  for (const row of rows) recipients.push(...openPaymentForReservation(store, edition, row.id, now));
  return recipients;
}

function openPaymentForReservation(store, edition, id, now) {
  const row = store.sql.exec(`SELECT id,first_name AS firstName,last_name AS lastName,email,company,status,referral_code AS referralCode FROM neptune_jt_reservations_v182 WHERE id=? AND edition_id=? LIMIT 1`, id, edition.id).toArray()[0];
  if (!row || row.status !== 'pre_registered') return [];
  store.sql.exec("UPDATE neptune_jt_reservations_v182 SET status='payment_requested',payment_sent_at=?,updated_at=? WHERE id=?", now, now, id);
  return [{ ...row, status: 'payment_requested', editionLabel: edition.label, paymentUrl: buildPaymentUrl(edition.paymentLink, row.id, row.email) }];
}

function reservationEmailPayload(store, id, edition) {
  const row = store.sql.exec(`SELECT id,first_name AS firstName,last_name AS lastName,email,company,status,referral_code AS referralCode FROM neptune_jt_reservations_v182 WHERE id=? LIMIT 1`, id).toArray()[0];
  if (!row) return null;
  const counts = reservationCounts(store, edition.id);
  return { ...row, editionLabel: edition.label, counts, eventAt: edition.eventAt, cutoffAt: edition.cutoffAt };
}

async function sendPreRegistrationEmail(env, origin, r) {
  if (!r?.email) return { ok: false };
  const shareUrl = `${origin}/reserver/neptune-jt/?ref=${encodeURIComponent(r.referralCode || '')}`;
  const reached = Number(r.counts?.total || 0) >= MIN_PARTICIPANTS;
  const subject = reached ? 'Neptune JT · Le minimum est atteint' : `Neptune JT · Pré-réservation enregistrée (${r.counts?.total || 1}/4)`;
  const text = reached
    ? `Bonjour ${r.firstName},\n\nVotre pré-réservation Neptune JT est enregistrée. Le seuil minimum de 4 participants est atteint : vous allez recevoir le lien de paiement de 200 € TTC pour confirmer définitivement votre place.\n\nÀ bientôt,\nNeptune Media`
    : `Bonjour ${r.firstName},\n\nVotre pré-réservation Neptune JT est enregistrée. Nous sommes actuellement à ${r.counts?.total || 1}/4 participant(s) nécessaires pour maintenir l'édition. Aucun paiement n'est demandé tant que le seuil de 4 n'est pas atteint.\n\nVous pouvez partager ce lien à un entrepreneur dont l'actualité mérite le plateau :\n${shareUrl}\n\nDès 4 pré-réservations, nous envoyons le lien de règlement à tous les participants.\n\nÀ bientôt,\nNeptune Media`;
  return sendEmail(env, { to: [r.email], subject, text, idempotencyKey: `neptune-jt-prereg-${r.id}` });
}

async function sendPaymentEmail(env, origin, r) {
  if (!r?.email || !r?.paymentUrl) return { ok: false };
  const text = `Bonjour ${r.firstName},\n\nBonne nouvelle : le minimum de 4 participants est atteint pour ${r.editionLabel || 'la prochaine édition de Neptune JT'}.\n\nVotre pré-réservation peut maintenant être confirmée. Réglez votre place de 200 € TTC ici :\n${r.paymentUrl}\n\nVotre place n'est définitive qu'après paiement. L'édition accueille au maximum 6 participants.\n\nAprès paiement, vous serez redirigé vers votre page de confirmation.\n\nÀ bientôt sur le plateau,\nNeptune Media`;
  return sendEmail(env, { to: [r.email], subject: 'Neptune JT · Confirmez maintenant votre passage', text, idempotencyKey: `neptune-jt-payment-${r.id}` });
}

async function sendPaymentConfirmationEmail(env, r) {
  if (!r?.email) return { ok: false };
  return sendEmail(env, {
    to: [r.email],
    subject: 'Neptune JT · Votre place est confirmée',
    text: `Bonjour ${r.firstName},\n\nVotre règlement de 200 € TTC est validé : votre place au Neptune JT est confirmée.\n\nNeptune vous recontactera pour le formulaire éditorial et l'appel de préparation.\n\nÀ bientôt sur le plateau,\nNeptune Media`,
    idempotencyKey: `neptune-jt-paid-${r.id}`,
  });
}

async function sendCancellationEmail(env, r) {
  if (!r?.email) return { ok: false };
  const paid = Number(r.amountPaidCents || 0) > 0;
  const text = paid
    ? `Bonjour ${r.firstName},\n\nL'édition Neptune JT est annulée : le minimum de 4 participants confirmés n'a pas été atteint à J-7. Votre règlement ne sera pas conservé au titre d'une annulation de votre part : Neptune vous contactera pour le remboursement ou, avec votre accord, le report sur une prochaine édition.\n\nNeptune Media`
    : `Bonjour ${r.firstName},\n\nL'édition Neptune JT est annulée : le minimum de 4 participants confirmés n'a pas été atteint à J-7. Aucun paiement n'est dû. Nous vous proposerons une prochaine édition dès qu'elle sera ouverte.\n\nNeptune Media`;
  return sendEmail(env, { to: [r.email], subject: 'Neptune JT · Édition annulée faute de minimum', text, idempotencyKey: `neptune-jt-cancel-${r.id}` });
}

function currentEdition(store) {
  const configuredId = sanitizeText(store.env?.NEPTUNE_JT_EDITION_ID || 'neptune-jt-next', 100) || 'neptune-jt-next';
  return editionById(store, configuredId);
}
function editionById(store, id) {
  return store.sql.exec(`SELECT id,label,event_at AS eventAt,cutoff_at AS cutoffAt,location,minimum_participants AS minimumParticipants,maximum_participants AS maximumParticipants,status,payment_link AS paymentLink,payment_opened_at AS paymentOpenedAt,cancelled_at AS cancelledAt,created_at AS createdAt,updated_at AS updatedAt FROM neptune_jt_editions_v182 WHERE id=? LIMIT 1`, id).toArray()[0] || null;
}
function reservationCounts(store, editionId) {
  const row = store.sql.exec(`SELECT COUNT(*) AS total,SUM(CASE WHEN status='confirmed' THEN 1 ELSE 0 END) AS confirmed,SUM(CASE WHEN status='payment_requested' THEN 1 ELSE 0 END) AS paymentRequested FROM neptune_jt_reservations_v182 WHERE edition_id=? AND status<>'cancelled_event'`, editionId).toArray()[0] || {};
  return { total: Number(row.total || 0), confirmed: Number(row.confirmed || 0), paymentRequested: Number(row.paymentRequested || 0) };
}
function safeEdition(edition) {
  if (!edition) return null;
  return { id: edition.id, label: edition.label, eventAt: edition.eventAt || null, cutoffAt: edition.cutoffAt || null, location: edition.location, status: edition.status, minimumParticipants: Number(edition.minimumParticipants || MIN_PARTICIPANTS), maximumParticipants: Number(edition.maximumParticipants || MAX_PARTICIPANTS) };
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
function makeReferralCode() { return crypto.randomUUID().replace(/-/gu, '').slice(0, 10).toUpperCase(); }
function validEmail(value) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/u.test(String(value || '')); }
function normalizeIso(value) { if (!value) return null; const d = new Date(String(value)); return Number.isFinite(d.getTime()) ? d.toISOString() : null; }
