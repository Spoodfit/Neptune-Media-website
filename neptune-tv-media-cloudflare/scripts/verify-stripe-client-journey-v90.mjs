import fs from 'node:fs';
import path from 'node:path';

const root=path.resolve(import.meta.dirname,'..');
const repoRoot=path.resolve(root,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const checks=[['src/entry-v29.js',['/api/webhooks/stripe','/api/admin/stripe/reconcile','verifyStripeWebhook','paymentAuthority']],['src/entry-v30.js',['/api/admin/stripe/status','/api/admin/workflow/action','payment_pending','payment_not_verified','paymentGateEnforcement','server-and-ui-v91']],['src/entry-v31.js',["import base from './entry-v30.js'",'/api/admin/journey-v92/context']],['src/entry-v32.js',["import base from './entry-v31.js'",'/api/admin/drive-upload-v94/session']],['src/entry-v33.js',["import base from './entry-v32.js'",'/api/admin/studio-operations-v95/']],['src/entry-v34.js',["from './entry-v33.js'",'/api/reservation/selection-v96']],['src/entry-v35.js',["from './entry-v34.js'",'webtv-media-v1.js']],['src/entry-v36.js',["from './entry-v35.js'","from './store-v29.js'"]],['src/entry-v37.js',["from './entry-v36.js'"]],['src/entry-v38.js',["from './entry-v37.js'"]],['src/stripe-journey-v90.js',['customer_details[email]','client_reference_id','locked_prefilled_email','/payment_links','NPOPP_']],['src/portal-stripe-v90.js',['portal_stripe_events_v90','stripe_payment_verified','stripe_payment_unmatched']],['public/studio/manual-scheduling-v85.js',['paymentRequirement','payment_pending','Aucun paiement requis','Montant à régler']],['public/studio/client-journey-v90.js',['VÉRIFICATIONS AUTOMATIQUES','PROCHAINE ACTION · PAIEMENT','Vérifier le paiement dans Stripe','Google Agenda / Meet','Studio fournisseur','Google Drive / R2','/api/admin/stripe/status','j90-payment-gate']],['public/studio/operational-clarity-v91.js',['Ouvrir le dossier','Montant du dossier','Voir le statut Stripe','Chargement de la prochaine action','Ouvrez un dossier client']],['public/studio/client-journey-v90.css',['@media(max-width:760px)','j90-layout','j90-payment-gate','billing-clarity-v91','font-size:13px']]];
for(const [file,needles] of checks){const content=read(file);for(const needle of needles)if(!content.includes(needle))throw new Error(`${file}: missing ${needle}`);}

const wrangler=fs.readFileSync(path.join(repoRoot,'wrangler.jsonc'),'utf8');
const mainEntry=(wrangler.match(/"main"\s*:\s*"([^"]+)"/u)?.[1]||'').replace(/^neptune-tv-media-cloudflare\//u,'');
const activeChain=traceEntryChain(mainEntry);
if(!activeChain.includes('src/entry-v44.js'))throw new Error(`Stripe v90 validation must preserve canonical v44 runtime; chain=${activeChain.join(' -> ')}`);
if(!activeChain.includes('src/entry-v38.js'))throw new Error(`Stripe v90 must remain reachable through active Worker chain; chain=${activeChain.join(' -> ')}`);
console.log(`Stripe journey v90 + operational UX v91 preserved through active Worker chain ${activeChain.join(' -> ')}; exact opportunity Stripe reference remains server-side.`);

function traceEntryChain(start){
  const chain=[];
  const seen=new Set();
  let current=start;
  for(let depth=0;depth<30&&current;depth+=1){
    if(seen.has(current))throw new Error(`entry chain cycle: ${current}`);
    seen.add(current);
    chain.push(current);
    const full=path.join(root,current);
    if(!fs.existsSync(full))break;
    const source=fs.readFileSync(full,'utf8');
    const parent=source.match(/from\s+['"]\.\/(entry-v\d+\.js)['"]/u)?.[1];
    if(!parent)break;
    current=path.posix.join(path.posix.dirname(current),parent);
  }
  return chain;
}
