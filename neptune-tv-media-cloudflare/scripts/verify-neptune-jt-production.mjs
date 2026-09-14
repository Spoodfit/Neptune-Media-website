import { readFile } from 'node:fs/promises';

const PUBLIC_URL = (process.env.PUBLIC_URL || 'https://tv.neptunebusiness.com').replace(/\/$/, '');
const WORKERS_URL = (process.env.WORKERS_URL || 'https://neptune-media-webtv.neptunebusinessclub.workers.dev').replace(/\/$/, '');
const DEPLOY_SHA = process.env.DEPLOY_SHA || process.env.GITHUB_SHA || 'manual';
const bases = [...new Set([WORKERS_URL, PUBLIC_URL])];

const runtimeSource = await readFile(new URL('../src/neptune-jt-v185.js', import.meta.url), 'utf8');
const expectedRelease = runtimeSource.match(/export const NEPTUNE_JT_RELEASE\s*=\s*['"]([^'"]+)['"]/)?.[1];
if (!expectedRelease) throw new Error('Unable to resolve Neptune JT release from source');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function request(url, init = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    return await fetch(url, {
      redirect: init.redirect || 'follow',
      ...init,
      headers: {
        'Cache-Control': 'no-cache, no-store',
        ...(init.headers || {}),
      },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function retry(label, fn, attempts = 24, waitMs = 5000) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fn(attempt);
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await sleep(waitMs);
    }
  }
  throw new Error(`${label}: ${lastError?.message || lastError}`);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function json(url, expectedStatus = 200) {
  const response = await request(url);
  const body = await response.json().catch(() => null);
  if (response.status !== expectedStatus) {
    throw new Error(`${url} -> HTTP ${response.status}, expected ${expectedStatus}: ${JSON.stringify(body).slice(0, 400)}`);
  }
  return { response, body };
}

async function text(url, expectedStatus = 200) {
  const response = await request(url);
  const body = await response.text();
  if (response.status !== expectedStatus) {
    throw new Error(`${url} -> HTTP ${response.status}, expected ${expectedStatus}`);
  }
  return { response, body };
}

async function verifyBase(base) {
  const nonce = encodeURIComponent(`${DEPLOY_SHA}-${Date.now()}`);

  await retry(`${base} Neptune JT release`, async (attempt) => {
    const { response, body } = await json(`${base}/api/public/release?neptuneJtVerify=${nonce}&attempt=${attempt}`);
    assert(body?.neptuneJt === expectedRelease, `release mismatch: ${body?.neptuneJt || 'missing'} != ${expectedRelease}`);
    assert((response.headers.get('x-neptune-jt') || '') === expectedRelease, 'X-Neptune-JT release header mismatch');
  });

  const landing = await text(`${base}/neptune-jt/?verify=${nonce}`);
  assert(landing.body.includes("L'actu vue par"), `${base}: Neptune JT landing marker missing`);
  assert(landing.body.includes('/neptune-jt/status-v184.js'), `${base}: Neptune JT live status asset missing`);

  const tunnel = await text(`${base}/reserver/neptune-jt/?verify=${nonce}`);
  assert(tunnel.body.includes('id="jtForm"'), `${base}: Neptune JT reservation form missing`);
  assert(tunnel.body.includes('/reserver/neptune-jt/assets/app.js'), `${base}: Neptune JT reservation runtime missing`);

  const status = (await json(`${base}/api/neptune-jt/status?verify=${nonce}`)).body;
  assert(status?.ok === true, `${base}: Neptune JT status not ok`);
  assert(status?.release === expectedRelease, `${base}: Neptune JT status release mismatch`);
  assert(status?.minimumParticipants === 4, `${base}: minimumParticipants must be 4`);
  assert(status?.maximumParticipants === 6, `${base}: maximumParticipants must be 6`);
  assert(typeof status?.registrationOpen === 'boolean', `${base}: registrationOpen must be boolean`);
  assert(status?.counts && typeof status.counts === 'object', `${base}: counts missing`);
  for (const key of ['total', 'confirmed', 'paymentRequested', 'preRegistered', 'paidEver', 'revenueCents']) {
    assert(Number.isFinite(Number(status.counts[key] ?? 0)), `${base}: invalid count ${key}`);
  }
  if (status.edition) {
    assert(Boolean(status.edition.id), `${base}: active edition id missing`);
    assert(!['cancelled', 'archived'].includes(status.edition.status), `${base}: unavailable edition exposed as active`);
  } else {
    assert(status.registrationOpen === false, `${base}: registrations cannot be open without an edition`);
  }

  const protectedDashboard = await request(`${base}/api/admin/neptune-jt-v183/dashboard?verify=${nonce}`);
  assert([401, 403].includes(protectedDashboard.status), `${base}: Neptune JT dashboard must reject unauthenticated access (HTTP ${protectedDashboard.status})`);

  const invalidPaymentStatus = await request(`${base}/api/neptune-jt/payment-status?session_id=invalid&verify=${nonce}`);
  assert(invalidPaymentStatus.status === 400, `${base}: invalid Stripe session must fail closed with HTTP 400, got ${invalidPaymentStatus.status}`);

  const confirmation = await text(`${base}/reserver/neptune-jt/confirmation/?verify=${nonce}`);
  assert(confirmation.body.includes('Vérification du paiement'), `${base}: payment confirmation page missing`);
  assert(confirmation.body.includes('N’effectuez pas de second paiement'), `${base}: financial-review safety copy missing`);
}

for (const base of bases) await verifyBase(base);
console.log(`Neptune JT production smoke passed on ${bases.length} ingress point(s): ${expectedRelease}.`);
