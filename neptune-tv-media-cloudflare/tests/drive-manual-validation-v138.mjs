import {readFile} from 'node:fs/promises';
import {handleDriveManualValidationV138,injectDriveManualValidationV138} from '../src/drive-manual-validation-v138.js';

const read=(path)=>readFile(new URL(`../${path}`,import.meta.url),'utf8');
const [entry,server,client]=await Promise.all([
  read('src/entry-v41.js'),
  read('src/drive-manual-validation-v138.js'),
  read('public/studio/drive-manual-validation-v138.js'),
]);

const checks=[];
const expect=(condition,label)=>{
  checks.push({condition:Boolean(condition),label});
  if(!condition)throw new Error(label);
  console.log(`✓ ${label}`);
};

expect(entry.includes("from './drive-manual-validation-v138.js'"),'active v41 imports manual Drive validation');
expect(entry.includes('handleDriveManualValidationV138(request,env)'),'manual endpoint is intercepted before base Worker');
expect(entry.includes('injectDriveManualValidationV138(response)'),'fallback UI is injected on Studio clients');
expect(entry.includes('augmentDriveManualValidationReleaseV138(response)'),'release endpoint exposes fallback');
expect(!entry.includes("from './entry-v42.js'"),'fallback does not change active Worker architecture');
expect(server.includes("notificationMode:'drive-sync-after-explicit-validation'"),'manual validation does not own client e-mail');
expect(server.includes("'/portal/drive-upload-target-v94'"),'server resolves exact passage Drive folders');
expect(server.includes("parents.includes(folderId)"),'server requires exact Drive parent folder');
expect(server.includes("properties.neptuneOrderId"),'server blocks conflicting passage ownership');
expect(server.includes("properties.neptuneCategory"),'server blocks conflicting category');
expect(server.includes("expected!==size"),'staging file requires exact byte count');
expect(server.includes("neptuneUploadState:'complete'"),'accepted files become complete only after validation');
expect(client.includes('Valider depuis le Drive'),'Studio exposes explicit Drive fallback');
expect(client.includes("sessionStorage.getItem('neptune_csrf')"),'manual action preserves CSRF protection');
expect(client.includes("fetch('/api/auth/status'"),'expired CSRF can be renewed once');
expect(!client.includes('/email')&&!client.includes('/notify'),'browser fallback contains no direct notification call');

await runtimeValidation();
await injectionValidation();
console.log(`Drive manual validation v138 passed: ${checks.length} checks + runtime scenarios.`);

async function runtimeValidation(){
  const storeCalls=[];
  const googleCalls=[];
  const longFolder='longFolder_1234567890';
  const shortFolder='shortFolder_1234567890';
  const validFile={
    id:'driveFile_1234567890',
    name:'MASTER.mp4',
    mimeType:'video/mp4',
    size:String(306200000),
    modifiedTime:'2026-08-24T09:00:00.000Z',
    webViewLink:'https://drive.google.com/file/d/driveFile_1234567890/view',
    parents:[longFolder],
    appProperties:{},
  };
  const conflictFile={
    id:'driveFile_abcdefghij',
    name:'OLD.mp4',
    mimeType:'video/mp4',
    size:'1000',
    modifiedTime:'2026-08-24T08:00:00.000Z',
    webViewLink:'https://drive.google.com/file/d/driveFile_abcdefghij/view',
    parents:[longFolder],
    appProperties:{neptuneOrderId:'another-order'},
  };

  const studio={
    async fetch(url,options={}){
      const path=new URL(url).pathname;
      const body=options.body?JSON.parse(options.body):{};
      storeCalls.push({path,body});
      if(path==='/portal/drive-upload-target-v94')return Response.json({
        longFolderId:longFolder,
        shortsFolderId:shortFolder,
        passageFolderUrl:'https://drive.google.com/drive/folders/passage123',
      });
      if(path==='/portal/drive-token-get')return Response.json({accessToken:'google-test-token'});
      if(path==='/portal/drive-files')return Response.json({ok:true,changed:1});
      throw new Error(`unexpected_store_${path}`);
    },
  };
  const env={STUDIO:{idFromName:()=>({toString:()=> 'studio'}),get:()=>studio}};
  const originalFetch=globalThis.fetch;
  globalThis.fetch=async(url,options={})=>{
    const parsed=new URL(String(url));
    googleCalls.push({url:parsed.toString(),method:options.method||'GET',body:options.body||''});
    if(parsed.hostname!=='www.googleapis.com')throw new Error(`unexpected_fetch_${parsed.hostname}`);
    if(parsed.pathname==='/drive/v3/files'){
      const query=parsed.searchParams.get('q')||'';
      return Response.json({files:query.includes(longFolder)?[validFile,conflictFile]:[]});
    }
    if(parsed.pathname===`/drive/v3/files/${validFile.id}`&&options.method==='PATCH'){
      const patch=JSON.parse(options.body||'{}');
      return Response.json({...validFile,...patch,appProperties:patch.appProperties||{}});
    }
    throw new Error(`unexpected_google_${parsed.pathname}`);
  };

  try{
    const request=new Request('https://media.neptunebusiness.com/api/admin/drive-manual-validation-v138',{
      method:'POST',
      headers:{
        Origin:'https://media.neptunebusiness.com',
        'Content-Type':'application/json',
        'X-CSRF-Token':'csrf-test',
        Cookie:'__Host-neptune_session=session-test',
      },
      body:JSON.stringify({orderId:'order-123'}),
    });
    const response=await handleDriveManualValidationV138(request,env);
    const data=await response.json();
    expect(response.status===200,'manual validation succeeds with complete Drive file');
    expect(data.validated===1&&data.skipped===1&&data.failed===0,'valid file accepted and conflicting file skipped');
    expect(data.notificationMode==='drive-sync-after-explicit-validation','response keeps notification separate from validation');
    const register=storeCalls.find(call=>call.path==='/portal/drive-files');
    expect(register?.body?.files?.[0]?.driveFileId===validFile.id,'validated Drive file is registered in Neptune inventory');
    expect(register?.body?.files?.[0]?.sizeBytes===306200000,'registered inventory keeps exact Drive byte size');
    expect(!storeCalls.some(call=>/mail|email|notify/iu.test(call.path)),'manual validation calls no notification endpoint');
    const patch=googleCalls.find(call=>call.method==='PATCH');
    const patchBody=JSON.parse(patch?.body||'{}');
    expect(patchBody.appProperties?.neptuneUploadState==='complete','manual file is tagged complete before inventory registration');
    expect(patchBody.appProperties?.neptuneOrderId==='order-123','manual file is tagged to exact order');
  }finally{
    globalThis.fetch=originalFetch;
  }
}

async function injectionValidation(){
  const response=new Response('<html><body><main>Studio</main></body></html>',{headers:{'Content-Type':'text/html; charset=utf-8'}});
  const injected=await injectDriveManualValidationV138(response);
  const html=await injected.text();
  expect(html.includes('/studio/drive-manual-validation-v138.js?v=138'),'Studio HTML loads cache-busted fallback asset');
  expect((html.match(/drive-manual-validation-v138\.js/gu)||[]).length===1,'fallback asset is injected only once');
  expect(injected.headers.get('Cache-Control')?.includes('no-store'),'Studio HTML cannot cache stale fallback');
}
