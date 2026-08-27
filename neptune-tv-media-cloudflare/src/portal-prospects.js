import { json, randomToken, sanitizeText, sha256 } from './security.js';
import { normalizeEmail } from './portal-utils.js';

const TOKEN_TTL_SECONDS = 48 * 60 * 60;
const OPEN_STATUSES = new Set(['captured', 'tunnel_started', 'paid']);

export async function startProspect(store, raw = {}) {
  const firstName = sanitizeText(raw.firstName, 80);
  const lastName = sanitizeText(raw.lastName, 100);
  const company = sanitizeText(raw.company, 180);
  const email = normalizeEmail(raw.email);
  const source = sanitizeText(raw.source || 'neptune_media', 80) || 'neptune_media';
  const accepted = raw.accepted === true || raw.accepted === 1 || raw.accepted === '1';

  if (!firstName || !lastName || !company || !email || !accepted) {
    return json({ error: 'invalid_contact' }, 400);
  }

  const now = new Date();
  const nowIso = now.toISOString();
  const fullName = `${firstName} ${lastName}`.trim();
  let client = store.sql.exec('SELECT id,active FROM portal_clients WHERE email=?', email).toArray()[0];

  if (!client) {
    client = { id: crypto.randomUUID(), active: 0 };
    store.sql.exec(
      'INSERT INTO portal_clients (id,email,full_name,company,active,created_at,updated_at,last_access_at) VALUES (?,?,?,?,0,?,?,NULL)',
      client.id, email, fullName, company, nowIso, nowIso,
    );
  } else {
    // A captured lead must never grant portal access. Existing paying clients keep
    // their current entitlement; inactive leads remain inactive until payment.
    store.sql.exec(
      'UPDATE portal_clients SET full_name=?,company=?,updated_at=? WHERE id=?',
      fullName, company, nowIso, client.id,
    );
  }

  store.sql.exec(
    "UPDATE portal_prospects SET status='replaced',updated_at=? WHERE client_id=? AND status IN ('captured','tunnel_started')",
    nowIso, client.id,
  );

  const token = randomToken(32);
  const tokenHash = await sha256(token);
  const prospectId = crypto.randomUUID();
  const expiresAt = new Date(now.getTime() + TOKEN_TTL_SECONDS * 1000).toISOString();

  store.sql.exec(
    `INSERT INTO portal_prospects
      (id,client_id,first_name,last_name,company,email,token_hash,status,source,intent,consent_at,expires_at,created_at,updated_at,tunnel_started_at,paid_at,order_id)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,NULL,NULL,NULL)`,
    prospectId, client.id, firstName, lastName, company, email, tokenHash,
    'captured', source, 'book_passage', nowIso, expiresAt, nowIso, nowIso,
  );

  return json({
    ok: true,
    token,
    prospectId,
    expiresIn: TOKEN_TTL_SECONDS,
    contact: { firstName, lastName, fullName, company, email },
  });
}

export async function prospectContext(store, raw = {}) {
  const token = String(raw.token || '').trim();
  if (token.length < 32) return json({ error: 'invalid_prospect_token' }, 400);

  const tokenHash = await sha256(token);
  const nowIso = new Date().toISOString();
  const prospect = store.sql.exec(
    `SELECT p.id,p.client_id AS clientId,p.first_name AS firstName,p.last_name AS lastName,p.company,p.email,
            p.status,p.expires_at AS expiresAt,p.created_at AS createdAt,p.tunnel_started_at AS tunnelStartedAt,
            c.full_name AS fullName
     FROM portal_prospects p JOIN portal_clients c ON c.id=p.client_id
     WHERE p.token_hash=? LIMIT 1`,
    tokenHash,
  ).toArray()[0];

  if (!prospect || prospect.expiresAt <= nowIso || !OPEN_STATUSES.has(prospect.status)) {
    return json({ error: 'prospect_token_expired' }, 401);
  }

  store.sql.exec(
    "UPDATE portal_prospects SET status=CASE WHEN status='paid' THEN status ELSE 'tunnel_started' END,tunnel_started_at=COALESCE(tunnel_started_at,?),updated_at=? WHERE id=?",
    nowIso, nowIso, prospect.id,
  );

  return json({
    ok: true,
    prospectId: prospect.id,
    status: prospect.status,
    expiresAt: prospect.expiresAt,
    contact: {
      firstName: prospect.firstName,
      lastName: prospect.lastName,
      fullName: prospect.fullName || `${prospect.firstName} ${prospect.lastName}`.trim(),
      company: prospect.company,
      email: prospect.email,
    },
  });
}

export function markProspectPaid(store, prospectId, orderId, now = new Date().toISOString()) {
  const id = sanitizeText(prospectId, 100);
  if (!id) return false;
  const result = store.sql.exec(
    "UPDATE portal_prospects SET status='paid',paid_at=COALESCE(paid_at,?),order_id=COALESCE(order_id,?),updated_at=? WHERE id=?",
    now, orderId, now, id,
  );
  return Number(result?.rowsWritten || 0) > 0;
}

export function prospectIdFromReference(value) {
  const reference = String(value || '').trim();
  const match = reference.match(/^NP:([0-9a-f-]{36})(?::|$)/iu);
  return match ? match[1] : '';
}
