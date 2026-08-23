import {readFile} from 'node:fs/promises';
import {
  injectDriveUploadResilienceV137,
  transformDriveUploadAssetV137,
} from '../src/drive-upload-resilience-v137.js';

const source=await readFile(new URL('../public/studio/drive-upload-v94.js',import.meta.url),'utf8');
const transformedResponse=await transformDriveUploadAssetV137(new Response(source,{status:200,headers:{'Content-Type':'application/javascript'}}));
const transformed=await transformedResponse.text();

const checks=[];
const expect=(name,value)=>checks.push({name,ok:Boolean(value)});
expect('large file chunk retries raised',transformed.includes('const MAX_CHUNK_RETRIES = 18;'));
expect('resume retries raised',transformed.includes('const MAX_RESUME_RETRIES = 18;'));
expect('API retries raised',transformed.includes('const MAX_API_RETRIES = 10;'));
expect('session restarts raised',transformed.includes('const MAX_SESSION_RESTARTS = 2;'));
expect('successful resume clears accumulated retry debt',(transformed.match(/if \(resumedOffset > offset\) failures = 0;/gu)||[]).length===2);
expect('completed upload registration is persisted',transformed.includes('rememberPendingRegistration({ orderId, category, fileId });'));
expect('pending registration recovered after reload',transformed.includes('recoverPendingRegistrations(mount, target);'));
expect('pending registration is not presented as upload failure',transformed.includes("code === 'drive_registration_pending'"));
expect('user is warned not to resend completed bytes',transformed.includes('Ne renvoyez pas ces fichiers')&&transformed.includes('ne renvoyez pas ce fichier'));
expect('old static uploader release removed',!transformed.includes("const RELEASE = 'neptune-studio-drive-upload-20260811-v94';"));
expect('transformed uploader is valid JavaScript',compiles(transformed));

const html='<html><body><script type="module" src="/studio/drive-upload-v94.js?v=1"></script></body></html>';
const injected=await injectDriveUploadResilienceV137(new Response(html,{status:200,headers:{'Content-Type':'text/html'}}));
const injectedBody=await injected.text();
expect('HTML cache bust forces resilient uploader',injectedBody.includes('/studio/drive-upload-v94.js?v=137'));
expect('resilience header exposed',injected.headers.get('X-Neptune-Drive-Upload-Resilience')==='neptune-drive-upload-resilience-20260824-v137');

const failed=checks.filter((item)=>!item.ok);
for(const item of checks)console.log(`${item.ok?'✓':'✗'} ${item.name}`);
if(failed.length){
  console.error(`Drive upload resilience v137 failed: ${failed.length} check(s).`);
  process.exit(1);
}
console.log(`Drive upload resilience v137 passed: ${checks.length} checks.`);

function compiles(code){
  try{new Function(code);return true;}catch(error){console.error(error);return false;}
}
