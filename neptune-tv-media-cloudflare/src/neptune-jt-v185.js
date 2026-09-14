import { json, sanitizeText } from './security.js';
import { requireOperator } from './workflow-db-v5.js';
import { ensureNeptuneJtSchema } from './neptune-jt-v183.js';
import {
  handleNeptuneJtStore as handleNeptuneJtStoreV184,
  handleNeptuneJtStripeWebhook as handleNeptuneJtStripeWebhookV184,
  reconcileNeptuneJtCheckoutSession as reconcileNeptuneJtCheckoutSessionV184,
  runNeptuneJtScheduled as runNeptuneJtScheduledV184,
  sendNeptuneJtCancellationNotifications as sendNeptuneJtCancellationNotificationsV184,
  sendNeptuneJtReservationEmails as sendNeptuneJtReservationEmailsV184,
} from './neptune-jt-v184.js';

export const NEPTUNE_JT_RELEASE = 'neptune-jt-20260914-v185-premerge';
const MIN_PARTICIPANTS = 4;

export async function handleNeptuneJtStore(store, request) {
  ensureNeptuneJtSchema(store);
  const url = new URL(request.url);
  if (request.method.toUpperCase() === 'POST' && url.pathname === '/neptune-jt-v183/admin-reservation-action') {
    const body = await request.clone().json().catch(() => ({}));
    if (String(body.action || '') === 'move') {
      const access = await requireOperator(store, body);
      if (!access.ok) return access.response;
      const protectedMove = protectIssuedPaymentMove(store, body);
      if (protectedMove) return protectedMove;
    }
  }
  return handleNeptuneJtStoreV184(store, request);
}

export function handleNeptuneJtStripeWebhook(request, env, storeCall) {
  return handleNeptuneJtStripeWebhookV184(request, env, storeCall);
}

export function reconcileNeptuneJtCheckoutSession(env, sessionId, storeCall) {
  return reconcileNeptuneJtCheckoutSessionV184(env, sessionId, storeCall);
}

export function runNeptuneJtScheduled(env, storeCall) {
  return runNeptuneJtScheduledV184(env, storeCall);
}

export function sendNeptuneJtReservationEmails(env, internal = {}) {
  return sendNeptuneJtReservationEmailsV184(env, internal);
}

export function sendNeptuneJtCancellationNotifications(env, internal = {}, storeCall) {
  return sendNeptuneJtCancellationNotificationsV184(env, internal, storeCall);
}

function protectIssuedPaymentMove(store, body) {
  const reservationId = sanitizeText(body.reservationId, 100).trim();
  const targetEditionId = sanitizeText(body.targetEditionId, 100).trim();
  if (!reservationId || !targetEditionId) return null;

  const reservation = store.sql.exec(
    'SELECT id,edition_id AS editionId,status FROM neptune_jt_reservations_v182 WHERE id=? LIMIT 1',
    reservationId,
  ).toArray()[0];
  if (!reservation || reservation.status !== 'payment_requested') return null;

  const target = store.sql.exec(
    `SELECT id,status,registrations_closed_at AS registrationsClosedAt,cutoff_at AS cutoffAt
     FROM neptune_jt_editions_v182 WHERE id=? LIMIT 1`,
    targetEditionId,
  ).toArray()[0];
  if (!target) return null;

  const count = store.sql.exec(
    "SELECT COUNT(*) AS count FROM neptune_jt_reservations_v182 WHERE edition_id=? AND status IN ('pre_registered','payment_requested','confirmed')",
    targetEditionId,
  ).toArray()[0];
  const totalAfterMove = Number(count?.count || 0) + (reservation.editionId === targetEditionId ? 0 : 1);
  const paymentWillRemainOpen = ['payment_open', 'confirmed'].includes(String(target.status || '')) || totalAfterMove >= MIN_PARTICIPANTS;

  if (!paymentWillRemainOpen) {
    return json({
      error: 'payment_requested_move_requires_open_target',
      message: 'A payment link has already been issued. Move this participant only to an edition where payment is already open or where this move reaches the threshold of four.',
    }, 409);
  }
  return null;
}
