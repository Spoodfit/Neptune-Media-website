import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');
const exists = (path) => fs.existsSync(path);

const worker = read('neptune-tv-media-cloudflare/src/worker.js');
const premerge = read('neptune-tv-media-cloudflare/src/neptune-jt-v185.js');
const hardened = read('neptune-tv-media-cloudflare/src/neptune-jt-v184.js');
const base = read('neptune-tv-media-cloudflare/src/neptune-jt-v183.js');
const tunnel = read('neptune-tv-media-cloudflare/public/reserver/neptune-jt/assets/app.js');
const landing = read('neptune-tv-media-cloudflare/public/neptune-jt/index.html');
const landingStatus = read('neptune-tv-media-cloudflare/public/neptune-jt/status-v184.js');
const studio = read('neptune-tv-media-cloudflare/public/studio/neptune-jt/index.html');
const studioGuard = read('neptune-tv-media-cloudflare/public/studio/neptune-jt/release-guard-v184.js');

assert.ok(worker.includes("from './neptune-jt-v185.js'"), 'active Worker must use the final Neptune JT premerge runtime');
assert.ok(!worker.includes("from './neptune-jt-v183.js'"), 'active Worker must not bypass Neptune JT hardening');
assert.ok(worker.includes('{...payload,...adminAuth(request)}'), 'trusted Studio auth must override untrusted JSON fields');
assert.ok(premerge.includes('payment_requested_move_requires_open_target'), 'an issued payment link must not be moved into a target where payment would become closed');
assert.ok(premerge.includes("reservation.status !== 'payment_requested'"), 'the move guard must only constrain reservations whose payment link was already issued');

assert.ok(hardened.includes("SELECT id,status FROM neptune_jt_reservations_v182 WHERE edition_id=? AND email=? LIMIT 1"), 'duplicate e-mail must be handled before the UNIQUE constraint');
assert.ok(hardened.includes("row.status !== 'payment_requested'"), 'paid sessions must only confirm reservations that were actually invited to pay');
assert.ok(hardened.includes('duplicate_paid_session'), 'a second Stripe payment must enter financial review instead of overwriting the first payment');
assert.ok(hardened.includes('neptune_jt_financial_alerts_v184'), 'financial anomalies must be persisted');
assert.ok(hardened.includes("url.hostname === 'buy.stripe.com'"), 'Studio must only accept Stripe Payment Link URLs');
assert.ok(hardened.includes('edition_date_must_be_future'), 'Studio must reject past edition dates');
assert.ok(hardened.includes("status='pre_registered',payment_sent_at=NULL"), 'removing a manual override must revoke unpaid payment-request state below threshold');
assert.ok(hardened.includes('paymentRecipients, cancellationRecipients: []'), 'manual maintain must send payment links to already registered participants');
assert.ok(hardened.includes("event_at IS NOT NULL AND event_at>?"), 'automatic active-edition recovery must prefer a future edition');
assert.ok(hardened.includes("registrations_closed_at=COALESCE(registrations_closed_at,?)"), 'J-7 processing must close registrations consistently');
assert.ok(hardened.includes('paid_participant_cancelled'), 'paid participant cancellation must create a financial review alert');
assert.ok(base.includes('verifyStripeWebhook'), 'signed Stripe webhook verification must remain in the underlying runtime');
assert.ok(base.includes('amountTotal || 0) !== 20000'), 'underlying runtime must retain exact 200 EUR payment validation');

assert.ok(tunnel.includes('registrationOpen = data.registrationOpen === true'), 'public tunnel must fail closed when the active edition is not open');
assert.ok(tunnel.includes("honeypot.name = '_companyWebsite'"), 'public tunnel must include a lightweight abuse trap');
assert.ok(tunnel.includes("startedAt.name = '_formStartedAt'"), 'public tunnel must reject implausibly fast automated submissions');
assert.ok(tunnel.includes('renderEditionMeta(data.edition)'), 'public tunnel must show the actual edition date and location');
assert.ok(landing.includes('/neptune-jt/status-v184.js'), 'public landing must load live edition status');
assert.ok(landingStatus.includes("fetch('/api/neptune-jt/status'"), 'landing must use the same source of truth as the tunnel');
assert.ok(studio.includes('/studio/neptune-jt/release-guard-v184.js'), 'Studio must load the release guard');
assert.ok(studioGuard.includes('/^[=+\\-@\\t\\r]/u'), 'CSV export must neutralize spreadsheet formula injection');
assert.ok(!exists('neptune-tv-media-cloudflare/src/neptune-jt-v182.js'), 'obsolete v182 runtime must not ship beside the active Neptune JT runtime');

console.log('Neptune JT premerge verification passed: payments, editions, moves, Studio, public tunnel and export guards are locked.');
