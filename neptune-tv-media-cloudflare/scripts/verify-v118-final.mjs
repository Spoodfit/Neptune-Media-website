import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const checks=[];
const expect=(name,condition)=>checks.push({name,ok:Boolean(condition)});

const rootWrangler=read('../wrangler.jsonc');
const localWrangler=read('wrangler.jsonc');
const entry=read('src/entry-v38.js');
const control=read('src/webtv-control-v118.js');
const encoder=read('containers/webtv/encoder-v118.mjs');
const docker=read('containers/webtv/Dockerfile');
const studio=read('public/studio/webtv-native-v118.js');
const wizard=read('public/studio/client-passage-wizard-v118.js');

expect('root Worker targets v38',rootWrangler.includes('neptune-tv-media-cloudflare/src/entry-v38.js'));
expect('local Worker targets v38',localWrangler.includes('src/entry-v38.js'));
expect('v38 preserves v37',entry.includes("from './entry-v37.js'"));
expect('v38 exposes public direct',entry.includes("url.pathname==='/direct/'")&&entry.includes("'/api/public/webtv/state'")&&entry.includes("'/direct/live/'"));
expect('v38 injects the guided passage wizard',entry.includes('client-passage-wizard-v118.js')&&entry.includes('client-passage-wizard-v118.css'));
expect('v38 injects native WebTV Studio controls',entry.includes('webtv-native-v118.js'));
expect('v38 cron maintains v118 WebTV',entry.includes("controller?.cron==='* * * * *'")&&entry.includes('maintainWebTvV118(env)'));
expect('media.neptunebusiness.com is not claimed as a Worker custom domain',!rootWrangler.includes('"pattern": "media.neptunebusiness.com"')&&!localWrangler.includes('"pattern": "media.neptunebusiness.com"'));

expect('WebTV primary provider is Neptune HLS',control.includes("provider:'neptune'")&&control.includes("protocol:'hls'")&&control.includes("manifestUrl:'/direct/live/index.m3u8'"));
expect('YouTube is optional',control.includes("youtube_start")&&control.includes("youtube_stop")&&control.includes('youtubeConfigured(env)'));
expect('WebTV activation does not require YouTube',!control.includes("state.enabled&&!youtubeConfigured(env)"));
expect('public state exposes schedule',control.includes('schedule=[]')&&control.includes('estimatedEndAt')&&control.includes("watchUrl:'/direct/'"));
expect('public live proxy is bounded to HLS assets',control.includes('index\\.m3u8|segment-\\d+\\.ts'));

expect('container runs v118 encoder',docker.includes('encoder-v118.mjs'));
expect('encoder has independent native and YouTube relays',encoder.includes('nativeRelay')&&encoder.includes('youtubeRelay')&&encoder.includes('NATIVE_PORT')&&encoder.includes('YOUTUBE_PORT'));
expect('encoder detects YouTube-only changes',encoder.includes('programChanged')&&encoder.includes('youtubeOnlyChange'));
expect('YouTube-only changes preserve playout',encoder.includes("if((revisionChanged||next.forceRestart)&&!youtubeOnlyChange)restartPlayout"));
expect('YouTube relay can restart independently',encoder.includes("restartYoutube('youtube_configuration_changed')"));
expect('native HLS remains primary',encoder.includes('buildNativeRelayArgs')&&encoder.includes("'-f','hls'"));

expect('Studio offers one-click YouTube simulcast controls',studio.includes('youtube_start')&&studio.includes('youtube_stop'));
expect('Studio labels Neptune as primary destination',studio.includes('Neptune'));

expect('wizard has five guided steps',wizard.includes("['Client','Format','Tarif','Rendez-vous','Validation']"));
expect('wizard consumes canonical media catalog context',wizard.includes("'/api/admin/media-catalog-v98/context'"));
expect('wizard consumes supplier rates',wizard.includes('supplierRates')&&wizard.includes('supplierRateId'));
expect('catalog offer must be explicitly selected',wizard.includes("if(!offer)return'Sélectionnez le tarif client du catalogue.'"));
expect('zero or invalid catalog client tariff is rejected',wizard.includes('!Number.isFinite(amount)||amount<=0'));
expect('manual tariff must be strictly positive',wizard.includes("Number(model.amountTotal)<=0")&&wizard.includes('montant client supérieur à 0 €'));
expect('wizard carries canonical offer reference',wizard.includes('offerId:model.offerId'));
expect('wizard identifies v118 source on order creation',wizard.includes('sourceVersion:RELEASE'));
expect('wizard reuses existing client-order workflow',wizard.includes("post('/api/admin/client-order',payload,true)"));
expect('Google appointment schedule remains integrated',wizard.includes('calendar.google.com/calendar/appointments/schedules/'));

const failed=checks.filter(check=>!check.ok);
for(const check of checks)console.log(`${check.ok?'✓':'✗'} ${check.name}`);
if(failed.length){
  console.error(`v118 final verification failed: ${failed.length} check(s).`);
  process.exit(1);
}
console.log(`v118 final contract verified: ${checks.length} checks.`);
