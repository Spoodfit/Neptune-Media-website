import {readFile} from 'node:fs/promises';

const read=(path)=>readFile(new URL(`../${path}`,import.meta.url),'utf8');
const readRoot=(path)=>readFile(new URL(`../../${path}`,import.meta.url),'utf8');

const [nativeControl,entry40,media,directR2,security,corsRaw,corsWorkflow,rootRaw,localRaw]=await Promise.all([
  read('src/webtv-control-v118.js'),
  read('src/entry-v40.js'),
  read('src/webtv-media-v1.js'),
  read('src/webtv-r2-direct-v1.js'),
  read('src/security.js'),
  read('config/webtv-r2-cors-wrangler.json'),
  readRoot('.github/workflows/configure-webtv-r2-cors.yml'),
  readRoot('wrangler.jsonc'),
  read('wrangler.jsonc'),
]);

const root=JSON.parse(rootRaw),local=JSON.parse(localRaw),cors=JSON.parse(corsRaw),failures=[];
const expect=(condition,message)=>{if(!condition)failures.push(message);};

for(const [name,config] of [['root',root],['local',local]]){
  const containers=Array.isArray(config.containers)?config.containers:[];
  expect(containers.length===0,`${name}: aucun Container Cloudflare ne doit être déclaré`);
  expect(!config.durable_objects?.bindings?.some(item=>item.name==='WEBTV_ENCODER'),`${name}: binding WEBTV_ENCODER encore présent`);
  expect(config.r2_buckets?.some(item=>item.binding==='MEDIA'&&item.bucket_name==='neptune-media-assets'),`${name}: bucket R2 MEDIA absent`);
  expect(!config.triggers?.crons?.includes('* * * * *'),`${name}: watchdog WebTV minute encore actif`);
  expect(config.migrations?.some(item=>Array.isArray(item.deleted_classes)&&item.deleted_classes.includes('WebTvEncoder')),`${name}: migration de suppression WebTvEncoder absente`);
}

expect(nativeControl.includes("error:'webtv_retired'"),'le contrôle WebTV ne signale pas explicitement son retrait');
expect(!nativeControl.includes("getContainer("),'le contrôle WebTV peut encore réveiller un Container');
expect(!nativeControl.includes("extends Container"),'la classe active WebTV dépend encore de Cloudflare Containers');
expect(nativeControl.includes("status:410"),'les assets live retirés doivent répondre 410');
expect(nativeControl.includes("enabled:false")&&nativeControl.includes("mode:'off'"),'l’état public WebTV doit être forcé à off');
expect(!entry40.includes("getContainer("),'le lecteur direct peut encore démarrer le Container');
expect(!entry40.includes("startAndWaitForPorts"),'le lecteur direct conserve un chemin de réveil Container');

for(const marker of ['DIRECT_PUT_TRANSPORT','presignDirectPut','MAX_FILE_BYTES=5*1024*1024*1024','uploadUrl','expectedSize','upload_size_mismatch','/api/admin/webtv/media','/media/webtv/','Accept-Ranges','Content-Range']){
  expect(media.includes(marker),`stockage vidéo R2 incomplet : ${marker}`);
}
expect(media.includes("prefix:R2_PREFIX")&&media.includes("include:['httpMetadata','customMetadata']"),'la médiathèque doit continuer à relire R2');
expect(media.includes('sameOrigin(request)'),'les mutations de médiathèque doivent rester same-origin');

for(const marker of ["import { AwsClient } from 'aws4fetch'",'direct-r2-put-v1','presignDirectPut','X-Amz-Expires','Content-Type','signQuery:true','R2_ACCESS_KEY_ID','R2_SECRET_ACCESS_KEY']){
  expect(directR2.includes(marker),`transport PUT R2 incomplet : ${marker}`);
}
expect(!directR2.includes('console.log'),'les URLs présignées R2 ne doivent pas être journalisées');

expect(security.includes("https://*.r2.cloudflarestorage.com"),'la CSP doit autoriser les PUT directs R2');
const corsRule=Array.isArray(cors.rules)?cors.rules[0]:null;
expect(corsRule?.allowed?.origins?.includes('https://tv.neptunebusiness.com'),'CORS R2 : origine tv absente');
expect(corsRule?.allowed?.origins?.includes('https://media.neptunebusiness.com'),'CORS R2 : origine media absente');
expect(corsRule?.allowed?.methods?.includes('PUT'),'CORS R2 : PUT absent');
expect(corsRule?.allowed?.headers?.includes('*'),'CORS R2 : headers navigateur non autorisés');
expect(corsRule?.exposeHeaders?.includes('ETag'),'CORS R2 : ETag non exposé');
expect(corsWorkflow.includes('wrangler r2 bucket cors set neptune-media-assets')&&corsWorkflow.includes('wrangler r2 bucket cors list neptune-media-assets'),'le workflow CORS R2 doit appliquer puis vérifier la politique');

if(failures.length){console.error(failures.map(failure=>`- ${failure}`).join('\n'));process.exit(1);}
console.log('WebTV Cloudflare retirée : aucun Container actif, aucun watchdog minute, stockage vidéo R2 et import direct conservés.');
