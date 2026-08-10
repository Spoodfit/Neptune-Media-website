import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const checks = [
  ['src/entry-v29.js', ['/api/webhooks/stripe','/api/admin/stripe/reconcile','verifyStripeWebhook','client-journey-v90.js','paymentAuthority']],
  ['src/stripe-journey-v90.js', ['customer_details[email]','client_reference_id','locked_prefilled_email','/payment_links']],
  ['src/portal-stripe-v90.js', ['portal_stripe_events_v90','stripe_payment_verified','stripe_payment_unmatched']],
  ['public/studio/client-journey-v90.js', ['Vérifier Stripe','Google Agenda / Meet','Studio fournisseur','Google Drive / R2','data-j90-workflow']],
  ['public/studio/client-journey-v90.css', ['@media(max-width:680px)','j90-grid']],
];
for (const [file, needles] of checks) {
  const content = read(file);
  for (const needle of needles) {
    if (!content.includes(needle)) throw new Error(`${file}: missing ${needle}`);
  }
}
const wrangler = read('wrangler.jsonc');
if (!wrangler.includes('"main": "src/entry-v29.js"')) throw new Error('wrangler main must be entry-v29.js');
console.log('stripe client journey v90 verified');
