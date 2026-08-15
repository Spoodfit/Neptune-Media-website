import { readFile } from 'node:fs/promises';

const read=(path)=>readFile(new URL(`../${path}`,import.meta.url),'utf8');
const readRoot=(path)=>readFile(new URL(`../../${path}`,import.meta.url),'utf8');
const [activeEntry40,activeEntry39,activeEntry38,activeEntry37,activeEntry36,activeEntry,appEntry,webtvEntry,control,nativeControl,media,directR2,encoder,nativeEncoder,html,ui,nativeUi,uploadUi,ia,navCompat,security,corsRaw,corsWorkflow,rootRaw,localRaw,rootPackageRaw,localPackageRaw]=await Promise.all([
  read('src/entry-v40.js'),read('src/entry-v39.js'),read('src/entry-v38.js'),read('src/entry-v37.js'),read('src/entry-v36.js'),read('src/entry-v35.js'),read('src/entry-v34.js'),read('src/entry-v33.js'),read('src/webtv-control-v1.js'),read('src/webtv-control-v118.js'),read('src/webtv-media-v1.js'),read('src/webtv-r2-direct-v1.js'),read('containers/webtv/encoder.mjs'),read('containers/webtv/encoder-v118.mjs'),read('public/studio/webtv.html'),read('public/studio/webtv-v1.js'),read('public/studio/webtv-native-v118.js'),read('public/studio/webtv-upload-v4.js'),read('public/studio/studio-information-architecture-v65-1.js'),read('public/studio/webtv-nav-compat-v1.js'),read('src/security.js'),read('config/webtv-r2-cors-wrangler.json'),readRoot('.github/workflows/configure-webtv-r2-cors.yml'),readRoot('wrangler.jsonc'),read('wrangler.jsonc'),readRoot('package.json'),read('package.json'),
]);
const root=JSON.parse(rootRaw),local=JSON.parse(localRaw),cors=JSON.parse(corsRaw),rootPackage=JSON.parse(rootPackageRaw),localPackage=JSON.parse(localPackageRaw),failures=[];
const expect=(condition,message)=>{if(!condition)failures.push(message);};

expect(root.main==='neptune-tv-media-cloudflare/src/entry-v40.js','le Worker racine doit cibler entry-v40');
expect(local.main==='src/entry-v40.js','le Worker local doit cibler entry-v40');
expect(activeEntry40.includes("from './entry-v39.js'"),'entry-v40 ne prolonge plus entry-v39');
expect(activeEntry40.includes('neptune-webtv-playback-20260815-v119.5')&&activeEntry40.includes('worker-src')&&activeEntry40.includes('blob:'),'entry-v40 ne conserve plus la correction CSP du lecteur Hls.js');
expect(activeEntry39.includes("from './entry-v38.js'"),'entry-v39 ne prolonge plus entry-v38');
expect(activeEntry39.includes("from './webtv-control-v118.js'"),'entry-v39 ne branche plus le moteur WebTV natif');
expect(activeEntry39.includes("'/api/public/webtv/state'")&&activeEntry39.includes("'/direct/live/'")&&activeEntry39.includes("'/direct/'"),'entry-v39 ne publie plus le direct Neptune natif');
expect(activeEntry39.includes('client-passage-wizard-v118.js')&&activeEntry39.includes('webtv-native-v118.js'),'entry-v39 ne branche plus le wizard ou la régie native');
expect(activeEntry38.includes("from './entry-v37.js'"),'entry-v38 ne prolonge plus entry-v37');
expect(activeEntry38.includes('client-experience-v117.js')&&activeEntry38.includes('client-command-center-v118-1.js'),'l’expérience client v118.2 n’est plus préservée sous v40');
expect(activeEntry37.includes("from './entry-v36.js'"),'entry-v37 ne prolonge plus entry-v36');
for(const marker of ['neptune-studio-runtime-recovery-20260813-v115','Promise.allSettled','controlDegraded','retryWebTvStateV115','refreshRuntimeV115','webtv-v1.js?v=7','X-Neptune-WebTV-Runtime'])expect(activeEntry37.includes(marker),`reprise Diffusion v115 absente : ${marker}`);
expect(activeEntry37.includes("if(controlDegraded){button.disabled=true;button.textContent='Régie à reconnecter'"),'la publication reste possible pendant une panne de régie');
expect(activeEntry37.includes("studioState=studioResult.status==='fulfilled'"),'une panne WebTV peut encore effacer le catalogue Studio');
expect(activeEntry36.includes("from './entry-v35.js'"),'entry-v36 ne prolonge plus entry-v35');
expect(activeEntry36.includes('WebTvEncoder'),'entry-v36 ne réexporte plus WebTvEncoder');
expect(activeEntry.includes("from './entry-v34.js'"),'entry-v35 ne prolonge plus entry-v34');
expect(activeEntry.includes("from './webtv-media-v1.js'"),'entry-v35 ne branche plus la médiathèque WebTV');
expect(activeEntry.includes("typeof base.scheduled==='function'"),'entry-v35 ne délègue plus les crons');
expect(appEntry.includes("from './entry-v33.js'"),'entry-v34 ne prolonge plus entry-v33');
expect(webtvEntry.includes("from './entry-v32.js'"),'entry-v33 ne prolonge plus entry-v32');
expect(webtvEntry.includes('WebTvEncoder')&&webtvEntry.includes('maintainWebTv'),'le moteur Web TV historique n’est plus exporté ou surveillé');

for(const [name,config] of [['root',root],['local',local]]){
  const webtv=Array.isArray(config.containers)?config.containers.filter(item=>item.class_name==='WebTvEncoder'):[];
  expect(webtv.length===1,`${name}: un unique Container WebTvEncoder doit être déclaré`);
  expect(webtv[0]?.max_instances===1,`${name}: WebTvEncoder doit être limité à une instance`);
  expect(webtv[0]?.instance_type==='standard-2',`${name}: le profil initial doit être standard-2`);
  expect(config.r2_buckets?.some(item=>item.binding==='MEDIA'&&item.bucket_name==='neptune-media-assets'),`${name}: bucket R2 MEDIA absent`);
  expect(config.durable_objects?.bindings?.some(item=>item.name==='WEBTV_ENCODER'&&item.class_name==='WebTvEncoder'),`${name}: binding WEBTV_ENCODER absent`);
  expect(config.triggers?.crons?.includes('* * * * *'),`${name}: watchdog minute absent`);
}
for(const [name,pkg] of [['root',rootPackage],['local',localPackage]]){
  expect(Boolean(pkg.dependencies?.['@cloudflare/containers']),`${name}: dépendance @cloudflare/containers absente`);
  expect(pkg.dependencies?.aws4fetch==='1.0.20',`${name}: aws4fetch 1.0.20 requis pour signer les URLs R2`);
}

for(const marker of ["import { Container, getContainer } from '@cloudflare/containers'",'YOUTUBE_RTMPS_URL','YOUTUBE_STREAM_KEY','getContainer(env.WEBTV_ENCODER, ENCODER_INSTANCE_NAME)',"'/api/admin/webtv/state'","'/api/admin/webtv/encoder'","url.protocol === 'rtmps:'"])expect(control.includes(marker),`contrat Web TV historique absent : ${marker}`);
for(const marker of ["import { Container, getContainer } from '@cloudflare/containers'",'provider:\'neptune\'','protocol:\'hls\'','youtube_start','youtube_stop','/direct/live/index.m3u8','maintainWebTvV118','LEGACY_STATE_KEY'])expect(nativeControl.includes(marker),`contrat Web TV natif absent : ${marker}`);
expect(!nativeControl.includes('state.enabled&&!youtubeConfigured'),'la chaîne Neptune dépend encore de la configuration YouTube');
for(const marker of ['DIRECT_PUT_TRANSPORT','presignDirectPut','MAX_FILE_BYTES=5*1024*1024*1024','uploadUrl','expectedSize','upload_size_mismatch','/api/admin/webtv/media','/media/webtv/','Accept-Ranges','Content-Range'])expect(media.includes(marker),`médiathèque WebTV single PUT incomplète : ${marker}`);
expect(media.includes("prefix:R2_PREFIX")&&media.includes("include:['httpMetadata','customMetadata']"),'la bibliothèque importée ne relit pas R2');
expect(media.includes('sameOrigin(request)'),'les mutations de la médiathèque ne sont pas protégées par same-origin');
for(const marker of ["import { AwsClient } from 'aws4fetch'",'direct-r2-put-v1','presignDirectPut','X-Amz-Expires','Content-Type','signQuery:true','R2_ACCESS_KEY_ID','R2_SECRET_ACCESS_KEY'])expect(directR2.includes(marker),`transport PUT R2 incomplet : ${marker}`);
expect(!directR2.includes('console.log'),'les URLs présignées ne doivent jamais être journalisées');
for(const marker of ['ffmpeg','ffprobe',"'-f', 'flv'",'rtmps://[youtube]','streamTarget(cfg)'])expect(encoder.includes(marker),`moteur FFmpeg historique incomplet : ${marker}`);
expect(!encoder.includes('VOTRE_CLE_YOUTUBE'),'une clé YouTube factice ou dangereuse est présente');
for(const marker of ['HLS_DIR','buildNativeRelayArgs','buildYoutubeArgs','nativeHlsReady','youtubeStatus',"'-f','hls'",'NATIVE_OUTPUT','YOUTUBE_OUTPUT'])expect(nativeEncoder.includes(marker),`moteur HLS natif incomplet : ${marker}`);
expect(nativeEncoder.includes("youtube?.enabled")&&nativeEncoder.includes("state.youtubeStatus='off'"),'le relais YouTube n’est pas réellement facultatif');

for(const marker of ['Diffusion','Web TV active','Ordre de passage','Programme de secours','Redémarrer l’encodeur','YouTube · RTMPS','webtv-upload-v4.js','webtv-upload-v1.css'])expect(html.includes(marker),`interface Diffusion historique incomplète : ${marker}`);
expect(!html.includes('webtv-upload-v3.js'),'l’ancien importeur multipart reste chargé');
expect(!html.includes('YOUTUBE_STREAM_KEY')&&!html.includes('streamKey'),'la clé de flux ne doit jamais être exposée dans le HTML Studio');
for(const marker of ['window.NeptuneWebTvProgram','setImportedMedia','addImportedMedia','push(importedMedia','thumbnailMarkup(','markDirty()'])expect(ui.includes(marker),`pont programme/médiathèque absent : ${marker}`);
for(const marker of ['Retour de la chaîne Neptune','youtube_start','youtube_stop','/direct/?embed=1','Ouvrir le direct Neptune'])expect(nativeUi.includes(marker),`interface WebTV native incomplète : ${marker}`);
for(const marker of ['Importer une émission','5 Go max.','DIRECT_PUT_TRANSPORT','XMLHttpRequest','xhr.upload.onprogress','xhr.send(file)','PUT_RETRY_DELAYS_MS','expectedSize','refreshImportedLibrary'])expect(uploadUi.includes(marker),`importeur Studio single PUT incomplet : ${marker}`);
expect(!uploadUi.includes('/part-url'),'le nouvel importeur ne doit plus utiliser UploadPart');
expect(!uploadUi.includes('uploadId'),'le nouvel importeur ne doit plus dépendre d’un état multipart');
expect(ia.includes("'/studio/webtv.html'"),'la navigation Diffusion ne pointe pas vers la régie Web TV');
expect(navCompat.includes("querySelectorAll('.studio-context-nav-v65')")&&navCompat.includes('.remove()'),'les onglets Diffusion historiques ne sont pas neutralisés');

expect(security.includes("https://*.r2.cloudflarestorage.com"),'la CSP bloque encore les PUT directs du navigateur vers R2');
const corsRule=Array.isArray(cors.rules)?cors.rules[0]:null;
expect(corsRule?.allowed?.origins?.includes('https://tv.neptunebusiness.com'),'CORS R2 : origine tv.neptunebusiness.com absente');
expect(corsRule?.allowed?.origins?.includes('https://media.neptunebusiness.com'),'CORS R2 : origine media.neptunebusiness.com absente');
expect(corsRule?.allowed?.methods?.includes('PUT'),'CORS R2 : méthode PUT absente');
expect(corsRule?.allowed?.headers?.includes('*'),'CORS R2 : en-têtes navigateur non autorisés');
expect(corsRule?.exposeHeaders?.includes('ETag'),'CORS R2 : ETag non exposé au navigateur');
expect(corsWorkflow.includes('wrangler r2 bucket cors set neptune-media-assets'),'le workflow ne pousse pas la politique CORS dans R2');
expect(corsWorkflow.includes('wrangler r2 bucket cors list neptune-media-assets'),'le workflow ne vérifie pas la politique CORS R2 appliquée');

if(failures.length){console.error(failures.map(failure=>`- ${failure}`).join('\n'));process.exit(1);}
console.log('WebTV v119.5 validée à travers entry-v40 : v39/v38 et reprise v115 préservées, HLS Neptune principal, worker Hls.js autorisé, YouTube secondaire facultatif, import R2 et watchdog conservés.');
