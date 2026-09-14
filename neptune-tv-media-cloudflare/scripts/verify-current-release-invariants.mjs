import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8');
const contains = (content, needle, label) => assert.ok(content.includes(needle), `${label} is missing: ${needle}`);
const excludes = (content, needle, label) => assert.ok(!content.includes(needle), `${label} must not contain: ${needle}`);

const entry48 = read('neptune-tv-media-cloudflare/src/worker.js');
const entry38 = read('neptune-tv-media-cloudflare/src/entry-v38.js');
const clientVisualJs = read('neptune-tv-media-cloudflare/public/espace-client/client-visual-coherence-v118-2.js');
const clientVisualCss = read('neptune-tv-media-cloudflare/public/espace-client/client-visual-coherence-v118-2.css');
const clientInteraction = read('neptune-tv-media-cloudflare/public/espace-client/client-catalog-interaction-v118-7.js');
const reservationHtml = read('neptune-tv-media-cloudflare/public/reserver/index.html');
const reservationScroll = read('neptune-tv-media-cloudflare/public/reserver/assets/scroll-stability-v181.js');
const horsNorme = read('neptune-tv-media-cloudflare/public/hors-norme/index.html');

contains(entry48, 'neptune-client-catalog-click-20260913-v181.5-single-owner-native-anchor', 'entry-v48');
contains(entry48, 'client-visual-coherence-v118-2.js?v=20260913-4', 'entry-v48');
contains(entry48, 'sales-catalog-v96.js?v=20260913-1', 'entry-v48');
contains(entry48, 'media-catalog-v95.js?v=20260913-1', 'entry-v48');
contains(entry38, 'client-visual-coherence-v118-2.css?v=3', 'entry-v38');
contains(entry38, 'client-catalog-hover-v118-7.css?v=2', 'entry-v38');

contains(clientVisualJs, "clientCatalogDomOwner='visual-v1182'", 'client visual runtime');
contains(clientVisualJs, 'data-v1182-booking-card="true"', 'client visual runtime');
contains(clientVisualJs, "new URL('/espace-client/reserver/'", 'client visual runtime');
contains(clientVisualJs, 'pointer-events:none!important', 'client visual runtime');
excludes(clientVisualJs, 'MutationObserver', 'client visual runtime');
excludes(clientVisualCss, 'transform:translateY(-2px)!important;', 'client visual stylesheet');

contains(clientInteraction, 'neptune-client-catalog-interaction-20260913-v118.10-native-anchor-shim', 'client interaction runtime');
contains(clientInteraction, "clientCatalogNavigationOwner='native-anchor'", 'client interaction runtime');
for (const forbidden of ["addEventListener('pointerdown'", "addEventListener('pointerup'", "addEventListener('click'", 'preventDefault']) {
  excludes(clientInteraction, forbidden, 'client interaction runtime');
}

contains(reservationHtml, '20260908-v181-scroll-stability', 'reservation HTML');
contains(reservationHtml, 'scroll-stability-v181.js?v=20260908-1', 'reservation HTML');
contains(reservationHtml, 'overflow-anchor:none', 'reservation HTML');
contains(reservationScroll, 'neptune-reservation-scroll-stability-20260908-v181', 'reservation scroll runtime');
contains(reservationScroll, 'unexpectedReset', 'reservation scroll runtime');
contains(reservationScroll, 'restoreStablePosition', 'reservation scroll runtime');

for (const text of ['Une demi-journée.', '3 mois de contenus.', '30 contenus minimum', 'Demander mon créneau']) {
  contains(horsNorme, text, 'HORS NORME React landing');
}
contains(horsNorme, '/hors-norme/_next/', 'HORS NORME React landing');
contains(horsNorme, '/direct/?embed=1', 'HORS NORME WebTV embed');
excludes(horsNorme, 'hors-norme.mp4', 'HORS NORME React landing');
excludes(horsNorme, 'release-v182.txt', 'HORS NORME React landing');

console.log('Current Neptune Media release invariants: OK');
