import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const checks=[];
const expect=(name,condition)=>checks.push({name,ok:Boolean(condition)});

const rootWrangler=read('../wrangler.jsonc');
const localWrangler=read('wrangler.jsonc');
const entry42=read('src/entry-v42.js');
const entry41=read('src/entry-v41.js');
const entry40=read('src/entry-v40.js');
const entry39=read('src/entry-v39.js');
const entry38=read('src/entry-v38.js');
const control=read('src/webtv-control-v118.js');
const encoder=read('containers/webtv/encoder-v118.mjs');
const docker=read('containers/webtv/Dockerfile');
const studio=read('public/studio/webtv-native-v118.js');
const wizard=read('public/studio/client-passage-wizard-v118.js');

expect('root Worker targets active v42 wrapper',rootWrangler.includes('neptune-tv-media-cloudflare/src/entry-v42.js'));
expect('local Worker targets active v42 wrapper',localWrangler.includes('src/entry-v42.js'));
expect('v42 preserves v41',entry42.includes("from './entry-v41.js'"));
expect('v41 preserves v40',entry41.includes("from './entry-v40.js'"));
expect('v40 preserves v39',entry40.includes("from './entry-v39.js'"));
expect('v40 fixes Hls.js worker CSP',entry40.includes('worker-src')&&entry40.includes('blob:')&&entry40.includes('neptune-webtv-playback-20260815-v119.5'));
expect('v39 preserves current client v38',entry39.includes("from './entry-v38.js'"));
expect('v38 client evolution remains below v39',entry38.length>0);
expect('v39 exposes public direct',entry39.includes("url.pathname==='/direct/'")&&entry39.includes("'/api/public/webtv/state'")&&entry39.includes("'/direct/live/'"));
expect('v39 injects guided passage wizard',entry39.includes('client-passage-wizard-v118.js')&&entry39.includes('client-passage-wizard-v118.css'));
expect('v39 injects native WebTV controls',entry39.includes('webtv-native-v118.js'));
expect('v39 cron maintains native WebTV',entry39.includes("controller?.cron==='* * * * *'")&&entry39.includes('maintainWebTvV118(env)'));
expect('media.neptunebusiness.com remains external to Worker custom-domain ownership',!rootWrangler.includes('"pattern": "media.neptunebusiness.com"')&&!localWrangler.includes('"pattern": "media.neptunebusiness.com"'));

expect('WebTV primary provider is Neptune HLS',control.includes("provider:'neptune'")&&control.includes("protocol:'hls'")&&control.includes("manifestUrl:'/direct/live/index.m3u8'"));
expect('YouTube remains optional',control.includes('youtube_start')&&control.includes('youtube_stop'));
expect('WebTV activation has no YouTube prerequisite',!control.includes('state.enabled&&!youtubeConfigured(env)'));
expect('public state exposes schedule',control.includes('schedule=[]')&&control.includes('estimatedEndAt'));

expect('container runs v118 native encoder',docker.includes('encoder-v118.mjs'));
expect('encoder has independent native and YouTube relays',encoder.includes('nativeRelay')&&encoder.includes('youtubeRelay'));
expect('encoder detects YouTube-only changes',encoder.includes('programChanged')&&encoder.includes('youtubeOnlyChange'));
expect('YouTube-only changes preserve Neptune playout',encoder.includes("if((revisionChanged||next.forceRestart)&&!youtubeOnlyChange)restartPlayout"));
expect('YouTube relay restarts independently',encoder.includes("restartYoutube('youtube_configuration_changed')"));
expect('native HLS remains the primary relay',encoder.includes('buildNativeRelayArgs')&&encoder.includes("'-f','hls'"));
expect('Studio exposes one-click YouTube simulcast actions',studio.includes('youtube_start')&&studio.includes('youtube_stop'));

expect('wizard has five guided steps',wizard.includes("['Client','Format','Tarif','Rendez-vous','Validation']"));
expect('wizard consumes canonical catalog context',wizard.includes("'/api/admin/media-catalog-v98/context'"));
expect('wizard consumes supplier rates',wizard.includes('supplierRates')&&wizard.includes('supplierRateId'));
expect('catalog client offer must be selected',wizard.includes("if(!offer)return'Sélectionnez le tarif client du catalogue.'"));
expect('zero or invalid catalog tariff is rejected',wizard.includes('!Number.isFinite(amount)||amount<=0'));
expect('manual tariff must be strictly positive',wizard.includes('Number(model.amountTotal)<=0')&&wizard.includes('montant client supérieur à 0 €'));
expect('wizard carries the canonical offer reference',wizard.includes('offerId:model.offerId'));
expect('wizard identifies its source version',wizard.includes('sourceVersion:RELEASE'));
expect('wizard reuses the existing order workflow',wizard.includes("post('/api/admin/client-order',payload,true)"));
expect('Google appointment schedule remains integrated',wizard.includes('calendar.google.com/calendar/appointments/schedules/'));

const failed=checks.filter(check=>!check.ok);
for(const check of checks)console.log(`${check.ok?'✓':'✗'} ${check.name}`);
if(failed.length){console.error(`v119.1 final verification failed: ${failed.length} check(s).`);process.exit(1);}
console.log(`v119.1 final contract verified through active v42→v41→v40 chain: ${checks.length} checks.`);
