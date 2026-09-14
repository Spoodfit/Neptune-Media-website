import { json, sanitizeText } from './security.js';
import { sendEmail } from './email-service.js';
import { normalizeStripeCheckoutSession, verifyStripeWebhook } from './stripe-journey-v90.js';
import { requireOperator } from './workflow-db-v5.js';
import {
  handleNeptuneJtStore as handleNeptuneJtStoreV185,
} from './neptune-jt-v185.js';

export const NEPTUNE_JT_RELEASE = 'neptune-jt-20260915-v186-live-sync-email-audit';
const MIN_PARTICIPANTS = 4;
const MAX_PARTICIPANTS = 6;
const DEFAULT_ORIGIN = 'https://tv.neptunebusiness.com';
const REF_PREFIX = 'NPJTE_';
const LIVE_STATUSES = new Set(['pre_registered', 'payment_requested', 'confirmed']);

export async function handleNeptuneJtStore(store, request) {
  ensureFinancialSchema(store);
  const url = new URL(request.url);
  const method = request.method.toUpperCase();
  const body = method === 'POST' ? await request.clone().json().catch(() => ({})) : {};

  if (method === 'POST' && (url.pathname === '/neptune-jt-v183/mark-paid' || url.pathname === '/neptune-jt-v183/reconcile-session')) {
    const anomaly = await interceptFinancialPaymentAnomaly(store, body);
    if (anomaly) return anomaly;
  }

  if (method === 'POST' && url.pathname === '/neptune-jt-v183/admin-reservation-action' && String(body.action || '') === 'cancel') {
    const paidCancellation = await interceptPaidReservationCancellation(store, body);
    if (paidCancellation) return paidCancellation;
  }

  const delegated = await handleNeptuneJtStoreV185(store, request);
  if (!delegated) return delegated;
  return enrichStoreResponse(store, delegated, { path: url.pathname, body });
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
  const data = await result.clone().json().catch(() => ({}));
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
  for (const recipient of paymentRecipients) tasks.push(sendPaymentEmail(env, recipient));
  if (internal.confirmation) tasks.push(sendPaymentConfirmationEmail(env, internal.confirmation, true));
  if (internal.participantMoved) tasks.push(sendParticipantMovedEmail(env, internal.participantMoved));
  if (internal.participantCancelled) tasks.push(sendParticipantCancellationEmail(env, internal.participantCancelled));

  const results = await Promise.allSettled(tasks);
  for (const result of results) {
    if (result.status === 'rejected') console.error('neptune_jt_email_failed', String(result.reason?.message || result.reason));
    else if (!result.value?.ok) console.error('neptune_jt_email_failed', String(result.value?.error || result.value?.providerCode || 'send_failed'));
  }
  return results;
}

export async function sendNeptuneJtCancellationNotifications(env, internal = {}, storeCall) {
  if (internal.paymentRecipients?.length) {
    await sendNeptuneJtReservationEmails(env, { paymentRecipients: internal.paymentRecipients });
  }

  const recipients = internal.cancellationRecipients || [];
  for (const recipient of recipients) {
    const sent = await sendCancellationEmail(env, { ...recipient, cancellationReason: internal.cancellationReason || recipient.cancellationReason });
    if (sent.ok && storeCall) await storeCall('/neptune-jt-v183/cancellation-email-mark', { reservationId: recipient.id });
  }

  if (Number(internal.paidCount || 0) > 0) {
    const reason = internal.cancellationReason === 'minimum_not_reached_j7'
      ? 'minimum de 4 paiements confirmés non atteint à J-7'
      : 'annulation décidée par Neptune';
    await sendEmail(env, {
      to: ['contact@neptunebusiness.com'],
      subject: `Action requise · remboursements Neptune JT · ${internal.label || internal.editionLabel || ''}`,
      text: [
        `${internal.paidCount} règlement(s) ont été encaissé(s) pour une édition Neptune JT annulée.`,
        `Motif : ${reason}.`,
        '',
        'Action requise : effectuer les remboursements Stripe, ou convenir d’un report uniquement avec l’accord explicite du client.',
      ].join('\n'),
      idempotencyKey: `neptune-jt-refund-alert-${internal.editionId}-${internal.cancelledAt || 'manual'}`,
    });
  }
}

export async function runNeptuneJtScheduled(env, storeCall) {
  const response = await storeCall('/neptune-jt-v183/cutoff', { now: new Date().toISOString() });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) return data;
  for (const cancellation of data.cancellations || []) {
    await sendNeptuneJtCancellationNotifications(env, { ...cancellation, cancellationReason: 'minimum_not_reached_j7' }, storeCall);
  }
  return data;
}

async function enrichStoreResponse(store, response, context) {
  const type = response.headers.get('Content-Type') || '';
  if (!type.includes('application/json')) return response;
  const data = await response.clone().json().catch(() => null);
  if (!data || typeof data !== 'object' || Array.isArray(data)) return response;

  if (Object.prototype.hasOwnProperty.call(data, 'release')) data.release = NEPTUNE_JT_RELEASE;
  if (data.internal && typeof data.internal === 'object') {
    data.internal = enrichInternal(store, data.internal, context);
  }

  const headers = new Headers(response.headers);
  headers.delete('Content-Length');
  headers.set('Content-Type', 'application/json; charset=utf-8');
  return new Response(JSON.stringify(data), { status: response.status, statusText: response.statusText, headers });
}

function enrichInternal(store, rawInternal, context) {
  const internal = { ...rawInternal };
  if (internal.acknowledgement?.id) internal.acknowledgement = enrichRecipient(store, internal.acknowledgement);
  if (internal.confirmation?.id) internal.confirmation = enrichRecipient(store, internal.confirmation);
  if (internal.participantCancelled?.id) internal.participantCancelled = enrichRecipient(store, internal.participantCancelled);
  if (Array.isArray(internal.paymentRecipients)) internal.paymentRecipients = internal.paymentRecipients.map((recipient) => enrichRecipient(store, recipient));
  if (Array.isArray(internal.cancellationRecipients)) internal.cancellationRecipients = internal.cancellationRecipients.map((recipient) => enrichRecipient(store, recipient));

  if (context.path === '/neptune-jt-v183/admin-reservation-action' && String(context.body?.action || '') === 'move') {
    const reservationId = sanitizeText(context.body?.reservationId, 100).trim();
    const moved = reservationId ? reservationContext(store, reservationId) : null;
    if (moved) {
      const paymentRecipient = (internal.paymentRecipients || []).find((recipient) => recipient.id === reservationId);
      internal.paymentRecipients = (internal.paymentRecipients || []).filter((recipient) => recipient.id !== reservationId);
      if (internal.acknowledgement?.id === reservationId) delete internal.acknowledgement;
      internal.participantMoved = {
        ...moved,
        paymentRequired: Boolean(paymentRecipient?.paymentUrl),
        paymentUrl: paymentRecipient?.paymentUrl || '',
        messageNonce: `${Date.now()}`,
      };
    }
  }

  if (context.path === '/neptune-jt-v183/admin-edition-action' && String(context.body?.action || '') === 'cancel') {
    internal.cancellationReason = 'manual_neptune';
  }
  if (context.path === '/neptune-jt-v183/cutoff') internal.cancellationReason = 'minimum_not_reached_j7';
  return internal;
}

function enrichRecipient(store, recipient) {
  const context = recipient?.id ? reservationContext(store, recipient.id) : null;
  return context ? { ...context, ...recipient } : recipient;
}

function reservationContext(store, id) {
  return store.sql.exec(
    `SELECT r.id,r.edition_id AS editionId,r.first_name AS firstName,r.last_name AS lastName,r.email,r.company,r.status,
      r.amount_paid_cents AS amountPaidCents,r.stripe_session_id AS stripeSessionId,r.referral_code AS referralCode,
      e.label AS editionLabel,e.event_at AS eventAt,e.cutoff_at AS cutoffAt,e.location
     FROM neptune_jt_reservations_v182 r
     JOIN neptune_jt_editions_v182 e ON e.id=r.edition_id
     WHERE r.id=? LIMIT 1`,
    id,
  ).toArray()[0] || null;
}

async function interceptFinancialPaymentAnomaly(store, body) {
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
    release: NEPTUNE_JT_RELEASE,
    reservationId,
    confirmed: row.status === 'confirmed',
    financialReviewRequired: true,
    anomaly: kind,
  });
}

async function interceptPaidReservationCancellation(store, body) {
  const reservationId = sanitizeText(body.reservationId, 100).trim();
  if (!reservationId) return null;
  const row = reservationById(store, reservationId);
  if (!row || !LIVE_STATUSES.has(row.status) || (Number(row.amountPaidCents || 0) <= 0 && row.status !== 'confirmed')) return null;

  const access = await requireOperator(store, body);
  if (!access.ok) return access.response;
  if (body.confirmPaidRisk !== true) return json({ error: 'paid_reservation_requires_refund_confirmation' }, 409);

  await recordFinancialAlert(store, {
    kind: 'paid_participant_cancelled',
    reservation: row,
    sessionId: row.stripeSessionId,
    amountCents: Number(row.amountPaidCents || 0),
    currency: 'eur',
    details: 'Cancellation requested from Neptune Studio; refund or written carry-over must be processed manually.',
  });

  const now = new Date().toISOString();
  store.sql.exec("UPDATE neptune_jt_reservations_v182 SET status='cancelled_participant',updated_at=? WHERE id=?", now, reservationId);
  const recipient = reservationContext(store, reservationId) || row;
  return json({
    ok: true,
    action: 'cancel',
    reservation: reservationById(store, reservationId),
    counts: reservationCounts(store, row.editionId),
    internal: {
      participantCancelled: {
        ...recipient,
        paid: true,
        messageNonce: `${Date.now()}`,
      },
    },
  });
}

async function recordFinancialAlert(store, alert) {
  ensureFinancialSchema(store);
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

  const amount = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: String(alert.currency || 'eur').toUpperCase() }).format(Math.max(0, Number(alert.amountCents || 0)) / 100);
  await sendEmail(store.env || {}, {
    to: ['contact@neptunebusiness.com'],
    subject: `Action requise · Neptune JT · ${sanitizeText(alert.kind, 100)}`,
    text: [
      'Une anomalie financière Neptune JT nécessite un contrôle humain.',
      '',
      `Type : ${alert.kind}`,
      `Participant : ${reservation.firstName || ''} ${reservation.lastName || ''}`.trim(),
      `E-mail : ${reservation.email || ''}`,
      `Entreprise : ${reservation.company || ''}`,
      `Réservation : ${reservation.id || ''}`,
      `Édition : ${reservation.editionId || ''}`,
      `Session Stripe : ${sessionId || 'non renseignée'}`,
      `Montant observé : ${amount}`,
      `Détail : ${alert.details || ''}`,
      '',
      'Ne pas considérer ce dossier comme soldé tant que Stripe et la situation client n’ont pas été vérifiés.',
    ].join('\n'),
    idempotencyKey: `neptune-jt-financial-${fingerprint}`.slice(0, 240),
  });
  return id;
}

function ensureFinancialSchema(store) {
  if (store.neptuneJtV186FinancialReady) return;
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
    CREATE INDEX IF NOT EXISTS idx_neptune_jt_financial_alerts_open_v184 ON neptune_jt_financial_alerts_v184(resolved_at,created_at DESC);
  `);
  store.neptuneJtV186FinancialReady = true;
}

async function sendPreRegistrationEmail(env, origin, recipient) {
  if (!recipient?.email) return { ok: false };
  const shareUrl = `${origin}/reserver/neptune-jt/?ref=${encodeURIComponent(recipient.referralCode || '')}`;
  const count = Number(recipient.counts?.total || 1);
  const subject = `Neptune JT · Pré-réservation enregistrée (${Math.min(count, MIN_PARTICIPANTS)}/4)`;
  const text = [
    `Bonjour ${recipient.firstName},`,
    '',
    `Votre pré-réservation pour ${recipient.editionLabel || 'Neptune JT'} est bien enregistrée.`,
    ...editionLines(recipient),
    '',
    `Nous sommes actuellement à ${count}/4 participant(s) nécessaires pour déclencher les paiements. Aucun paiement n’est demandé avant ce seuil.`,
    'Dès 4 pré-réservations, chaque participant reçoit son lien de règlement de 200 € TTC.',
    'À J-7, l’édition est maintenue uniquement si au moins 4 paiements sont confirmés. Sinon, elle est annulée.',
    '',
    'Vous pouvez partager votre lien personnel :',
    shareUrl,
    '',
    'À bientôt,',
    'Neptune Media',
  ].join('\n');
  return sendEmail(env, { to: [recipient.email], subject, text, idempotencyKey: mailKey('prereg', recipient) });
}

async function sendPaymentEmail(env, recipient) {
  if (!recipient?.email || !recipient?.paymentUrl) return { ok: false };
  const text = [
    `Bonjour ${recipient.firstName},`,
    '',
    `Le seuil de 4 pré-réservations est atteint pour ${recipient.editionLabel || 'Neptune JT'}.`,
    ...editionLines(recipient),
    '',
    'Vous pouvez maintenant confirmer votre place en réglant 200 € TTC :',
    recipient.paymentUrl,
    '',
    'Votre place devient confirmée après validation du paiement. L’édition accueille au maximum 6 participants.',
    'L’édition est définitivement maintenue à partir de 4 paiements confirmés ; ce seuil est contrôlé au plus tard à J-7.',
    'Si le minimum n’est pas atteint à J-7, l’édition est annulée et tout règlement déjà encaissé est remboursé, ou reporté uniquement avec votre accord.',
    '',
    'À bientôt sur le plateau,',
    'Neptune Media',
  ].join('\n');
  return sendEmail(env, { to: [recipient.email], subject: 'Neptune JT · Confirmez votre passage', text, idempotencyKey: mailKey('payment', recipient) });
}

async function sendPaymentConfirmationEmail(env, recipient, manual = false) {
  if (!recipient?.email) return { ok: false };
  const text = [
    `Bonjour ${recipient.firstName},`,
    '',
    `Votre règlement de 200 € TTC est validé : votre place pour ${recipient.editionLabel || 'Neptune JT'} est confirmée.`,
    ...editionLines(recipient),
    '',
    'L’édition est maintenue dès que 4 paiements sont confirmés. Si ce minimum n’est pas atteint à J-7, l’édition est annulée et votre règlement est remboursé, ou reporté uniquement avec votre accord.',
    'Neptune vous recontactera pour préparer l’angle éditorial et l’appel de préparation.',
    '',
    'À bientôt sur le plateau,',
    'Neptune Media',
  ].join('\n');
  return sendEmail(env, {
    to: [recipient.email],
    subject: 'Neptune JT · Votre place est confirmée',
    text,
    idempotencyKey: manual
      ? `neptune-jt-paid-manual-${recipient.id}-${recipient.messageNonce || Date.now()}`
      : mailKey('paid', recipient),
  });
}

async function sendParticipantMovedEmail(env, recipient) {
  if (!recipient?.email) return { ok: false };
  const lines = [
    `Bonjour ${recipient.firstName},`,
    '',
    `Votre pré-réservation Neptune JT a été déplacée vers ${recipient.editionLabel || 'une nouvelle édition'}.`,
    ...editionLines(recipient),
    '',
  ];
  if (recipient.paymentRequired && recipient.paymentUrl) {
    lines.push('Le paiement est ouvert pour cette édition. Utilisez ce lien pour confirmer votre place à 200 € TTC :', recipient.paymentUrl, '', 'Votre place devient confirmée après paiement.');
  } else {
    lines.push('Aucun paiement n’est demandé pour le moment. Vous recevrez le lien de règlement dès que le seuil de 4 pré-réservations sera atteint.');
  }
  lines.push('', 'À bientôt,', 'Neptune Media');
  return sendEmail(env, {
    to: [recipient.email],
    subject: `Neptune JT · Votre réservation a été déplacée`,
    text: lines.join('\n'),
    idempotencyKey: mailKey('move', recipient),
  });
}

async function sendParticipantCancellationEmail(env, recipient) {
  if (!recipient?.email) return { ok: false };
  const paid = Boolean(recipient.paid || Number(recipient.amountPaidCents || 0) > 0);
  const text = [
    `Bonjour ${recipient.firstName},`,
    '',
    `Votre participation à ${recipient.editionLabel || 'Neptune JT'} a été annulée depuis le Studio Neptune.`,
    ...editionLines(recipient),
    '',
    paid
      ? 'Un règlement est associé à votre dossier. L’équipe Neptune vous contactera pour le remboursement ou, uniquement avec votre accord, un éventuel report.'
      : 'Aucun paiement n’est dû.',
    '',
    'Neptune Media',
  ].join('\n');
  return sendEmail(env, {
    to: [recipient.email],
    subject: 'Neptune JT · Mise à jour de votre participation',
    text,
    idempotencyKey: mailKey('participant-cancel', recipient),
  });
}

async function sendCancellationEmail(env, recipient) {
  if (!recipient?.email) return { ok: false };
  const paid = Number(recipient.amountPaidCents || 0) > 0;
  const reason = recipient.cancellationReason === 'minimum_not_reached_j7'
    ? 'Le minimum de 4 paiements confirmés n’a pas été atteint à J-7.'
    : 'Neptune a annulé cette édition.';
  const text = [
    `Bonjour ${recipient.firstName},`,
    '',
    `${recipient.editionLabel || 'Votre édition Neptune JT'} est annulée.`,
    reason,
    ...editionLines(recipient),
    '',
    paid
      ? 'Votre règlement ne sera pas conservé : Neptune procédera au remboursement, ou pourra vous proposer un report uniquement avec votre accord.'
      : 'Aucun paiement n’est dû.',
    '',
    'Neptune Media',
  ].join('\n');
  return sendEmail(env, {
    to: [recipient.email],
    subject: 'Neptune JT · Édition annulée',
    text,
    idempotencyKey: `neptune-jt-cancel-${recipient.id}`,
  });
}

function editionLines(recipient) {
  const lines = [];
  const formatted = formatEventDate(recipient?.eventAt);
  if (formatted) lines.push(`Date : ${formatted}`);
  if (recipient?.location) lines.push(`Lieu : ${recipient.location}`);
  return lines;
}

function formatEventDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  return new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'full',
    timeStyle: 'short',
    timeZone: 'Europe/Paris',
  }).format(date);
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
    `SELECT id,label,status FROM neptune_jt_editions_v182 WHERE id=? LIMIT 1`,
    id,
  ).toArray()[0] || null;
}

function reservationCounts(store, editionId) {
  const row = store.sql.exec(
    `SELECT
      SUM(CASE WHEN status IN ('pre_registered','payment_requested','confirmed') THEN 1 ELSE 0 END) AS total,
      SUM(CASE WHEN status='confirmed' THEN 1 ELSE 0 END) AS confirmed
     FROM neptune_jt_reservations_v182 WHERE edition_id=?`,
    editionId,
  ).toArray()[0] || {};
  return { total: Number(row.total || 0), confirmed: Number(row.confirmed || 0) };
}

function reservationIdFromReference(value) {
  const raw = String(value || '').trim();
  if (!raw.startsWith(REF_PREFIX)) return '';
  const id = raw.slice(REF_PREFIX.length);
  return /^[0-9a-f-]{20,100}$/iu.test(id) ? id : '';
}

function mailKey(kind, recipient) {
  return `neptune-jt-${kind}-${recipient.id}-${recipient.messageNonce || 'auto'}`.slice(0, 240);
}
