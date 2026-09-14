import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8');
const exists = path => fs.existsSync(path);

const worker = read('neptune-tv-media-cloudflare/src/worker.js');
const cancellationSemantics = read('neptune-tv-media-cloudflare/src/neptune-jt-v187.js');
const audited = read('neptune-tv-media-cloudflare/src/neptune-jt-v186.js');
const premerge = read('neptune-tv-media-cloudflare/src/neptune-jt-v185.js');
const hardened = read('neptune-tv-media-cloudflare/src/neptune-jt-v184.js');
const base = read('neptune-tv-media-cloudflare/src/neptune-jt-v183.js');
const landing = read('neptune-tv-media-cloudflare/react/neptune-jt/src/app/page.tsx');
const tunnel = read('neptune-tv-media-cloudflare/react/neptune-jt/src/app/reserver/page.tsx');
const confirmation = read('neptune-tv-media-cloudflare/react/neptune-jt/src/app/confirmation/page.tsx');
const studio = read('neptune-tv-media-cloudflare/react/neptune-jt/src/app/studio/page.tsx');
const config = read('neptune-tv-media-cloudflare/react/neptune-jt/next.config.ts');
const setup = read('neptune-tv-media-cloudflare/NEPTUNE_JT_SETUP.md');
const productionSmoke = read('neptune-tv-media-cloudflare/scripts/verify-neptune-jt-production.mjs');
const productionWorkflow = read('.github/workflows/verify-production-after-deploy.yml');
const packageJson = read('package.json');

assert.ok(packageJson.includes('neptune-tv-media-cloudflare/react/neptune-jt'), 'root workspace must include Neptune JT React');
assert.ok(config.includes('output: "export"'), 'Neptune JT must use a static Next export');
assert.ok(config.includes('assetPrefix: "/neptune-jt-assets"'), 'Neptune JT assets must use their isolated public prefix');
for (const source of [landing, tunnel, confirmation, studio]) assert.ok(source.includes('react') || source.includes('useState') || source.includes('useEffect'), 'all Neptune JT UI surfaces must be React source');

assert.ok(worker.includes("from './neptune-jt-v187.js'"), 'active Worker must use cancellation-safe Neptune JT runtime');
assert.ok(worker.includes('{...payload,...adminAuth(request)}'), 'trusted Studio auth must override untrusted JSON fields');
assert.ok(worker.includes('sendNeptuneJtReservationEmails(env,data.internal)'), 'all Studio reservation mail actions must use the audited mail dispatcher');
assert.ok(premerge.includes('manual_maintenance_disabled'), 'manual maintenance below four must remain disabled');
assert.ok(premerge.includes('enforceStrictMinimum(store)'), 'strict 4/6 rule must be normalized server-side');
assert.ok(premerge.includes('withActiveRelease(delegated)'), 'delegated responses must expose the active release');
assert.ok(hardened.includes('duplicate_paid_session'), 'double Stripe payment must enter financial review');
assert.ok(hardened.includes('neptune_jt_financial_alerts_v184'), 'financial anomalies must persist');
assert.ok(hardened.includes("url.hostname === 'buy.stripe.com'"), 'Studio must accept only Stripe Payment Links');
assert.ok(hardened.includes('edition_date_must_be_future'), 'past edition dates must be rejected');
assert.ok(base.includes('verifyStripeWebhook'), 'Stripe webhook signature verification must remain enabled');
assert.ok(base.includes('amountTotal || 0) !== 20000'), 'exact 200 EUR payment validation must remain enabled');

assert.ok(audited.includes("NEPTUNE_JT_RELEASE = 'neptune-jt-20260915-v186-live-sync-email-audit'"), 'email-audited runtime must remain below the active wrapper');
assert.ok(audited.includes('participantMoved'), 'moving a participant must generate a dedicated notification instead of a generic registration email');
assert.ok(audited.includes('minimum de 4 paiements confirmés n’a pas été atteint à J-7'), 'J-7 cancellation email must explain the actual cancellation rule');
assert.ok(audited.includes('tout règlement déjà encaissé est remboursé, ou reporté uniquement avec votre accord'), 'payment request email must explain refund/report semantics');
assert.ok(audited.includes("Math.max(0, Number(alert.amountCents || 0)) / 100"), 'financial alert emails must display euros, not raw cents');
assert.ok(audited.includes('verifyStripeWebhook'), 'audited runtime must keep signed Stripe webhook verification');
assert.ok(audited.includes('sendPaymentConfirmationEmail(env, data.internal.confirmation)'), 'Stripe confirmation must use the audited confirmation template');
assert.ok(audited.includes("cancellationReason: 'minimum_not_reached_j7'"), 'scheduled cancellation must use the dedicated J-7 email reason');

assert.ok(cancellationSemantics.includes("NEPTUNE_JT_RELEASE = 'neptune-jt-20260915-v187-cancellation-semantics'"), 'active cancellation-semantics release must be present');
assert.ok(cancellationSemantics.includes("CANCELLATION_ORIGINS = new Set(['participant', 'neptune'])"), 'cancellation origin must be explicit');
assert.ok(cancellationSemantics.includes('le paiement n’est pas remboursable dans ce cas'), 'participant-requested paid cancellation must state no refund');
assert.ok(cancellationSemantics.includes('Neptune procédera au remboursement'), 'Neptune-requested paid cancellation must state refund/report semantics');
assert.ok(cancellationSemantics.includes('normalizeEditionAfterCancellation'), 'edition status must be recalculated after participant cancellation');
assert.ok(cancellationSemantics.includes("return json({ error: 'cancellation_origin_required' }, 400)"), 'ambiguous Studio cancellations must fail closed');

assert.ok(landing.includes('fetch("/api/neptune-jt/status"'), 'React landing must use live Neptune JT status');
assert.ok(tunnel.includes('fetch("/api/neptune-jt/status"'), 'React tunnel must fail closed from live status');
assert.ok(tunnel.includes('fetch("/api/neptune-jt/pre-register"'), 'React tunnel must submit to the production API');
assert.ok(tunnel.includes('_companyWebsite'), 'React tunnel must keep the honeypot');
assert.ok(tunnel.includes('_formStartedAt'), 'React tunnel must keep minimum-time abuse guard');
assert.ok(confirmation.includes('/api/neptune-jt/payment-status'), 'React confirmation must reconcile Stripe server-side');
assert.ok(confirmation.indexOf('financialReviewRequired') < confirmation.indexOf('data.confirmed'), 'financial review must be handled before confirmation success');
assert.ok(confirmation.includes('N’effectuez pas de second paiement'), 'confirmation must prevent duplicate-charge behavior');
assert.ok(studio.includes('/api/auth/status'), 'React Studio must require the existing Studio session');
assert.ok(studio.includes('/api/admin/neptune-jt-v183'), 'React Studio must use the existing protected Neptune JT admin API');
assert.ok(!studio.includes('Maintenir manuellement'), 'React Studio must not expose obsolete manual maintenance');
assert.ok(studio.includes('/^[=+\\-@\\t\\r]/u'), 'React Studio CSV export must neutralize spreadsheet formula injection');
assert.ok(studio.includes('AUTO_SYNC_MS = 10_000'), 'React Studio must refresh live state automatically');
assert.ok(studio.includes('visibilitychange'), 'React Studio must resync immediately when the tab becomes visible');
assert.ok(studio.includes('window.addEventListener("focus", refresh)'), 'React Studio must resync immediately on focus');
assert.ok(studio.includes('const requestId = ++syncRequestId.current'), 'Studio refresh races must be resolved by latest-request-wins semantics');
assert.ok(studio.includes('cancellationOrigin: action === "cancel" ? cancellationOrigin : undefined'), 'Studio must send cancellation origin to backend');
assert.ok(studio.includes('Demandée par le participant'), 'Studio must expose participant-requested cancellation explicitly');
assert.ok(studio.includes('Annuler par Neptune'), 'Studio must expose Neptune-requested cancellation explicitly');

for (const generated of [
  'neptune-tv-media-cloudflare/public/neptune-jt/index.html',
  'neptune-tv-media-cloudflare/public/reserver/neptune-jt/index.html',
  'neptune-tv-media-cloudflare/public/reserver/neptune-jt/confirmation/index.html',
  'neptune-tv-media-cloudflare/public/studio/neptune-jt/index.html',
]) {
  assert.ok(exists(generated), `generated React page missing: ${generated}`);
  const html = read(generated);
  assert.ok(html.includes('/neptune-jt-assets/_next/'), `generated page is not the Neptune JT Next/React export: ${generated}`);
}
for (const legacy of [
  'neptune-tv-media-cloudflare/public/neptune-jt/status-v184.js',
  'neptune-tv-media-cloudflare/public/reserver/neptune-jt/assets/app.js',
  'neptune-tv-media-cloudflare/public/studio/neptune-jt/assets/app.js',
  'neptune-tv-media-cloudflare/public/studio/neptune-jt/release-guard-v184.js',
]) assert.ok(!exists(legacy), `legacy imperative Neptune JT runtime must not ship: ${legacy}`);

assert.ok(setup.includes('Aucun maintien manuel sous le seuil de 4'), 'operations documentation must match strict 4/6 rule');
assert.ok(productionSmoke.includes('/api/neptune-jt/status'), 'post-deploy smoke must verify public status');
assert.ok(productionSmoke.includes('/api/admin/neptune-jt-v183/dashboard'), 'post-deploy smoke must verify Studio auth');
assert.ok(productionSmoke.includes('status?.release === expectedRelease'), 'production smoke must verify active release body');
assert.ok(productionWorkflow.includes('Verify Neptune JT production smoke'), 'post-deploy workflow must run Neptune JT smoke');
assert.ok(!exists('neptune-tv-media-cloudflare/src/neptune-jt-v182.js'), 'obsolete v182 backend must remain absent');

console.log('Neptune JT verified: React surfaces, live Studio sync, explicit cancellation semantics, coherent email lifecycle and hardened 4/6 backend are aligned.');
