import { json, sanitizeText } from './security.js';
import { sendEmail } from './email-service.js';
import { normalizeStripeCheckoutSession, verifyStripeWebhook } from './stripe-journey-v90.js';
import { requireOperator } from './workflow-db-v5.js';
import { ensurePortalSchema } from './portal-schema.js';
import { ensureStudioOperationsV95Schema } from './portal-studio-operations-v95.js';
import { syncSteps } from './portal-utils.js';
import { ensureNeptuneJtSchema } from './neptune-jt-v183.js';
import {
  NEPTUNE_JT_RELEASE as PREVIOUS_RELEASE,
  handleNeptuneJtStore as handleNeptuneJtStoreV186,
  runNeptuneJtScheduled as runNeptuneJtScheduledV186,
  sendNeptuneJtCancellationNotifications as sendNeptuneJtCancellationNotificationsV186,
  sendNeptuneJtReservationEmails as sendNeptuneJtReservationEmailsV186,
} from './neptune-jt-v186.js';

export const NEPTUNE_JT_RELEASE = 'neptune-jt-20260915-v187-studio-canonical-promo';
const MIN_PARTICIPANTS = 4;
const MAX_PARTICIPANTS = 6;
const REF_PREFIX = 'NPJTE_';
const PROMO_CODE = 'NEPTUNEJT';
const PRODUCT_CODE = 'neptune-jt';
const TERMS_VERSION = 'neptune-jt-20260915';
const MEDIA_RELEASE_VERSION = 'neptune-jt-media-rights-20260915';
const DEFAULT_BOOKING_URL = 'https://tv.neptunebusiness.com/reserver/neptune-jt/';
const LIVE_STATUSES = new Set(['pre_registered', 'payment_requested', 'confirmed']);
const CANCELLATION_ORIGINS = new Set(['participant', 'neptune']);

export async function handleNeptuneJtStore(store, request) {
  ensureStudioBridgeSchema(store);
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
  return enrichCanonicalResponse(store, delegated, { path: url.pathname, body });
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
  if (response.ok && data.internal?.confirmation) await sendPaymentConfirmationWithPromo(env, data.internal.confirmation);
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
  if (result.ok && data.internal?.confirmation) await sendPaymentConfirmationWithPromo(env, data.internal.confirmation);
  delete data.internal;
  return json({ ...data, paymentStatus: normalized.paymentStatus || String(session.payment_status || '') }, result.status);
}

export function runNeptuneJtScheduled(env, storeCall) {
  return runNeptuneJtScheduledV186(env, storeCall);
}

export function sendNeptuneJtCancellationNotifications(env, internal = {}, storeCall) {
  return sendNeptuneJtCancellationNotificationsV186(env, internal, storeCall);
}

export async function sendNeptuneJtReservationEmails(env, internal = {}) {
  const participantCancelled = internal.participantCancelled;
  const confirmation = internal.confirmation;
  const delegated = { ...internal };
  delete delegated.participantCancelled;
  delete delegated.confirmation;

  const tasks = [];
  if (hasMailWork(delegated)) tasks.push(sendNeptuneJtReservationEmailsV186(env, delegated));
  if (confirmation) tasks.push(sendPaymentConfirmationWithPromo(env, confirmation, Boolean(confirmation.messageNonce)));
  if (participantCancelled) tasks.push(sendParticipantCancellationByOrigin(env, participantCancelled));

  const results = await Promise.allSettled(tasks);
  for (const result of results) {
    if (result.status === 'rejected') console.error('neptune_jt_v187_email_failed', String(result.reason?.message || result.reason));
    else if (!result.value?.ok && !Array.isArray(result.value)) console.error('neptune_jt_v187_email_failed', String(result.value?.error || result.value?.providerCode || 'send_failed'));
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

  if (row.portalOrderId) {
    store.sql.exec(
      "UPDATE portal_orders SET next_action='Participation Neptune JT annulée à la demande du client · paiement non remboursable selon les conditions acceptées',updated_at=? WHERE id=?",
      now,
      row.portalOrderId,
    );
  }
  store.audit?.(access.actor?.id || 'studio', 'neptune_jt_participant_cancelled', 'neptune_jt_reservation', reservationId, {
    cancellationOrigin: 'participant',
    paid: Number(row.amountPaidCents || 0) > 0 || row.status === 'confirmed',
    portalOrderId: row.portalOrderId || '',
  });

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
    if (reservation && (Number(reservation.amountPaidCents || 0) > 0 || reservation.status === 'confirmed')) {
      data.refund = ensureCanonicalRefundRequest(store, reservation.id, 'Annulation Neptune JT décidée par Neptune');
    }
  }
  data.release = NEPTUNE_JT_RELEASE;

  const headers = new Headers(response.headers);
  headers.delete('Content-Length');
  headers.set('Content-Type', 'application/json; charset=utf-8');
  return new Response(JSON.stringify(data), { status: response.status, statusText: response.statusText, headers });
}

async function enrichCanonicalResponse(store, response, context) {
  if (!response) return response;
  const type = response.headers.get('Content-Type') || '';
  if (!type.includes('application/json')) return response;
  const data = await response.clone().json().catch(() => null);
  if (!data || typeof data !== 'object' || Array.isArray(data)) return response;

  if (response.ok) {
    const paymentPath = ['/neptune-jt-v183/mark-paid', '/neptune-jt-v183/reconcile-session'].includes(context.path);
    if (paymentPath && data.confirmed === true && data.financialReviewRequired !== true && data.reservationId) {
      const canonical = materializeStudioParticipant(store, data.reservationId);
      data.studio = canonical;
      const confirmation = reservationContext(store, data.reservationId);
      if (confirmation?.email) {
        data.internal = data.internal && typeof data.internal === 'object' ? data.internal : {};
        data.internal.confirmation = {
          ...(data.internal.confirmation || {}),
          ...confirmation,
          promoCode: confirmation.memberStatus === 'non_member' ? PROMO_CODE : '',
        };
      }
    }

    if (context.path === '/neptune-jt-v183/admin-save-edition' && data.edition?.id) {
      syncEditionToPortalOrders(store, data.edition.id);
    }

    if (context.path === '/neptune-jt-v183/admin-dashboard') {
      enrichDashboardWithStudio(store, data);
    }

    const cancellationIsNeptune = context.path === '/neptune-jt-v183/cutoff'
      || (context.path === '/neptune-jt-v183/admin-edition-action' && String(context.body?.action || '') === 'cancel');
    if (cancellationIsNeptune && data.internal?.cancellationRecipients) {
      data.refunds = [];
      for (const recipient of data.internal.cancellationRecipients) {
        const row = reservationById(store, recipient.id);
        if (row && (Number(row.amountPaidCents || 0) > 0 || row.status === 'confirmed' || row.portalOrderId)) {
          const refund = ensureCanonicalRefundRequest(
            store,
            row.id,
            context.path === '/neptune-jt-v183/cutoff'
              ? 'Annulation Neptune JT · minimum de 4 paiements non atteint à J-7'
              : 'Annulation Neptune JT décidée par Neptune',
          );
          if (refund) data.refunds.push(refund);
        }
      }
    }

    if (data.internal?.confirmation?.id) {
      const confirmation = reservationContext(store, data.internal.confirmation.id);
      if (confirmation) {
        data.internal.confirmation = {
          ...data.internal.confirmation,
          ...confirmation,
          promoCode: confirmation.memberStatus === 'non_member' ? PROMO_CODE : '',
        };
      }
    }
  }

  data.release = NEPTUNE_JT_RELEASE;
  const headers = new Headers(response.headers);
  headers.delete('Content-Length');
  headers.set('Content-Type', 'application/json; charset=utf-8');
  return new Response(JSON.stringify(data), { status: response.status, statusText: response.statusText, headers });
}

function ensureStudioBridgeSchema(store) {
  ensureNeptuneJtSchema(store);
  ensurePortalSchema(store);
  ensureStudioOperationsV95Schema(store);
  if (store.neptuneJtV187StudioBridgeReady) return;

  ensureReservationColumn(store, 'portal_client_id', "TEXT NOT NULL DEFAULT ''");
  ensureReservationColumn(store, 'portal_order_id', "TEXT NOT NULL DEFAULT ''");
  ensureReservationColumn(store, 'canonical_materialized_at', 'TEXT');
  ensureReservationColumn(store, 'terms_version', `TEXT NOT NULL DEFAULT '${TERMS_VERSION}'`);
  ensureReservationColumn(store, 'media_release_version', `TEXT NOT NULL DEFAULT '${MEDIA_RELEASE_VERSION}'`);

  store.sql.exec(
    `UPDATE neptune_jt_reservations_v182
     SET terms_version=CASE WHEN terms_version='' THEN ? ELSE terms_version END,
         media_release_version=CASE WHEN media_release_version='' THEN ? ELSE media_release_version END`,
    TERMS_VERSION,
    MEDIA_RELEASE_VERSION,
  );
  seedNeptuneJtStudioFormat(store);
  backfillVerifiedCanonicalPayments(store);
  store.neptuneJtV187StudioBridgeReady = true;
}

function ensureReservationColumn(store, name, definition) {
  const columns = store.sql.exec('PRAGMA table_info(neptune_jt_reservations_v182)').toArray().map((row) => String(row.name || ''));
  if (columns.includes(name)) return;
  store.sql.exec(`ALTER TABLE neptune_jt_reservations_v182 ADD COLUMN ${name} ${definition}`);
}

function seedNeptuneJtStudioFormat(store) {
  const now = new Date().toISOString();
  const existing = store.sql.exec("SELECT id FROM portal_media_formats_v95 WHERE slug='neptune-jt' LIMIT 1").toArray()[0];
  if (!existing) {
    store.sql.exec(
      `INSERT INTO portal_media_formats_v95(id,slug,name,concept,description,duration_label,price_cents,booking_url,active,public_order,created_at,updated_at)
       VALUES('format-neptune-jt','neptune-jt','Neptune JT','Actualité & expertise terrain','Un passage au JT de Neptune Business pour décrypter une actualité liée au marché du participant.','15–20 min de passage · 30 min de créneau',20000,?,1,15,?,?)`,
      DEFAULT_BOOKING_URL,
      now,
      now,
    );
  } else {
    store.sql.exec(
      `UPDATE portal_media_formats_v95
       SET price_cents=20000,booking_url=?,active=1,updated_at=?
       WHERE id=? AND (price_cents<>20000 OR booking_url<>? OR active<>1)`,
      DEFAULT_BOOKING_URL,
      now,
      existing.id,
      DEFAULT_BOOKING_URL,
    );
  }
}

function backfillVerifiedCanonicalPayments(store) {
  const rows = store.sql.exec(
    `SELECT id FROM neptune_jt_reservations_v182
     WHERE status='confirmed' AND amount_paid_cents=20000 AND stripe_session_id<>'' AND portal_order_id=''
     ORDER BY paid_at ASC`,
  ).toArray();
  for (const row of rows) materializeStudioParticipant(store, row.id);
}

function materializeStudioParticipant(store, reservationId) {
  const row = reservationContext(store, reservationId);
  if (!row) return { ok: false, reason: 'reservation_not_found' };
  if (row.status !== 'confirmed' || Number(row.amountPaidCents || 0) !== 20000 || !row.stripeSessionId) {
    return { ok: false, reason: 'verified_paid_reservation_required' };
  }

  const now = new Date().toISOString();
  let client = store.sql.exec(
    'SELECT id,email,full_name AS fullName,company FROM portal_clients WHERE email=? LIMIT 1',
    row.email,
  ).toArray()[0];
  if (!client) {
    client = { id: crypto.randomUUID(), email: row.email };
    store.sql.exec(
      'INSERT INTO portal_clients(id,email,full_name,company,active,created_at,updated_at,last_access_at) VALUES(?,?,?,?,1,?,?,NULL)',
      client.id,
      row.email,
      `${row.firstName || ''} ${row.lastName || ''}`.trim(),
      row.company || '',
      now,
      now,
    );
  } else {
    store.sql.exec(
      `UPDATE portal_clients
       SET full_name=CASE WHEN full_name='' THEN ? ELSE full_name END,
           company=CASE WHEN company='' THEN ? ELSE company END,
           active=1,updated_at=?
       WHERE id=?`,
      `${row.firstName || ''} ${row.lastName || ''}`.trim(),
      row.company || '',
      now,
      client.id,
    );
  }

  let order = store.sql.exec(
    'SELECT id,client_id AS clientId,product_code AS productCode FROM portal_orders WHERE external_payment_id=? LIMIT 1',
    row.stripeSessionId,
  ).toArray()[0];
  if (order && (order.clientId !== client.id || (order.productCode && order.productCode !== PRODUCT_CODE))) {
    store.audit?.('system', 'neptune_jt_canonical_collision', 'neptune_jt_reservation', row.id, {
      stripeSessionId: row.stripeSessionId,
      existingOrderId: order.id,
      existingClientId: order.clientId,
      expectedClientId: client.id,
      existingProductCode: order.productCode || '',
    });
    return { ok: false, reason: 'canonical_order_collision', clientId: client.id, existingOrderId: order.id };
  }

  if (!order) {
    order = { id: crypto.randomUUID(), clientId: client.id, productCode: PRODUCT_CODE };
    const reference = `NEPTUNEJT-${row.id.replace(/-/gu, '').slice(0, 10).toUpperCase()}`;
    store.sql.exec(
      `INSERT INTO portal_orders(
        id,client_id,external_payment_id,order_reference,product_code,title,format,payment_status,amount_total,currency,status,
        appointment_at,filming_at,next_action,preparation_url,booking_url,created_at,updated_at
      ) VALUES(?,?,?,?,?,?,?,'paid',20000,'eur','reservation_confirmed',NULL,?,?,?,?,?,?)`,
      order.id,
      client.id,
      row.stripeSessionId,
      reference,
      PRODUCT_CODE,
      `Neptune JT · ${row.editionLabel || 'Édition'}`,
      'Neptune JT',
      row.eventAt || null,
      'Réserver et préparer l’appel éditorial de 30 à 45 minutes',
      '',
      DEFAULT_BOOKING_URL,
      now,
      now,
    );
  } else {
    store.sql.exec(
      `UPDATE portal_orders SET payment_status='paid',amount_total=20000,currency='eur',
       filming_at=COALESCE(filming_at,?),updated_at=? WHERE id=?`,
      row.eventAt || null,
      now,
      order.id,
    );
  }

  syncSteps(store, order.id, 'reservation_confirmed', now);
  store.sql.exec(
    `UPDATE neptune_jt_reservations_v182
     SET portal_client_id=?,portal_order_id=?,canonical_materialized_at=COALESCE(canonical_materialized_at,?),updated_at=?
     WHERE id=?`,
    client.id,
    order.id,
    now,
    now,
    row.id,
  );
  store.audit?.('system', 'neptune_jt_materialized_to_studio', 'portal_order', order.id, {
    reservationId: row.id,
    editionId: row.editionId,
    stripeSessionId: row.stripeSessionId,
    amountCents: 20000,
  });

  return {
    ok: true,
    clientId: client.id,
    orderId: order.id,
    productCode: PRODUCT_CODE,
    materialized: true,
  };
}

function syncEditionToPortalOrders(store, editionId) {
  const edition = store.sql.exec(
    'SELECT id,label,event_at AS eventAt FROM neptune_jt_editions_v182 WHERE id=? LIMIT 1',
    editionId,
  ).toArray()[0];
  if (!edition) return;
  const now = new Date().toISOString();
  const rows = store.sql.exec(
    "SELECT portal_order_id AS orderId FROM neptune_jt_reservations_v182 WHERE edition_id=? AND portal_order_id<>''",
    editionId,
  ).toArray();
  for (const row of rows) {
    store.sql.exec(
      'UPDATE portal_orders SET title=?,filming_at=?,updated_at=? WHERE id=?',
      `Neptune JT · ${edition.label || 'Édition'}`,
      edition.eventAt || null,
      now,
      row.orderId,
    );
  }
}

function ensureCanonicalRefundRequest(store, reservationId, reason) {
  let row = reservationById(store, reservationId);
  if (!row) return null;
  if (!row.portalOrderId && row.status === 'confirmed' && Number(row.amountPaidCents || 0) === 20000 && row.stripeSessionId) {
    materializeStudioParticipant(store, reservationId);
    row = reservationById(store, reservationId);
  }
  if (!row?.portalOrderId) return null;

  const existing = store.sql.exec(
    'SELECT id,status,requested_at AS requestedAt,processed_at AS processedAt FROM portal_refund_requests WHERE order_id=? AND processed_at IS NULL ORDER BY requested_at DESC LIMIT 1',
    row.portalOrderId,
  ).toArray()[0];
  if (existing) return { ...existing, orderId: row.portalOrderId, existing: true };

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  store.sql.exec(
    "INSERT INTO portal_refund_requests(id,order_id,reason,eligible,status,requested_at,processed_at) VALUES(?,?,?,1,'pending',?,NULL)",
    id,
    row.portalOrderId,
    sanitizeText(reason, 500),
    now,
  );
  store.sql.exec(
    "UPDATE portal_orders SET payment_status='refund_pending',next_action='Remboursement Stripe à traiter ou report à valider explicitement avec le client',updated_at=? WHERE id=?",
    now,
    row.portalOrderId,
  );
  store.audit?.('system', 'neptune_jt_refund_requested', 'portal_order', row.portalOrderId, {
    reservationId,
    refundRequestId: id,
    reason: sanitizeText(reason, 500),
  });
  return { id, orderId: row.portalOrderId, status: 'pending', requestedAt: now, existing: false };
}

function enrichDashboardWithStudio(store, data) {
  const reservations = Array.isArray(data.reservations) ? data.reservations : [];
  let linked = 0;
  let refundPending = 0;
  data.reservations = reservations.map((reservation) => {
    const row = reservationById(store, reservation.id);
    if (!row) return reservation;
    let order = null;
    if (row.portalOrderId) {
      order = store.sql.exec(
        'SELECT id,payment_status AS paymentStatus,status,next_action AS nextAction,filming_at AS filmingAt FROM portal_orders WHERE id=? LIMIT 1',
        row.portalOrderId,
      ).toArray()[0] || null;
      if (order) linked += 1;
      const pending = store.sql.exec(
        'SELECT id,status,requested_at AS requestedAt FROM portal_refund_requests WHERE order_id=? AND processed_at IS NULL ORDER BY requested_at DESC LIMIT 1',
        row.portalOrderId,
      ).toArray()[0] || null;
      if (pending) refundPending += 1;
      return {
        ...reservation,
        portalClientId: row.portalClientId || '',
        portalOrderId: row.portalOrderId || '',
        canonicalMaterializedAt: row.canonicalMaterializedAt || null,
        studioOrder: order,
        refundRequest: pending,
      };
    }
    return {
      ...reservation,
      portalClientId: row.portalClientId || '',
      portalOrderId: row.portalOrderId || '',
      canonicalMaterializedAt: row.canonicalMaterializedAt || null,
      studioOrder: null,
      refundRequest: null,
    };
  });
  data.studioSync = {
    linkedParticipants: linked,
    paidParticipants: Number(data.counts?.confirmed || 0),
    refundPending,
    productCode: PRODUCT_CODE,
    promoCodeForNonMembers: PROMO_CODE,
  };
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

async function sendPaymentConfirmationWithPromo(env, recipient, manual = false) {
  if (!recipient?.email) return { ok: false };
  const promoEligible = recipient.memberStatus === 'non_member';
  const lines = [
    `Bonjour ${recipient.firstName},`,
    '',
    `Votre règlement de 200 € TTC est validé : votre place pour ${recipient.editionLabel || 'Neptune JT'} est confirmée.`,
    ...editionLines(recipient),
    '',
    'L’édition est maintenue dès que 4 paiements sont confirmés. Si ce minimum n’est pas atteint à J-7, l’édition est annulée et votre règlement est remboursé, ou reporté uniquement avec votre accord.',
    'Neptune vous recontactera pour préparer l’angle éditorial et l’appel de préparation.',
  ];
  if (promoEligible) {
    lines.push(
      '',
      'Votre mois Neptune offert',
      `Code promotionnel : ${PROMO_CODE}`,
      'Ce code est réservé aux participants Neptune JT non-membres et vous permet de bénéficier d’un mois Neptune offert selon les conditions de l’offre Neptune associée.',
    );
  }
  lines.push('', 'À bientôt sur le plateau,', 'Neptune Media');
  return sendEmail(env, {
    to: [recipient.email],
    subject: 'Neptune JT · Votre place est confirmée',
    text: lines.join('\n'),
    idempotencyKey: manual
      ? `neptune-jt-paid-promo-v1-manual-${recipient.id}-${recipient.messageNonce || Date.now()}`.slice(0, 240)
      : `neptune-jt-paid-promo-v1-${recipient.id}`.slice(0, 240),
  });
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
        ? 'Un règlement est associé à votre dossier. Une demande de remboursement est enregistrée dans Studio ; Neptune procédera au remboursement Stripe, ou pourra vous proposer un report uniquement avec votre accord.'
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
    `SELECT id,edition_id AS editionId,first_name AS firstName,last_name AS lastName,email,company,status,member_status AS memberStatus,
      stripe_session_id AS stripeSessionId,amount_paid_cents AS amountPaidCents,paid_at AS paidAt,
      portal_client_id AS portalClientId,portal_order_id AS portalOrderId,canonical_materialized_at AS canonicalMaterializedAt
     FROM neptune_jt_reservations_v182 WHERE id=? LIMIT 1`,
    id,
  ).toArray()[0] || null;
}

function reservationContext(store, id) {
  if (!id) return null;
  return store.sql.exec(
    `SELECT r.id,r.edition_id AS editionId,r.first_name AS firstName,r.last_name AS lastName,r.email,r.company,r.status,
      r.member_status AS memberStatus,r.amount_paid_cents AS amountPaidCents,r.stripe_session_id AS stripeSessionId,
      r.portal_client_id AS portalClientId,r.portal_order_id AS portalOrderId,r.canonical_materialized_at AS canonicalMaterializedAt,
      r.terms_version AS termsVersion,r.media_release_version AS mediaReleaseVersion,
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
    || internal?.participantMoved
    || (Array.isArray(internal?.paymentRecipients) && internal.paymentRecipients.length),
  );
}

void PREVIOUS_RELEASE;
void MAX_PARTICIPANTS;
