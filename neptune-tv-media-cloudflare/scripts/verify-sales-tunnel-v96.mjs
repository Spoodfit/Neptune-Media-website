import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const checks=[];
const expect=(name,ok)=>checks.push({name,ok:Boolean(ok)});

const rootWrangler=read('../wrangler.jsonc');
const localWrangler=read('wrangler.jsonc');
const activeEntry36=read('src/entry-v36.js');
const activeEntry=read('src/entry-v35.js');
const entry=read('src/entry-v34.js');
const store29=read('src/store-v29.js');
const store=read('src/store-v28.js');
const backend=read('src/portal-sales-tunnel-v96.js');
const options=read('src/portal-sales-tunnel-options-v96.js');
const enhanced=read('src/portal-sales-tunnel-v97.js');
const catalogV98=read('src/portal-sales-tunnel-v98.js');
const visualsV98=read('src/media-catalog-visuals-v98.js');
const stripe=read('src/stripe-journey-v90.js');
const studio=read('public/studio/sales-configuration-v96.js');
const client=read('public/espace-client/sales-catalog-v96.js');
const tunnel=read('public/reserver/assets/app-v96.js');
const css=read('public/reserver/assets/styles-v96.css');
const html=read('public/reserver/index.html');
const terms=read('public/reserver/conditions/index.html');

expect('root Worker targets active v36',rootWrangler.includes('neptune-tv-media-cloudflare/src/entry-v36.js'));
expect('local Worker targets v36',localWrangler.includes('src/entry-v36.js'));
expect('v36 preserves v35 sales tunnel',activeEntry36.includes("from './entry-v35.js'")&&activeEntry36.includes("from './store-v29.js'"));
expect('v35 preserves v34 sales tunnel',activeEntry.includes("from './entry-v34.js'"));
expect('v34 preserves v33 and v28 store',entry.includes("from './entry-v33.js'")&&entry.includes("from './store-v28.js'"));
expect('v29 store extends v28 and overlays v98',store29.includes("from './store-v28.js'")&&store29.includes("from './portal-sales-tunnel-v98.js'")&&store29.includes('publicSalesCatalogV98'));
expect('v28 store extends v27',store.includes("from './store-v27.js'"));
expect('v28 overlays v97 on compatible v96 routes',store.includes("from './portal-sales-tunnel-v97.js'")&&store.includes('publicSalesCatalogV97')&&store.includes('saveTunnelSelectionV97')&&store.includes('startTunnelProspectV97')&&store.includes('tunnelProspectContextV97'));
expect('v97 still depends on v96 option guard',enhanced.includes('ensureSalesTunnelOptionsV96Schema')&&enhanced.includes('portal_reservation_configuration_v96'));
expect('v98 visual overlay resolves catalog visuals',catalogV98.includes('formatVisualV98')&&catalogV98.includes('configurationVisualV98')&&visualsV98.includes('portal_media_format_visuals_v98'));
expect('media DNS is not claimed as Worker custom domain',!rootWrangler.includes('"pattern": "media.neptunebusiness.com"')&&!localWrangler.includes('"pattern": "media.neptunebusiness.com"'));
expect('canonical booking URL remains Studio domain',rootWrangler.includes('"BOOKING_URL": "https://tv.neptunebusiness.com/reserver"')&&localWrangler.includes('"BOOKING_URL": "https://tv.neptunebusiness.com/reserver"'));
expect('reserver is served without index redirect loop',entry.includes("url.pathname==='/reserver'")&&entry.includes("assetRequest(request,'/reserver/')")&&entry.includes("assetRequest(request,'/reserver/conditions/')")&&!entry.includes("assetRequest(request,'/reserver/index.html')"));

expect('contact capture requires first last email phone',backend.includes('firstName')&&backend.includes('lastName')&&backend.includes('normalizeEmail')&&backend.includes('normalizePhone')&&tunnel.includes("field('Téléphone','phone'"));
expect('multi-city supplier offer schema remains',backend.includes('portal_media_cities_v96')&&backend.includes('portal_media_offers_v96')&&backend.includes('city_id TEXT NOT NULL')&&backend.includes('format_id TEXT NOT NULL')&&backend.includes('supplier_id TEXT NOT NULL')&&backend.includes('payment_url TEXT NOT NULL'));
expect('order sales snapshot remains',backend.includes('portal_order_sales_v96'));
expect('supplier finance auto-assignment remains',backend.includes('portal_supplier_finance_v95')&&backend.includes('o.supplier_id')&&backend.includes("'assigned'"));
expect('supplier-specific configurations remain persisted',options.includes('portal_offer_configurations_v96')&&options.includes('portal_reservation_configuration_v96'));
expect('legacy configurations preserved',options.includes("['Chaise','Canapé']")&&options.includes("['Plateau','Bar','Chaise','Canapé','Sur-mesure']"));
expect('server still rejects invalid configurations',options.includes('configuration_required')&&options.includes('configuration_not_available'));

expect('v97 pricing is server-authoritative',enhanced.includes("status='paid'")&&enhanced.includes("source LIKE 'neptune_media_tunnel_v%'")&&enhanced.includes('paidTunnelCount'));
expect('v97 first 3 bookings use cost tier',enhanced.includes('if(paid<3)')&&enhanced.includes("key:'launch'")&&enhanced.includes('Math.max(0,3-paid)'));
expect('v97 bookings 4 to 10 use preferential tier',enhanced.includes('if(paid<10)')&&enhanced.includes("key:'promo'")&&enhanced.includes('Math.max(0,10-paid)'));
expect('v97 booking 11+ uses normal tier',enhanced.includes("key:'base'")&&enhanced.includes("label:'Tarif normal'"));
expect('tier is re-resolved server-side before payment',enhanced.includes('currentTier(store)')&&enhanced.includes('resolveTierOffer(variants,tier.key)')&&enhanced.includes('decoratePaymentUrl(offer.paymentUrl'));
expect('exact Stripe opportunity reference remains',enhanced.includes('NPOPP_${opportunityId}')&&stripe.includes("kind === 'NPOPP'")&&stripe.includes('opportunityId'));
expect('original HN Stripe tiers remain',backend.includes('89000')&&backend.includes('149000')&&backend.includes('199000')&&backend.includes('cNi8wPelvgXw9FIdSK73G06')&&backend.includes('8x214n2CN22C5ps9Cu73G0a')&&backend.includes('14AcN5gtD7mW19c8yq73G07'));
expect('original Libre Stripe tiers remain',backend.includes('79000')&&backend.includes('99000')&&backend.includes('109000')&&backend.includes('fZu9AT1yJ5eO2dg4ia73G05')&&backend.includes('dRm14nfpz8r04lo7um73G09')&&backend.includes('28EcN5a5fcHg5psdSK73G08'));

expect('Stripe Payment Links redirect to Neptune confirmation',enhanced.includes('after_completion[type]')&&enhanced.includes('after_completion[redirect][url]')&&enhanced.includes('{CHECKOUT_SESSION_ID}')&&enhanced.includes('https://tv.neptunebusiness.com/reserver?payment=success'));
expect('Stripe redirect sync is idempotent',enhanced.includes('portal_sales_runtime_v97')&&enhanced.includes('stripe_redirect_version'));

expect('legacy format poster fallback remains available',enhanced.includes('/assets/posters/hors-norme-wide.webp')&&enhanced.includes('/assets/posters/concept-libre-wide.webp')&&tunnel.includes('visual-format-card')&&tunnel.includes('format-visual'));
expect('configuration fallback assets remain available',enhanced.includes('/assets/formats/exact-hn1.b64')&&enhanced.includes('/assets/formats/exact-hn2.b64')&&enhanced.includes('/assets/formats/exact-cl1.b64')&&tunnel.includes('configuration-visual')&&tunnel.includes('hydrateB64Images'));
expect('v98 corrects HN canapé and chaise mapping',visualsV98.includes("n.includes('canap')")&&visualsV98.includes("'/assets/formats/exact-hn1.b64'")&&visualsV98.includes("n.includes('chaise')")&&visualsV98.includes("'/assets/formats/exact-hn2.b64'"));
expect('raw date input replaced by visual calendar',tunnel.includes('calendar-shell')&&tunnel.includes('renderCalendarDays')&&tunnel.includes('data-date')&&!tunnel.includes('type="date"'));
expect('slot selection uses morning and afternoon buttons',tunnel.includes('data-slot="morning"')&&tunnel.includes('9h – 12h')&&tunnel.includes('data-slot="afternoon"')&&tunnel.includes('14h – 17h'));
expect('business-day guard exists client and server',enhanced.includes('isBusinessDay')&&enhanced.includes('frenchHolidays')&&tunnel.includes('isBusinessSelectable')&&tunnel.includes('frenchHolidays'));
expect('urgency banner reflects pricing tier',tunnel.includes('renderUrgency')&&tunnel.includes('PRIX COÛTANT')&&tunnel.includes('TARIF PRÉFÉRENTIEL')&&css.includes('.pricing-alert')&&css.includes('.launch-banner[data-tier="promo"]'));
expect('payment button uses selected payment URL and CGV gate',tunnel.includes('id="payLink"')&&tunnel.includes('href="${esc(state.paymentUrl)}"')&&tunnel.includes('termsAccepted')&&tunnel.includes('/reserver/conditions')&&terms.includes('Conditions Générales de Vente'));
expect('payment return has confirming stage',tunnel.includes("'payment-confirming'")&&tunnel.includes("params.get('payment')==='success'")&&tunnel.includes('renderPaymentConfirming'));
expect('confirmation explains supplier date validation',tunnel.includes('Le fournisseur vérifie maintenant votre créneau')&&tunnel.includes('proposition de date alternative'));
expect('Google Appointment Scheduling is embedded',tunnel.includes('calendar.google.com/calendar/appointments/schedules/AcZssZ0Zxy57HrKj43TqUhbv9bMsGMbkgyg1MnuGdxFhb3W_LcNr2SqGtfO0AR8noAdLDwlnSqriORjU')&&tunnel.includes('<iframe'));
expect('Google preparation fallback link remains',tunnel.includes('calendar.app.google/X9q1T5JT9ngMfZY67')&&rootWrangler.includes('https://calendar.app.google/X9q1T5JT9ngMfZY67'));
expect('public tunnel does not expose supplier identity',!tunnel.includes('supplierName')&&!tunnel.includes('RECBOX'));

expect('Studio still manages cities offers suppliers and configurations',studio.includes('Villes du tunnel')&&studio.includes('Offres & liens Stripe')&&studio.includes('Fournisseur')&&studio.includes('Configurations disponibles')&&studio.includes('configurationOptions'));
expect('client space still groups formats by city',client.includes('v96-client-city')&&client.includes("new URL('/reserver'"));
expect('v35 release still exposes sales capabilities through v34',entry.includes('salesCatalog')&&entry.includes('salesProspect')&&entry.includes('salesStudioConfig'));
expect('responsive tunnel shell preserved',html.includes('viewport-fit=cover')&&html.includes('id="app-content"')&&css.includes('@media(max-width:820px)')&&css.includes('.calendar-shell'));

const failed=checks.filter(x=>!x.ok);
for(const c of checks)console.log(`${c.ok?'✓':'✗'} ${c.name}`);
if(failed.length){console.error(`Sales tunnel v97 verification failed: ${failed.length} check(s).`);process.exit(1);}
console.log(`Sales tunnel v97 verified through active v98 catalog overlay: ${checks.length} checks.`);
