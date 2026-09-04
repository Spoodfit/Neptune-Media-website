import { readFileSync } from 'node:fs';

const read=(path)=>readFileSync(path,'utf8');
const assert=(condition,message)=>{if(!condition)throw new Error(message);};

const clientJs=read('neptune-tv-media-cloudflare/public/espace-client/client-hors-norme-personalization-v139.js');
const clientCss=read('neptune-tv-media-cloudflare/public/espace-client/client-hors-norme-personalization-v139.css');
const bookingJs=read('neptune-tv-media-cloudflare/public/reserver/assets/catalog-commerce-v143.js');
const confirmationHtml=read('neptune-tv-media-cloudflare/public/reserver/confirmation/index.html');
const confirmationJs=read('neptune-tv-media-cloudflare/public/reserver/confirmation/confirmation.js');
const catalogJs=read('neptune-tv-media-cloudflare/public/studio/studio-catalog-commerce-v143-4.js');
const webtvJs=read('neptune-tv-media-cloudflare/public/studio/webtv-monitor-controls-v135.js');
const presenterJs=read('neptune-tv-media-cloudflare/src/portal-presenters-v146.js');
const store=read('neptune-tv-media-cloudflare/src/store-v29.js');
const historicalStripeRedirect=read('neptune-tv-media-cloudflare/src/stripe-redirect-v146.js');
const canonicalStripeRedirect=read('neptune-tv-media-cloudflare/src/reservation-stripe-redirect-v180.js');
const entry47=read('neptune-tv-media-cloudflare/src/entry-v47.js');
const salesCatalog=read('neptune-tv-media-cloudflare/src/portal-sales-tunnel-v98.js');

// Client preparation: the accidental question-selection product must be retired.
assert(clientJs.includes('removeQuestionPersonalization'), 'client preparation does not retire question personalization');
assert(!clientJs.includes("const PHASES=["), 'legacy question-personalization phases are still active');
assert(!clientJs.includes("/api/client/hors-norme-personalization"), 'legacy question-personalization API is still called by the client');
assert(clientCss.includes('.hn-personalization-v139,.hn-personalization-dialog-v139,.hn-toast-v139{display:none!important}'), 'legacy personalization UI is not hard-hidden');
assert(clientCss.includes('#ccDetailRegion:not([data-neptune-user-open="1"])'), 'client detail is not closed by default');
assert(clientJs.includes("region.dataset.neptuneUserOpen='1'"), 'client detail cannot be explicitly opened by a stage click');
assert(clientJs.includes('offer?.configurations'), 'future-format preparation cards are not derived from catalogue configurations');
assert(clientJs.includes('formatPreparationCards'), 'generic format preparation card renderer is missing');

// Payment authority: Stripe/webhook is authoritative; no client-declared payment state.
assert(bookingJs.includes('installPaymentAuthorityGuard'), 'payment authority guard missing');
assert(bookingJs.includes('data-payment-confirm'), 'manual payment confirmation controls are not explicitly retired');
assert(confirmationHtml.includes('Vous n’avez rien à valider manuellement'), 'historical confirmation page does not state automatic Stripe verification');
assert(confirmationJs.includes("String(data.status||'').toLowerCase()==='paid'"), 'historical confirmation cannot open before paid server status');
assert(confirmationJs.includes('Le paiement a été validé automatiquement par Stripe'), 'Stripe-confirmed copy missing from historical confirmation route');
assert(confirmationJs.includes('preparationBookingUrl'), 'historical confirmation route does not hand off to preparation booking');

// The v146 dedicated TV confirmation route remains as backwards compatibility only.
assert(historicalStripeRedirect.includes("after_completion[redirect][url]"), 'historical Stripe Payment Link redirect synchronizer missing');
assert(salesCatalog.includes('ensureStripeConfirmationRedirectV146'), 'historical sales catalogue compatibility hook is missing');
assert(salesCatalog.includes('stripeConfirmation'), 'historical sales catalogue does not expose safe redirect-sync status');

// Canonical production return now stays in the active media-domain tunnel, where payment state is server verified.
const expectedStripeUrl='https://media.neptunebusiness.com/reserver?payment=success&session_id={CHECKOUT_SESSION_ID}';
assert(canonicalStripeRedirect.includes(`RESERVATION_STRIPE_RETURN_URL='${expectedStripeUrl}'`), 'canonical Stripe return URL is not the media-domain reservation tunnel');
assert(canonicalStripeRedirect.includes("after_completion[redirect][url]"), 'canonical Stripe Payment Link redirect synchronizer missing');
assert(canonicalStripeRedirect.includes("LEGACY_STATE_KEY='stripe_redirect_version'"), 'canonical synchronizer does not freeze the legacy redirect state');
assert(entry47.includes('ensureCanonicalStripeRedirectV180'), 'active entry does not invoke the canonical Stripe redirect synchronizer');

// Catalogue: simple actions must publish the exact public catalogue, not only write admin data.
assert(catalogJs.includes('Qu’est-ce que vous ajoutez ?'), 'simple catalogue entry point missing');
assert(catalogJs.includes('Publier dans le tunnel'), 'simple publishing flow missing');
assert(catalogJs.includes("geo.api.gouv.fr/communes"), 'simple city lookup missing');
assert(catalogJs.includes('verifyPublished(cityId,formatId)'), 'catalogue does not verify public tunnel publication after save');
assert(catalogJs.includes("PUBLIC_CATALOG='/api/reservation/catalog-v96'"), 'catalogue publication is not checked against the sales tunnel source');
assert(catalogJs.includes("FORMAT_API='/api/admin/media-catalog-v98/format/save'"), 'simple new-format flow missing');
assert(catalogJs.includes("accept=\"image/jpeg,image/png,image/webp\""), 'new-format visual upload missing');
assert(catalogJs.includes('configurationOptions:familyForFormat?.configurationOptions||[]'), 'format cards/configurations are not propagated to newly published offers');

// Presenters: support club ranks now, without forcing them into the simple publishing path.
assert(presenterJs.includes("new Set(['presenter','captain','admiral'])"), 'presenter/captain/admiral roles are not modeled');
assert(presenterJs.includes('portal_media_family_presenter_v146'), 'presenter assignment to city/format/supplier family is missing');
assert(store.includes('handleMediaPresentersV146'), 'presenter API is not wired into the active Store');

// Diffusion monitor must remain a classic landscape player.
assert(webtvJs.includes('ensureLandscapeMonitor'), 'Diffusion landscape monitor guard missing');
assert(webtvJs.includes('aspect-ratio:16/9!important'), 'Diffusion player is not locked to 16:9');
assert(webtvJs.includes('object-fit:contain!important'), 'Diffusion video can be stretched/cropped');

console.log(JSON.stringify({ok:true,release:'neptune-simplified-client-catalog-booking-20260905-v180',stripeConfirmationUrl:expectedStripeUrl},null,2));
