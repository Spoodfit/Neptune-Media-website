import { ensurePortalSchema } from './portal-schema.js';
import { syncSteps, normalizeEmail } from './portal-utils.js';
import { json, randomToken, sanitizeText, sha256 } from './security.js';
import {
  ADMIN_EMAIL,
  ensureWorkflowSchema,
  isHorsNorme,
  recordEvent,
  requireOperator,
} from './workflow-db-v5.js';
import { ensureManualWorkflowForOrder } from './portal-manual-scheduling-v85.js';

const ACTION_TOKEN_TTL_MS = 14 * 24 * 60 * 60 * 1000;
const MESSAGE_COOLDOWN_MS = 2 * 60 * 60 * 1000;
const FINISHED = new Set(['delivered', 'completed']);
const PAID = new Set(['paid', 'succeeded', 'complete', 'completed', 'no_payment_required']);

export function ensureCrmV86Schema(store) {
  ensurePortalSchema(store);
  ensureWorkflowSchema(store);
  if (store.crmV86SchemaReady) return;
  store.sql.exec(`
    CREATE TABLE IF NOT EXISTS portal_crm_opportunities_v86(
      id TEXT PRIMARY KEY,
      client_id TEXT NOT NULL REFERENCES portal_clients(id) ON DELETE CASCADE,
      prospect_id TEXT REFERENCES portal_prospects(id) ON DELETE SET NULL,
      source_type TEXT NOT NULL DEFAULT 'direct',
      title TEXT NOT NULL DEFAULT 'Passage Neptune Media',
      format TEXT NOT NULL DEFAULT 'Hors Norme',
      amount_total INTEGER NOT NULL DEFAULT 0,
      currency TEXT NOT NULL DEFAULT 'eur',
      payment_mode TEXT NOT NULL DEFAULT 'payment_pending',
      status TEXT NOT NULL DEFAULT 'payment_pending',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS portal_crm_action_tokens_v86(
      id TEXT PRIMARY KEY,
      token_hash TEXT NOT NULL UNIQUE,
      client_id TEXT NOT NULL REFERENCES portal_clients(id) ON DELETE CASCADE,
      opportunity_id TEXT REFERENCES portal_crm_opportunities_v86(id) ON DELETE CASCADE,
      order_id TEXT REFERENCES portal_orders(id) ON DELETE CASCADE,
      action TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      used_at TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS portal_crm_messages_v86(
      id TEXT PRIMARY KEY,
      client_id TEXT NOT NULL REFERENCES portal_clients(id) ON DELETE CASCADE,
      opportunity_id TEXT,
      order_id TEXT,
      action TEXT NOT NULL,
      sent_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS portal_filming_preferences_v86(
      id TEXT PRIMARY KEY,
      token_id TEXT NOT NULL UNIQUE REFERENCES portal_crm_action_tokens_v86(id) ON DELETE CASCADE,
      client_id TEXT NOT NULL REFERENCES portal_clients(id) ON DELETE CASCADE,
      opportunity_id TEXT,
      order_id TEXT,
      preferences_json TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'submitted',
      submitted_at TEXT NOT NULL,
      applied_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_crm_opp_client_v86 ON portal_crm_opportunities_v86(client_id,updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_crm_opp_prospect_v86 ON portal_crm_opportunities_v86(prospect_id);
    CREATE INDEX IF NOT EXISTS idx_crm_token_hash_v86 ON portal_crm_action_tokens_v86(token_hash);
    CREATE INDEX IF NOT EXISTS idx_crm_messages_v86 ON portal_crm_messages_v86(client_id,action,sent_at DESC);
    CREATE INDEX IF NOT EXISTS idx_filming_preferences_order_v86 ON portal_filming_preferences_v86(order_id,submitted_at DESC);
  `);
  store.crmV86SchemaReady = true;
}

export async function crmSnapshotV86(store, body = {}) {
  ensureCrmV86Schema(store);
  const access = await requireOperator(store, body);
  if (!access.ok) return access.response;

  const clients = store.sql.exec(`
    SELECT id,email,full_name AS fullName,company,active,created_at AS createdAt,updated_at AS updatedAt,last_access_at AS lastAccessAt
    FROM portal_clients ORDER BY updated_at DESC
  `).toArray();
  const prospects = store.sql.exec(`
    SELECT id,client_id AS clientId,status,source,created_at AS createdAt,updated_at AS updatedAt,paid_at AS paidAt,order_id AS orderId
    FROM portal_prospects ORDER BY updated_at DESC
  `).toArray();
  const orders = store.sql.exec(`
    SELECT o.id,o.client_id AS clientId,o.title,o.format,o.payment_status AS paymentStatus,o.amount_total AS amountTotal,o.currency,
           o.status,o.appointment_at AS appointmentAt,o.filming_at AS filmingAt,o.booking_url AS bookingUrl,o.next_action AS nextAction,
           o.created_at AS createdAt,o.updated_at AS updatedAt
    FROM portal_orders o ORDER BY o.updated_at DESC
  `).toArray();
  const opportunities = store.sql.exec(`
    SELECT x.id,x.client_id AS clientId,x.prospect_id AS prospectId,x.source_type AS sourceType,x.title,x.format,
           x.amount_total AS amountTotal,x.currency,x.payment_mode AS paymentMode,x.status,x.created_at AS createdAt,x.updated_at AS updatedAt,
           p.status AS prospectStatus,p.order_id AS paidOrderId,p.paid_at AS paidAt
    FROM portal_crm_opportunities_v86 x
    LEFT JOIN portal_prospects p ON p.id=x.prospect_id
    ORDER BY x.updated_at DESC
  `).toArray();
  const preferences = store.sql.exec(`
    SELECT id,client_id AS clientId,opportunity_id AS opportunityId,order_id AS orderId,preferences_json AS preferencesJson,
           status,submitted_at AS submittedAt,applied_at AS appliedAt
    FROM portal_filming_preferences_v86 ORDER BY submitted_at DESC
  `).toArray().map((row) => ({ ...row, preferences: safeJson(row.preferencesJson, []) }));

  const latestProspect = firstBy(prospects, 'clientId');
  const latestOrder = firstBy(orders, 'clientId');
  const latestOpportunity = firstBy(opportunities.filter((row) => !['cancelled', 'converted'].includes(row.status)), 'clientId');
  const latestPreference = firstBy(preferences, 'clientId');

  const contacts = clients.map((client) => {
    const prospect = latestProspect.get(client.id) || null;
    const order = latestOrder.get(client.id) || null;
    const opportunity = latestOpportunity.get(client.id) || null;
    const preference = latestPreference.get(client.id) || null;
    const state = resolveCrmState({ client, prospect, order, opportunity, preference });
    return { ...client, prospect, order, opportunity, preference, ...state };
  });

  const pipeline = {
    toConvert: contacts.filter((x) => x.stage === 'to_convert').length,
    payment: contacts.filter((x) => x.stage === 'payment_pending').length,
    preparation: contacts.filter((x) => x.stage === 'preparation_pending').length,
    filming: contacts.filter((x) => x.stage === 'filming_pending').length,
    ready: contacts.filter((x) => x.stage === 'ready').length,
  };

  return json({ ok: true, contacts, pipeline, generatedAt: new Date().toISOString() });
}

export async function createCrmOpportunityV86(store, body = {}) {
  ensureCrmV86Schema(store);
  const access = await requireOperator(store, body);
  if (!access.ok) return access.response;
  const payload = body.payload && typeof body.payload === 'object' ? body.payload : {};
  const client = resolveClient(store, payload);
  if (!client) return json({ error: 'invalid_client' }, 400);

  const amountTotal = clampInteger(payload.amountTotal, 0, 1000000000);
  const format = sanitizeText(payload.format || 'Hors Norme', 120) || 'Hors Norme';
  const title = sanitizeText(payload.title || 'Passage Neptune Media', 200) || 'Passage Neptune Media';
  const sourceType = sanitizeText(payload.sourceType || 'direct', 60) || 'direct';
  if (amountTotal <= 0) return json({ error: 'payment_amount_required' }, 400);

  const now = new Date().toISOString();
  let opportunity = store.sql.exec(`
    SELECT id FROM portal_crm_opportunities_v86
    WHERE client_id=? AND payment_mode='payment_pending' AND status NOT IN ('cancelled','converted')
    ORDER BY updated_at DESC LIMIT 1
  `, client.id).toArray()[0];
  if (!opportunity) opportunity = { id: crypto.randomUUID() };

  const issued = await issueProspectToken(store, client, opportunity.id, now);
  const exists = store.sql.exec('SELECT id FROM portal_crm_opportunities_v86 WHERE id=? LIMIT 1', opportunity.id).toArray()[0];
  if (exists) {
    store.sql.exec(`
      UPDATE portal_crm_opportunities_v86 SET prospect_id=?,source_type=?,title=?,format=?,amount_total=?,currency='eur',
        payment_mode='payment_pending',status='payment_pending',updated_at=? WHERE id=?
    `, issued.prospectId, sourceType, title, format, amountTotal, now, opportunity.id);
  } else {
    store.sql.exec(`
      INSERT INTO portal_crm_opportunities_v86
        (id,client_id,prospect_id,source_type,title,format,amount_total,currency,payment_mode,status,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,'eur','payment_pending','payment_pending',?,?)
    `, opportunity.id, client.id, issued.prospectId, sourceType, title, format, amountTotal, now, now);
  }
  store.audit?.(access.actor.id || 'studio', 'crm_opportunity_created_v86', 'portal_client', client.id, {
    opportunityId: opportunity.id, amountTotal, format, sourceType,
  });
  return json({ ok: true, opportunityId: opportunity.id, client, amountTotal, format, title, token: issued.token });
}

export async function prepareCrmActionV86(store, body = {}) {
  ensureCrmV86Schema(store);
  const access = await requireOperator(store, body);
  if (!access.ok) return access.response;
  const payload = body.payload && typeof body.payload === 'object' ? body.payload : {};
  const target = resolveActionTarget(store, payload);
  if (!target.client) return json({ error: 'client_not_found' }, 404);

  let action = sanitizeText(payload.action || 'autopilot', 60) || 'autopilot';
  if (action === 'autopilot') action = nextAction(target);
  if (!['payment', 'preparation', 'filming_preferences', 'access', 'none'].includes(action)) {
    return json({ error: 'invalid_crm_action' }, 400);
  }
  if (action === 'none') return json({ ok: true, action: 'none', suppressed: true, reason: 'nothing_to_send' });

  const cooldownSince = new Date(Date.now() - MESSAGE_COOLDOWN_MS).toISOString();
  const duplicate = store.sql.exec(`
    SELECT id,sent_at AS sentAt FROM portal_crm_messages_v86
    WHERE client_id=? AND action=?
      AND COALESCE(order_id,'')=? AND COALESCE(opportunity_id,'')=? AND sent_at>=?
    ORDER BY sent_at DESC LIMIT 1
  `, target.client.id, action, target.order?.id || '', target.opportunity?.id || '', cooldownSince).toArray()[0];
  if (duplicate) {
    return json({ ok: true, action, suppressed: true, reason: 'cooldown', sentAt: duplicate.sentAt });
  }

  let token = '';
  if (action === 'payment') {
    if (!target.opportunity) return json({ error: 'payment_passage_required' }, 409);
    const issued = await issueProspectToken(store, target.client, target.opportunity.id, new Date().toISOString(), target.opportunity.prospectId);
    token = issued.token;
  }
  if (action === 'filming_preferences') {
    if (!target.order) return json({ error: 'order_required' }, 409);
    token = await issueActionToken(store, target.client.id, target.order.id, target.opportunity?.id || null, 'filming_preferences');
  }

  return json({
    ok: true,
    action,
    suppressed: false,
    token,
    client: target.client,
    opportunity: target.opportunity,
    order: target.order,
    bookingUrl: target.order?.bookingUrl || '',
    actor: access.actor.email || ADMIN_EMAIL,
  });
}

export async function markCrmActionSentV86(store, body = {}) {
  ensureCrmV86Schema(store);
  const access = await requireOperator(store, body);
  if (!access.ok) return access.response;
  const payload = body.payload && typeof body.payload === 'object' ? body.payload : {};
  const clientId = sanitizeText(payload.clientId, 100);
  const action = sanitizeText(payload.action, 60);
  if (!clientId || !action) return json({ error: 'invalid_crm_message' }, 400);
  const now = new Date().toISOString();
  store.sql.exec(`
    INSERT INTO portal_crm_messages_v86(id,client_id,opportunity_id,order_id,action,sent_at) VALUES(?,?,?,?,?,?)
  `, crypto.randomUUID(), clientId, sanitizeText(payload.opportunityId, 100) || null, sanitizeText(payload.orderId, 100) || null, action, now);
  if (payload.opportunityId && action === 'payment') {
    store.sql.exec(`UPDATE portal_crm_opportunities_v86 SET status='payment_sent',updated_at=? WHERE id=?`, now, sanitizeText(payload.opportunityId, 100));
  }
  store.audit?.(access.actor.id || 'studio', 'crm_message_sent_v86', 'portal_client', clientId, { action });
  return json({ ok: true, sentAt: now });
}

export async function clientActionContextV86(store, raw = {}) {
  ensureCrmV86Schema(store);
  const token = String(raw.token || '').trim();
  if (token.length < 32) return json({ error: 'invalid_token' }, 400);
  const tokenHash = await sha256(token);
  const row = store.sql.exec(`
    SELECT t.id,t.action,t.expires_at AS expiresAt,t.used_at AS usedAt,t.order_id AS orderId,t.opportunity_id AS opportunityId,
           c.id AS clientId,c.email,c.full_name AS fullName,c.company,o.title,o.format,o.appointment_at AS appointmentAt
    FROM portal_crm_action_tokens_v86 t
    JOIN portal_clients c ON c.id=t.client_id
    LEFT JOIN portal_orders o ON o.id=t.order_id
    WHERE t.token_hash=? LIMIT 1
  `, tokenHash).toArray()[0];
  if (!row || row.expiresAt <= new Date().toISOString()) return json({ error: 'token_expired' }, 401);
  return json({
    ok: true,
    action: row.action,
    alreadySubmitted: Boolean(row.usedAt),
    client: { id: row.clientId, email: row.email, fullName: row.fullName, company: row.company },
    order: row.orderId ? { id: row.orderId, title: row.title, format: row.format, appointmentAt: row.appointmentAt } : null,
  });
}

export async function submitClientActionV86(store, raw = {}) {
  ensureCrmV86Schema(store);
  const token = String(raw.token || '').trim();
  if (token.length < 32) return json({ error: 'invalid_token' }, 400);
  const tokenHash = await sha256(token);
  const row = store.sql.exec(`
    SELECT id,client_id AS clientId,opportunity_id AS opportunityId,order_id AS orderId,action,expires_at AS expiresAt,used_at AS usedAt
    FROM portal_crm_action_tokens_v86 WHERE token_hash=? LIMIT 1
  `, tokenHash).toArray()[0];
  if (!row || row.expiresAt <= new Date().toISOString()) return json({ error: 'token_expired' }, 401);
  if (row.usedAt) return json({ ok: true, alreadySubmitted: true });
  if (row.action !== 'filming_preferences') return json({ error: 'invalid_action' }, 400);

  const preferences = normalizePreferences(raw.preferences);
  if (!preferences.length) return json({ error: 'preferences_required' }, 400);
  const now = new Date().toISOString();
  const preferenceId = crypto.randomUUID();
  store.sql.exec(`
    INSERT INTO portal_filming_preferences_v86
      (id,token_id,client_id,opportunity_id,order_id,preferences_json,status,submitted_at,applied_at)
    VALUES(?,?,?,?,?,?,'submitted',?,NULL)
  `, preferenceId, row.id, row.clientId, row.opportunityId || null, row.orderId || null, JSON.stringify(preferences), now);
  store.sql.exec('UPDATE portal_crm_action_tokens_v86 SET used_at=? WHERE id=?', now, row.id);
  if (row.orderId) {
    recordEvent(store, row.orderId, 'client_filming_preferences_submitted', 'client', '', { preferences });
  }
  return json({ ok: true, preferenceId, preferences, submittedAt: now });
}

export async function applyFilmingPreferenceV86(store, body = {}) {
  ensureCrmV86Schema(store);
  const access = await requireOperator(store, body);
  if (!access.ok) return access.response;
  const payload = body.payload && typeof body.payload === 'object' ? body.payload : {};
  const preferenceId = sanitizeText(payload.preferenceId, 100);
  const choiceIndex = Math.max(0, Math.min(2, Number(payload.choiceIndex || 0)));
  const preference = store.sql.exec(`
    SELECT id,order_id AS orderId,preferences_json AS preferencesJson,status FROM portal_filming_preferences_v86 WHERE id=? LIMIT 1
  `, preferenceId).toArray()[0];
  if (!preference?.orderId) return json({ error: 'preference_not_found' }, 404);
  const preferences = safeJson(preference.preferencesJson, []);
  const filmingAt = preferences[choiceIndex];
  if (!filmingAt) return json({ error: 'preference_choice_invalid' }, 400);

  const order = store.sql.exec(`SELECT id,format,appointment_at AS appointmentAt FROM portal_orders WHERE id=? LIMIT 1`, preference.orderId).toArray()[0];
  if (!order) return json({ error: 'order_not_found' }, 404);
  if (order.appointmentAt && new Date(filmingAt) < new Date(order.appointmentAt)) return json({ error: 'filming_before_preparation' }, 400);

  const workflow = store.sql.exec('SELECT order_id AS orderId FROM portal_workflows WHERE order_id=? LIMIT 1', order.id).toArray()[0];
  if (!workflow) ensureManualWorkflowForOrder(store, order.id, { sourceType: 'studio', filmingConfirmed: false });
  const horsNorme = isHorsNorme(order.format);
  const now = new Date().toISOString();
  const status = horsNorme ? 'studio_date_confirmation_pending' : 'filming_scheduled';
  const nextActionLabel = horsNorme
    ? 'Le créneau choisi par le client est en confirmation auprès du studio.'
    : 'Votre date de passage est planifiée.';
  store.sql.exec('UPDATE portal_orders SET filming_at=?,status=?,next_action=?,updated_at=? WHERE id=?', filmingAt, status, nextActionLabel, now, order.id);
  store.sql.exec(`
    UPDATE portal_workflows SET requested_filming_at=?,supplier_status=?,supplier_response_at=NULL,supplier_note='',updated_at=? WHERE order_id=?
  `, filmingAt, horsNorme ? 'pending' : 'not_required', now, order.id);
  store.sql.exec(`UPDATE portal_filming_preferences_v86 SET status='applied',applied_at=? WHERE id=?`, now, preference.id);
  syncSteps(store, order.id, status, now);
  recordEvent(store, order.id, 'client_filming_preference_applied', 'admin', access.actor.email || ADMIN_EMAIL, {
    filmingAt, preferenceId, choiceIndex,
  });
  return json({ ok: true, orderId: order.id, filmingAt, status, supplierConfirmationRequired: horsNorme, updatedAt: now });
}

function resolveCrmState({ prospect, order, opportunity, preference }) {
  const activeOrder = order && !FINISHED.has(order.status) ? order : null;
  if (opportunity && ['captured', 'tunnel_started'].includes(opportunity.prospectStatus || '') && !opportunity.paidOrderId) {
    return { stage: 'payment_pending', stageLabel: 'Paiement à obtenir', recommendedAction: 'payment' };
  }
  if (activeOrder) {
    if (!PAID.has(String(activeOrder.paymentStatus || '').toLowerCase())) {
      return { stage: 'payment_pending', stageLabel: 'Paiement à obtenir', recommendedAction: 'payment' };
    }
    if (!activeOrder.appointmentAt) return { stage: 'preparation_pending', stageLabel: 'Préparation à réserver', recommendedAction: 'preparation' };
    if (!activeOrder.filmingAt) {
      return {
        stage: 'filming_pending',
        stageLabel: preference?.status === 'submitted' ? 'Disponibilités reçues' : 'Passage à planifier',
        recommendedAction: preference?.status === 'submitted' ? 'apply_preference' : 'filming_preferences',
      };
    }
    return { stage: 'ready', stageLabel: 'Passage confirmé', recommendedAction: 'none' };
  }
  if (prospect && ['captured', 'tunnel_started'].includes(prospect.status)) {
    return { stage: 'to_convert', stageLabel: 'À convertir', recommendedAction: 'create_passage' };
  }
  return { stage: 'client', stageLabel: 'Client', recommendedAction: 'create_passage' };
}

function resolveActionTarget(store, payload) {
  const opportunityId = sanitizeText(payload.opportunityId, 100);
  const orderId = sanitizeText(payload.orderId, 100);
  const clientId = sanitizeText(payload.clientId, 100);
  let opportunity = opportunityId ? getOpportunity(store, opportunityId) : null;
  let order = orderId ? getOrder(store, orderId) : null;
  let client = null;
  const resolvedClientId = clientId || opportunity?.clientId || order?.clientId || '';
  if (resolvedClientId) client = getClient(store, resolvedClientId);
  if (client && !opportunity) opportunity = latestOpportunityForClient(store, client.id);
  if (client && !order) order = latestActiveOrderForClient(store, client.id);
  return { client, opportunity, order };
}

function nextAction(target) {
  const opp = target.opportunity;
  if (opp && ['captured', 'tunnel_started', 'payment_pending', 'payment_sent'].includes(opp.prospectStatus || opp.status || '') && !opp.paidOrderId) return 'payment';
  const order = target.order;
  if (!order) return 'none';
  if (!PAID.has(String(order.paymentStatus || '').toLowerCase())) return opp ? 'payment' : 'none';
  if (!order.appointmentAt) return 'preparation';
  if (!order.filmingAt) return 'filming_preferences';
  return 'access';
}

async function issueProspectToken(store, client, opportunityId, now, existingProspectId = '') {
  const token = randomToken(32);
  const tokenHash = await sha256(token);
  const expiresAt = new Date(Date.now() + ACTION_TOKEN_TTL_MS).toISOString();
  const names = splitName(client.fullName);
  let prospectId = sanitizeText(existingProspectId, 100);
  const existing = prospectId ? store.sql.exec('SELECT id FROM portal_prospects WHERE id=? LIMIT 1', prospectId).toArray()[0] : null;
  if (existing) {
    store.sql.exec(`
      UPDATE portal_prospects SET token_hash=?,status=CASE WHEN status='paid' THEN status ELSE 'captured' END,
        expires_at=?,updated_at=?,source='studio_manual',intent='book_passage' WHERE id=?
    `, tokenHash, expiresAt, now, prospectId);
  } else {
    store.sql.exec("UPDATE portal_prospects SET status='replaced',updated_at=? WHERE client_id=? AND status IN ('captured','tunnel_started')", now, client.id);
    prospectId = crypto.randomUUID();
    store.sql.exec(`
      INSERT INTO portal_prospects
        (id,client_id,first_name,last_name,company,email,token_hash,status,source,intent,consent_at,expires_at,created_at,updated_at,tunnel_started_at,paid_at,order_id)
      VALUES(?,?,?,?,?,?,?,'captured','studio_manual','book_passage',?,?,?, ?,NULL,NULL,NULL)
    `, prospectId, client.id, names.firstName, names.lastName, client.company || '', client.email, tokenHash, now, expiresAt, now, now);
  }
  if (opportunityId) store.sql.exec('UPDATE portal_crm_opportunities_v86 SET prospect_id=?,updated_at=? WHERE id=?', prospectId, now, opportunityId);
  return { token, prospectId, expiresAt };
}

async function issueActionToken(store, clientId, orderId, opportunityId, action) {
  const token = randomToken(32);
  const tokenHash = await sha256(token);
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + ACTION_TOKEN_TTL_MS).toISOString();
  store.sql.exec(`
    INSERT INTO portal_crm_action_tokens_v86(id,token_hash,client_id,opportunity_id,order_id,action,expires_at,used_at,created_at)
    VALUES(?,?,?,?,?,?,?,NULL,?)
  `, crypto.randomUUID(), tokenHash, clientId, opportunityId || null, orderId || null, action, expiresAt, now);
  return token;
}

function resolveClient(store, payload) {
  const clientId = sanitizeText(payload.clientId, 100);
  const email = normalizeEmail(payload.email);
  let client = clientId ? getClient(store, clientId) : null;
  if (!client && email) client = store.sql.exec('SELECT id,email,full_name AS fullName,company FROM portal_clients WHERE email=? LIMIT 1', email).toArray()[0];
  const fullName = sanitizeText(payload.fullName, 180);
  const company = sanitizeText(payload.company, 180);
  const now = new Date().toISOString();
  if (!client && email) {
    client = { id: crypto.randomUUID(), email, fullName, company };
    store.sql.exec('INSERT INTO portal_clients(id,email,full_name,company,active,created_at,updated_at,last_access_at) VALUES(?,?,?,?,1,?,?,NULL)', client.id, email, fullName, company, now, now);
  } else if (client) {
    store.sql.exec(`UPDATE portal_clients SET full_name=CASE WHEN ?<>'' THEN ? ELSE full_name END,company=CASE WHEN ?<>'' THEN ? ELSE company END,active=1,updated_at=? WHERE id=?`, fullName, fullName, company, company, now, client.id);
    client = getClient(store, client.id);
  }
  return client;
}

function getClient(store, id) {
  return store.sql.exec('SELECT id,email,full_name AS fullName,company FROM portal_clients WHERE id=? LIMIT 1', id).toArray()[0] || null;
}
function getOpportunity(store, id) {
  return store.sql.exec(`
    SELECT x.id,x.client_id AS clientId,x.prospect_id AS prospectId,x.source_type AS sourceType,x.title,x.format,x.amount_total AS amountTotal,x.currency,
           x.payment_mode AS paymentMode,x.status,p.status AS prospectStatus,p.order_id AS paidOrderId
    FROM portal_crm_opportunities_v86 x LEFT JOIN portal_prospects p ON p.id=x.prospect_id WHERE x.id=? LIMIT 1
  `, id).toArray()[0] || null;
}
function latestOpportunityForClient(store, clientId) {
  return store.sql.exec(`
    SELECT x.id,x.client_id AS clientId,x.prospect_id AS prospectId,x.source_type AS sourceType,x.title,x.format,x.amount_total AS amountTotal,x.currency,
           x.payment_mode AS paymentMode,x.status,p.status AS prospectStatus,p.order_id AS paidOrderId
    FROM portal_crm_opportunities_v86 x LEFT JOIN portal_prospects p ON p.id=x.prospect_id
    WHERE x.client_id=? AND x.status NOT IN ('cancelled','converted') ORDER BY x.updated_at DESC LIMIT 1
  `, clientId).toArray()[0] || null;
}
function getOrder(store, id) {
  return store.sql.exec(`
    SELECT o.id,o.client_id AS clientId,o.title,o.format,o.payment_status AS paymentStatus,o.amount_total AS amountTotal,o.currency,o.status,
           o.appointment_at AS appointmentAt,o.filming_at AS filmingAt,o.booking_url AS bookingUrl,o.next_action AS nextAction
    FROM portal_orders o WHERE o.id=? LIMIT 1
  `, id).toArray()[0] || null;
}
function latestActiveOrderForClient(store, clientId) {
  return store.sql.exec(`
    SELECT o.id,o.client_id AS clientId,o.title,o.format,o.payment_status AS paymentStatus,o.amount_total AS amountTotal,o.currency,o.status,
           o.appointment_at AS appointmentAt,o.filming_at AS filmingAt,o.booking_url AS bookingUrl,o.next_action AS nextAction
    FROM portal_orders o WHERE o.client_id=? AND o.status NOT IN ('completed','delivered') ORDER BY o.created_at DESC LIMIT 1
  `, clientId).toArray()[0] || null;
}
function firstBy(rows, key) {
  const map = new Map();
  for (const row of rows) if (row?.[key] && !map.has(row[key])) map.set(row[key], row);
  return map;
}
function splitName(value) {
  const parts = String(value || '').trim().split(/\s+/u).filter(Boolean);
  return { firstName: parts.shift() || '', lastName: parts.join(' ') };
}
function normalizePreferences(values) {
  const source = Array.isArray(values) ? values : [];
  const unique = [];
  for (const value of source.slice(0, 3)) {
    const date = new Date(value || '');
    if (Number.isNaN(date.getTime()) || date.getTime() < Date.now() + 60 * 60 * 1000) continue;
    const iso = date.toISOString();
    if (!unique.includes(iso)) unique.push(iso);
  }
  return unique;
}
function safeJson(value, fallback) {
  try { return JSON.parse(value || ''); } catch { return fallback; }
}
function clampInteger(value, min, max) {
  const n = Math.round(Number(value || 0));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : min;
}
