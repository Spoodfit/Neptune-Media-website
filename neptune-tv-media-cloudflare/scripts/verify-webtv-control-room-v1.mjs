import { readFile } from 'node:fs/promises';

const read=(path)=>readFile(new URL(`../${path}`,import.meta.url),'utf8');
const readRoot=(path)=>readFile(new URL(`../../${path}`,import.meta.url),'utf8');
const [activeEntry,appEntry,webtvEntry,control,media,encoder,html,ui,uploadUi,ia,navCompat,rootRaw,localRaw,rootPackageRaw,localPackageRaw]=await Promise.all([
  read('src/entry-v35.js'),read('src/entry-v34.js'),read('src/entry-v33.js'),read('src/webtv-control-v1.js'),read('src/webtv-media-v1.js'),read('containers/webtv/encoder.mjs'),read('public/studio/webtv.html'),read('public/studio/webtv-v1.js'),read('public/studio/webtv-upload-v1.js'),read('public/studio/studio-information-architecture-v65-1.js'),read('public/studio/webtv-nav-compat-v1.js'),readRoot('wrangler.jsonc'),read('wrangler.jsonc'),readRoot('package.json'),read('package.json'),
]);
const root=JSON.parse(rootRaw),local=JSON.parse(localRaw),rootPackage=JSON.parse(rootPackageRaw),localPackage=JSON.parse(localPackageRaw),failures=[];
const expect=(condition,message)=>{if(!condition)failures.push(message);};

expect(root.main==='neptune-tv-media-cloudflare/src/entry-v35.js','le Worker racine doit cibler entry-v35 avec la médiathèque WebTV');
expect(local.main==='src/entry-v35.js','le Worker local doit cibler entry-v35 avec la médiathèque WebTV');
expect(activeEntry.includes("from './entry-v34.js'"),'entry-v35 ne prolonge plus entry-v34');
expect(activeEntry.includes("from './webtv-media-v1.js'"),'entry-v35 ne branche plus la médiathèque WebTV');
expect(activeEntry.includes("typeof base.scheduled==='function'"),'entry-v35 ne délègue plus les crons');
expect(appEntry.includes("from './entry-v33.js'"),'entry-v34 ne prolonge plus entry-v33');
expect(webtvEntry.includes("from './entry-v32.js'"),'entry-v33 ne prolonge plus entry-v32');
expect(webtvEntry.includes('WebTvEncoder')&&webtvEntry.includes('maintainWebTv'),'le moteur Web TV n’est pas exporté ou surveillé');

for(const [name,config] of [['root',root],['local',local]]){
  const webtv=Array.isArray(config.containers)?config.containers.filter(item=>item.class_name==='WebTvEncoder'):[];
  expect(webtv.length===1,`${name}: un unique Container WebTvEncoder doit être déclaré`);
  expect(webtv[0]?.max_instances===1,`${name}: WebTvEncoder doit être limité à une instance`);
  expect(webtv[0]?.instance_type==='standard-2',`${name}: le profil initial doit être standard-2`);
  expect(config.r2_buckets?.some(item=>item.binding==='MEDIA'&&item.bucket_name==='neptune-media-assets'),`${name}: bucket R2 MEDIA absent`);
  expect(config.durable_objects?.bindings?.some(item=>item.name==='WEBTV_ENCODER'&&item.class_name==='WebTvEncoder'),`${name}: binding WEBTV_ENCODER absent`);
  expect(config.triggers?.crons?.includes('* * * * *'),`${name}: watchdog minute absent`);
}
for(const [name,pkg] of [['root',rootPackage],['local',localPackage]])expect(Boolean(pkg.dependencies?.['@cloudflare/containers']),`${name}: dépendance @cloudflare/containers absente`);

for(const marker of ["import { Container, getContainer } from '@cloudflare/containers'",'YOUTUBE_RTMPS_URL','YOUTUBE_STREAM_KEY','getContainer(env.WEBTV_ENCODER, ENCODER_INSTANCE_NAME)',"'/api/admin/webtv/state'","'/api/admin/webtv/encoder'","url.protocol === 'rtmps:'"])expect(control.includes(marker),`contrat Web TV absent : ${marker}`);
for(const marker of ['createMultipartUpload','resumeMultipartUpload','uploadPart','multipart.complete','/api/admin/webtv/media','/media/webtv/','Accept-Ranges','Content-Range','MAX_FILE_BYTES'])expect(media.includes(marker),`médiathèque WebTV incomplète : ${marker}`);
expect(media.includes("prefix:R2_PREFIX")&&media.includes("include:['httpMetadata','customMetadata']"),'la bibliothèque importée ne relit pas les métadonnées R2');
expect(media.includes("sameOrigin(request)"),'les mutations de la médiathèque ne sont pas protégées par same-origin');
for(const marker of ['ffmpeg','ffprobe',"'-f', 'flv'",'rtmps://[youtube]','streamTarget(cfg)'])expect(encoder.includes(marker),`moteur FFmpeg incomplet : ${marker}`);
expect(!encoder.includes('VOTRE_CLE_YOUTUBE'),'une clé YouTube factice ou dangereuse est présente');

for(const marker of ['Diffusion','Web TV active','Ordre de passage','Programme de secours','Redémarrer l’encodeur','YouTube · RTMPS','webtv-upload-v1.js','webtv-upload-v1.css'])expect(html.includes(marker),`interface Diffusion incomplète : ${marker}`);
expect(!html.includes('YOUTUBE_STREAM_KEY')&&!html.includes('streamKey'),'la clé de flux ne doit jamais être exposée dans le HTML Studio');
for(const marker of ['window.NeptuneWebTvProgram','setImportedMedia','addImportedMedia','push(importedMedia','thumbnailMarkup(','markDirty()'])expect(ui.includes(marker),`pont programme/médiathèque absent : ${marker}`);
for(const marker of ['Importer une vidéo','Importer et ajouter au programme','data-upload-drop',`${'/api/admin/webtv/media'}`,'chunkSize','Promise.all','apiRaw','refreshImportedLibrary'])expect(uploadUi.includes(marker),`importeur Studio incomplet : ${marker}`);
expect(uploadUi.includes('Math.min(3,total)'),'l’upload multipart doit rester borné à trois blocs concurrents');
expect(ia.includes("'/studio/webtv.html'"),'la navigation Diffusion ne pointe pas vers la régie Web TV');
expect(navCompat.includes("querySelectorAll('.studio-context-nav-v65')")&&navCompat.includes('.remove()'),'les onglets Diffusion historiques ne sont pas neutralisés');

if(failures.length){console.error(failures.map(failure=>`- ${failure}`).join('\n'));process.exit(1);}
console.log('WebTV validée derrière entry-v35 : régie compacte, import vidéo multipart vers R2, bibliothèque persistante, lecture Range, programme modifiable puis application explicite à l’antenne, Container FFmpeg et RTMPS préservés.');
