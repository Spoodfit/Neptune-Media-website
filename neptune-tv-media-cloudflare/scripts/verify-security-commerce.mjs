import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=(path)=>fs.readFileSync(path,'utf8');
const clientLogin=read('neptune-tv-media-cloudflare/src/portal-code-login.js');
const tunnelGuard=read('neptune-tv-media-cloudflare/src/portal-sales-tunnel-v109-guard.js');
const catalogCommerce=read('neptune-tv-media-cloudflare/src/catalog-commerce-v143.js');
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

assert.ok(!deployWorkflow.includes('Verify trusted Neptune client login'),'production deployment must not certify an authentication bypass');
assert.ok(!deployWorkflow.includes('/tmp/trusted-login.json'),'production deployment must not use the legacy privileged-login fixture');
assert.ok(deployWorkflow.includes('Verify client login cannot bypass OTP'),'deployment must probe that OTP cannot be bypassed');
assert.ok(deployWorkflow.includes("! grep -Fq '\"trustedAccess\":true' \"$body\""),'deployment must explicitly reject a trusted-access response');

console.log('Security/commerce regression verification passed.');
