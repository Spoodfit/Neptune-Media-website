import { DAY, SUPPLIER_EMAIL, SUPPLIER_NAME, safeParse } from './workflow-db-v5.js';
import { syncSteps } from './portal-utils.js';

export const FORMAT_LABELS = {
  hors_norme: 'HORS NORME',
  concept_libre: 'CONCEPT LIBRE',
};
export const DECORS = {
  'hors-norme-chaise-sombre': {
    format: 'hors_norme',
    label: 'Fauteuils · ambiance sombre',
    image: '/assets/studio-decors/hors-norme-chaise-sombre.webp',
  },
  'hors-norme-canape-sombre': {
    format: 'hors_norme',
    label: 'Canapés · ambiance sombre',
    image: '/assets/studio-decors/hors-norme-canape-sombre.webp',
  },
  'concept-libre-plateau-clair': {
    format: 'concept_libre',
    label: 'Plateau central · ambiance claire',
    image: '/assets/studio-decors/concept-libre-plateau-clair.webp',
  },
  'concept-libre-chaise-clair': {
    format: 'concept_libre',
    label: 'Fauteuils · ambiance claire',
    image: '/assets/studio-decors/concept-libre-chaise-clair.webp',
  },
  'concept-libre-canape-clair': {
    format: 'concept_libre',
    label: 'Canapés · ambiance claire',
    image: '/assets/studio-decors/concept-libre-canape-clair.webp',
  },
  'concept-libre-bar-clair': {
    format: 'concept_libre',
    label: 'Plateau bar · ambiance claire',
    image: '/assets/studio-decors/concept-libre-bar-clair.webp',
  },
  'concept-libre-sur-mesure': {
    format: 'concept_libre',
    label: 'Décor sur mesure',
    image: '/assets/studio-decors/concept-libre-sur-mesure.webp',
  },
};

export function applyFilmingDate(store, orderId, finalAt, now) {
  store.sql.exec(`
    UPDATE portal_orders
    SET filming_at=?,status='filming_scheduled',
      next_action='Votre passage est confirmé. Consultez la préparation et les informations pratiques.',
      updated_at=?
    WHERE id=?
  `, finalAt, now, orderId);
  store.sql.exec(`
    UPDATE portal_workflows
    SET requested_filming_at=?,supplier_status='confirmed',
      supplier_response_at=?,updated_at=?
    WHERE order_id=?
  `, finalAt, now, now, orderId);
  syncSteps(store, orderId, 'filming_scheduled', now);
}

export function filmingChangeRules(filmingAt) {
  const filming = new Date(filmingAt || '');
  if (Number.isNaN(filming.getTime())) {
    return {
      allowed: false,
      reason: 'filming_date_not_confirmed',
      deadlineAt: null,
      daysRemaining: null,
    };
  }
  const deadline = new Date(filming.getTime() - 15 * DAY);
  const remainingMs = filming.getTime() - Date.now();
  return {
    allowed: Date.now() <= deadline.getTime(),
    reason: Date.now() <= deadline.getTime() ? null : 'filming_change_notice_too_short',
    deadlineAt: deadline.toISOString(),
    daysRemaining: Math.max(0, Math.floor(remainingMs / DAY)),
  };
}

export function listRequests(store, filters = {}) {
  const clauses = [];
  const params = [];
  if (filters.orderId) {
    clauses.push('r.order_id=?');
    params.push(filters.orderId);
  }
  if (filters.clientId) {
    clauses.push('o.client_id=?');
    params.push(filters.clientId);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  return store.sql.exec(`
    SELECT r.*,o.client_id AS clientId,o.title,o.format,o.status AS orderStatus,
      o.filming_at AS filmingAt,o.appointment_at AS appointmentAt,
      o.preparation_url AS preparationUrl,o.booking_url AS bookingUrl,
      c.email,c.full_name AS fullName,c.company,
      w.supplier_email AS supplierEmail,w.supplier_name AS supplierName
    FROM portal_change_requests r
    JOIN portal_orders o ON o.id=r.order_id
    JOIN portal_clients c ON c.id=o.client_id
    LEFT JOIN portal_workflows w ON w.order_id=o.id
    ${where}
    ORDER BY r.created_at DESC
    LIMIT 250
  `, ...params).toArray().map(decorate);
}

export function getRequest(store, id) {
  const row = getRequestRow(store, id);
  return row ? decorate(row) : null;
}

export function getRequestRow(store, id) {
  const row = store.sql.exec(`
    SELECT r.*,o.client_id AS clientId,o.title,o.format,o.status AS orderStatus,
      o.filming_at AS filmingAt,o.appointment_at AS appointmentAt,
      o.preparation_url AS preparationUrl,o.booking_url AS bookingUrl,
      c.email,c.full_name AS fullName,c.company,
      w.supplier_email AS supplierEmail,w.supplier_name AS supplierName
    FROM portal_change_requests r
    JOIN portal_orders o ON o.id=r.order_id
    JOIN portal_clients c ON c.id=o.client_id
    LEFT JOIN portal_workflows w ON w.order_id=o.id
    WHERE r.id=?
    LIMIT 1
  `, id).toArray()[0];
  if (!row) return null;
  return {
    ...row,
    orderId: row.order_id,
    requestType: row.request_type,
    requestedValue: row.requested_value,
    proposedValue: row.proposed_value,
    targetFormat: row.target_format,
    decorCode: row.decor_code,
    conceptBrief: row.concept_brief,
    supplierTokenExpiresAt: row.supplier_token_expires_at,
    supplierNote: row.supplier_note,
  };
}

export function getRequestRowByToken(store, tokenHash) {
  const row = store.sql.exec(`
    SELECT r.id,r.order_id AS orderId,r.request_type AS requestType,r.status,
      r.requested_value AS requestedValue,r.proposed_value AS proposedValue,
      r.reason,r.target_format AS targetFormat,r.decor_code AS decorCode,
      r.concept_brief AS conceptBrief,r.supplier_token_expires_at AS supplierTokenExpiresAt,
      o.client_id AS clientId,o.title,o.format,o.filming_at AS filmingAt,
      o.appointment_at AS appointmentAt,c.email,c.full_name AS fullName,c.company,
      w.supplier_email AS supplierEmail,w.supplier_name AS supplierName
    FROM portal_change_requests r
    JOIN portal_orders o ON o.id=r.order_id
    JOIN portal_clients c ON c.id=o.client_id
    LEFT JOIN portal_workflows w ON w.order_id=o.id
    WHERE r.supplier_token_hash=?
    LIMIT 1
  `, tokenHash).toArray()[0];
  return row || null;
}

function decorate(row) {
  const requestedValue = safeParse(row.requested_value ?? row.requestedValue);
  const proposedValue = safeParse(row.proposed_value ?? row.proposedValue);
  const requestType = row.request_type ?? row.requestType;
  const targetFormat = row.target_format ?? row.targetFormat;
  const decorCode = row.decor_code ?? row.decorCode;
  return {
    id: row.id,
    orderId: row.order_id ?? row.orderId,
    clientId: row.client_id ?? row.clientId,
    requestType,
    status: row.status,
    requestedValue,
    proposedValue,
    reason: row.reason || '',
    targetFormat,
    targetFormatLabel: FORMAT_LABELS[targetFormat] || targetFormat || '',
    decorCode,
    decorLabel: DECORS[decorCode]?.label || '',
    decorImage: DECORS[decorCode]?.image || '',
    conceptBrief: row.concept_brief ?? row.conceptBrief ?? '',
    supplierNote: row.supplier_note ?? row.supplierNote ?? '',
    supplierResponseAt: row.supplier_response_at ?? row.supplierResponseAt ?? null,
    clientResponseAt: row.client_response_at ?? row.clientResponseAt ?? null,
    title: row.title || '',
    format: row.format || '',
    orderStatus: row.orderStatus || '',
    filmingAt: row.filmingAt || null,
    appointmentAt: row.appointmentAt || null,
    preparationUrl: row.preparationUrl || '',
    bookingUrl: row.bookingUrl || '',
    clientEmail: row.email || '',
    clientName: row.fullName || '',
    company: row.company || '',
    supplierEmail: row.supplierEmail || SUPPLIER_EMAIL,
    supplierName: row.supplierName || SUPPLIER_NAME,
    createdAt: row.created_at ?? row.createdAt,
    updatedAt: row.updated_at ?? row.updatedAt,
  };
}

export function summarize(requests) {
  return {
    total: requests.length,
    pendingNeptune: requests.filter((request) => request.status === 'pending_neptune').length,
    pendingSupplier: requests.filter((request) => request.status === 'pending_supplier').length,
    awaitingClient: requests.filter((request) => request.status === 'supplier_alternate').length,
    completed: requests.filter((request) => ['approved', 'rejected'].includes(request.status)).length,
  };
}

export function decorCatalog() {
  return Object.entries(DECORS).map(([code, decor]) => ({
    code,
    ...decor,
    formatLabel: FORMAT_LABELS[decor.format],
    custom: code === 'concept-libre-sur-mesure',
  }));
}

export function emailPayload(order, extra = {}) {
  return {
    orderId: order.orderId || order.id,
    title: order.title || 'Passage Neptune Media',
    format: order.format || '',
    fullName: order.fullName || order.clientName || '',
    company: order.company || '',
    clientEmail: order.email || order.clientEmail || '',
    filmingAt: order.filmingAt || null,
    appointmentAt: order.appointmentAt || null,
    supplierName: order.supplierName || SUPPLIER_NAME,
    ...extra,
  };
}

export function normalizeFormat(value) {
  const normalized = String(value || '').toLowerCase().replace(/[^a-z]+/gu, '_').replace(/^_|_$/gu, '');
  if (normalized.includes('hors') && normalized.includes('norme')) return 'hors_norme';
  if (normalized.includes('concept') && normalized.includes('libre')) return 'concept_libre';
  return '';
}

export function object(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}
