import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const checks = [
  ['src/entry-v29.js', ['/api/webhooks/stripe','/api/admin/stripe/reconcile','verifyStripeWebhook','paymentAuthority']],
  ['src/entry-v30.js', ['/api/admin/stripe/status','/api/admin/workflow/action','payment_pending','payment_not_verified','paymentGateEnforcement','server-and-ui-v91','single-next-action-plus-automatic-checks-v91','stripe-verified-or-no-payment-required-before-operational-actions-v91','open-dossier-only-v91','amount-is-not-payment-proof-v91','client-journey-v90.js?v=3','operational-clarity-v91.js?v=1']],
  ['src/entry-v31.js', ["import base from './entry-v30.js'",'/api/admin/journey-v92/context']],
  ['src/entry-v32.js', ["import base from './entry-v31.js'",'/api/admin/drive-upload-v94/session']],
  ['src/entry-v33.js', ["import base from './entry-v32.js'",'/api/admin/studio-operations-v95/']],
  ['src/stripe-journey-v90.js', ['customer_details[email]','client_reference_id','locked_prefilled_email','/payment_links']],
  ['src/portal-stripe-v90.js', ['portal_stripe_events_v90','stripe_payment_verified','stripe_payment_unmatched']],
  ['public/studio/manual-scheduling-v85.js', ['paymentRequirement','payment_pending','Aucun paiement requis','Montant à régler']],
  ['public/studio/client-journey-v90.js', ['VÉRIFICATIONS AUTOMATIQUES','PROCHAINE ACTION · PAIEMENT','Vérifier le paiement dans Stripe','Google Agenda / Meet','Studio fournisseur','Google Drive / R2','/api/admin/stripe/status','j90-payment-gate']],
  ['public/studio/operational-clarity-v91.js', ['Ouvrir le dossier','Montant du dossier','Voir le statut Stripe','Chargement de la prochaine action','Ouvrez un dossier client']],
  ['public/studio/client-journey-v90.css', ['@media(max-width:760px)','j90-layout','j90-payment-gate','billing-clarity-v91','font-size:13px']],
];
for (const [file, needles] of checks) {
  const content = read(file);
  for (const needle of needles) {
    if (!content.includes(needle)) throw new Error(`${file}: missing ${needle}`);
  }
}
const wrangler = read('wrangler.jsonc');
if (!wrangler.includes('"main": "src/entry-v33.js"')) throw new Error('wrangler main must be entry-v33.js');
console.log('Stripe journey v90 + operational UX v91 preserved behind simple journey v92, Drive upload v94 and Studio operations v95; Stripe gate remains server-side');
