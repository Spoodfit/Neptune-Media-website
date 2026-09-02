import fs from 'node:fs';
import path from 'node:path';

const root=path.resolve(import.meta.dirname,'..');
const repoRoot=path.resolve(root,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const readRepo=file=>fs.readFileSync(path.join(repoRoot,file),'utf8');
const entry44=read('src/entry-v44.js');
const entry40=read('src/entry-v40.js');
const entry39=read('src/entry-v39.js');
const entry38=read('src/entry-v38.js');
const entry37=read('src/entry-v37.js');
const entry36=read('src/entry-v36.js');
const entry35=read('src/entry-v35.js');
const entry34=read('src/entry-v34.js');
const entry33=read('src/entry-v33.js');
const entry=read('src/entry-v32.js');
const target=read('src/portal-drive-upload-v94.js');
const routes=read('src/portal-drive-routes.js');
const resilience=read('src/drive-upload-resilience-v137.js');
const ui=read('public/studio/drive-upload-v94.js');
const css=read('public/studio/drive-upload-v94.css');
const wrangler=readRepo('wrangler.jsonc');
const mainEntry=(wrangler.match(/"main"\s*:\s*"([^"]+)"/u)?.[1]||'').replace(/^neptune-tv-media-cloudflare\//u,'');
const activeChain=traceEntryChain(mainEntry);
const checks=[];
const expect=(name,c)=>checks.push({name,ok:Boolean(c)});

expect('active Cloudflare entry preserves v94 through canonical v44 -> v40 chain',activeChain.includes('src/entry-v44.js')&&!activeChain.includes('src/entry-v41.js')&&!activeChain.includes('src/entry-v42.js')&&!activeChain.includes('src/entry-v43.js')&&activeChain.includes('src/entry-v40.js')&&activeChain.includes('src/entry-v32.js')&&entry44.includes("from './entry-v40.js'")&&entry44.includes("from './drive-upload-resilience-v137.js'")&&entry44.includes("from './drive-upload-recovery-v137.js'")&&entry44.includes("from './drive-manual-validation-v138.js'")&&entry40.includes("from './entry-v39.js'")&&entry39.includes("from './entry-v38.js'")&&entry38.includes("from './entry-v37.js'")&&entry37.includes("from './entry-v36.js'")&&entry36.includes("from './entry-v35.js'")&&entry35.includes("from './entry-v34.js'")&&entry34.includes("from './entry-v33.js'")&&entry33.includes("from './entry-v32.js'"));
expect('v94 inherits v92/v93 Worker',entry.includes("import base from './entry-v31.js'")&&entry.includes("from './store-v26.js'"));
expect('upload target protected by operator session',target.includes('requireOperator')&&target.includes('driveUploadTargetV94'));
expect('Drive mapping isolated by orderId',target.includes('WHERE dp.order_id=? LIMIT 1')&&target.includes("mapping.syncStatus === 'ready'")&&target.includes('longFolderId')&&target.includes('shortsFolderId'));
expect('backend creates resumable session',entry.includes("uploadType', 'resumable'")&&entry.includes('X-Upload-Content-Length'));
expect('metadata pins exact passage',entry.includes('neptuneOrderId: orderId')&&entry.includes('neptuneCategory: category'));
expect('upload session carries expected size and lifecycle state',entry.includes('neptuneExpectedSize')&&entry.includes('neptuneUploadState: UPLOAD_STATE_UPLOADING')&&entry.includes("STAGING_PREFIX = '.__neptune_uploading__'"));
expect('Google token stays server-side',entry.includes("'/portal/drive-token-get'")&&!ui.includes('accessToken'));
expect('video bytes bypass legacy Worker upload',!ui.includes('/api/admin/client-upload')&&!entry.includes('formData()')&&ui.includes("method: 'PUT'"));
expect('Drive chunks are valid',ui.includes('const CHUNK_BYTES = 8 * 1024 * 1024')&&ui.includes('Content-Range'));
expect('base resumable recovery is present',ui.includes('response.status === 308')&&ui.includes('resumePositionRobust')&&ui.includes('MAX_RESUME_RETRIES = 6')&&ui.includes('MAX_CHUNK_RETRIES = 6')&&ui.includes('RETRYABLE_HTTP')&&ui.includes('waitForOnline'));
expect('v137 clears retry debt when Drive has advanced',resilience.includes('if (resumedOffset > offset) failures = 0')&&resilience.includes('resumeMatches!==2'));
expect('v137 raises large-file retry budgets',resilience.includes("'const MAX_CHUNK_RETRIES = 6;','const MAX_CHUNK_RETRIES = 18;'")&&resilience.includes("'const MAX_RESUME_RETRIES = 6;','const MAX_RESUME_RETRIES = 18;'")&&resilience.includes("'const MAX_API_RETRIES = 4;','const MAX_API_RETRIES = 10;'"));
expect('v137 persists post-upload registration',resilience.includes('rememberPendingRegistration')&&resilience.includes('recoverPendingRegistrations')&&resilience.includes('drive_registration_pending'));
expect('v137 cache-busts old uploader',resilience.includes("'/studio/drive-upload-v94.js?v=137'"));
expect('raw browser network errors are normalized',ui.toLowerCase().includes('failed to fetch')&&ui.includes("return 'drive_network_error'"));
expect('expired resumable sessions are renewed',ui.includes('MAX_SESSION_RESTARTS = 1')&&ui.includes('drive_upload_session_expired')&&ui.includes('drive_upload_session_gone'));
expect('completed files are re-read from Drive',entry.includes('/drive/v3/files/${encodeURIComponent(fileId)}')&&entry.includes('drive_file_metadata_mismatch'));
expect('file byte count must exactly match announced upload',entry.includes('actualSize !== expectedSize')&&entry.includes('drive_upload_size_mismatch'));
expect('Neptune inventory precedes Drive delivery finalization',entry.indexOf('const provisional = await registerDriveInventory')>=0&&entry.indexOf('const finalized = await finalizeGoogleDriveFile')>entry.indexOf('const provisional = await registerDriveInventory'));
expect('Drive finalization is explicit and idempotent',entry.includes('neptuneUploadState: UPLOAD_STATE_COMPLETE')&&entry.includes("method: 'PATCH'")&&entry.includes('deliveryReady: true'));
expect('Drive inventory registration preserved',entry.includes("'/portal/drive-files'"));
expect('webhook ignores incomplete staging objects',routes.includes("STAGING_UPLOAD_PREFIX = '.__neptune_uploading__'")&&routes.includes('currentDeliverableFiles')&&routes.includes('size <= 0')&&routes.includes('isStagingUploadName(name)'));
expect('email only flushes events for files present in current complete scan',routes.includes('currentFileIds.has')&&routes.includes('sameDriveVersion')&&routes.includes('deliveryResult = { ...result, pendingEvents: events }')&&routes.includes('no_complete_file_in_current_scan'));
expect('Montage has Long and Shorts',ui.includes("dropzone('long', 'Long format'")&&ui.includes("dropzone('short', 'Shorts'"));
expect('uploader only on Montage',ui.includes("data-v93-step=\"6\"")&&ui.includes('/montage/iu'));
expect('Drive folder link available',ui.includes('Ouvrir le Drive'));
expect('responsive upload layout preserved',css.includes('grid-template-columns:repeat(2,minmax(0,1fr))')&&css.includes('@media(max-width:760px)'));
expect('touch-safe pickers preserved',css.includes('min-height:46px!important')&&css.includes('max-width:none!important'));
expect('legacy Drive refresh hidden',css.includes('.v92-step[data-v93-step="6"]>.v92-step-actions{display:none!important}'));
expect('Google API CSP preserved',entry.includes("DRIVE_UPLOAD_ORIGIN = 'https://www.googleapis.com'")&&entry.includes('allowGoogleApiConnect'));
expect('v94 release exposed',entry.includes('studioDriveUpload: RELEASE'));

const failed=checks.filter(x=>!x.ok);
for(const c of checks)console.log(`${c.ok?'✓':'✗'} ${c.name}`);
if(failed.length){console.error(`Studio Drive upload v94/v137 verification failed: ${failed.length} check(s).`);process.exit(1);}
console.log(`Studio Drive upload v94/v137 verified through active chain ${activeChain.join(' -> ')}: ${checks.length} checks.`);

function traceEntryChain(start){
  if(!start)return [];
  const chain=[];
  const seen=new Set();
  let current=start;
  for(let depth=0;depth<20;depth+=1){
    if(seen.has(current))return chain;
    seen.add(current);
    chain.push(current);
    if(current==='src/entry-v32.js')return chain;
    const full=path.join(root,current);
    if(!fs.existsSync(full))return chain;
    const source=fs.readFileSync(full,'utf8');
    const parent=source.match(/from\s+['"]\.\/(entry-v\d+\.js)['"]/u)?.[1];
    if(!parent)return chain;
    current=path.posix.join(path.posix.dirname(current),parent);
  }
  return chain;
}
