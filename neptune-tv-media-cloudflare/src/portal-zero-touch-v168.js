import { ensureSalesTunnelOptionsV96Schema } from './portal-sales-tunnel-options-v96.js';
import { ensureManualWorkflowForOrder } from './portal-manual-scheduling-v85.js';
import { supplierRespond as supplierRespondLegacy } from './portal-workflow-v5.js';
import { syncSteps } from './portal-utils.js';
import {
  SUPPLIER_EMAIL,
  SUPPLIER_NAME,
  ensureWorkflowSchema,
  getWorkflow,
  isHorsNorme,
  normalizeEmail,
  queueEmail,
  recordEvent,
  safeParse,
} from './workflow-db-v5.js';
import { json, randomToken, sanitizeText, sha256 } from './security.js';

export const ZERO_TOUCH_V168_RELEASE = 'neptune-zero-touch-20260901-v168';
const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const EARLY_STATUSES = new Set([
  'reservation_confirmed',
  'preparation_booking_pending',
  'appointment_booked',
  'studio_date_confirmation_pending',
]);

export function ensureZeroTouchV168Schema(store) {
  ensureSalesTunnelOptionsV96Schema(store);
  ensureWorkflowSchema(store);
  if (store.zeroTouchV168Ready) return;
  store.sql.exec(`
    CREATE TABLE IF NOT EXISTS portal_zero_touch_exceptions_v168(
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL,
      exception_type TEXT NOT NULL,
      detail TEXT NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'open',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      resolved_at TEXT,
      UNIQUE(order_id,exception_type)
    );
    CREATE INDEX IF NOT EXISTS idx_zero_touch_exceptions_v168_status
      ON portal_zero_touch_exceptions_v168(status,updated_at DESC);
  `);
  store.zeroTouchV168Ready = true;
}

export async function materializePaidOrderV168(store, raw = {}) {
  ensureZeroTouchV168Schema(store);
  const orderId = sanitizeText(raw.orderId || raw.order_id, 100);
  if (!orderId) return { ok: false, skipped: true, reason: 'order_required' };

  const order = store.sql.exec(`
    SELECT o.id,o.format,o.status,o.payment_status AS paymentStatus,o.next_action AS nextAction,
           c.email AS clientEmail
    FROM portal_orders o JOIN portal_clients c ON c.id=o.client_id
    WHERE o.id=? LIMIT 1
  `, orderId).toArray()[0];
  if (!order) return { ok: false, skipped: true, reason: 'order_not_found', orderId };
  if (String(order.paymentStatus || '').toLowerCase() !== 'paid') {
    return { ok: true, skipped: true, reason: 'order_not_paid', orderId };
  }

  const selection = store.sql.exec(`
    SELECT p.id AS prospectId,p.source,p.updated_at AS prospectUpdatedAt,
           i.city_id AS cityId,i.format_id AS formatId,i.offer_id AS offerId,
           i.requested_date AS requestedDate,i.requested_daypart AS requestedDaypart,
           rc.configuration_choice AS configurationChoice
    FROM portal_prospects p
    LEFT JOIN portal_reservation_intents_v96 i ON i.prospect_id=p.id
    LEFT JOIN portal_reservation_configuration_v96 rc ON rc.prospect_id=p.id
    WHERE p.order_id=? AND p.status='paid'
    ORDER BY p.updated_at DESC LIMIT 1
  `, orderId).toArray()[0];

  if (!selection) return { ok: true, skipped: true, reason: 'not_tunnel_order', orderId };
  if (!selection.offerId) {
    openException(store, orderId, 'paid_tunnel_order_missing_offer', { prospectId: selection.prospectId });
    return { ok: false, orderId, reason: 'paid_tunnel_order_missing_offer' };
  }

  const offer = store.sql.exec(`
    SELECT o.id,o.city_id AS cityId,o.format_id AS formatId,o.supplier_id AS supplierId,
           o.name AS offerName,o.client_price_cents AS clientPriceCents,o.currency,
           o.supplier_net_cents AS supplierNetCents,o.supplier_gross_cents AS supplierGrossCents,
           c.name AS cityName,f.name AS formatName,f.slug AS formatSlug,
           s.name AS supplierName,s.email AS supplierEmail
    FROM portal_media_offers_v96 o
    JOIN portal_media_cities_v96 c ON c.id=o.city_id
    JOIN portal_media_formats_v95 f ON f.id=o.format_id
    JOIN portal_media_suppliers_v95 s ON s.id=o.supplier_id
    WHERE o.id=? LIMIT 1
  `, selection.offerId).toArray()[0];
  if (!offer) {
    openException(store, orderId, 'paid_tunnel_order_offer_unavailable', { offerId: selection.offerId });
    return { ok: false, orderId, reason: 'paid_tunnel_order_offer_unavailable' };
  }

  const now = new Date().toISOString();
  let changed = false;
  changed = upsertSalesSnapshot(store, orderId, selection, offer, now) || changed;
  changed = ensureSupplierFinance(store, orderId, offer, now) || changed;

  let workflow = getWorkflow(store, orderId);
  if (!workflow) {
    const created = ensureManualWorkflowForOrder(store, orderId, {
      sourceType: 'stripe_zero_touch_v168',
      filmingConfirmed: false,
      supplierEmail: offer.supplierEmail,
      supplierName: offer.supplierName,
    });
    changed = Boolean(created?.workflowCreated) || changed;
    workflow = getWorkflow(store, orderId);
  }

  const supplierEmail = normalizeEmail(offer.supplierEmail || store.env?.STUDIO_SUPPLIER_EMAIL || SUPPLIER_EMAIL);
  const supplierName = sanitizeText(offer.supplierName || store.env?.STUDIO_SUPPLIER_NAME || SUPPLIER_NAME, 160) || SUPPLIER_NAME;
  if (workflow && (workflow.supplierEmail !== supplierEmail || workflow.supplierName !== supplierName)) {
    store.sql.exec(`UPDATE portal_workflows SET supplier_email=?,supplier_name=?,updated_at=? WHERE order_id=?`,
      supplierEmail, supplierName, now, orderId);
    changed = true;
    workflow = getWorkflow(store, orderId);
  }

  const preference = {
    requestedDate: selection.requestedDate || '',
    requestedDaypart: selection.requestedDaypart || '',
    requestedDaypartLabel: daypartLabel(selection.requestedDaypart),
    configurationChoice: selection.configurationChoice || '',
    cityName: offer.cityName || '',
    formatName: offer.formatName || order.format || '',
    offerName: offer.offerName || '',
    supplierName,
    zeroTouchRelease: ZERO_TOUCH_V168_RELEASE,
  };

  if (isHorsNorme(order.format || offer.formatName)) {
    if (EARLY_STATUSES.has(String(order.status || '')) && order.status !== 'studio_date_confirmation_pending') {
      const nextAction = selection.requestedDate
        ? 'Votre préférence de passage est transmise au studio. Il confirme l’heure exacte ; vous pouvez réserver votre préparation en parallèle.'
        : 'Le studio doit confirmer votre passage. Vous pouvez réserver votre préparation en parallèle.';
      store.sql.exec(`UPDATE portal_orders SET status='studio_date_confirmation_pending',next_action=?,updated_at=? WHERE id=?`, nextAction, now, orderId);
      syncSteps(store, orderId, 'studio_date_confirmation_pending', now);
      changed = true;
    }

    workflow = getWorkflow(store, orderId);
    if (workflow && !['confirmed', 'not_required'].includes(String(workflow.supplierStatus || ''))) {
      const tokenState = await ensureSupplierConfirmationToken(store, orderId, supplierEmail, preference);
      changed = tokenState.changed || changed;
    }
  }

  if (!emailFamilyExists(store, orderId, 'client_payment_received')) {
    queueEmail(store, orderId, 'client_payment_received_v168', 'client', order.clientEmail, preference);
    changed = true;
  }
  if (!emailFamilyExists(store, orderId, 'admin_new_booking')) {
    queueEmail(store, orderId, 'admin_new_booking_v168', 'admin', 'contact@neptunebusiness.com', preference);
    changed = true;
  }

  resolveException(store, orderId, 'paid_tunnel_order_missing_offer');
  resolveException(store, orderId, 'paid_tunnel_order_offer_unavailable');
  resolveException(store, orderId, 'zero_touch_materialization_failed');

  if (changed && !eventExists(store, orderId, 'zero_touch_materialized_v168')) {
    recordEvent(store, orderId, 'zero_touch_materialized_v168', 'system', '', {
      prospectId: selection.prospectId,
      offerId: offer.id,
      supplierId: offer.supplierId,
      requestedDate: selection.requestedDate || '',
      requestedDaypart: selection.requestedDaypart || '',
      configurationChoice: selection.configurationChoice || '',
      release: ZERO_TOUCH_V168_RELEASE,
    });
  }

  return {
    ok: true,
    orderId,
    changed,
    prospectId: selection.prospectId,
    supplierId: offer.supplierId,
    requestedDate: selection.requestedDate || '',
    requestedDaypart: selection.requestedDaypart || '',
    release: ZERO_TOUCH_V168_RELEASE,
  };
}

export async function reconcilePaidOrdersV168(store, raw = {}) {
  ensureZeroTouchV168Schema(store);
  const limit = Math.max(1, Math.min(80, Number(raw.limit || 40)));
  const ids = new Set();

  for (const row of store.sql.exec(`
    SELECT p.order_id AS orderId
    FROM portal_prospects p
    JOIN portal_orders o ON o.id=p.order_id
    LEFT JOIN portal_order_sales_v96 s ON s.order_id=p.order_id
    WHERE p.status='paid' AND p.order_id IS NOT NULL AND o.payment_status='paid' AND s.order_id IS NULL
    ORDER BY p.updated_at DESC LIMIT ?
  `, limit).toArray()) if (row.orderId) ids.add(row.orderId);

  for (const row of store.sql.exec(`
    SELECT s.order_id AS orderId
    FROM portal_order_sales_v96 s
    JOIN portal_orders o ON o.id=s.order_id
    LEFT JOIN portal_supplier_finance_v95 f ON f.order_id=s.order_id AND f.supplier_id=s.supplier_id
    WHERE o.payment_status='paid' AND s.supplier_id<>'' AND f.id IS NULL
    ORDER BY s.updated_at DESC LIMIT ?
  `, limit).toArray()) if (row.orderId) ids.add(row.orderId);

  for (const row of store.sql.exec(`
    SELECT w.order_id AS orderId
    FROM portal_workflows w
    JOIN portal_orders o ON o.id=w.order_id
    JOIN portal_prospects p ON p.order_id=o.id AND p.status='paid'
    WHERE o.payment_status='paid' AND w.supplier_status='pending'
      AND (w.supplier_token_hash IS NULL OR w.supplier_token_hash='' OR w.supplier_token_expires_at IS NULL OR w.supplier_token_expires_at<=?)
    ORDER BY w.updated_at DESC LIMIT ?
  `, new Date().toISOString(), limit).toArray()) if (row.orderId) ids.add(row.orderId);

  const results = [];
  for (const orderId of [...ids].slice(0, limit)) {
    try {
      results.push(await materializePaidOrderV168(store, { orderId }));
    } catch (error) {
      openException(store, orderId, 'zero_touch_materialization_failed', safeError(error));
      results.push({ ok: false, orderId, reason: 'zero_touch_materialization_failed' });
    }
  }
  await stabilizeSupplierTokensV168(store);
  return {
    ok: true,
    release: ZERO_TOUCH_V168_RELEASE,
    scanned: ids.size,
    processed: results.length,
    changed: results.filter((item) => item?.changed).length,
    failed: results.filter((item) => item?.ok === false).length,
  };
}

export async function supplierContextV168(store, token) {
  ensureZeroTouchV168Schema(store);
  const raw = String(token || '');
  if (!raw) return json({ error: 'invalid_or_expired_token' }, 404);
  const hash = await sha256(raw);
  const row = store.sql.exec(`
    SELECT w.order_id AS orderId,w.requested_filming_at AS requestedFilmingAt,
           w.supplier_status AS supplierStatus,w.supplier_name AS supplierName,
           w.supplier_token_expires_at AS tokenExpiresAt,w.supplier_response_at AS supplierResponseAt,
           o.title,o.format,c.full_name AS fullName,c.company,
           s.requested_date AS requestedDate,s.requested_daypart AS requestedDaypart,
           rc.configuration_choice AS configurationChoice
    FROM portal_workflows w
    JOIN portal_orders o ON o.id=w.order_id
    JOIN portal_clients c ON c.id=o.client_id
    LEFT JOIN portal_order_sales_v96 s ON s.order_id=o.id
    LEFT JOIN portal_reservation_configuration_v96 rc ON rc.prospect_id=s.prospect_id
    WHERE w.supplier_token_hash=? LIMIT 1
  `, hash).toArray()[0];
  if (!row || !row.tokenExpiresAt || row.tokenExpiresAt <= new Date().toISOString()) {
    return json({ error: 'invalid_or_expired_token' }, 404);
  }
  return json({
    ok: true,
    release: ZERO_TOUCH_V168_RELEASE,
    booking: {
      ...row,
      requestedDate: row.requestedDate || dateKeyFromIso(row.requestedFilmingAt),
      requestedDaypart: row.requestedDaypart || '',
      requestedDaypartLabel: daypartLabel(row.requestedDaypart),
      configurationChoice: row.configurationChoice || '',
      needsConfirmedTime: !validIso(row.requestedFilmingAt) && Boolean(row.requestedDate),
    },
  });
}

export async function supplierRespondV168(store, body = {}) {
  ensureZeroTouchV168Schema(store);
  const token = String(body.token || '');
  const decision = sanitizeText(body.decision, 40);
  if (!token || !['confirm', 'alternate', 'reject'].includes(decision)) {
    return json({ error: 'invalid_response' }, 400);
  }

  if (decision !== 'confirm') return supplierRespondLegacy(store, body);

  const hash = await sha256(token);
  const row = store.sql.exec(`
    SELECT w.order_id AS orderId,w.requested_filming_at AS requestedFilmingAt,
           w.supplier_token_expires_at AS tokenExpiresAt,s.requested_date AS requestedDate
    FROM portal_workflows w
    LEFT JOIN portal_order_sales_v96 s ON s.order_id=w.order_id
    WHERE w.supplier_token_hash=? LIMIT 1
  `, hash).toArray()[0];
  if (!row || !row.tokenExpiresAt || row.tokenExpiresAt <= new Date().toISOString()) {
    return json({ error: 'invalid_or_expired_token' }, 404);
  }

  const confirmedAt = validIso(body.confirmedAt || body.confirmed_at || row.requestedFilmingAt);
  if (!confirmedAt) return json({ error: 'confirmed_time_required' }, 400);
  if (row.requestedDate && parisDateKey(confirmedAt) !== row.requestedDate) {
    return json({ error: 'confirmed_date_must_match_requested_date' }, 409);
  }

  if (confirmedAt !== validIso(row.requestedFilmingAt)) {
    const now = new Date().toISOString();
    store.sql.exec('UPDATE portal_workflows SET requested_filming_at=?,updated_at=? WHERE order_id=?', confirmedAt, now, row.orderId);
  }
  return supplierRespondLegacy(store, { ...body, confirmedAt });
}

export async function activateSupplierTokenForEmailV168(store, raw = {}) {
  ensureZeroTouchV168Schema(store);
  const item = raw.item && typeof raw.item === 'object' ? raw.item : raw;
  const orderId = sanitizeText(item.orderId || item.order_id, 100);
  const messageKey = String(item.messageKey || item.message_key || '');
  const payload = item.payload && typeof item.payload === 'object' ? item.payload : safeParse(item.payload);
  const token = String(payload?.supplierToken || '');
  const expiresAt = String(payload?.tokenExpiresAt || '');
  if (!orderId || !messageKey.startsWith('supplier_date_confirmation') || token.length < 24 || expiresAt <= new Date().toISOString()) {
    return { ok: true, skipped: true, release: ZERO_TOUCH_V168_RELEASE };
  }
  const workflow = store.sql.exec(`SELECT supplier_status AS supplierStatus,supplier_token_hash AS tokenHash,supplier_token_expires_at AS tokenExpiresAt FROM portal_workflows WHERE order_id=? LIMIT 1`, orderId).toArray()[0];
  if (!workflow || workflow.supplierStatus !== 'pending') return { ok: true, skipped: true, release: ZERO_TOUCH_V168_RELEASE };
  const expectedHash = await sha256(token);
  if (workflow.tokenHash === expectedHash && workflow.tokenExpiresAt === expiresAt) return { ok: true, changed: false, release: ZERO_TOUCH_V168_RELEASE };
  store.sql.exec(`UPDATE portal_workflows SET supplier_token_hash=?,supplier_token_expires_at=?,updated_at=? WHERE order_id=?`, expectedHash, expiresAt, new Date().toISOString(), orderId);
  return { ok: true, changed: true, orderId, release: ZERO_TOUCH_V168_RELEASE };
}

export async function stabilizeSupplierTokensV168(store) {
  ensureZeroTouchV168Schema(store);
  const rows = store.sql.exec(`
    SELECT w.order_id AS orderId,w.supplier_token_hash AS tokenHash,w.supplier_token_expires_at AS tokenExpiresAt,
           s.requested_date AS requestedDate,s.requested_daypart AS requestedDaypart,
           rc.configuration_choice AS configurationChoice
    FROM portal_workflows w
    LEFT JOIN portal_order_sales_v96 s ON s.order_id=w.order_id
    LEFT JOIN portal_reservation_configuration_v96 rc ON rc.prospect_id=s.prospect_id
    WHERE w.supplier_status='pending'
    ORDER BY w.updated_at DESC LIMIT 60
  `).toArray();

  let repaired = 0;
  for (const row of rows) {
    const preference = {
      requestedDate: row.requestedDate || '',
      requestedDaypart: row.requestedDaypart || '',
      requestedDaypartLabel: daypartLabel(row.requestedDaypart),
      configurationChoice: row.configurationChoice || '',
      zeroTouchRelease: ZERO_TOUCH_V168_RELEASE,
    };
    enrichPendingSupplierEmails(store, row.orderId, preference);
    const tokenState = latestUsableSupplierToken(store, row.orderId);
    if (!tokenState) continue;
    const expectedHash = await sha256(tokenState.token);
    if (expectedHash !== row.tokenHash || tokenState.expiresAt !== row.tokenExpiresAt) {
      store.sql.exec(`UPDATE portal_workflows SET supplier_token_hash=?,supplier_token_expires_at=?,updated_at=? WHERE order_id=?`,
        expectedHash, tokenState.expiresAt, new Date().toISOString(), row.orderId);
      repaired += 1;
    }
  }
  return { ok: true, repaired, release: ZERO_TOUCH_V168_RELEASE };
}

function upsertSalesSnapshot(store, orderId, selection, offer, now) {
  const desired = {
    prospectId: selection.prospectId || '',
    cityId: offer.cityId || '',
    formatId: offer.formatId || '',
    offerId: offer.id || '',
    supplierId: offer.supplierId || '',
    cityName: offer.cityName || '',
    formatName: offer.formatName || '',
    offerName: offer.offerName || '',
    supplierName: offer.supplierName || '',
    clientPriceCents: Number(offer.clientPriceCents || 0),
    currency: String(offer.currency || 'eur'),
    requestedDate: selection.requestedDate || '',
    requestedDaypart: selection.requestedDaypart || '',
  };
  const current = store.sql.exec(`
    SELECT prospect_id AS prospectId,city_id AS cityId,format_id AS formatId,offer_id AS offerId,supplier_id AS supplierId,
           city_name AS cityName,format_name AS formatName,offer_name AS offerName,supplier_name AS supplierName,
           client_price_cents AS clientPriceCents,currency,requested_date AS requestedDate,requested_daypart AS requestedDaypart
    FROM portal_order_sales_v96 WHERE order_id=? LIMIT 1
  `, orderId).toArray()[0];
  if (current && sameSalesSnapshot(current, desired)) return false;
  if (!current) {
    store.sql.exec(`
      INSERT INTO portal_order_sales_v96(order_id,prospect_id,city_id,format_id,offer_id,supplier_id,city_name,format_name,offer_name,supplier_name,client_price_cents,currency,requested_date,requested_daypart,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `, orderId, desired.prospectId, desired.cityId, desired.formatId, desired.offerId, desired.supplierId,
    desired.cityName, desired.formatName, desired.offerName, desired.supplierName, desired.clientPriceCents,
    desired.currency, desired.requestedDate, desired.requestedDaypart, now, now);
  } else {
    store.sql.exec(`
      UPDATE portal_order_sales_v96 SET prospect_id=?,city_id=?,format_id=?,offer_id=?,supplier_id=?,city_name=?,format_name=?,offer_name=?,supplier_name=?,client_price_cents=?,currency=?,requested_date=?,requested_daypart=?,updated_at=?
      WHERE order_id=?
    `, desired.prospectId, desired.cityId, desired.formatId, desired.offerId, desired.supplierId,
    desired.cityName, desired.formatName, desired.offerName, desired.supplierName, desired.clientPriceCents,
    desired.currency, desired.requestedDate, desired.requestedDaypart, now, orderId);
  }
  return true;
}

function sameSalesSnapshot(current, desired) {
  return ['prospectId','cityId','formatId','offerId','supplierId','cityName','formatName','offerName','supplierName','currency','requestedDate','requestedDaypart']
    .every((key) => String(current?.[key] || '') === String(desired?.[key] || ''))
    && Number(current?.clientPriceCents || 0) === Number(desired.clientPriceCents || 0);
}

function ensureSupplierFinance(store, orderId, offer, now) {
  if (!offer.supplierId) return false;
  const current = store.sql.exec('SELECT id FROM portal_supplier_finance_v95 WHERE order_id=? AND supplier_id=? LIMIT 1', orderId, offer.supplierId).toArray()[0];
  if (current) return false;
  const net = Math.max(0, Number(offer.supplierNetCents || 0));
  const gross = Math.max(net, Number(offer.supplierGrossCents || 0));
  store.sql.exec(`
    INSERT INTO portal_supplier_finance_v95(id,order_id,supplier_id,status,net_cents,vat_cents,gross_cents,created_at,updated_at)
    VALUES(?,?,?,'assigned',?,?,?,?,?)
  `, crypto.randomUUID(), orderId, offer.supplierId, net, Math.max(0, gross - net), gross, now, now);
  return true;
}

async function ensureSupplierConfirmationToken(store, orderId, supplierEmail, preference) {
  enrichPendingSupplierEmails(store, orderId, preference);
  const usable = latestUsableSupplierToken(store, orderId);
  if (usable) {
    const workflow = store.sql.exec(`SELECT supplier_token_hash AS tokenHash,supplier_token_expires_at AS tokenExpiresAt FROM portal_workflows WHERE order_id=? LIMIT 1`, orderId).toArray()[0] || {};
    const expectedHash = await sha256(usable.token);
    if (workflow.tokenHash !== expectedHash || workflow.tokenExpiresAt !== usable.expiresAt) {
      store.sql.exec(`UPDATE portal_workflows SET supplier_status='pending',supplier_token_hash=?,supplier_token_expires_at=?,updated_at=? WHERE order_id=?`,
        expectedHash, usable.expiresAt, new Date().toISOString(), orderId);
      return { changed: true, reused: true };
    }
    return { changed: false, reused: true };
  }

  const token = randomToken(32);
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS).toISOString();
  store.sql.exec(`UPDATE portal_workflows SET supplier_status='pending',supplier_token_hash=?,supplier_token_expires_at=?,updated_at=? WHERE order_id=?`,
    await sha256(token), expiresAt, new Date().toISOString(), orderId);
  const key = `supplier_date_confirmation_v168_${new Date().toISOString().slice(0, 10)}`;
  queueEmail(store, orderId, key, 'supplier', supplierEmail || SUPPLIER_EMAIL, {
    ...preference,
    supplierToken: token,
    tokenExpiresAt: expiresAt,
  });
  return { changed: true, reused: false };
}

function latestUsableSupplierToken(store, orderId) {
  const rows = store.sql.exec(`
    SELECT status,payload,created_at AS createdAt
    FROM portal_email_outbox
    WHERE order_id=? AND recipient_type='supplier' AND message_key LIKE 'supplier_date_confirmation%'
      AND status IN ('sent','pending','failed')
    ORDER BY created_at DESC LIMIT 12
  `, orderId).toArray().map((row) => ({ ...row, payload: safeParse(row.payload) }));
  const valid = (row) => {
    const token = String(row?.payload?.supplierToken || '');
    const expiresAt = String(row?.payload?.tokenExpiresAt || '');
    return token.length >= 24 && expiresAt > new Date().toISOString();
  };
  const chosen = rows.find((row) => row.status === 'sent' && valid(row)) || rows.find((row) => valid(row));
  return chosen ? { token: chosen.payload.supplierToken, expiresAt: chosen.payload.tokenExpiresAt } : null;
}

function enrichPendingSupplierEmails(store, orderId, preference) {
  const rows = store.sql.exec(`
    SELECT id,payload FROM portal_email_outbox
    WHERE order_id=? AND recipient_type='supplier' AND message_key LIKE 'supplier_date_confirmation%'
      AND status IN ('pending','failed')
  `, orderId).toArray();
  const now = new Date().toISOString();
  for (const row of rows) {
    const current = safeParse(row.payload);
    const next = {
      ...current,
      ...(preference.requestedDate && !current.requestedDate ? { requestedDate: preference.requestedDate } : {}),
      ...(preference.requestedDaypart && !current.requestedDaypart ? { requestedDaypart: preference.requestedDaypart } : {}),
      ...(preference.requestedDaypartLabel && !current.requestedDaypartLabel ? { requestedDaypartLabel: preference.requestedDaypartLabel } : {}),
      ...(preference.configurationChoice && !current.configurationChoice ? { configurationChoice: preference.configurationChoice } : {}),
      zeroTouchRelease: ZERO_TOUCH_V168_RELEASE,
    };
    if (JSON.stringify(next) !== JSON.stringify(current)) {
      store.sql.exec('UPDATE portal_email_outbox SET payload=?,updated_at=? WHERE id=?', JSON.stringify(next), now, row.id);
    }
  }
}

function emailFamilyExists(store, orderId, prefix) {
  return Boolean(store.sql.exec('SELECT id FROM portal_email_outbox WHERE order_id=? AND substr(message_key,1,?)=? LIMIT 1', orderId, prefix.length, prefix).toArray()[0]);
}

function eventExists(store, orderId, key) {
  return Boolean(store.sql.exec('SELECT id FROM portal_workflow_events WHERE order_id=? AND event_key=? LIMIT 1', orderId, key).toArray()[0]);
}

function openException(store, orderId, type, detail = {}) {
  const encoded = JSON.stringify(detail || {});
  const current = store.sql.exec(`SELECT id,status,detail FROM portal_zero_touch_exceptions_v168 WHERE order_id=? AND exception_type=? LIMIT 1`, orderId, type).toArray()[0];
  if (current?.status === 'open' && String(current.detail || '{}') === encoded) return;
  const now = new Date().toISOString();
  if (!current) {
    store.sql.exec(`INSERT INTO portal_zero_touch_exceptions_v168(id,order_id,exception_type,detail,status,created_at,updated_at,resolved_at) VALUES(?,?,?,?,'open',?,?,NULL)`, crypto.randomUUID(), orderId, type, encoded, now, now);
    return;
  }
  store.sql.exec(`UPDATE portal_zero_touch_exceptions_v168 SET detail=?,status='open',updated_at=?,resolved_at=NULL WHERE id=?`, encoded, now, current.id);
}

function resolveException(store, orderId, type) {
  const row = store.sql.exec(`SELECT id,status FROM portal_zero_touch_exceptions_v168 WHERE order_id=? AND exception_type=? LIMIT 1`, orderId, type).toArray()[0];
  if (!row || row.status === 'resolved') return;
  const now = new Date().toISOString();
  store.sql.exec(`UPDATE portal_zero_touch_exceptions_v168 SET status='resolved',resolved_at=?,updated_at=? WHERE id=?`, now, now, row.id);
}

function daypartLabel(value) {
  return ({ morning: 'Matin', afternoon: 'Après-midi', flexible: 'Horaire flexible' })[String(value || '')] || '';
}

function validIso(value) {
  const date = new Date(value || '');
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function dateKeyFromIso(value) {
  const iso = validIso(value);
  return iso ? parisDateKey(iso) : '';
}

function parisDateKey(value) {
  const date = new Date(value || '');
  if (Number.isNaN(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function safeError(error) {
  return {
    name: String(error?.name || 'Error').slice(0, 120),
    message: String(error?.message || error || 'unknown').slice(0, 500),
  };
}
