import { json, sanitizeText } from './security.js';
import { sendEmail } from './email-service.js';
import { requireOperator } from './workflow-db-v5.js';
import { ensureNeptuneJtSchema } from './neptune-jt-v183.js';
import {
  NEPTUNE_JT_RELEASE as PREVIOUS_RELEASE,
  handleNeptuneJtStore as handleNeptuneJtStoreV186,
  handleNeptuneJtStripeWebhook as handleNeptuneJtStripeWebhookV186,
  reconcileNeptuneJtCheckoutSession as reconcileNeptuneJtCheckoutSessionV186,
  runNeptuneJtScheduled as runNeptuneJtScheduledV186,
  sendNeptuneJtCancellationNotifications as sendNeptuneJtCancellationNotificationsV186,
  sendNeptuneJtReservationEmails as sendNeptuneJtReservationEmailsV186,
} from './neptune-jt-v186.js';

export const NEPTUNE_JT_RELEASE = 'neptune-jt-20260915-v187-cancellation-semantics';
const MIN_PARTICIPANTS = 4;
const LIVE_STATUSES = new Set(['pre_registered', 'payment_requested', 'confirmed']);
const CANCELLATION_ORIGINS = new Set(['participant', 'neptune']);

export async function handleNeptuneJtStore(store, request) {
  ensureNeptuneJtSchema(store);
  const url = new URL(request.url);
  const method = request.method.toUpperCase();
  const body = method === 'POST' ? await request.clone().json().catch(() => ({})) : {};

  if (method === 'POST' && url.pathname === '/neptune-jt-v183/admin-reservation-action' && String(body.action || '') === 'cancel') {
    const origin = cancellationOrigin(body.cancellationOrigin);
    if (!origin) return json({ error: 'cancellation_origin_required' }, 400);

    if (origin === 'participant') {
      return cancelAtParticipantRequest(store, body);
    }

    const delegated = await handleNeptuneJtStoreV186(store, request);
    return enrichNeptuneCancellation(store, delegated, body);
  }

  const delegated = await handleNeptuneJtStoreV186(store, request);
  return withRelease(delegated);
}

export function handleNeptuneJtStripeWebhook(request, env, storeCall) {
  return handleNeptuneJtStripeWebhookV186(request, env, storeCall);
}

export function reconcileNeptuneJtCheckoutSession(env, sessionId, storeCall) {
  return reconcileNeptuneJtCheckoutSessionV186(env, sessionId, storeCall);
}

export function runNeptuneJtScheduled(env, storeCall) {
  return runNeptuneJtScheduledV186(env, storeCall);
}

export function sendNeptuneJtCancellationNotifications(env, internal = {}, storeCall) {
  return sendNeptuneJtCancellationNotificationsV186(env, internal, storeCall);
}

export async function sendNeptuneJtReservationEmails(env, internal = {}) {
  const participantCancelled = internal.participantCancelled;
  const delegated = { ...internal };
  delete delegated.participantCancelled;

  const tasks = [];
  if (hasMailWork(delegated)) tasks.push(sendNeptuneJtReservationEmailsV186(env, delegated));
  if (participantCancelled) tasks.push(sendParticipantCancellationByOrigin(env, participantCancelled));

  const results = await Promise.allSettled(tasks);
  for (const result of results) {
    if (result.status === 'rejected') console.error('neptune_jt_v187_email_failed', String(result.reason?.message || result.reason));
  }
  return results;
}

async function cancelAtParticipantRequest(store, body) {
  const access = await requireOperator(store, body);
  if (!access.ok) return access.response;

  const reservationId = sanitizeText(body.reservationId, 100).trim();
  if (!reservationId) return json({ error: 'reservation_id_required' }, 400);
  const row = reservationById(store, reservationId);
  if (!row) return json({ error: 'reservation_not_found' }, 404);
  if (!LIVE_STATUSES.has(row.status)) return json({ error: 'reservation_action_not_available' }, 409);

  const now = new Date().toISOString();
  store.sql.exec("UPDATE neptune_jt_reservations_v182 SET status='cancelled_participant',updated_at=? WHERE id=?", now, reservationId);
  normalizeEditionAfterCancellation(store, row.editionId, now);
  const recipient = reservationContext(store, reservationId) || row;
  const counts = reservationCounts(store, row.editionId);

  return json({
    ok: true,
    release: NEPTUNE_JT_RELEASE,
    action: 'cancel',
    cancellationOrigin: 'participant',
    reservation: reservationById(store, reservationId),
    counts,
    internal: {
      participantCancelled: {
        ...recipient,
        cancellationOrigin: 'participant',
        paid: Number(row.amountPaidCents || 0) > 0 || row.status === 'confirmed',
        messageNonce: `${Date.now()}`,
      },
    },
  });
}

async function enrichNeptuneCancellation(store, response, body) {
  if (!response) return response;
  const type = response.headers.get('Content-Type') || '';
  if (!type.includes('application/json')) return response;
  const data = await response.clone().json().catch(() => null);
  if (!data || typeof data !== 'object' || Array.isArray(data)) return response;

  if (response.ok) {
    const reservationId = sanitizeText(body.reservationId, 100).trim();
    const reservation = reservationId ? reservationById(store, reservationId) : null;
    if (reservation?.editionId) normalizeEditionAfterCancellation(store, reservation.editionId, new Date().toISOString());
    if (data.internal?.participantCancelled) {
      data.internal.participantCancelled = {
        ...data.internal.participantCancelled,
        ...reservationContext(store, reservationId),
        cancellationOrigin: 'neptune',
      };
    }
    if (reservation?.editionId) data.counts = reservationCounts(store, reservation.editionId);
  }
  if (Object.prototype.hasOwnProperty.call(data, 'release')) data.release = NEPTUNE_JT_RELEASE;

  const headers = new Headers(response.headers);
  headers.delete('Content-Length');
  headers.set('Content-Type', 'application/json; charset=utf-8');
  return new Response(JSON.stringify(data), { status: response.status, statusText: response.statusText, headers });
}

function normalizeEditionAfterCancellation(store, editionId, now) {
  const edition = editionById(store, editionId);
  if (!edition || ['cancelled', 'archived'].includes(edition.status)) return;
  const counts = reservationCounts(store, editionId);
  const nextStatus = counts.confirmed >= MIN_PARTICIPANTS
    ? 'confirmed'
    : counts.total >= MIN_PARTICIPANTS
      ? 'payment_open'
      : 'collecting';
  store.sql.exec(
    "UPDATE neptune_jt_editions_v182 SET status=?,updated_at=? WHERE id=? AND status NOT IN ('cancelled','archived')",
    nextStatus,
    now,
    editionId,
  );
}

async function sendParticipantCancellationByOrigin(env, recipient) {
  if (!recipient?.email) return { ok: false };
  const origin = cancellationOrigin(recipient.cancellationOrigin) || 'neptune';
  const paid = Boolean(recipient.paid || Number(recipient.amountPaidCents || 0) > 0);
  const lines = [
    `Bonjour ${recipient.firstName},`,
    '',
    origin === 'participant'
      ? `Votre demande d’annulation pour ${recipient.editionLabel || 'Neptune JT'} est enregistrée.`
      : `Votre participation à ${recipient.editionLabel || 'Neptune JT'} a été annulée par Neptune.`,
    ...editionLines(recipient),
    '',
  ];

  if (origin === 'participant') {
    lines.push(
      paid
        ? 'Cette annulation intervient à votre initiative après règlement. Conformément aux conditions Neptune JT acceptées lors de la réservation, le paiement n’est pas remboursable dans ce cas.'
        : 'Aucun paiement n’est dû.',
    );
  } else {
    lines.push(
      paid
        ? 'Un règlement est associé à votre dossier. Neptune procédera au remboursement, ou pourra vous proposer un report uniquement avec votre accord.'
        : 'Aucun paiement n’est dû.',
    );
  }

  lines.push('', 'Neptune Media');
  return sendEmail(env, {
    to: [recipient.email],
    subject: origin === 'participant'
      ? 'Neptune JT · Votre annulation est enregistrée'
      : 'Neptune JT · Votre participation est annulée',
    text: lines.join('\n'),
    idempotencyKey: `neptune-jt-participant-cancel-${origin}-${recipient.id}-${recipient.messageNonce || 'auto'}`.slice(0, 240),
  });
}

function reservationById(store, id) {
  return store.sql.exec(
    `SELECT id,edition_id AS editionId,first_name AS firstName,last_name AS lastName,email,company,status,
      stripe_session_id AS stripeSessionId,amount_paid_cents AS amountPaidCents,paid_at AS paidAt
     FROM neptune_jt_reservations_v182 WHERE id=? LIMIT 1`,
    id,
  ).toArray()[0] || null;
}

function reservationContext(store, id) {
  if (!id) return null;
  return store.sql.exec(
    `SELECT r.id,r.edition_id AS editionId,r.first_name AS firstName,r.last_name AS lastName,r.email,r.company,r.status,
      r.amount_paid_cents AS amountPaidCents,r.stripe_session_id AS stripeSessionId,
      e.label AS editionLabel,e.event_at AS eventAt,e.cutoff_at AS cutoffAt,e.location
     FROM neptune_jt_reservations_v182 r
     JOIN neptune_jt_editions_v182 e ON e.id=r.edition_id
     WHERE r.id=? LIMIT 1`,
    id,
  ).toArray()[0] || null;
}

function editionById(store, id) {
  if (!id) return null;
  return store.sql.exec('SELECT id,status FROM neptune_jt_editions_v182 WHERE id=? LIMIT 1', id).toArray()[0] || null;
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

function cancellationOrigin(value) {
  const origin = sanitizeText(value, 40).trim().toLowerCase();
  return CANCELLATION_ORIGINS.has(origin) ? origin : '';
}

function hasMailWork(internal) {
  return Boolean(
    internal?.acknowledgement
    || internal?.confirmation
    || internal?.participantMoved
    || (Array.isArray(internal?.paymentRecipients) && internal.paymentRecipients.length),
  );
}

async function withRelease(response) {
  if (!response) return response;
  const type = response.headers.get('Content-Type') || '';
  if (!type.includes('application/json')) return response;
  const data = await response.clone().json().catch(() => null);
  if (!data || typeof data !== 'object' || Array.isArray(data) || !Object.prototype.hasOwnProperty.call(data, 'release')) return response;
  data.release = NEPTUNE_JT_RELEASE;
  const headers = new Headers(response.headers);
  headers.delete('Content-Length');
  headers.set('Content-Type', 'application/json; charset=utf-8');
  return new Response(JSON.stringify(data), { status: response.status, statusText: response.statusText, headers });
}

void PREVIOUS_RELEASE;
