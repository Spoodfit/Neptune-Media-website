import {readFile} from 'node:fs/promises';

const read=(path)=>readFile(new URL(`../${path}`,import.meta.url),'utf8');
const readRoot=(path)=>readFile(new URL(`../../${path}`,import.meta.url),'utf8');
const [entry44,entry40,entry39,entry38,entry37,entry36,entry35,entry34,entry33,control,nativeControl,media,directR2,encoder,nativeEncoder,html,ui,nativeUi,uploadUi,ia,navCompat,security,corsRaw,corsWorkflow,rootRaw,localRaw,rootPackageRaw,localPackageRaw]=await Promise.all([
  read('src/entry-v44.js'),read('src/entry-v40.js'),read('src/entry-v39.js'),read('src/entry-v38.js'),read('src/entry-v37.js'),read('src/entry-v36.js'),read('src/entry-v35.js'),read('src/entry-v34.js'),read('src/entry-v33.js'),read('src/webtv-control-v1.js'),read('src/webtv-control-v118.js'),read('src/webtv-media-v1.js'),read('src/webtv-r2-direct-v1.js'),read('containers/webtv/encoder.mjs'),read('containers/webtv/encoder-v118.mjs'),read('public/studio/webtv.html'),read('public/studio/webtv-v1.js'),read('public/studio/webtv-native-v118.js'),read('public/studio/webtv-upload-v4.js'),read('public/studio/studio-information-architecture-v65-1.js'),read('public/studio/webtv-nav-compat-v1.js'),read('src/security.js'),read('config/webtv-r2-cors-wrangler.json'),readRoot('.github/workflows/configure-webtv-r2-cors.yml'),readRoot('wrangler.jsonc'),read('wrangler.jsonc'),readRoot('package.json'),read('package.json'),
]);
const root=JSON.parse(rootRaw),local=JSON.parse(localRaw),cors=JSON.parse(corsRaw),rootPackage=JSON.parse(rootPackageRaw),localPackage=JSON.parse(localPackageRaw),failures=[];
const expect=(condition,message)=>{if(!condition)failures.push(message);};
const normalizeMain=(value)=>String(value||'').replace(/^neptune-tv-media-cloudflare\//u,'');
const rootChain=await traceEntryChain(normalizeMain(root.main));
const localChain=await traceEntryChain(normalizeMain(local.main));

for(const [name,chain] of [['racine',rootChain],['local',localChain]]){
  expect(chain[0]==='src/entry-v44.js'&&chain.includes('src/entry-v40.js')&&chain.includes('src/entry-v33.js'),`le Worker ${name} doit préserver la WebTV à travers la chaîne canonique v44 -> v40 -> v33 (${chain.join(' -> ')})`);
  expect(!chain.some(file=>['src/entry-v41.js','src/entry-v42.js','src/entry-v43.js'].includes(file)),`le Worker ${name} ne doit pas réintroduire les wrappers aplatis v41-v43 (${chain.join(' -> ')})`);
}
expect(entry44.includes("from './entry-v40.js'")&&entry44.includes("from './drive-upload-recovery-v137.js'"),'entry-v44 doit composer directement v40 tout en conservant la reprise Drive');
expect(entry40.includes("from './entry-v39.js'"),'entry-v40 doit prolonger entry-v39');
expect(entry40.includes('neptune-webtv-playback-20260815-v119.5')&&entry40.includes('worker-src')&&entry40.includes('blob:'),'entry-v40 doit conserver la correction CSP du lecteur Hls.js');
expect(entry39.includes("from './entry-v38.js'")&&entry39.includes("from './webtv-control-v118.js'"),'entry-v39 doit conserver la WebTV native');
expect(entry39.includes("'/api/public/webtv/state'")&&entry39.includes("'/direct/live/'")&&entry39.includes("'/direct/'"),'entry-v39 doit publier le direct Neptune natif');
expect(entry39.includes('client-passage-wizard-v118.js')&&entry39.includes('webtv-native-v118.js'),'entry-v39 doit préserver wizard et régie native');
expect(entry38.includes("from './entry-v37.js'")&&entry38.includes('client-experience-v117.js')&&entry38.includes('client-command-center-v118-1.js'),'expérience client v118 doit rester préservée');
expect(entry37.includes("from './entry-v36.js'"),'entry-v37 doit prolonger entry-v36');
for(const marker of ['neptune-studio-runtime-recovery-20260813-v115','Promise.allSettled','controlDegraded','retryWebTvStateV115','refreshRuntimeV115','webtv-v1.js?v=7','X-Neptune-WebTV-Runtime'])expect(entry37.includes(marker),`reprise Diffusion v115 absente : ${marker}`);
expect(entry36.includes("from './entry-v35.js'")&&entry36.includes('WebTvEncoder'),'entry-v36 doit préserver WebTvEncoder');
expect(entry35.includes("from './entry-v34.js'")&&entry35.includes("from './webtv-media-v1.js'")&&entry35.includes("typeof base.scheduled==='function'"),'entry-v35 doit préserver la médiathèque et les crons');
expect(entry34.includes("from './entry-v33.js'"),'entry-v34 doit prolonger entry-v33');
expect(entry33.includes("from './entry-v32.js'")&&entry33.includes('WebTvEncoder')&&entry33.includes('maintainWebTv'),'moteur WebTV historique doit rester exporté et surveillé');

for(const [name,config] of [['root',root],['local',local]]){
  const webtv=Array.isArray(config.containers)?config.containers.filter(item=>item.class_name==='WebTvEncoder'):[];
  expect(webtv.length===1,`${name}: un unique Container WebTvEncoder doit être déclaré`);
  expect(webtv[0]?.max_instances===1,`${name}: WebTvEncoder doit être limité à une instance`);
  expect(webtv[0]?.instance_type==='standard-2',`${name}: profil WebTV attendu standard-2`);
  expect(config.r2_buckets?.some(item=>item.binding==='MEDIA'&&item.bucket_name==='neptune-media-assets'),`${name}: bucket R2 MEDIA absent`);
  expect(config.durable_objects?.bindings?.some(item=>item.name==='WEBTV_ENCODER'&&item.class_name==='WebTvEncoder'),`${name}: binding WEBTV_ENCODER absent`);
  expect(config.triggers?.crons?.includes('* * * * *'),`${name}: watchdog minute absent`);
}
for(const [name,pkg] of [['root',rootPackage],['local',localPackage]]){
  expect(Boolean(pkg.dependencies?.['@cloudflare/containers']),`${name}: dépendance @cloudflare/containers absente`);
  expect(pkg.dependencies?.aws4fetch==='1.0.20',`${name}: aws4fetch 1.0.20 requis`);
}

for(const marker of ["import { Container, getContainer } from '@cloudflare/containers'",'YOUTUBE_RTMPS_URL','YOUTUBE_STREAM_KEY','getContainer(env.WEBTV_ENCODER, ENCODER_INSTANCE_NAME)',"'/api/admin/webtv/state'","'/api/admin/webtv/encoder'","url.protocol === 'rtmps:'"])expect(control.includes(marker),`contrat WebTV historique absent : ${marker}`);
for(const marker of ["import { Container, getContainer } from '@cloudflare/containers'","provider:'neptune'","protocol:'hls'",'youtube_start','youtube_stop','/direct/live/index.m3u8','maintainWebTvV118','LEGACY_STATE_KEY'])expect(nativeControl.includes(marker),`contrat WebTV natif absent : ${marker}`);
expect(!nativeControl.includes('state.enabled&&!youtubeConfigured'),'la chaîne Neptune ne doit pas dépendre de YouTube');
for(const marker of ['DIRECT_PUT_TRANSPORT','presignDirectPut','MAX_FILE_BYTES=5*1024*1024*1024','uploadUrl','expectedSize','upload_size_mismatch','/api/admin/webtv/media','/media/webtv/','Accept-Ranges','Content-Range'])expect(media.includes(marker),`médiathèque WebTV incomplète : ${marker}`);
expect(media.includes("prefix:R2_PREFIX")&&media.includes("include:['httpMetadata','customMetadata']"),'bibliothèque importée doit relire R2');
expect(media.includes('sameOrigin(request)'),'mutations médiathèque doivent être same-origin');
for(const marker of ["import { AwsClient } from 'aws4fetch'",'direct-r2-put-v1','presignDirectPut','X-Amz-Expires','Content-Type','signQuery:true','R2_ACCESS_KEY_ID','R2_SECRET_ACCESS_KEY'])expect(directR2.includes(marker),`transport PUT R2 incomplet : ${marker}`);
expect(!directR2.includes('console.log'),'URLs présignées ne doivent pas être journalisées');
for(const marker of ['ffmpeg','ffprobe',"'-f', 'flv'",'rtmps://[youtube]','streamTarget(cfg)'])expect(encoder.includes(marker),`moteur FFmpeg historique incomplet : ${marker}`);
expect(!encoder.includes('VOTRE_CLE_YOUTUBE'),'aucune clé YouTube factice ne doit être présente');
for(const marker of ['HLS_DIR','buildNativeRelayArgs','buildYoutubeArgs','nativeHlsReady','youtubeStatus',"'-f','hls'",'NATIVE_OUTPUT','YOUTUBE_OUTPUT'])expect(nativeEncoder.includes(marker),`moteur HLS natif incomplet : ${marker}`);

for(const marker of ['Diffusion','Web TV active','Ordre de passage','Programme de secours','Redémarrer l’encodeur','YouTube · RTMPS','webtv-upload-v4.js','webtv-upload-v1.css'])expect(html.includes(marker),`interface Diffusion historique incomplète : ${marker}`);
expect(!html.includes('webtv-upload-v3.js'),'ancien importeur multipart ne doit plus être chargé');
expect(!html.includes('YOUTUBE_STREAM_KEY')&&!html.includes('streamKey'),'clé de flux ne doit jamais être exposée dans le HTML');
for(const marker of ['window.NeptuneWebTvProgram','setImportedMedia','addImportedMedia','push(importedMedia','thumbnailMarkup(','markDirty()'])expect(ui.includes(marker),`pont programme/médiathèque absent : ${marker}`);
for(const marker of ['Retour de la chaîne Neptune','youtube_start','youtube_stop','/direct/?embed=1','Ouvrir le direct Neptune'])expect(nativeUi.includes(marker),`interface WebTV native incomplète : ${marker}`);
for(const marker of ['Importer une émission','5 Go max.','DIRECT_PUT_TRANSPORT','XMLHttpRequest','xhr.upload.onprogress','xhr.send(file)','PUT_RETRY_DELAYS_MS','expectedSize','refreshImportedLibrary'])expect(uploadUi.includes(marker),`importeur Studio incomplet : ${marker}`);
expect(!uploadUi.includes('/part-url')&&!uploadUi.includes('uploadId'),'importeur ne doit plus dépendre du multipart historique');
expect(ia.includes("'/studio/webtv.html'"),'navigation Diffusion doit pointer vers la régie WebTV');
expect(navCompat.includes("querySelectorAll('.studio-context-nav-v65')")&&navCompat.includes('.remove()'),'onglets Diffusion historiques doivent être neutralisés');

expect(security.includes("https://*.r2.cloudflarestorage.com"),'CSP doit autoriser les PUT directs R2');
const corsRule=Array.isArray(cors.rules)?cors.rules[0]:null;
expect(corsRule?.allowed?.origins?.includes('https://tv.neptunebusiness.com'),'CORS R2 : origine tv absente');
expect(corsRule?.allowed?.origins?.includes('https://media.neptunebusiness.com'),'CORS R2 : origine media absente');
expect(corsRule?.allowed?.methods?.includes('PUT'),'CORS R2 : PUT absent');
expect(corsRule?.allowed?.headers?.includes('*'),'CORS R2 : headers navigateur non autorisés');
expect(corsRule?.exposeHeaders?.includes('ETag'),'CORS R2 : ETag non exposé');
expect(corsWorkflow.includes('wrangler r2 bucket cors set neptune-media-assets')&&corsWorkflow.includes('wrangler r2 bucket cors list neptune-media-assets'),'workflow CORS R2 doit appliquer puis vérifier la politique');

if(failures.length){console.error(failures.map(failure=>`- ${failure}`).join('\n'));process.exit(1);}
console.log(`WebTV v119.5 validée à travers les chaînes actives root=${rootChain.join(' -> ')} / local=${localChain.join(' -> ')} : HLS Neptune principal, YouTube secondaire facultatif, import R2 et watchdog conservés.`);

async function traceEntryChain(start){
  const chain=[];
  const seen=new Set();
  let current=start;
  for(let depth=0;depth<64&&current;depth+=1){
    if(seen.has(current))break;
    seen.add(current);
    chain.push(current);
    if(current==='src/entry-v33.js')return chain;
    let source='';
    try{source=await read(current);}catch{return chain;}
    const parent=source.match(/from\s+['"]\.\/(entry-v\d+\.js)['"]/u)?.[1];
    if(!parent)return chain;
    current=`src/${parent}`;
  }
  return chain;
}
