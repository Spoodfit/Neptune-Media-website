import { sanitizeText } from './security.js';

const STRIPE_API = 'https://api.stripe.com/v1';
const PAID = new Set(['paid', 'no_payment_required']);
const WEBHOOK_TOLERANCE_SECONDS = 300;

export function stripeConfiguration(env = {}) {
  const secretKey = String(env.STRIPE_SECRET_KEY || '').trim();
  const webhookSecret = String(env.STRIPE_WEBHOOK_SECRET || '').trim();
  return {
    configured: Boolean(secretKey),
    webhookConfigured: Boolean(webhookSecret),
    secretKey,
    webhookSecret,
  };
}

export function stripeSafeReference(target = {}) {
  const opportunityId = sanitizeText(target.opportunityId || target.opportunity?.id, 100);
  if (opportunityId) return `NPOPP_${opportunityId}`;
  const orderId = sanitizeText(target.orderId || target.order?.id, 100);
  if (orderId) return `NPORD_${orderId}`;
  const clientId = sanitizeText(target.clientId || target.client?.id, 100);
  return clientId ? `NPCLIENT_${clientId}` : '';
}

export function parseStripeReference(value = '') {
  const raw = String(value || '').trim();
  const modern = /^(NPOPP|NPORD|NPCLIENT)_([0-9a-f-]{20,100})$/iu.exec(raw);
  if (modern) {
    const kind = modern[1].toUpperCase();
    return {
      opportunityId: kind === 'NPOPP' ? modern[2] : '',
      orderId: kind === 'NPORD' ? modern[2] : '',
      clientId: kind === 'NPCLIENT' ? modern[2] : '',
      prospectId: '',
    };
  }
  const legacy = /^NP[:_-]([0-9a-f-]{20,100})(?::|$)/iu.exec(raw);
  return legacy ? { opportunityId: '', orderId: '', clientId: '', prospectId: legacy[1] } : {
    opportunityId: '', orderId: '', clientId: '', prospectId: '',
  };
}

export async function verifyStripeWebhook(rawBody, signatureHeader, secret, nowMs = Date.now()) {
  const header = String(signatureHeader || '');
  const parts = header.split(',').map((item) => item.trim()).filter(Boolean);
  const timestamp = Number(parts.find((item) => item.startsWith('t='))?.slice(2) || 0);
  const signatures = parts.filter((item) => item.startsWith('v1=')).map((item) => item.slice(3).toLowerCase());
  if (!timestamp || !signatures.length || !secret) return false;
  if (Math.abs(Math.floor(nowMs / 1000) - timestamp) > WEBHOOK_TOLERANCE_SECONDS) return false;
  const payload = `${timestamp}.${rawBody}`;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(String(secret)),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const digest = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  const expected = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return signatures.some((signature) => constantTimeHexEqual(signature, expected));
}

export async function stripePaymentOptions(env, target = {}) {
  const config = stripeConfiguration(env);
  if (!config.configured) return { configured: false, options: [], error: 'stripe_not_configured' };
  const query = new URLSearchParams({ active: 'true', limit: '100' });
  query.append('expand[]', 'data.line_items');
  const result = await stripeGet(config.secretKey, `/payment_links?${query}`);
  if (!result.ok) return { configured: true, options: [], error: result.error || 'stripe_payment_links_failed' };

  const expectedAmount = Number(target.amountTotal || target.order?.amountTotal || target.opportunity?.amountTotal || 0);
  const expectedCurrency = String(target.currency || target.order?.currency || target.opportunity?.currency || 'eur').toLowerCase();
  const format = normalize(target.format || target.order?.format || target.opportunity?.format);
  const productCode = normalize(target.productCode || target.order?.productCode);
  const reference = stripeSafeReference(target);
  const email = String(target.email || target.client?.email || '').trim().toLowerCase();

  const options = (result.data?.data || [])
    .map((link) => paymentLinkOption(link, { expectedAmount, expectedCurrency, format, productCode, reference, email }))
    .filter(Boolean)
    .sort((a, b) => b.score - a.score || a.amountTotal - b.amountTotal);

  const bestScore = options[0]?.score || 0;
  const uniqueBest = bestScore > 0 && (!options[1] || options[1].score < bestScore);
  return {
    configured: true,
    options: options.slice(0, 8).map((option, index) => ({
      ...option,
      recommended: uniqueBest && index === 0,
    })),
  };
}

export async function stripePaidCandidates(env, target = {}) {
  const config = stripeConfiguration(env);
  if (!config.configured) return { configured: false, candidates: [], error: 'stripe_not_configured' };
  const candidates = [];
  const exactId = String(target.externalPaymentId || target.order?.externalPaymentId || '').trim();

  if (/^cs_/u.test(exactId)) {
    const exact = await stripeGet(config.secretKey, `/checkout/sessions/${encodeURIComponent(exactId)}`);
    if (exact.ok && exact.data) candidates.push(scoreSession(exact.data, target, true));
  } else if (/^pi_/u.test(exactId)) {
    const query = new URLSearchParams({ payment_intent: exactId, limit: '10' });
    const listed = await stripeGet(config.secretKey, `/checkout/sessions?${query}`);
    if (listed.ok) for (const session of listed.data?.data || []) candidates.push(scoreSession(session, target, true));
  }

  const email = String(target.email || target.client?.email || '').trim().toLowerCase();
  if (email) {
    const query = new URLSearchParams({ limit: '30' });
    query.set('customer_details[email]', email);
    const listed = await stripeGet(config.secretKey, `/checkout/sessions?${query}`);
    if (listed.ok) {
      for (const session of listed.data?.data || []) {
        if (!candidates.some((item) => item.session.id === session.id)) candidates.push(scoreSession(session, target, false));
      }
    }
  }

  const paid = candidates
    .filter((item) => item.paid)
    .sort((a, b) => b.score - a.score || Number(b.session.created || 0) - Number(a.session.created || 0));

  const top = paid[0];
  const second = paid[1];
  const confident = Boolean(top && top.score >= 70 && (!second || top.score > second.score));
  return {
    configured: true,
    candidates: paid.slice(0, 8).map((item) => ({
      id: item.session.id,
      paymentIntent: idValue(item.session.payment_intent),
      paymentLink: idValue(item.session.payment_link),
      clientReferenceId: String(item.session.client_reference_id || ''),
      amountTotal: Number(item.session.amount_total || 0),
      currency: String(item.session.currency || '').toLowerCase(),
      paymentStatus: String(item.session.payment_status || ''),
      customerEmail: String(item.session.customer_details?.email || item.session.customer_email || ''),
      createdAt: item.session.created ? new Date(Number(item.session.created) * 1000).toISOString() : null,
      score: item.score,
    })),
    confident,
    session: confident ? top.session : null,
    ambiguous: Boolean(top && !confident),
  };
}

export function normalizeStripeCheckoutSession(session = {}) {
  const metadata = session.metadata && typeof session.metadata === 'object' ? session.metadata : {};
  const clientReferenceId = String(session.client_reference_id || '').trim();
  return {
    id: String(session.id || '').trim(),
    externalPaymentId: String(session.id || session.payment_intent || '').trim(),
    paymentIntentId: idValue(session.payment_intent),
    paymentLinkId: idValue(session.payment_link),
    clientReferenceId,
    reference: parseStripeReference(clientReferenceId),
    email: String(session.customer_details?.email || session.customer_email || metadata.email || '').trim().toLowerCase(),
    fullName: String(session.customer_details?.name || metadata.fullName || metadata.name || '').trim(),
    company: String(session.customer_details?.business_name || metadata.company || '').trim(),
    amountTotal: Number(session.amount_total || 0),
    currency: String(session.currency || 'eur').trim().toLowerCase(),
    paymentStatus: PAID.has(String(session.payment_status || '').toLowerCase()) ? 'paid' : String(session.payment_status || '').toLowerCase(),
    productCode: String(metadata.productCode || metadata.product_code || metadata.offer || '').trim(),
    title: String(metadata.title || metadata.productName || metadata.product_name || '').trim(),
    format: String(metadata.format || metadata.concept || '').trim(),
    metadata,
  };
}

function paymentLinkOption(link, target) {
  if (!link?.id || !link?.url || link.active === false) return null;
  const items = link.line_items?.data || [];
  const amountTotal = items.reduce((sum, item) => {
    const amount = Number(item.amount_total ?? item.price?.unit_amount ?? 0);
    const quantity = Number(item.quantity || 1);
    return sum + (item.amount_total != null ? amount : amount * quantity);
  }, 0);
  const currency = String(items[0]?.currency || items[0]?.price?.currency || 'eur').toLowerCase();
  const description = items.map((item) => item.description || item.price?.nickname || '').filter(Boolean).join(' · ');
  const metadata = link.metadata && typeof link.metadata === 'object' ? link.metadata : {};
  const metaFormat = normalize(metadata.neptune_format || metadata.format || metadata.concept || '');
  const metaProduct = normalize(metadata.productCode || metadata.product_code || metadata.offer || '');
  let score = 0;
  if (target.productCode && metaProduct === target.productCode) score += 120;
  if (target.format && metaFormat === target.format) score += 100;
  if (target.expectedAmount > 0 && amountTotal === target.expectedAmount && currency === target.expectedCurrency) score += 70;
  if (target.format && normalize(description).includes(target.format)) score += 25;
  if (target.expectedAmount > 0 && amountTotal !== target.expectedAmount && score < 100) score -= 80;
  if (currency !== target.expectedCurrency) score -= 100;

  const url = new URL(link.url);
  if (target.reference) url.searchParams.set('client_reference_id', target.reference);
  if (target.email) url.searchParams.set('locked_prefilled_email', target.email);
  url.searchParams.set('utm_source', 'neptune_studio');
  url.searchParams.set('utm_medium', 'client_journey');

  return {
    id: link.id,
    url: url.toString(),
    baseUrl: link.url,
    amountTotal,
    currency,
    description: description || metadata.label || 'Paiement Stripe',
    metadata,
    score,
  };
}

function scoreSession(session, target, exact) {
  const paid = PAID.has(String(session.payment_status || '').toLowerCase());
  const ref = parseStripeReference(session.client_reference_id || '');
  const expectedAmount = Number(target.amountTotal || target.order?.amountTotal || target.opportunity?.amountTotal || 0);
  const expectedCurrency = String(target.currency || target.order?.currency || target.opportunity?.currency || 'eur').toLowerCase();
  const orderId = String(target.orderId || target.order?.id || '');
  const opportunityId = String(target.opportunityId || target.opportunity?.id || '');
  const clientId = String(target.clientId || target.client?.id || '');
  const email = String(target.email || target.client?.email || '').toLowerCase();
  const sessionEmail = String(session.customer_details?.email || session.customer_email || '').toLowerCase();
  let score = exact ? 200 : 0;
  if (orderId && ref.orderId === orderId) score += 160;
  if (opportunityId && ref.opportunityId === opportunityId) score += 160;
  if (clientId && ref.clientId === clientId) score += 120;
  if (email && sessionEmail === email) score += 40;
  if (expectedAmount > 0 && Number(session.amount_total || 0) === expectedAmount) score += 35;
  if (expectedCurrency && String(session.currency || '').toLowerCase() === expectedCurrency) score += 10;
  if (expectedAmount > 0 && Number(session.amount_total || 0) !== expectedAmount && !exact && !ref.orderId && !ref.opportunityId) score -= 80;
  return { session, paid, score };
}

async function stripeGet(secretKey, path) {
  try {
    const response = await fetch(`${STRIPE_API}${path}`, {
      headers: {
        Authorization: `Bearer ${secretKey}`,
        Accept: 'application/json',
        'User-Agent': 'Neptune-Media-Worker/6.0.0',
      },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        error: data.error?.message || data.error?.code || `stripe_http_${response.status}`,
        data,
      };
    }
    return { ok: true, status: response.status, data };
  } catch (error) {
    return { ok: false, status: 0, error: String(error?.message || error || 'stripe_unavailable') };
  }
}

function constantTimeHexEqual(left, right) {
  const a = String(left || '').toLowerCase();
  const b = String(right || '').toLowerCase();
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index += 1) diff |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return diff === 0;
}

function idValue(value) {
  if (!value) return '';
  return typeof value === 'string' ? value : String(value.id || '');
}

function normalize(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '')
    .slice(0, 120);
}
