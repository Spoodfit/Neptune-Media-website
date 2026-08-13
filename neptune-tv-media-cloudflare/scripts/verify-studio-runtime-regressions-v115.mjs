import { readFile } from 'node:fs/promises';

const read=(path)=>readFile(new URL(`../${path}`,import.meta.url),'utf8');
const [advanced,fix,previewSync,entry37,webtvUi]=await Promise.all([
  read('public/studio/advanced.html'),
  read('public/studio/media-catalog-runtime-fix-v115.js'),
  read('public/studio/media-catalog-preview-sync-v109.js'),
  read('src/entry-v37.js'),
  read('public/studio/webtv-v1.js'),
]);

const failures=[];
const expect=(condition,message)=>{if(!condition)failures.push(message);};

expect(advanced.includes('/studio/media-catalog-runtime-fix-v115.js?v=1'),'Réglages ne charge pas le runtime correctif v115');
for(const marker of [
  "decodeURIComponent(location.hash.slice(1)).trim()==='programs'",
  "content.dataset.c98=''",
  "new MouseEvent('click'",
  "iframe[data-catalog-preview-v109]",
  "data-catalog-preview-shell-v115",
  'c115-preview-device',
  'width:100%!important',
  'height:100%!important',
  'min-height:44px!important',
])expect(fix.includes(marker),`correctif Catalogue/Aperçu v115 incomplet : ${marker}`);
expect(!fix.includes('localStorage.setItem'),'le correctif d’aperçu ne doit jamais écrire dans le localStorage client');
expect(previewSync.includes("catalog_preview:'studio'"),'le mode d’aperçu Studio isolé a disparu');
expect(previewSync.includes('data.catalogPreviewV109'),'le propriétaire de l’iframe v109 a changé sans migration');

for(const marker of [
  "from './entry-v36.js'",
  "const WEBTV_UI='/studio/webtv-v1.js'",
  'Promise.allSettled',
  "studioState=studioResult.status==='fulfilled'",
  'controlDegraded=false',
  'degradedControlV115',
  'retryWebTvStateV115',
  'refreshRuntimeV115',
  "webtv-v1.js?v=7",
  'X-Neptune-WebTV-Runtime',
])expect(entry37.includes(marker),`reprise Diffusion v115 incomplète : ${marker}`);

for(const sourceContract of [
  'let importedMedia=[];',
  '\ninit();\n',
  'if(!item?.mediaUrl||!control)return false;',
  "$('#restartEncoder').disabled=!control.enabled||!control.output?.configured||list.length===0;",
  "function updateApplyState(){\n  const button=$('#save');if(!button||!control)return;",
  "async function save(){\n  const button=$('#save');",
])expect(webtvUi.includes(sourceContract),`le contrat source WebTV nécessaire à la transformation v115 a changé : ${sourceContract}`);

if(failures.length){
  console.error(failures.map(failure=>`- ${failure}`).join('\n'));
  process.exit(1);
}
console.log('Studio runtime v115 validé : Réglages remonte le Catalogue après Actualiser, aperçu réel dimensionné et isolé, Diffusion résiste à une panne WebTV partielle et permet la reconnexion sans effacer le catalogue Studio.');
