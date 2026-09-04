import fs from 'node:fs';

const read=path=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const entry47=read('src/entry-v47.js');
const entry46=read('src/entry-v46.js');
const store=read('src/catalog-family-update-v169.js');
const ui=read('public/studio/studio-catalog-effective-visibility-v169.js');
const css=read('public/studio/studio-catalog-effective-visibility-v169.css');
let failures=0;
const check=(label,ok)=>{if(ok)console.log(`✓ ${label}`);else{console.error(`✗ ${label}`);failures++}};

check('active v47 preserves v46 catalog-family runtime',entry47.includes("from './entry-v46.js'")&&entry46.includes('handleCatalogFamilyUpdateV169Store(this,request)'));
check('active v46 layer injects effective visibility UX',entry46.includes('studio-catalog-effective-visibility-v169.js')&&entry46.includes('X-Neptune-Catalog-Effective-Visibility'));
check('family update resolves existing tiers by ID',store.includes('findOfferById(store,inputId)'));
check('family update changes the existing row instead of re-inserting its ID',store.includes('UPDATE portal_media_offers_v96 SET city_id=?,format_id=?,supplier_id=?'));
check('family update blocks target-family duplicates with a controlled 409',store.includes('atTarget&&byId.id!==atTarget.id')&&store.includes('},409)'));
check('family update validates full tier plan before writes',store.indexOf('const plan=[]')<store.indexOf('const service=ensureService'));
check('offer list distinguishes effective visibility from own active flag',ui.includes("badge.textContent='Non visible'")&&ui.includes('offerVisibility(data,family)'));
check('offer form explains inherited parent blockers',ui.includes('Non visible dans le tunnel')&&ui.includes('parentBlockers(data'));
check('hidden parent choices are labelled in selects',ui.includes('— MASQUÉ'));
check('city supplier and concept visibility participate in inheritance',ui.includes("kind:'ville'")&&ui.includes("kind:'fournisseur'")&&ui.includes("kind:'concept'"));
check('visibility states have dedicated blocked styling',css.includes('.v169-visibility-callout.is-blocked')&&css.includes('.v147-row em.is-blocked'));

if(failures)throw new Error(`Catalog v169 verification failed (${failures} check(s)).`);
console.log('Catalog effective visibility + safe hierarchy update v169 verified through active v47 -> v46 chain.');
