import fs from 'node:fs';

const read=path=>fs.readFileSync(path,'utf8');
const engine=read('neptune-tv-media-cloudflare/src/effective-offer-v181.js');
const entry=read('neptune-tv-media-cloudflare/src/entry-v48.js');
const clientServer=read('neptune-tv-media-cloudflare/src/portal-client-direct-booking-v118-5.js');
const clientUi=read('neptune-tv-media-cloudflare/public/espace-client/reserver/client-booking-v118-5.js');
const root=JSON.parse(read('wrangler.jsonc'));
const nested=JSON.parse(read('neptune-tv-media-cloudflare/wrangler.jsonc'));

const checks=[
  ['both Worker configs activate v48',root.main==='neptune-tv-media-cloudflare/src/entry-v48.js'&&nested.main==='neptune-tv-media-cloudflare/src/entry-v48.js'],
  ['launch zero capacity means sold out',engine.includes("launch:{label:'Tarif de lancement',order:10,zeroMeansSoldOut:true}")],
  ['promo zero capacity means sold out',engine.includes("promo:{label:'Tarif préférentiel',order:20,zeroMeansSoldOut:true}")],
  ['base zero capacity remains fallback unlimited',engine.includes("base:{label:'Tarif de base',order:30,zeroMeansSoldOut:false}")],
  ['one effective offer is exposed per format',engine.includes('format.offers=[decorated]')],
  ['effective offer is chosen by lowest live price',engine.includes('Number(a.clientPriceCents||0)-Number(b.clientPriceCents||0)')],
  ['paid reservations and active holds consume tier stock',engine.includes("WHERE p.status='paid'")&&engine.includes('portal_offer_holds_v143')],
  ['public selection route rejects stale tier',entry.includes("pathname.endsWith('/selection-v96')")&&entry.includes('validateEffectiveOfferV181')],
  ['Studio policy response exposes sold out and unlimited semantics',entry.includes('remainingPlaces')&&entry.includes('zeroCapacitySoldOut')&&entry.includes("tierCode==='base'&&capacity===0")],
  ['client direct booking validates current tier',clientServer.includes('effectiveOfferForFormatV181')&&clientServer.includes("tierError('offer_tier_changed'" )],
  ['client direct booking creates finite tier hold',clientServer.includes('reserveEffectiveOfferHoldV181')&&engine.includes('expiresAt=new Date(now.getTime()+30*60*1000)')],
  ['client UI refreshes automatically when tier changes',clientUi.includes("code==='offer_tier_changed'")&&clientUi.includes('refreshEffectiveOffer()')],
  ['capacity exhausted is explicit',engine.includes("error:'offer_capacity_exhausted'")&&clientUi.includes("code==='offer_capacity_exhausted'")],
];

const failures=checks.filter(([,ok])=>!ok);
for(const [name,ok] of checks)console.log(`${ok?'✓':'✗'} ${name}`);
if(failures.length){
  console.error(`Effective offer v181 verification failed: ${failures.length}/${checks.length}`);
  process.exit(1);
}
console.log(`Effective offer v181 verification passed: ${checks.length}/${checks.length}`);
