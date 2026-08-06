import { ensurePortalSchema } from './portal-schema.js';
import {
  nextActionForStatus,
  normalizeStatus,
  nullableIso,
  safeInteger,
  syncSteps,
} from './portal-utils.js';
import { json, sanitizeText, sanitizeUrl } from './security.js';
import {
  ADMIN_EMAIL,
  SUPPLIER_EMAIL,
  ensureWorkflowSchema,
  isHorsNorme,
  normalizeEmail,
  queueEmail,
  recordEvent,
} from './workflow-db-v5.js';

const PAYMENT_STATUSES = new Set(['paid', 'pending', 'refunded', 'failed', 'cancelled']);
const CURRENCIES = new Set(['eur', 'usd', 'gbp', 'chf']);
const CLIENT_PAYMENT_NOTICES = new Set(['pending', 'refunded', 'failed', 'cancelled']);
const SUPPLIER_STATUSES = new Set([
  'studio_date_confirmation_pending',
  'filming_scheduled',
  'filming_confirmed',
  'filmed',
  'videos_pending',
]);

const FIELD_META = {
  title: { label: 'Nom du passage', kind: 'text' },
  format: { label: 'Format', kind: 'text' },
  status: { label: 'Statut opérationnel', kind: 'status' },
  appointmentAt: { label: 'Rendez-vous de préparation', kind: 'date' },
  filmingAt: { label: 'Date et heure du passage', kind: 'date' },
  preparationUrl: { label: 'Lien de préparation', kind: 'url' },
  bookingUrl: { label: 'Lien de réservation', kind: 'url' },
  nextAction: { label: 'Prochaine action', kind: 'text' },
  orderReference: { label: 'Référence de commande', kind: 'text' },
  productCode: { label: 'Code produit', kind: 'text' },
  paymentStatus: { label: 'Statut du paiement', kind: 'payment' },
  amountTotal: { label: 'Montant', kind: 'money' },
  currency: { label: 'Devise', kind: 'text' },
};

const STATUS_LABELS = {
  payment_confirmed: 'Paiement reçu',
  reservation_confirmed: 'Rendez-vous à réserver',
  preparation_booking_pending: 'Rendez-vous à réserver',
  appointment_confirmed: 'Préparation réservée',
  appointment_booked: 'Préparation réservée',
  preparation: 'Préparation en cours',
  studio_date_confirmation_pending: 'Date à confirmer',
  preparation_complete: 'Préparation terminée',
  filming_scheduled: 'Passage confirmé',
  filming_confirmed: 'Passage confirmé',
  filmed: 'Passage réalisé',
  videos_pending: 'Vidéos attendues',
  videos_received: 'Vidéos reçues',
  editing: 'Traitement en cours',
  approval: 'Traitement en cours',
  delivered: 'Livré',
  completed: 'Terminé',
};

const PAYMENT_LABELS = {
  paid: 'Payé',
  pending: 'En attente',
  refunded: 'Remboursé',
  failed: 'Échec',
  cancelled: 'Annulé',
};

export function adminPassageUpdateV81(store, payload = {}, actor = {}) {
  ensurePortalSchema(store);
  ensureWorkflowSchema(store);

  const orderId = sanitizeText(payload.orderId, 100);
  if (!orderId) return json({ error: 'invalid_order' }, 400);

  const current = store.sql.exec(`
    SELECT o.id,o.title,o.format,o.status,o.appointment_at AS appointmentAt,o.filming_at AS filmingAt,
           o.preparation_url AS preparationUrl,o.booking_url AS bookingUrl,o.next_action AS nextAction,
           o.order_reference AS orderReference,o.product_code AS productCode,o.payment_status AS paymentStatus,
           o.amount_total AS amountTotal,o.currency,o.updated_at AS updatedAt,
           c.email AS clientEmail,c.full_name AS fullName,c.company,
           w.supplier_email AS supplierEmail,w.supplier_status AS supplierStatus
    FROM portal_orders o
    JOIN portal_clients c ON c.id=o.client_id
    LEFT JOIN portal_workflows w ON w.order_id=o.id
    WHERE o.id=? LIMIT 1
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

  const next = {
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
  };
  const changes = detectChanges(current, next);

  store.sql.exec(`
    UPDATE portal_orders
    SET title=?,format=?,status=?,appointment_at=?,filming_at=?,preparation_url=?,booking_url=?,
        next_action=?,order_reference=?,product_code=?,payment_status=?,amount_total=?,currency=?,updated_at=?
    WHERE id=?
  `,
  title, format, status, appointmentAt, filmingAt, preparationUrl, bookingUrl,
  nextAction, orderReference, productCode, paymentStatus, amountTotal, currency, now, orderId);

  reconcileWorkflow(store, current, next, changes, now, orderId);
  if (status !== current.status) syncSteps(store, orderId, status, now);

  const notificationPlan = buildNotificationPlan(store, current, next, changes);
  let notificationsQueued = 0;
  for (const recipient of notificationPlan.recipients) {
    const key = `passage_change_${recipient.type}_${compactStamp(now)}_${crypto.randomUUID().slice(0, 8)}`;
    const queued = queueEmail(store, orderId, key, recipient.type, recipient.email, {
      recipientType: recipient.type,
      recipientLabel: recipient.label,
      fullName: current.fullName,
      company: current.company,
      title,
      format,
      appointmentAt,
      filmingAt,
      preparationUrl,
      bookingUrl,
      nextAction,
      paymentStatus,
      changes: recipient.changes,
      actionRequired: recipient.actionRequired,
      actorEmail: normalizeEmail(actor.email),
    });
    if (queued) notificationsQueued += 1;
  }

  recordEvent(store, orderId, 'passage_updated', 'admin', actor.email || '', {
    changedFields: changes.map((change) => change.field),
    notifications: notificationPlan.recipients.map((recipient) => ({
      type: recipient.type,
      email: recipient.email,
      fields: recipient.changes.map((change) => change.field),
    })),
  });
  store.audit?.(actor.id || 'studio', 'portal_passage_update_v81', 'portal_order', orderId, {
    changedFields: changes.map((change) => change.field),
    notificationsQueued,
  });

  return json({
    ok: true,
    order: { id: orderId, ...next, updatedAt: now },
    changes,
    notificationPlan: {
      mode: 'automatic-by-changed-field',
      recipients: notificationPlan.recipients.map(({ type, label, email, changes: recipientChanges, actionRequired }) => ({
        type,
        label,
        email,
        fields: recipientChanges.map((change) => change.field),
        actionRequired,
      })),
      internalOnly: notificationPlan.internalOnly,
      notificationsQueued,
    },
  });
}

function detectChanges(current, next) {
  const changes = [];
  for (const [field, meta] of Object.entries(FIELD_META)) {
    const before = normalizeComparable(current[field], meta.kind);
    const after = normalizeComparable(next[field], meta.kind);
    if (before === after) continue;
    changes.push({
      field,
      label: meta.label,
      before: displayValue(before, meta.kind, current.currency),
      after: displayValue(after, meta.kind, next.currency),
    });
  }
  return changes;
}

function buildNotificationPlan(store, current, next, changes) {
  const recipients = new Map();
  const clientEmail = normalizeEmail(current.clientEmail);
  const supplierEmail = normalizeEmail(current.supplierEmail || store.env?.STUDIO_SUPPLIER_EMAIL || SUPPLIER_EMAIL);
  const adminEmails = internalEmails(store.env?.PORTAL_INTERNAL_EMAILS || ADMIN_EMAIL);

  const add = (type, label, email, change, actionRequired = false) => {
    if (!email) return;
    const key = `${type}:${email}`;
    if (!recipients.has(key)) recipients.set(key, { type, label, email, changes: [], actionRequired: false });
    const recipient = recipients.get(key);
    if (!recipient.changes.some((item) => item.field === change.field)) recipient.changes.push(change);
    recipient.actionRequired ||= actionRequired;
  };
  const addClient = (change, actionRequired = false) => add('client', 'Client', clientEmail, change, actionRequired);
  const addSupplier = (change, actionRequired = false) => add('supplier', 'Studio fournisseur', supplierEmail, change, actionRequired);
  const addAdmins = (change, actionRequired = false) => {
    for (const email of adminEmails) add('admin', 'Neptune / organisateur', email, change, actionRequired);
  };

  for (const change of changes) {
    if (change.field === 'appointmentAt') {
      addClient(change);
      addAdmins(change);
      continue;
    }
    if (['filmingAt', 'format'].includes(change.field)) {
      addClient(change);
      addAdmins(change);
      addSupplier(change, next.status === 'studio_date_confirmation_pending');
      continue;
    }
    if (['title', 'preparationUrl', 'bookingUrl', 'nextAction'].includes(change.field)) {
      addClient(change);
      addAdmins(change);
      continue;
    }
    if (change.field === 'status') {
      addClient(change, ['payment_confirmed', 'preparation_booking_pending'].includes(next.status));
      addAdmins(change);
      if (SUPPLIER_STATUSES.has(next.status)) addSupplier(change, next.status === 'studio_date_confirmation_pending');
      continue;
    }
    if (change.field === 'paymentStatus') {
      addAdmins(change, ['failed', 'cancelled'].includes(next.paymentStatus));
      if (CLIENT_PAYMENT_NOTICES.has(next.paymentStatus)) addClient(change, ['pending', 'failed', 'cancelled'].includes(next.paymentStatus));
    }
  }

  const list = [...recipients.values()].filter((recipient) => recipient.changes.length);
  return { recipients: list, internalOnly: changes.length > 0 && list.length === 0 };
}

function reconcileWorkflow(store, current, next, changes, now, orderId) {
  const changed = new Set(changes.map((change) => change.field));
  if (changed.has('appointmentAt')) {
    store.sql.exec(
      'UPDATE portal_workflows SET preparation_status=?,updated_at=? WHERE order_id=?',
      next.appointmentAt ? 'booked' : 'to_book',
      now,
      orderId,
    );
  }
  if (changed.has('filmingAt') || changed.has('format') || changed.has('status')) {
    let supplierStatus = current.supplierStatus || 'pending';
    if (!isHorsNorme(next.format)) supplierStatus = 'not_required';
    else if (next.filmingAt && ['filming_scheduled', 'filming_confirmed'].includes(next.status)) supplierStatus = 'confirmed';
    else if (!next.filmingAt) supplierStatus = 'pending';
    store.sql.exec(
      'UPDATE portal_workflows SET requested_filming_at=?,supplier_status=?,supplier_response_at=CASE WHEN ?=\'confirmed\' THEN ? ELSE supplier_response_at END,updated_at=? WHERE order_id=?',
      next.filmingAt,
      supplierStatus,
      supplierStatus,
      now,
      now,
      orderId,
    );
  }
}

function internalEmails(value) {
  const emails = String(value || '')
    .split(/[;,\s]+/u)
    .map(normalizeEmail)
    .filter(Boolean);
  return [...new Set(emails.length ? emails : [ADMIN_EMAIL])];
}

function normalizeComparable(value, kind) {
  if (kind === 'date') return nullableIso(value) || '';
  if (kind === 'money') return String(Number(value || 0));
  return String(value ?? '').trim();
}

function displayValue(value, kind, currency = 'eur') {
  if (!value) return 'Non renseigné';
  if (kind === 'date') {
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? 'Non renseigné'
      : new Intl.DateTimeFormat('fr-FR', {
        dateStyle: 'full',
        timeStyle: 'short',
        timeZone: 'Europe/Paris',
      }).format(date);
  }
  if (kind === 'status') return STATUS_LABELS[value] || value;
  if (kind === 'payment') return PAYMENT_LABELS[value] || value;
  if (kind === 'money') {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: String(currency || 'eur').toUpperCase(),
    }).format(Number(value || 0) / 100);
  }
  if (kind === 'url') return value ? 'Lien mis à jour' : 'Lien supprimé';
  return value;
}

function compactStamp(value) {
  return String(value || '').replace(/\D/gu, '').slice(0, 17);
}
