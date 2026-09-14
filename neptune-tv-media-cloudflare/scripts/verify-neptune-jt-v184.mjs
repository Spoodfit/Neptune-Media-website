import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');
const exists = (path) => fs.existsSync(path);

const worker = read('neptune-tv-media-cloudflare/src/worker.js');
const premerge = read('neptune-tv-media-cloudflare/src/neptune-jt-v185.js');
const hardened = read('neptune-tv-media-cloudflare/src/neptune-jt-v184.js');
const base = read('neptune-tv-media-cloudflare/src/neptune-jt-v183.js');
const tunnel = read('neptune-tv-media-cloudflare/public/reserver/neptune-jt/assets/app.js');
const confirmation = read('neptune-tv-media-cloudflare/public/reserver/neptune-jt/confirmation/index.html');
const landing = read('neptune-tv-media-cloudflare/public/neptune-jt/index.html');
const landingStatus = read('neptune-tv-media-cloudflare/public/neptune-jt/status-v184.js');
const studio = read('neptune-tv-media-cloudflare/public/studio/neptune-jt/index.html');
const studioGuard = read('neptune-tv-media-cloudflare/public/studio/neptune-jt/release-guard-v184.js');
const setup = read('neptune-tv-media-cloudflare/NEPTUNE_JT_SETUP.md');
const productionSmoke = read('neptune-tv-media-cloudflare/scripts/verify-neptune-jt-production.mjs');
const productionWorkflow = read('.github/workflows/verify-production-after-deploy.yml');

assert.ok(worker.includes("from './neptune-jt-v185.js'"), 'active Worker must use the final Neptune JT premerge runtime');
assert.ok(!worker.includes("from './neptune-jt-v183.js'"), 'active Worker must not bypass Neptune JT hardening');
assert.ok(worker.includes('{...payload,...adminAuth(request)}'), 'trusted Studio auth must override untrusted JSON fields');
assert.ok(premerge.includes('payment_requested_move_requires_open_target'), 'an issued payment link must not be moved into a target where payment would become closed');
assert.ok(premerge.includes("reservation.status !== 'payment_requested'"), 'the move guard must only constrain reservations whose payment link was already issued');
assert.ok(premerge.includes('manual_maintenance_disabled'), 'manual maintenance below the four-participant rule must be rejected server-side');
assert.ok(premerge.includes('enforceStrictMinimum(store)'), 'legacy manual-override state must be normalized before requests are processed');
assert.ok(premerge.includes('force_maintained=0'), 'strict minimum normalization must clear legacy override state');

assert.ok(hardened.includes("SELECT id,status FROM neptune_jt_reservations_v182 WHERE edition_id=? AND email=? LIMIT 1"), 'duplicate e-mail must be handled before the UNIQUE constraint');
assert.ok(hardened.includes("row.status !== 'payment_requested'"), 'paid sessions must only confirm reservations that were actually invited to pay');
assert.ok(hardened.includes('duplicate_paid_session'), 'a second Stripe payment must enter financial review instead of overwriting the first payment');
assert.ok(hardened.includes('neptune_jt_financial_alerts_v184'), 'financial anomalies must be persisted');
assert.ok(hardened.includes("url.hostname === 'buy.stripe.com'"), 'Studio must only accept Stripe Payment Link URLs');
assert.ok(hardened.includes('edition_date_must_be_future'), 'Studio must reject past edition dates');
assert.ok(hardened.includes("event_at IS NOT NULL AND event_at>?"), 'automatic active-edition recovery must prefer a future edition');
assert.ok(hardened.includes("registrations_closed_at=COALESCE(registrations_closed_at,?)"), 'J-7 processing must close registrations consistently');
assert.ok(hardened.includes('paid_participant_cancelled'), 'paid participant cancellation must create a financial review alert');
assert.ok(base.includes('verifyStripeWebhook'), 'signed Stripe webhook verification must remain in the underlying runtime');
assert.ok(base.includes('amountTotal || 0) !== 20000'), 'underlying runtime must retain exact 200 EUR payment validation');

assert.ok(tunnel.includes('registrationOpen = data.registrationOpen === true'), 'public tunnel must fail closed when the active edition is not open');
assert.ok(tunnel.includes("honeypot.name = '_companyWebsite'"), 'public tunnel must include a lightweight abuse trap');
assert.ok(tunnel.includes("startedAt.name = '_formStartedAt'"), 'public tunnel must reject implausibly fast automated submissions');
assert.ok(tunnel.includes('renderEditionMeta(data.edition)'), 'public tunnel must show the actual edition date and location');
assert.ok(confirmation.indexOf('data.financialReviewRequired') < confirmation.indexOf('data.confirmed'), 'financial anomalies must be shown before any success confirmation');
assert.ok(confirmation.includes('N’effectuez pas de second paiement'), 'payment anomaly UX must explicitly prevent a second charge attempt');
assert.ok(landing.includes('/neptune-jt/status-v184.js'), 'public landing must load live edition status');
assert.ok(landingStatus.includes("fetch('/api/neptune-jt/status'"), 'landing must use the same source of truth as the tunnel');
assert.ok(studio.includes('/studio/neptune-jt/release-guard-v184.js'), 'Studio must load the release guard');
assert.ok(studioGuard.includes('[data-edition-action="maintain"]'), 'Studio must remove obsolete manual-maintenance controls');
assert.ok(studioGuard.includes('uniquement à partir de 4 paiements confirmés'), 'Studio copy must state the strict four-payment rule');
assert.ok(studioGuard.includes('/^[=+\\-@\\t\\r]/u'), 'CSV export must neutralize spreadsheet formula injection');
assert.ok(setup.includes('Aucun maintien manuel sous le seuil de 4'), 'operations documentation must match the strict four-participant rule');

assert.ok(productionSmoke.includes("/api/neptune-jt/status"), 'post-deploy smoke must verify the Neptune JT public status endpoint');
assert.ok(productionSmoke.includes("/api/admin/neptune-jt-v183/dashboard"), 'post-deploy smoke must verify Studio auth remains closed to anonymous requests');
assert.ok(productionSmoke.includes('X-Neptune-JT release header mismatch'), 'post-deploy smoke must verify the deployed Neptune JT release header');
assert.ok(productionSmoke.includes('invalid Stripe session must fail closed'), 'post-deploy smoke must verify invalid payment reconciliation fails closed');
assert.ok(productionWorkflow.includes('Verify Neptune JT production smoke'), 'post-deploy workflow must execute the Neptune JT production smoke');
assert.ok(productionWorkflow.includes('verify-neptune-jt-production.mjs'), 'post-deploy workflow must call the Neptune JT production smoke script');

assert.ok(!exists('neptune-tv-media-cloudflare/src/neptune-jt-v182.js'), 'obsolete v182 runtime must not ship beside the active Neptune JT runtime');

console.log('Neptune JT premerge verification passed: strict 4/6 rule, payments, editions, moves, Studio, public tunnel, confirmation, export guards and post-deploy smoke are locked.');
