import { ensurePortalSchema } from './portal-schema.js';
import { json, sanitizeText } from './security.js';
import { requireOperator } from './workflow-db-v5.js';

export const STUDIO_OPERATIONS_RELEASE = 'neptune-studio-operations-20260811-v95';
const TEST_EMAIL = 'contact@neptunebusiness.com';
const INVOICE_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const PAYMENT_STATUSES = new Set(['assigned', 'requested', 'received', 'paid']);

export function ensureStudioOperationsV95Schema(store) {
  ensurePortalSchema(store);
  if (store.studioOperationsV95SchemaReady) return;
  store.sql.exec(`
    CREATE TABLE IF NOT EXISTS portal_media_suppliers_v95(
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL DEFAULT '',
      legal_name TEXT NOT NULL DEFAULT '',
      default_net_cents INTEGER NOT NULL DEFAULT 0,
      vat_rate_bps INTEGER NOT NULL DEFAULT 2000,
      default_gross_cents INTEGER NOT NULL DEFAULT 0,
      notes TEXT NOT NULL DEFAULT '',
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS portal_supplier_finance_v95(
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL REFERENCES portal_orders(id) ON DELETE CASCADE,
      supplier_id TEXT NOT NULL REFERENCES portal_media_suppliers_v95(id) ON DELETE RESTRICT,
      status TEXT NOT NULL DEFAULT 'assigned',
      net_cents INTEGER NOT NULL DEFAULT 0,
      vat_cents INTEGER NOT NULL DEFAULT 0,
      gross_cents INTEGER NOT NULL DEFAULT 0,
      invoice_number TEXT NOT NULL DEFAULT '',
      invoice_url TEXT NOT NULL DEFAULT '',
      requested_at TEXT,
      request_email_id TEXT NOT NULL DEFAULT '',
      received_at TEXT,
      paid_at TEXT,
      payment_reference TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(order_id,supplier_id)
    );
    CREATE TABLE IF NOT EXISTS portal_media_formats_v95(
      id TEXT PRIMARY KEY,
      slug TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      concept TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      duration_label TEXT NOT NULL DEFAULT '',
      price_cents INTEGER NOT NULL DEFAULT 0,
      booking_url TEXT NOT NULL DEFAULT '',
      active INTEGER NOT NULL DEFAULT 1,
      public_order INTEGER NOT NULL DEFAULT 100,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_supplier_finance_order_v95 ON portal_supplier_finance_v95(order_id,created_at);
    CREATE INDEX IF NOT EXISTS idx_supplier_finance_status_v95 ON portal_supplier_finance_v95(status,updated_at);
    CREATE INDEX IF NOT EXISTS idx_media_formats_public_v95 ON portal_media_formats_v95(active,public_order,name);
  `);
  seedDefaults(store);
  store.studioOperationsV95SchemaReady = true;
}

export async function clientAccountV95(store, body = {}) {
  ensureStudioOperationsV95Schema(store);
  const access = await requireOperator(store, body);
  if (!access.ok) return access.response;
  const payload = objectPayload(body);
  const client = resolveClient(store, payload);
  if (!client) return json({ error: 'client_not_found' }, 404);
  const orders = store.sql.exec(`
    SELECT o.id,o.client_id AS clientId,o.title,o.format,o.payment_status AS paymentStatus,o.amount_total AS amountTotal,o.currency,
           o.status,o.appointment_at AS appointmentAt,o.filming_at AS filmingAt,o.booking_url AS bookingUrl,o.next_action AS nextAction,
           o.created_at AS createdAt,o.updated_at AS updatedAt
    FROM portal_orders o WHERE o.client_id=? ORDER BY COALESCE(o.filming_at,o.created_at) DESC,o.created_at DESC
  `, client.id).toArray();
  const finance = store.sql.exec(`
    SELECT f.id,f.order_id AS orderId,f.supplier_id AS supplierId,f.status,f.net_cents AS netCents,f.vat_cents AS vatCents,
           f.gross_cents AS grossCents,f.invoice_number AS invoiceNumber,f.requested_at AS requestedAt,f.received_at AS receivedAt,
           f.paid_at AS paidAt,s.name AS supplierName
    FROM portal_supplier_finance_v95 f JOIN portal_media_suppliers_v95 s ON s.id=f.supplier_id
    WHERE f.order_id IN (SELECT id FROM portal_orders WHERE client_id=?) ORDER BY f.created_at
  `, client.id).toArray();
  return json({ ok: true, release: STUDIO_OPERATIONS_RELEASE, client, orders, finance });
}

export async function configurationV95(store, body = {}, { publicOnly = false } = {}) {
  ensureStudioOperationsV95Schema(store);
  if (!publicOnly) {
    const access = await requireOperator(store, body);
    if (!access.ok) return access.response;
  }
  const formats = store.sql.exec(`
    SELECT id,slug,name,concept,description,duration_label AS durationLabel,price_cents AS priceCents,booking_url AS bookingUrl,
           active,public_order AS publicOrder,created_at AS createdAt,updated_at AS updatedAt
    FROM portal_media_formats_v95 ${publicOnly ? 'WHERE active=1' : ''} ORDER BY public_order,name
  `).toArray().map(normalizeActive);
  if (publicOnly) return json({ ok: true, release: STUDIO_OPERATIONS_RELEASE, formats });
  const suppliers = store.sql.exec(`
    SELECT id,name,email,legal_name AS legalName,default_net_cents AS defaultNetCents,vat_rate_bps AS vatRateBps,
           default_gross_cents AS defaultGrossCents,notes,active,created_at AS createdAt,updated_at AS updatedAt
    FROM portal_media_suppliers_v95 ORDER BY active DESC,name
  `).toArray().map(normalizeActive);
  return json({ ok: true, release: STUDIO_OPERATIONS_RELEASE, suppliers, formats });
}

export async function saveSupplierV95(store, body = {}) {
  ensureStudioOperationsV95Schema(store);
  const access = await requireOperator(store, body);
  if (!access.ok) return access.response;
  const p = objectPayload(body);
  const id = cleanId(p.id) || crypto.randomUUID();
  const name = sanitizeText(p.name, 140);
  if (!name) return json({ error: 'supplier_name_required' }, 400);
  const email = normalizeEmail(p.email);
  const legalName = sanitizeText(p.legalName || name, 180);
  const netCents = clampInt(p.defaultNetCents, 0, 1000000000);
  const vatRateBps = clampInt(p.vatRateBps, 0, 10000);
  const vatCents = Math.round(netCents * vatRateBps / 10000);
  const grossCents = netCents + vatCents;
  const notes = sanitizeText(p.notes, 1200);
  const active = p.active === false || p.active === 0 ? 0 : 1;
  const now = new Date().toISOString();
  const exists = store.sql.exec('SELECT id FROM portal_media_suppliers_v95 WHERE id=? LIMIT 1', id).toArray()[0];
  if (exists) {
    store.sql.exec(`UPDATE portal_media_suppliers_v95 SET name=?,email=?,legal_name=?,default_net_cents=?,vat_rate_bps=?,default_gross_cents=?,notes=?,active=?,updated_at=? WHERE id=?`,
      name, email, legalName, netCents, vatRateBps, grossCents, notes, active, now, id);
  } else {
    store.sql.exec(`INSERT INTO portal_media_suppliers_v95(id,name,email,legal_name,default_net_cents,vat_rate_bps,default_gross_cents,notes,active,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?)`, id, name, email, legalName, netCents, vatRateBps, grossCents, notes, active, now, now);
  }
  store.audit?.(access.actor?.id || 'studio', 'media_supplier_saved_v95', 'supplier', id, { name, active, netCents, vatRateBps });
  return configurationV95(store, body);
}

export async function saveFormatV95(store, body = {}) {
  ensureStudioOperationsV95Schema(store);
  const access = await requireOperator(store, body);
  if (!access.ok) return access.response;
  const p = objectPayload(body);
  const id = cleanId(p.id) || crypto.randomUUID();
  const name = sanitizeText(p.name, 140);
  if (!name) return json({ error: 'format_name_required' }, 400);
  let slug = cleanSlug(p.slug || name);
  if (!slug) slug = `format-${id.slice(0, 8)}`;
  const concept = sanitizeText(p.concept, 180);
  const description = sanitizeText(p.description, 1200);
  const durationLabel = sanitizeText(p.durationLabel, 120);
  const priceCents = clampInt(p.priceCents, 0, 1000000000);
  const bookingUrl = safeHttpUrl(p.bookingUrl);
  const active = p.active === false || p.active === 0 ? 0 : 1;
  const publicOrder = clampInt(p.publicOrder, 0, 9999);
  const now = new Date().toISOString();
  const collision = store.sql.exec('SELECT id FROM portal_media_formats_v95 WHERE slug=? AND id<>? LIMIT 1', slug, id).toArray()[0];
  if (collision) slug = `${slug}-${id.slice(0, 6)}`;
  const exists = store.sql.exec('SELECT id FROM portal_media_formats_v95 WHERE id=? LIMIT 1', id).toArray()[0];
  if (exists) {
    store.sql.exec(`UPDATE portal_media_formats_v95 SET slug=?,name=?,concept=?,description=?,duration_label=?,price_cents=?,booking_url=?,active=?,public_order=?,updated_at=? WHERE id=?`,
      slug, name, concept, description, durationLabel, priceCents, bookingUrl, active, publicOrder, now, id);
  } else {
    store.sql.exec(`INSERT INTO portal_media_formats_v95(id,slug,name,concept,description,duration_label,price_cents,booking_url,active,public_order,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`, id, slug, name, concept, description, durationLabel, priceCents, bookingUrl, active, publicOrder, now, now);
  }
  store.audit?.(access.actor?.id || 'studio', 'media_format_saved_v95', 'media_format', id, { name, active, priceCents });
  return configurationV95(store, body);
}

export async function supplierPaymentContextV95(store, body = {}) {
  ensureStudioOperationsV95Schema(store);
  const access = await requireOperator(store, body);
  if (!access.ok) return access.response;
  const p = objectPayload(body);
  const orderId = cleanId(p.orderId);
  if (!orderId) return json({ error: 'order_required' }, 400);
  const order = resolveOrder(store, orderId);
  if (!order) return json({ error: 'order_not_found' }, 404);
  const suppliers = store.sql.exec(`SELECT id,name,email,legal_name AS legalName,default_net_cents AS defaultNetCents,vat_rate_bps AS vatRateBps,
    default_gross_cents AS defaultGrossCents,active FROM portal_media_suppliers_v95 WHERE active=1 ORDER BY name`).toArray().map(normalizeActive);
  const payments = financeForOrder(store, orderId);
  return json({ ok: true, release: STUDIO_OPERATIONS_RELEASE, order, suppliers, payments });
}

export async function supplierPaymentActionV95(store, body = {}) {
  ensureStudioOperationsV95Schema(store);
  const access = await requireOperator(store, body);
  if (!access.ok) return access.response;
  const p = objectPayload(body);
  const action = sanitizeText(p.action, 80);
  if (action === 'assign') return assignSupplier(store, access, p);
  if (action === 'request_invoice_prepare') return prepareInvoiceRequest(store, p);
  if (action === 'request_invoice_commit') return commitInvoiceRequest(store, access, p);
  if (action === 'mark_received') return markInvoiceReceived(store, access, p);
  if (action === 'mark_paid') return markSupplierPaid(store, access, p);
  return json({ error: 'invalid_supplier_action' }, 400);
}

function assignSupplier(store, access, p) {
  const orderId = cleanId(p.orderId);
  const supplierId = cleanId(p.supplierId);
  const order = resolveOrder(store, orderId);
  const supplier = resolveSupplier(store, supplierId);
  if (!order || !supplier) return json({ error: 'order_or_supplier_not_found' }, 404);
  const current = store.sql.exec('SELECT id,status FROM portal_supplier_finance_v95 WHERE order_id=? AND supplier_id=? LIMIT 1', orderId, supplierId).toArray()[0];
  if (current) return supplierPaymentContextV95(store, { ...p, payload: { orderId }, operatorToken: p.operatorToken, actor: p.actor });
  const now = new Date().toISOString();
  const netCents = Number(supplier.defaultNetCents || 0);
  const vatCents = Math.round(netCents * Number(supplier.vatRateBps || 0) / 10000);
  const grossCents = netCents + vatCents;
  const id = crypto.randomUUID();
  store.sql.exec(`INSERT INTO portal_supplier_finance_v95(id,order_id,supplier_id,status,net_cents,vat_cents,gross_cents,created_at,updated_at)
    VALUES(?,?,?,'assigned',?,?,?,?,?)`, id, orderId, supplierId, netCents, vatCents, grossCents, now, now);
  store.audit?.(access.actor?.id || 'studio', 'supplier_assigned_v95', 'portal_order', orderId, { supplierId, financeId: id, grossCents });
  return json({ ok: true, release: STUDIO_OPERATIONS_RELEASE, payment: financeById(store, id) });
}

function prepareInvoiceRequest(store, p) {
  const payment = financeById(store, cleanId(p.paymentId));
  if (!payment) return json({ error: 'supplier_payment_not_found' }, 404);
  if (payment.status === 'paid') return json({ error: 'supplier_already_paid' }, 409);
  if (!payment.supplierEmail) return json({ error: 'supplier_email_missing' }, 409);
  if (payment.requestedAt) {
    const age = Date.now() - new Date(payment.requestedAt).getTime();
    if (Number.isFinite(age) && age >= 0 && age < INVOICE_COOLDOWN_MS) {
      return json({ ok: true, release: STUDIO_OPERATIONS_RELEASE, suppressed: true, reason: 'invoice_request_cooldown', requestedAt: payment.requestedAt, payment });
    }
  }
  const recipient = normalizeEmail(payment.clientEmail) === TEST_EMAIL ? TEST_EMAIL : normalizeEmail(payment.supplierEmail);
  return json({
    ok: true,
    release: STUDIO_OPERATIONS_RELEASE,
    suppressed: false,
    recipient,
    testRerouted: recipient === TEST_EMAIL && normalizeEmail(payment.supplierEmail) !== TEST_EMAIL,
    payment,
  });
}

function commitInvoiceRequest(store, access, p) {
  const paymentId = cleanId(p.paymentId);
  const current = financeById(store, paymentId);
  if (!current) return json({ error: 'supplier_payment_not_found' }, 404);
  const now = new Date().toISOString();
  const emailId = sanitizeText(p.emailId, 180);
  store.sql.exec(`UPDATE portal_supplier_finance_v95 SET status='requested',requested_at=?,request_email_id=?,updated_at=? WHERE id=?`, now, emailId, now, paymentId);
  store.audit?.(access.actor?.id || 'studio', 'supplier_invoice_requested_v95', 'portal_order', current.orderId, { paymentId, supplierId: current.supplierId, emailId });
  return json({ ok: true, release: STUDIO_OPERATIONS_RELEASE, payment: financeById(store, paymentId) });
}

function markInvoiceReceived(store, access, p) {
  const paymentId = cleanId(p.paymentId);
  const current = financeById(store, paymentId);
  if (!current) return json({ error: 'supplier_payment_not_found' }, 404);
  if (current.status === 'paid') return json({ error: 'supplier_already_paid' }, 409);
  const invoiceNumber = sanitizeText(p.invoiceNumber, 180);
  const invoiceUrl = safeHttpUrl(p.invoiceUrl);
  if (!invoiceNumber && !invoiceUrl) return json({ error: 'invoice_reference_required' }, 400);
  const now = new Date().toISOString();
  store.sql.exec(`UPDATE portal_supplier_finance_v95 SET status='received',invoice_number=?,invoice_url=?,received_at=?,updated_at=? WHERE id=?`, invoiceNumber, invoiceUrl, now, now, paymentId);
  store.audit?.(access.actor?.id || 'studio', 'supplier_invoice_received_v95', 'portal_order', current.orderId, { paymentId, supplierId: current.supplierId, invoiceNumber });
  return json({ ok: true, release: STUDIO_OPERATIONS_RELEASE, payment: financeById(store, paymentId) });
}

function markSupplierPaid(store, access, p) {
  const paymentId = cleanId(p.paymentId);
  const current = financeById(store, paymentId);
  if (!current) return json({ error: 'supplier_payment_not_found' }, 404);
  if (current.status !== 'received') return json({ error: 'supplier_invoice_required_before_payment' }, 409);
  const paymentReference = sanitizeText(p.paymentReference, 220);
  if (!paymentReference) return json({ error: 'payment_reference_required' }, 400);
  const now = new Date().toISOString();
  store.sql.exec(`UPDATE portal_supplier_finance_v95 SET status='paid',paid_at=?,payment_reference=?,updated_at=? WHERE id=?`, now, paymentReference, now, paymentId);
  store.audit?.(access.actor?.id || 'studio', 'supplier_paid_v95', 'portal_order', current.orderId, { paymentId, supplierId: current.supplierId, paymentReference, grossCents: current.grossCents });
  return json({ ok: true, release: STUDIO_OPERATIONS_RELEASE, payment: financeById(store, paymentId) });
}

function resolveClient(store, p) {
  if (cleanId(p.clientId)) return clientByWhere(store, 'c.id=?', cleanId(p.clientId));
  if (normalizeEmail(p.email)) return clientByWhere(store, 'LOWER(c.email)=?', normalizeEmail(p.email));
  if (cleanId(p.orderId)) return clientByWhere(store, 'c.id=(SELECT client_id FROM portal_orders WHERE id=? LIMIT 1)', cleanId(p.orderId));
  return null;
}

function clientByWhere(store, where, value) {
  return store.sql.exec(`SELECT c.id,c.email,c.full_name AS fullName,c.company,c.active,c.created_at AS createdAt,c.updated_at AS updatedAt,c.last_access_at AS lastAccessAt FROM portal_clients c WHERE ${where} LIMIT 1`, value).toArray().map(normalizeActive)[0] || null;
}

function resolveOrder(store, orderId) {
  if (!orderId) return null;
  return store.sql.exec(`SELECT o.id,o.client_id AS clientId,o.title,o.format,o.payment_status AS paymentStatus,o.amount_total AS amountTotal,o.currency,o.status,
    o.appointment_at AS appointmentAt,o.filming_at AS filmingAt,o.created_at AS createdAt,o.updated_at AS updatedAt,
    c.email AS clientEmail,c.full_name AS clientName,c.company AS clientCompany
    FROM portal_orders o JOIN portal_clients c ON c.id=o.client_id WHERE o.id=? LIMIT 1`, orderId).toArray()[0] || null;
}

function resolveSupplier(store, supplierId) {
  if (!supplierId) return null;
  return store.sql.exec(`SELECT id,name,email,legal_name AS legalName,default_net_cents AS defaultNetCents,vat_rate_bps AS vatRateBps,default_gross_cents AS defaultGrossCents,active FROM portal_media_suppliers_v95 WHERE id=? LIMIT 1`, supplierId).toArray().map(normalizeActive)[0] || null;
}

function financeForOrder(store, orderId) {
  return store.sql.exec(`SELECT f.id,f.order_id AS orderId,f.supplier_id AS supplierId,f.status,f.net_cents AS netCents,f.vat_cents AS vatCents,
    f.gross_cents AS grossCents,f.invoice_number AS invoiceNumber,f.invoice_url AS invoiceUrl,f.requested_at AS requestedAt,
    f.request_email_id AS requestEmailId,f.received_at AS receivedAt,f.paid_at AS paidAt,f.payment_reference AS paymentReference,
    s.name AS supplierName,s.email AS supplierEmail,s.legal_name AS supplierLegalName,s.vat_rate_bps AS vatRateBps
    FROM portal_supplier_finance_v95 f JOIN portal_media_suppliers_v95 s ON s.id=f.supplier_id WHERE f.order_id=? ORDER BY f.created_at`, orderId).toArray();
}

function financeById(store, id) {
  if (!id) return null;
  return store.sql.exec(`SELECT f.id,f.order_id AS orderId,f.supplier_id AS supplierId,f.status,f.net_cents AS netCents,f.vat_cents AS vatCents,
    f.gross_cents AS grossCents,f.invoice_number AS invoiceNumber,f.invoice_url AS invoiceUrl,f.requested_at AS requestedAt,
    f.request_email_id AS requestEmailId,f.received_at AS receivedAt,f.paid_at AS paidAt,f.payment_reference AS paymentReference,
    s.name AS supplierName,s.email AS supplierEmail,s.legal_name AS supplierLegalName,s.vat_rate_bps AS vatRateBps,
    o.title AS orderTitle,o.format AS orderFormat,c.email AS clientEmail,c.full_name AS clientName,c.company AS clientCompany
    FROM portal_supplier_finance_v95 f JOIN portal_media_suppliers_v95 s ON s.id=f.supplier_id
    JOIN portal_orders o ON o.id=f.order_id JOIN portal_clients c ON c.id=o.client_id WHERE f.id=? LIMIT 1`, id).toArray()[0] || null;
}

function seedDefaults(store) {
  const now = new Date().toISOString();
  const recbox = store.sql.exec("SELECT id FROM portal_media_suppliers_v95 WHERE id='recbox' LIMIT 1").toArray()[0];
  if (!recbox) {
    store.sql.exec(`INSERT INTO portal_media_suppliers_v95(id,name,email,legal_name,default_net_cents,vat_rate_bps,default_gross_cents,notes,active,created_at,updated_at)
      VALUES('recbox','RECBOX','contact@recbox.fr','RECBOX',60000,2000,72000,'Studio fournisseur Neptune Media',1,?,?)`, now, now);
  }
  const formatCount = Number(store.sql.exec('SELECT COUNT(*) AS n FROM portal_media_formats_v95').toArray()[0]?.n || 0);
  if (!formatCount) {
    store.sql.exec(`INSERT INTO portal_media_formats_v95(id,slug,name,concept,description,duration_label,price_cents,booking_url,active,public_order,created_at,updated_at)
      VALUES('format-hors-norme','hors-norme','Hors Norme','Émission Neptune Business','Un passage éditorial structuré pour produire un contenu long et ses déclinaisons courtes.','',0,'',1,10,?,?)`, now, now);
    store.sql.exec(`INSERT INTO portal_media_formats_v95(id,slug,name,concept,description,duration_label,price_cents,booking_url,active,public_order,created_at,updated_at)
      VALUES('format-libre','libre','Libre','Format libre','Un format configurable pour les concepts Neptune Media qui ne relèvent pas de Hors Norme.','',0,'',1,20,?,?)`, now, now);
  }
}

function objectPayload(body) {
  return body?.payload && typeof body.payload === 'object' ? body.payload : body || {};
}
function normalizeEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email) ? email.slice(0, 254) : '';
}
function cleanId(value) { return String(value || '').trim().replace(/[^A-Za-z0-9_.:-]+/gu, '').slice(0, 120); }
function cleanSlug(value) { return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/gu, '').toLowerCase().replace(/[^a-z0-9]+/gu, '-').replace(/^-+|-+$/gu, '').slice(0, 100); }
function clampInt(value, min, max) { const n = Math.round(Number(value || 0)); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : min; }
function safeHttpUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try { const url = new URL(raw); return ['http:', 'https:'].includes(url.protocol) ? url.toString().slice(0, 1000) : ''; } catch { return ''; }
}
function normalizeActive(row) { return row ? { ...row, active: Boolean(Number(row.active)) } : row; }

export function validSupplierPaymentStatusV95(value) { return PAYMENT_STATUSES.has(String(value || '')); }
