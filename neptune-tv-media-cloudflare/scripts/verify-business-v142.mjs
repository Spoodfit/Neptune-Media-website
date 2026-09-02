import fs from 'node:fs';
const read=(p)=>fs.readFileSync(p,'utf8');
const engine=read('neptune-tv-media-cloudflare/src/catalog-booking-cost-v142.js');
const core=read('neptune-tv-media-cloudflare/src/business-v142-core.js');
const bookingServer=read('neptune-tv-media-cloudflare/src/business-v142-booking.js');
const prep=read('neptune-tv-media-cloudflare/src/business-v142-preparation.js');
const entry=read('neptune-tv-media-cloudflare/src/entry-v43.js');
const entry44=read('neptune-tv-media-cloudflare/src/entry-v44.js');
const entry45=read('neptune-tv-media-cloudflare/src/entry-v45.js');
const entry46=read('neptune-tv-media-cloudflare/src/entry-v46.js');
const booking=read('neptune-tv-media-cloudflare/public/reserver/assets/booking-slots-v142.js');
const studio=read('neptune-tv-media-cloudflare/public/studio/studio-business-v142.js');
const rootWrangler=read('wrangler.jsonc');
const workerWrangler=read('neptune-tv-media-cloudflare/wrangler.jsonc');
const checks=[
['historical v43 inherits v42',entry.includes("from './entry-v42.js'")],
['historical v43 exports StudioStore subclass',entry.includes('class StudioStore extends BaseStudioStore')],
['historical v43 store routing retained',entry.includes('handleBusinessV142Store')],
['historical v43 HTTP routing retained',entry.includes('handleBusinessV142Http')],
['historical v43 preparation scheduler retained',entry.includes("controller?.cron==='* * * * *'")&&entry.includes('sendDuePreparationPacksV142')],
['supplier booking block schema',core.includes('portal_supplier_booking_blocks_v142')],
['single hold per prospect',core.includes('idx_booking_block_prospect_v142')],
['duration source of truth',core.includes('totalMinutes||s.shootMinutes')],
['normalized supplier pricing',core.includes('normalizeSupplierCost')&&core.includes('equivalentHourlyGrossCents')],
['supplier source price snapshot',core.includes('source_rate_gross_cents')&&core.includes('source_rate_duration_minutes')],
['overlap lock',core.includes("start_at<? AND end_at>?")&&core.includes('hasConflict')],
['manual Studio preflight',engine.includes("'/api/admin/client-order'")&&bookingServer.includes('manualPreflightV142')],
['agenda/journey preflight',engine.includes("'/api/admin/journey-v92/action'")&&bookingServer.includes('journeyPreflightV142')],
['canonical/fuzzy city guard',core.includes('cityLooksSame')&&core.includes('editDistance')],
['optional versioned preparation packs',core.includes('portal_preparation_packs_v142')&&prep.includes('version=Number(current?.version||0)+1')],
['preparation send idempotency',core.includes('UNIQUE(order_id,pack_version)')],
['exact slot transmitted by client',booking.includes('slotStart:slot.startAt')&&booking.includes('slotEnd:slot.endAt')],
['duration driven slot API',booking.includes('/api/reservation/slots-v142')&&core.includes('generateSlots')],
['Studio TTC/HT rate editor and preparation editor',studio.includes('Montant exprimé en')&&studio.includes('Cartes de préparation')],
['active v46 preserves v142 through v45 -> v44 while v44 directly preserves v40, Drive v137/v138 and v139 personalization',rootWrangler.includes('neptune-tv-media-cloudflare/src/entry-v46.js')&&fs.lstatSync('neptune-tv-media-cloudflare/wrangler.jsonc').isSymbolicLink()&&workerWrangler===rootWrangler&&entry46.includes("from './entry-v45.js'")&&entry45.includes("from './entry-v44.js'")&&entry44.includes("from './entry-v40.js'")&&!entry44.includes("from './entry-v41.js'")&&!entry44.includes("from './entry-v42.js'")&&!entry44.includes("from './entry-v43.js'")&&entry44.includes('handleDriveManualValidationV138')&&entry44.includes('recoverDriveStagingUploadsV137')&&entry44.includes('handleHorsNormePersonalizationV139')&&entry44.includes('handleBusinessV142Store')&&entry44.includes('handleBusinessV142Http')&&entry44.includes('sendDuePreparationPacksV142')],
['720 TTC / 180 min = 240 TTC/h',Math.round(72000*60/180)===24000],
];
const failures=checks.filter(([,ok])=>!ok);for(const[name,ok]of checks)console.log(`${ok?'✓':'✗'} ${name}`);if(failures.length){console.error(`Business v142 verification failed: ${failures.length}/${checks.length}`);process.exit(1)}console.log(`Business v142 verification passed: ${checks.length}/${checks.length}`);
