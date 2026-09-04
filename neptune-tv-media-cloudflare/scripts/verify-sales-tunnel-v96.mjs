import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const checks=[];
const expect=(name,ok)=>checks.push({name,ok:Boolean(ok)});

const rootWrangler=read('../wrangler.jsonc');
const localWrangler=read('wrangler.jsonc');
const entry47=read('src/entry-v47.js');
const entry46=read('src/entry-v46.js');
const domain=read('src/reservation-domain-v173.js');
const policy=read('src/reservation-policy-v173.js');
const slots=read('src/reservation-slot-management-v172.js');
const stripeReturn=read('src/reservation-stripe-redirect-v180.js');
const projection=read('src/reservation-client-projection-v179.js');
const backend=read('src/portal-sales-tunnel-v96.js');
const enhanced=read('src/portal-sales-tunnel-v97.js');
const options=read('src/portal-sales-tunnel-options-v96.js');
const app=read('public/reserver/assets/app-v163.js');
const runtime=read('public/reserver/assets/tunnel-runtime-v179.js');
const availability=read('public/reserver/assets/reservation-availability-v172.js');
const memberGate=read('public/reserver/assets/member-gate-v170.js');
const clientTruth=read('public/espace-client/client-reservation-truth-v179.js');
const studioReservations=read('public/studio/studio-reservations-v172.js');
const html=read('public/reserver/index.html');
const css=read('public/reserver/assets/tunnel-focus-v172.css')+read('public/reserver/assets/tunnel-rhythm-v175.css')+read('public/reserver/assets/tunnel-conversion-v176.css');
const terms=read('public/reserver/conditions/index.html');

expect('canonical Worker entry is v47 in both configs',rootWrangler.includes('neptune-tv-media-cloudflare/src/entry-v47.js')&&localWrangler.includes('neptune-tv-media-cloudflare/src/entry-v47.js')&&rootWrangler===localWrangler);
expect('v47 preserves the complete existing Worker through v46',entry47.includes("from './entry-v46.js'"));
expect('media.neptunebusiness.com is an owned Worker custom domain',rootWrangler.includes('"pattern": "media.neptunebusiness.com"'));
expect('canonical booking URL is media.neptunebusiness.com/reserver',rootWrangler.includes('"BOOKING_URL": "https://media.neptunebusiness.com/reserver"'));
expect('canonical Stripe return targets media.neptunebusiness.com',stripeReturn.includes("https://media.neptunebusiness.com/reserver?payment=success&session_id={CHECKOUT_SESSION_ID}")&&entry47.includes('ensureCanonicalStripeRedirectV180'));
expect('legacy Stripe synchronizer is prevented from overwriting canonical return',stripeReturn.includes("LEGACY_STATE_KEY='stripe_redirect_version'")&&stripeReturn.includes("LEGACY_STATE_VALUE='v97-confirmation-20260811'"));

expect('email member entry remains the reservation identity gate',memberGate.includes('/api/reservation/member-entry-v171')&&memberGate.includes("type=\"email\"")&&!memberGate.includes('name="firstName"')&&!memberGate.includes('name="lastName"'));
expect('company step remains one organization field',app.includes('name="companyIdentity"')&&runtime.includes("label.textContent='Nom de l’entreprise'")&&runtime.includes("button.textContent='Continuer'"));
expect('active tunnel is domain driven',app.includes("const RELEASE='neptune-sales-tunnel-domain-driven-20260904-v178'")&&app.includes('/api/reservation/catalog-v96')&&app.includes('/api/reservation/selection-v96'));
expect('concept copy comes from canonical catalog description',app.includes("description=concise(c.description||c.editorialLine)")&&!runtime.includes('conceptCopy('));
expect('physical configuration copy comes from canonical configuration description',app.includes("concise(option?.description)")&&domain.includes('configurationVisualV98'));
expect('public tunnel never exposes supplier identity',!app.includes('supplierName')&&!runtime.includes('supplierName')&&!app.includes('RECBOX'));

expect('selection validation is intercepted server-side before legacy persistence',entry46.includes("'/sales-v173/validate-selection'")&&entry46.includes("url.pathname==='/api/reservation/selection-v96'")&&entry46.includes('if(!validation.ok)return'));
expect('reservation policy centralizes the 15-day rule',policy.includes('RESERVATION_MIN_LEAD_DAYS')&&domain.includes('reservationDatePolicyV173')&&domain.includes('nonBookableDatesForMonthV173'));
expect('availability endpoint uses canonical reservation domain',entry46.includes("'/sales-v172/availability'")&&entry46.includes('reservationAvailabilityV173'));
expect('client availability UI consumes server policy and occupied slots',availability.includes('/api/reservation/availability-v172')&&availability.includes('data.policy?.nonBookableDates')&&availability.includes('data.unavailable'));
expect('active slot uniqueness prevents double booking',slots.includes('CREATE UNIQUE INDEX IF NOT EXISTS idx_reservation_slots_active_v172')&&slots.includes("WHERE status IN ('hold','confirmed','blocked')"));
expect('payment hold remains time bounded',slots.includes('const HOLD_MINUTES=20')&&slots.includes("status='hold'"));
expect('Studio can block move confirm and cancel slots',studioReservations.includes("action:'block'")&&studioReservations.includes('data-action="move"')&&studioReservations.includes('data-action="confirm"')&&studioReservations.includes('data-action="cancel"')&&studioReservations.includes("if(action==='move')"));

expect('paid orders have immutable snapshots',domain.includes('portal_order_snapshots_v173')&&domain.includes('INSERT OR IGNORE INTO portal_order_snapshots_v173')&&domain.includes('capturePaidOrderSnapshotV173'));
expect('reservation lifecycle is separate from immutable purchase snapshot',domain.includes('portal_order_lifecycle_v173')&&domain.includes('syncOrderLifecycleV173'));
expect('Stripe/payment materialization captures snapshot and lifecycle',entry46.includes('capturePaidOrderSnapshotV173')&&entry46.includes('confirmOrderLifecycleV173'));
expect('historical paid orders are backfilled',domain.includes('backfillPaidOrderSnapshotsV173')&&entry46.includes('backfillPaidOrderSnapshotsV173'));
expect('client session receives snapshot plus current lifecycle',domain.includes('order.reservationSnapshot')&&domain.includes('order.reservation=')&&entry46.includes('enrichPortalSessionResponseV173'));
expect('client projection treats snapshot as authoritative commercial truth',projection.includes('reservationSnapshotAuthoritative=true')&&projection.includes('paid.paidAmountCents')&&projection.includes('reservationStatus'));
expect('client UI displays immutable amount and mutable current reservation state',clientTruth.includes('Montant payé')&&clientTruth.includes('Date actuelle')&&clientTruth.includes('Date réservée initialement')&&clientTruth.includes("r.status==='cancelled'"));

expect('legacy presentation JS stack is absent from static tunnel',!html.includes('/reserver/assets/sales-experience-v165.js')&&!html.includes('/reserver/assets/sales-experience-v166.js')&&!html.includes('/reserver/assets/tunnel-copy-v175.js')&&!html.includes('/reserver/assets/tunnel-conversion-v176.js'));
expect('one consolidated runtime owns presentation copy and conversion polish',html.includes('/reserver/assets/tunnel-runtime-v179.js')&&runtime.includes('neptune-reservation-runtime-20260905-v179.1'));
expect('calendar remains visual and uses morning/afternoon decisions',app.includes('calendar-shell')&&app.includes('data-slot="morning"')&&app.includes('data-slot="afternoon"')&&!app.includes('type="date"'));
expect('payment return keeps confirmation stage',app.includes("params.get('payment')==='success'")&&app.includes("'payment-confirming'")&&app.includes('renderPaymentConfirming'));
expect('manual already-paid block is removed from visible payment UI',runtime.includes("host.querySelectorAll('.payment-wait').forEach(node=>node.remove())")&&css.includes('.payment-wait'));
expect('real price saving and remaining-place urgency are emphasized',runtime.includes('pricing-saving-v176')&&runtime.includes('pricing-urgency-v176')&&css.includes('.pricing-urgency-number-v176'));
expect('terms and secure payment gate remain',app.includes('termsAccepted')&&app.includes('/reserver/conditions')&&terms.includes('Conditions Générales de Vente'));
expect('Google preparation scheduling remains available after confirmation',app.includes('calendar.google.com/calendar/appointments/schedules/')&&app.includes('calendar.app.google/X9q1T5JT9ngMfZY67'));
expect('responsive focused shell remains',html.includes('viewport-fit=cover')&&html.includes('id="app-content"')&&css.includes('@media(max-width:760px)'));

// Preserve the underlying v96/v97 commercial compatibility that existing orders and Stripe references still rely on.
expect('legacy sales schema and order-sales snapshot remain intact',backend.includes('portal_order_sales_v96')&&backend.includes('portal_media_offers_v96'));
expect('supplier-specific configuration persistence remains intact',options.includes('portal_offer_configurations_v96')&&options.includes('portal_reservation_configuration_v96'));
expect('server-authoritative launch/promo/base pricing tiers remain intact',enhanced.includes('paidTunnelCount')&&enhanced.includes("key:'launch'")&&enhanced.includes("key:'promo'")&&enhanced.includes("key:'base'"));
expect('exact Stripe opportunity reference remains intact',enhanced.includes('NPOPP_${opportunityId}'));

const failed=checks.filter(item=>!item.ok);
for(const item of checks)console.log(`${item.ok?'✓':'✗'} ${item.name}`);
if(failed.length){console.error(`Final reservation architecture verification failed: ${failed.length} check(s).`);process.exit(1);}
console.log(`Final reservation architecture verified: ${checks.length} checks across Studio, tunnel, Stripe and client space.`);
