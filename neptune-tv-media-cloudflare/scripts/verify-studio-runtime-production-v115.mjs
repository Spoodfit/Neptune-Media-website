const RELEASE='neptune-studio-runtime-recovery-20260813-v115';
const DEFAULT_BASES=['https://neptune-media-webtv.neptunebusinessclub.workers.dev','https://tv.neptunebusiness.com'];
const bases=(process.env.STUDIO_PRODUCTION_BASE_URLS||DEFAULT_BASES.join(',')).split(',').map(value=>value.trim().replace(/\/+$/u,'')).filter(Boolean);
const attempts=Number.parseInt(process.env.STUDIO_PRODUCTION_ATTEMPTS||'15',10);
const delayMs=Number.parseInt(process.env.STUDIO_PRODUCTION_DELAY_MS||'10000',10);

const reports=[];
for(const base of bases)reports.push(await verifyWithRetry(base));
console.log(JSON.stringify({ok:true,release:RELEASE,checkedAt:new Date().toISOString(),reports},null,2));
console.log('Studio runtime v115 production verification passed on workers.dev and the custom domain.');

async function verifyWithRetry(base){
  let lastError=null;
  for(let attempt=1;attempt<=attempts;attempt+=1){
    try{return await verifyBase(base,attempt);}catch(error){
      lastError=error;
      console.error(`${base}: v115 attempt ${attempt}/${attempts} failed: ${error.message}`);
      if(attempt<attempts)await sleep(delayMs);
    }
  }
  throw new Error(`${base}: Studio runtime v115 failed after ${attempts} attempts. Last error: ${lastError?.message||'unknown'}`);
}

async function verifyBase(base,attempt){
  const nonce=`${Date.now()}-${process.pid}-${attempt}`;
  const release=await fetchJson(`${base}/api/public/release?studio_v115=${nonce}`);
  assert(release.studioRuntimeRecovery===RELEASE,`release marker incorrect: ${release.studioRuntimeRecovery}`);

  const webtvPage=await fetchText(`${base}/studio/webtv.html?studio_v115=${nonce}`);
  assert(webtvPage.headers.get('x-neptune-webtv-runtime')===RELEASE,'Diffusion HTML v115 header missing');
  assert(webtvPage.body.includes('/studio/webtv-v1.js?v=7'),'Diffusion still loads the cached v6 runtime');

  const webtvRuntime=await fetchText(`${base}/studio/webtv-v1.js?v=7&studio_v115=${nonce}`);
  assert(webtvRuntime.headers.get('x-neptune-webtv-runtime')===RELEASE,'Diffusion JS v115 header missing');
  for(const marker of ['initV115();','Promise.allSettled','controlDegraded','retryWebTvStateV115','refreshRuntimeV115',"studioState=studioResult.status==='fulfilled'",'Régie indisponible'])assert(webtvRuntime.body.includes(marker),`Diffusion transformed runtime missing ${marker}`);
  assert(!webtvRuntime.body.includes('\ninit();\n'),'legacy destructive Diffusion init still executes');

  const advanced=await fetchText(`${base}/studio/advanced.html?studio_v115=${nonce}`);
  assert(advanced.body.includes('/studio/media-catalog-runtime-fix-v115.js?v=1'),'Réglages v115 runtime script missing');
  const catalogFix=await fetchText(`${base}/studio/media-catalog-runtime-fix-v115.js?v=1&studio_v115=${nonce}`);
  for(const marker of ["content.dataset.c98=''",'c115-preview-device','iframe[data-catalog-preview-v109]','min-height:44px!important'])assert(catalogFix.body.includes(marker),`Catalogue/Aperçu runtime missing ${marker}`);
  assert(!catalogFix.body.includes('localStorage.setItem'),'Catalogue preview fix writes client localStorage');

  const preview=await fetchText(`${base}/reserver?catalog_preview=studio&catalog_view=configuration&studio_v115=${nonce}`);
  assert(preview.headers.get('x-frame-options')==='SAMEORIGIN','Studio tunnel preview lost SAMEORIGIN');

  const protectedState=await fetchAny(`${base}/api/admin/webtv/state?studio_v115=${nonce}`);
  assert([401,403].includes(protectedState.status),`unauthenticated WebTV state must stay protected, got ${protectedState.status}`);

  return {base,attempt,release:release.studioRuntimeRecovery,webtvRuntimeBytes:webtvRuntime.body.length,catalogFixBytes:catalogFix.body.length,previewFrameOptions:preview.headers.get('x-frame-options'),protectedWebTvState:protectedState.status};
}

async function fetchJson(url){const response=await fetch(url,options());const body=await response.text();assert(response.ok,`${url} HTTP ${response.status}: ${body.slice(0,300)}`);try{return JSON.parse(body);}catch{throw new Error(`${url} did not return JSON`);}}
async function fetchText(url){const response=await fetch(url,options());const body=await response.text();assert(response.ok,`${url} HTTP ${response.status}: ${body.slice(0,300)}`);return{status:response.status,headers:response.headers,body};}
async function fetchAny(url){const response=await fetch(url,options());return{status:response.status,headers:response.headers,body:await response.text()};}
function options(){return{headers:{'Cache-Control':'no-cache, no-store',Pragma:'no-cache','User-Agent':'Neptune-Studio-V115-Production-Verification/1.0'},redirect:'follow',signal:AbortSignal.timeout(30000)};}
function assert(condition,message){if(!condition)throw new Error(message);}
function sleep(ms){return new Promise(resolve=>setTimeout(resolve,ms));}
