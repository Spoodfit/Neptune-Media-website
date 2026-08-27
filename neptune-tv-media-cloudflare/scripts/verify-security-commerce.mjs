import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=(path)=>fs.readFileSync(path,'utf8');
const clientLogin=read('neptune-tv-media-cloudflare/src/portal-code-login.js');
const tunnelGuard=read('neptune-tv-media-cloudflare/src/portal-sales-tunnel-v109-guard.js');
const catalogCommerce=read('neptune-tv-media-cloudflare/src/catalog-commerce-v143.js');
const prospectLifecycle=read('neptune-tv-media-cloudflare/src/portal-prospects.js');
const lifecycleRuntime=read('neptune-tv-media-cloudflare/src/portal-lifecycle-v144.js');
const activeEntry=read('neptune-tv-media-cloudflare/src/entry-v44.js');
const rootWrangler=read('wrangler.jsonc');
const deployWorkflow=read('.github/workflows/deploy-cloudflare.yml');

assert.ok(!clientLogin.includes('TRUSTED_TEST_EMAIL'),'public client login must not contain a trusted test email bypass');
assert.ok(!clientLogin.includes('/portal/trusted-test-login'),'public client login must not call the trusted test session endpoint');
assert.ok(!clientLogin.includes('trustedAccess'),'public client login must not return trusted-access authentication');
assert.ok(clientLogin.includes("callStore(studio, '/portal/request-code'"),'all client login requests must use OTP request-code flow');
assert.ok(clientLogin.includes("result.reason === 'invalid_email'"),'invalid email remains explicitly rejected');
assert.ok(!clientLogin.includes("result.reason === 'client_not_found' ? 'client_not_found'"),'client existence must not be exposed by the public endpoint');

assert.ok(catalogCommerce.includes('reserveOfferHold(store,body)'),'v143 must own the capacity hold before selection');
assert.ok(tunnelGuard.includes('saveTunnelSelectionV97(store,raw)'),'legacy guard must preserve the exact held offer');
assert.ok(!tunnelGuard.includes('currentTierKey('),'legacy global tier remapping must stay disabled');
assert.ok(!tunnelGuard.includes('offerId:effective.id'),'checkout must never silently replace the held offer id');

assert.ok(prospectLifecycle.includes('VALUES (?,?,?,?,0,?,?,NULL)'),'newly captured prospects must not receive client portal entitlement');
assert.ok(!prospectLifecycle.includes('SET full_name=?,company=?,active=1,updated_at=?'),'capturing an existing lead must not activate portal access');
assert.ok(lifecycleRuntime.includes("WHEN NEW.status='paid'"),'paid prospect transition must explicitly activate its client entitlement');
assert.ok(lifecycleRuntime.includes("AFTER INSERT ON portal_orders"),'paid order creation must activate client entitlement');
assert.ok(lifecycleRuntime.includes("AFTER UPDATE OF payment_status ON portal_orders"),'paid order updates must activate client entitlement');
assert.ok(activeEntry.includes("ensurePortalLifecycleV144(this)"),'the active store runtime must install lifecycle guards before lower-level routes');

const legacyWranglerPath='neptune-tv-media-cloudflare/wrangler.jsonc';
assert.ok(fs.lstatSync(legacyWranglerPath).isSymbolicLink(),'legacy Wrangler path must be a symlink, never a second config');
assert.equal(fs.readlinkSync(legacyWranglerPath),'../wrangler.jsonc','legacy Wrangler path must resolve to the canonical root config');
assert.equal(read(legacyWranglerPath),rootWrangler,'legacy Wrangler compatibility path must expose exactly the canonical config');
assert.ok(rootWrangler.includes('"main": "neptune-tv-media-cloudflare/src/entry-v44.js"'),'root Wrangler config must point to the canonical active entry');
assert.ok(rootWrangler.includes('"WEBTV_VIDEO_BITRATE_KBPS": "4000"'),'canonical WebTV bitrate must remain 4000 kbps');
assert.ok(!activeEntry.includes("from './entry-v43.js'"),'active entry must not retain the redundant v43 wrapper layer');
assert.ok(!activeEntry.includes("from './entry-v42.js'"),'active entry must not retain the redundant v42 personalization wrapper layer');
assert.ok(activeEntry.includes("from './entry-v41.js'"),'active entry must now compose directly on the preserved v41 runtime');
assert.ok(activeEntry.includes('handleHorsNormePersonalizationV139'),'Hors Norme personalization must remain active after flattening v42');
assert.ok(activeEntry.includes('client-hors-norme-personalization-v139.js'),'client Hors Norme personalization asset must remain injected by the canonical entry');
assert.ok(activeEntry.includes('studio-hors-norme-personalization-v139.js'),'Studio Hors Norme personalization asset must remain injected by the canonical entry');
assert.ok(activeEntry.includes('horsNormePersonalization:HORS_NORME_PERSONALIZATION_RELEASE'),'public release metadata must still expose the Hors Norme personalization release');
assert.ok(activeEntry.includes('handleBusinessV142Http'),'v142 business runtime must be flattened into the canonical active entry');
assert.ok(activeEntry.includes('handleCatalogCommerceV143Store'),'v143 commerce runtime must remain in the canonical active entry');

assert.ok(!deployWorkflow.includes('Verify trusted Neptune client login'),'production deployment must not certify an authentication bypass');
assert.ok(!deployWorkflow.includes('/tmp/trusted-login.json'),'production deployment must not use the legacy privileged-login fixture');
assert.ok(deployWorkflow.includes('Verify client login cannot bypass OTP'),'deployment must probe that OTP cannot be bypassed');
assert.ok(deployWorkflow.includes("! grep -Fq '\"trustedAccess\":true' \"$body\""),'deployment must explicitly reject a trusted-access response');
assert.ok(deployWorkflow.includes('wrangler deploy --config wrangler.jsonc --dry-run'),'deployment validation must use the canonical root Wrangler config');
assert.ok(deployWorkflow.includes('wrangler deploy --config wrangler.jsonc'),'production deployment must use the same canonical Wrangler config');

console.log('Security/commerce/architecture regression verification passed.');
