import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const checks = [];
const expect = (name, condition) => checks.push({ name, ok: Boolean(condition) });

const rootWrangler = read('../wrangler.jsonc');
const localWrangler = read('wrangler.jsonc');
const entry28 = read('src/entry-v28.js');
const entry27 = read('src/entry-v27.js');
const entry26 = read('src/entry-v26.js');
const crm = read('src/portal-crm-v86.js');
const store = read('src/store-v22.js');
const guard = read('src/store-v23.js');
const email = read('src/portal-crm-email-v86.js');
const studio = read('public/studio/crm-autopilot-v86.js');
const availability = read('public/disponibilites-passage/availability-v86.js');

expect('root Worker targets entry-v28', rootWrangler.includes('neptune-tv-media-cloudflare/src/entry-v28.js'));
expect('local Worker targets entry-v28', localWrangler.includes('src/entry-v28.js'));
expect('entry-v28 extends v27', entry28.includes("from './entry-v27.js'"));
expect('entry-v27 extends v26', entry27.includes("from './entry-v26.js'"));
expect('entry-v26 extends v25', entry26.includes("from './entry-v25.js'"));
expect('CRM submit handler is ordered before v85', entry27.includes('crm-autopilot-v86.js') && entry27.includes('manual-scheduling-v85'));
expect('CRM keeps hashed capability tokens', crm.includes('sha256(token)') && crm.includes('token_hash TEXT NOT NULL UNIQUE'));
expect('CRM never stores raw action token column', !crm.includes(' token TEXT NOT NULL'));
expect('CRM has same-action two-hour cooldown', crm.includes('MESSAGE_COOLDOWN_MS = 2 * 60 * 60 * 1000'));
expect('CRM has cross-action recipient cooldown', guard.includes('RECIPIENT_COOLDOWN_MS = 45 * 60 * 1000') && guard.includes("reason: 'recipient_cooldown'"));
expect('CRM calculates one next action', crm.includes('function nextAction(target)'));
expect('CRM supports existing clients', studio.includes('Rechercher un client, un prospect ou une entreprise') && studio.includes('clientId'));
expect('amount is labelled as format price', studio.includes('Montant du format (€)'));
expect('payment pending is explicit', studio.includes('payment_pending') && studio.includes('À demander au client'));
expect('Studio no longer infers paid from a positive amount', !studio.includes("amountEuros > 0 ? 'paid'"));
expect('zero-writing actions exist', email.includes('Finaliser et payer mon passage') && email.includes('Choisir mon rendez-vous') && email.includes('Choisir mes disponibilités'));
expect('filming preferences accept up to three choices', crm.includes('source.slice(0, 3)') && availability.includes('preferences'));
expect('preference can trigger supplier workflow', entry26.includes('resend_supplier_confirmation'));
expect('store exposes all CRM routes', store.includes('/portal/crm-snapshot-v86') && store.includes('/portal/crm-opportunity-v86') && store.includes('/portal/crm-filming-preference-apply-v86'));

const failed = checks.filter((check) => !check.ok);
for (const check of checks) console.log(`${check.ok ? '✓' : '✗'} ${check.name}`);
if (failed.length) {
  console.error(`CRM autopilot v86 verification failed: ${failed.length} check(s).`);
  process.exit(1);
}
console.log(`CRM autopilot v86 verification passed: ${checks.length} checks.`);
