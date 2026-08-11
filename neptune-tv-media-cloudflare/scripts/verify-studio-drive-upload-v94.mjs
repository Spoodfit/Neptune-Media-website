import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const entry33 = read('src/entry-v33.js');
const entry = read('src/entry-v32.js');
const store = read('src/store-v26.js');
const target = read('src/portal-drive-upload-v94.js');
const ui = read('public/studio/drive-upload-v94.js');
const css = read('public/studio/drive-upload-v94.css');
const wrangler = read('wrangler.jsonc');

const checks = [];
const expect = (name, condition) => checks.push({ name, ok: Boolean(condition) });

expect('active Cloudflare entry preserves v94 through v33', wrangler.includes('"main": "src/entry-v33.js"') && entry33.includes("from './entry-v32.js'"));
expect('v94 inherits the existing v92/v93 Worker rather than replacing the workflow', entry.includes("import base from './entry-v31.js'") && entry.includes("import { StudioStore } from './store-v26.js'"));
expect('upload target is protected by the existing Studio operator session', target.includes('requireOperator') && target.includes('driveUploadTargetV94'));
expect('Drive mapping is isolated by exact orderId and ready passage folders', target.includes('WHERE dp.order_id=? LIMIT 1') && target.includes("mapping.syncStatus === 'ready'") && target.includes('longFolderId') && target.includes('shortsFolderId'));
expect('backend creates a Google Drive resumable session', entry.includes("uploadType', 'resumable'") && entry.includes('X-Upload-Content-Length') && entry.includes('X-Upload-Content-Type'));
expect('upload metadata pins the file to the exact Neptune passage', entry.includes('neptuneOrderId: orderId') && entry.includes('neptuneCategory: category') && entry.includes('parents: [folderId]'));
expect('Google OAuth token stays server-side', entry.includes("'/portal/drive-token-get'") && !entry.includes('accessToken: credential.accessToken') && !ui.includes('accessToken'));
expect('video bytes never use the legacy Cloudflare client-upload route', !ui.includes('/api/admin/client-upload') && !entry.includes('formData()') && ui.includes("method: 'PUT'"));
expect('large uploads are chunked in a Drive-compatible 256 KiB multiple', ui.includes('const CHUNK_BYTES = 8 * 1024 * 1024') && (8 * 1024 * 1024) % (256 * 1024) === 0 && ui.includes('Content-Range'));
expect('resumable upload handles 308, server errors and expired sessions', ui.includes('response.status === 308') && ui.includes('response.status >= 500') && ui.includes('response.status === 404') && ui.includes('resumePosition'));
expect('completed files are re-read from Google before Neptune registration', entry.includes('/drive/v3/files/${encodeURIComponent(fileId)}') && entry.includes("parents.includes(target.data.targetFolderId)") && entry.includes('drive_file_metadata_mismatch'));
expect('Drive upload registers immediately through the existing Drive inventory pipeline', entry.includes("'/portal/drive-files'") && entry.includes('registered.summary'));
expect('Montage has explicit Long format and Shorts destinations', ui.includes("dropzone('long', 'Long format'") && ui.includes("dropzone('short', 'Shorts'"));
expect('uploader mounts only on the Montage step', ui.includes("data-v93-step=\"6\"") && ui.includes('/montage/iu'));
expect('passage Drive remains directly accessible from the Montage UI', ui.includes('Ouvrir le Drive') && ui.includes('passageFolderUrl'));
expect('responsive layout keeps two desktop destinations and one mobile column', css.includes('grid-template-columns:repeat(2,minmax(0,1fr))') && css.includes('@media(max-width:760px)') && css.includes('.v94-destinations{grid-template-columns:minmax(0,1fr);width:100%}'));
expect('mobile file pickers are touch-safe and cannot inherit a narrow legacy max-width', css.includes('min-height:46px!important') && css.includes('max-width:none!important') && css.includes('width:100%!important'));
expect('redundant legacy Drive refresh action is hidden inside Montage', css.includes('.v92-step[data-v93-step="6"]>.v92-step-actions{display:none!important}'));
expect('Studio CSP explicitly permits the temporary Google upload session', entry.includes("DRIVE_UPLOAD_ORIGIN = 'https://www.googleapis.com'") && entry.includes('allowGoogleApiConnect'));
expect('v94 release is exposed for production verification', entry.includes('studioDriveUpload: RELEASE') && entry.includes("studioDriveUploadMode: 'direct-resumable-google-drive-v94'"));

const failed = checks.filter((check) => !check.ok);
for (const check of checks) console.log(`${check.ok ? '✓' : '✗'} ${check.name}`);
if (failed.length) {
  console.error(`Studio Drive upload v94 verification failed: ${failed.length} check(s).`);
  process.exit(1);
}
console.log(`Studio Drive upload v94 verified through active v33 entry: ${checks.length} checks.`);
