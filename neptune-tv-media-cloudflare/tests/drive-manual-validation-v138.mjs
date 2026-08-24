import {readFile} from 'node:fs/promises';
import {
  injectDriveUploadResilienceV137,
  transformDriveUploadAssetV137,
} from '../src/drive-upload-resilience-v137.js';
import {
  DRIVE_MANUAL_VALIDATION_V138_API,
  injectDriveManualValidationV138,
  transformDriveManualValidationAssetV138,
} from '../src/drive-manual-validation-v138.js';

const read=(path)=>readFile(new URL(`../${path}`,import.meta.url),'utf8');
const [uploaderSource,cssSource,serverSource,entry42]=await Promise.all([
  read('public/studio/drive-upload-v94.js'),
  read('public/studio/drive-upload-v94.css'),
  read('src/drive-manual-validation-v138.js'),
  read('src/entry-v42.js'),
]);

const resilientResponse=await transformDriveUploadAssetV137(new Response(uploaderSource,{status:200,headers:{'Content-Type':'application/javascript'}}));
const resilientSource=await resilientResponse.text();
const manualResponse=await transformDriveManualValidationAssetV138(new Response(resilientSource,{status:200,headers:{'Content-Type':'application/javascript'}}),'/studio/drive-upload-v94.js');
const manualSource=await manualResponse.text();

const checks=[];
const expect=(name,value)=>checks.push({name,ok:Boolean(value)});
expect('manual validation API is wired into uploader',manualSource.includes(`const MANUAL_VALIDATE_API = '${DRIVE_MANUAL_VALIDATION_V138_API}';`));
expect('Studio exposes manual Drive validation action',manualSource.includes('Valider depuis le Drive')&&manualSource.includes('data-v138-manual-drive'));
expect('manual validation is bound after uploader render',manualSource.includes('installManualDriveValidationV138(mount, target);'));
expect('successful manual validation refreshes current client',manualSource.includes("document.querySelector('[data-v92-refresh]')?.click()"));
expect('no file state explains exact manual workflow',manualSource.includes('Déposez d’abord le fichier dans le dossier Long format ou Shorts du Drive'));
expect('transformed uploader remains valid JavaScript',compiles(manualSource));

const html='<html><head><link rel="stylesheet" href="/studio/drive-upload-v94.css?v=1"></head><body><script type="module" src="/studio/drive-upload-v94.js?v=137"></script></body></html>';
const resilientHtml=await injectDriveUploadResilienceV137(new Response(html,{status:200,headers:{'Content-Type':'text/html'}}));
const manualHtml=await injectDriveManualValidationV138(resilientHtml);
const manualHtmlBody=await manualHtml.text();
expect('manual validation cache-busts JS',manualHtmlBody.includes('/studio/drive-upload-v94.js?v=138'));
expect('manual validation cache-busts CSS',manualHtmlBody.includes('/studio/drive-upload-v94.css?v=138'));

const cssResponse=await transformDriveManualValidationAssetV138(new Response(cssSource,{status:200,headers:{'Content-Type':'text/css'}}),'/studio/drive-upload-v94.css');
const css=await cssResponse.text();
expect('manual action has loading/disabled UX',css.includes('.v138-manual-drive:disabled'));

expect('server validates operator through protected Drive target',serverSource.includes("'/portal/drive-upload-target-v94'")&&serverSource.includes('...adminAuth(request)'));
expect('server scans only mapped Long/Short folders',serverSource.includes("{category:'long',folderId:String(target.longFolderId||'')}")&&serverSource.includes("{category:'short',folderId:String(target.shortsFolderId||'')}"));
expect('server requires direct folder membership',serverSource.includes('parents.includes(folderId)'));
expect('server rejects empty and unsupported files',serverSource.includes('!size')&&serverSource.includes('isSupportedFile(name,mime)'));
expect('server preserves conflicting order/category safety',serverSource.includes("reason:'conflicting_order'")&&serverSource.includes("reason:'conflicting_category'"));
expect('server can finalize a fully received staging object',serverSource.includes("state!=='uploading'||expected!==size")&&serverSource.includes("neptuneUploadState:'complete'"));
expect('manual Drive file is tagged complete before registration',serverSource.includes("neptuneSource:String(properties.neptuneSource||'manual-drive-v138')")&&serverSource.includes('neptuneManualValidatedAt'));
expect('validated files are registered into Neptune inventory',serverSource.includes("callStore(studio,'/portal/drive-files'"));
expect('manual validation never sends email directly',!serverSource.includes('sendDriveDelivery')&&!serverSource.includes('sendEmail('));
expect('entry v42 preserves v41 and handles manual API before base',entry42.includes("from './entry-v41.js'")&&entry42.indexOf('handleDriveManualValidationV138')<entry42.indexOf('base.fetch(request,env,ctx)'));

const failed=checks.filter((item)=>!item.ok);
for(const item of checks)console.log(`${item.ok?'✓':'✗'} ${item.name}`);
if(failed.length){
  console.error(`Drive manual validation v138 failed: ${failed.length} check(s).`);
  process.exit(1);
}
console.log(`Drive manual validation v138 passed: ${checks.length} checks.`);

function compiles(code){
  try{new Function(code);return true;}catch(error){console.error(error);return false;}
}
