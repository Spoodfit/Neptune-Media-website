import {readFile} from 'node:fs/promises';
const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');
const [direct,media,upload]=await Promise.all([
  read('src/webtv-r2-direct-v1.js'),
  read('src/webtv-media-v1.js'),
  read('public/studio/webtv-upload-v3.js'),
]);
const failures=[];
const expect=(condition,message)=>{if(!condition)failures.push(message);};
for(const marker of ['directR2Diagnostics','s3EndpointPresent','s3EndpointValid','s3EndpointReason','endpointResolved','configured'])expect(direct.includes(marker),`diagnostic R2 serveur absent : ${marker}`);
for(const marker of ['directUploadDiagnostics','acceptedEndpointSources','diagnostics'])expect(media.includes(marker),`diagnostic R2 API absent : ${marker}`);
expect(upload.includes('Configuration R2 vue par le Worker'),'diagnostic R2 lisible absent du Studio');
expect(!upload.includes('error?.data?.diagnostics?.secret'),'le Studio ne doit jamais essayer de lire une valeur secrète');
expect(!media.includes('R2_SECRET_ACCESS_KEY:env'),'l’API ne doit jamais sérialiser le secret R2');
if(failures.length){console.error(failures.map(item=>`- ${item}`).join('\n'));process.exit(1);}
console.log('Diagnostic R2 Web TV validé : présence/validation uniquement, aucune valeur secrète exposée.');
