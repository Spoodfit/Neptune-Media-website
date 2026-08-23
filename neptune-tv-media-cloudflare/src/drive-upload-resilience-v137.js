const RELEASE='neptune-drive-upload-resilience-20260824-v137';
const DRIVE_UPLOAD_ASSET='/studio/drive-upload-v94.js';
const CLIENTS_PATHS=new Set(['/studio/clients','/studio/clients/','/studio/clients.html']);

export function isDriveUploadAssetV137(pathname){
  return pathname===DRIVE_UPLOAD_ASSET;
}

export function isDriveUploadDocumentV137(pathname){
  return CLIENTS_PATHS.has(pathname);
}

export async function transformDriveUploadAssetV137(response){
  let body=await response.text();
  body=requiredReplace(body,"const RELEASE = 'neptune-studio-drive-upload-20260811-v94';","const RELEASE = 'neptune-studio-drive-upload-20260824-v94.1';",'release');
  body=requiredReplace(body,'const MAX_CHUNK_RETRIES = 6;','const MAX_CHUNK_RETRIES = 18;','chunk retry budget');
  body=requiredReplace(body,'const MAX_RESUME_RETRIES = 6;','const MAX_RESUME_RETRIES = 18;','resume retry budget');
  body=requiredReplace(body,'const MAX_API_RETRIES = 4;','const MAX_API_RETRIES = 10;','API retry budget');
  body=requiredReplace(body,'const MAX_SESSION_RESTARTS = 1;','const MAX_SESSION_RESTARTS = 2;','session restart budget');
  body=requiredReplace(body,'let completed = 0;\n  let failed = 0;','let completed = 0;\n  let failed = 0;\n  let pendingFinalization = 0;','pending finalization counter');
  body=requiredReplace(body,`    } catch (error) {\n      failed += 1;\n      finishRow(row, 'error', errorLabel(errorCode(error)));\n    }`,`    } catch (error) {\n      const code = errorCode(error);\n      if (code === 'drive_registration_pending') {\n        pendingFinalization += 1;\n        finishRow(row, 'done', errorLabel(code));\n      } else {\n        failed += 1;\n        finishRow(row, 'error', errorLabel(code));\n      }\n    }`,'pending finalization rendering');
  body=requiredReplace(body,`  if (failed) setStatus(mount, \`${'${completed}'} fichier(s) déposé(s), ${'${failed}'} en erreur. Vous pouvez relancer uniquement les fichiers concernés.\`, true);\n  else setStatus(mount, \`${'${completed}'} fichier(s) rangé(s) dans le Drive et enregistré(s) dans Neptune.\`);`,`  if (failed) setStatus(mount, \`${'${completed}'} fichier(s) finalisé(s), ${'${failed}'} en erreur. Vous pouvez relancer uniquement les fichiers réellement en erreur.\`, true);\n  else if (pendingFinalization) setStatus(mount, \`${'${pendingFinalization}'} fichier(s) déjà envoyé(s) dans Drive · finalisation Neptune automatique en attente. Ne renvoyez pas ces fichiers.\`);\n  else setStatus(mount, \`${'${completed}'} fichier(s) rangé(s) dans le Drive et enregistré(s) dans Neptune.\`);`,'batch final status');
  body=requiredReplace(body,`  mount.querySelectorAll('[data-v94-zone]').forEach((zone) => bindZone(zone, mount, target));\n}`,`  mount.querySelectorAll('[data-v94-zone]').forEach((zone) => bindZone(zone, mount, target));\n  recoverPendingRegistrations(mount, target);\n}`,'pending registration recovery hook');
  body=requiredReplace(body,`  updateRow(row, 99, 'Vérification dans le Drive client…');\n  await api(REGISTER_API, { orderId, category, fileId });\n  updateRow(row, 100, 'Enregistré dans Neptune');`,`  updateRow(row, 99, 'Vérification dans le Drive client…');\n  rememberPendingRegistration({ orderId, category, fileId });\n  try {\n    await api(REGISTER_API, { orderId, category, fileId });\n    forgetPendingRegistration(orderId, category, fileId);\n  } catch (error) {\n    updateRow(row, 99, 'Upload terminé · finalisation Neptune en attente…');\n    throw new Error('drive_registration_pending');\n  }\n  updateRow(row, 100, 'Enregistré dans Neptune');`,'registration persistence');
  const resumeNeedle='      offset = clampOffset(resumed.next, file.size);\n      continue;';
  const resumeReplacement=`      const resumedOffset = clampOffset(resumed.next, file.size);\n      if (resumedOffset > offset) failures = 0;\n      offset = resumedOffset;\n      continue;`;
  const resumeMatches=count(body,resumeNeedle);
  if(resumeMatches!==2)throw new Error(`drive_upload_v137_transform_failed:resume offset:${resumeMatches}`);
  body=body.split(resumeNeedle).join(resumeReplacement);
  body=requiredReplace(body,`async function api(path, payload = {}) {`,`const PENDING_REGISTRATIONS_KEY = 'neptune_drive_pending_registrations_v137';\n\nfunction readPendingRegistrations() {\n  try {\n    const parsed = JSON.parse(localStorage.getItem(PENDING_REGISTRATIONS_KEY) || '[]');\n    return Array.isArray(parsed) ? parsed.filter((item) => item && item.orderId && item.category && item.fileId).slice(-20) : [];\n  } catch { return []; }\n}\n\nfunction writePendingRegistrations(items) {\n  try { localStorage.setItem(PENDING_REGISTRATIONS_KEY, JSON.stringify(items.slice(-20))); } catch {}\n}\n\nfunction rememberPendingRegistration(item) {\n  const items = readPendingRegistrations().filter((entry) => !(entry.orderId === item.orderId && entry.category === item.category && entry.fileId === item.fileId));\n  items.push({ ...item, savedAt: new Date().toISOString() });\n  writePendingRegistrations(items);\n}\n\nfunction forgetPendingRegistration(orderId, category, fileId) {\n  writePendingRegistrations(readPendingRegistrations().filter((entry) => !(entry.orderId === orderId && entry.category === category && entry.fileId === fileId)));\n}\n\nasync function recoverPendingRegistrations(mount, target) {\n  const orderId = String(target?.orderId || '');\n  const pending = readPendingRegistrations().filter((entry) => entry.orderId === orderId);\n  if (!pending.length) return;\n  setStatus(mount, \`${'${pending.length}'} fichier(s) déjà envoyé(s) dans Drive · finalisation automatique en cours…\`);\n  let recovered = 0;\n  for (const item of pending) {\n    try {\n      await api(REGISTER_API, { orderId: item.orderId, category: item.category, fileId: item.fileId });\n      forgetPendingRegistration(item.orderId, item.category, item.fileId);\n      recovered += 1;\n    } catch {}\n  }\n  const remaining = readPendingRegistrations().filter((entry) => entry.orderId === orderId).length;\n  if (recovered) {\n    setStatus(mount, remaining\n      ? \`${'${recovered}'} fichier(s) finalisé(s) · ${'${remaining}'} encore en attente.\`\n      : \`${'${recovered}'} fichier(s) déjà envoyé(s) ont été finalisé(s) automatiquement.\`);\n    targetCache.delete(orderId);\n    setTimeout(() => document.querySelector('[data-v92-refresh]')?.click(), 300);\n  } else if (remaining) {\n    setStatus(mount, \`${'${remaining}'} fichier(s) sont déjà dans Drive mais attendent encore la finalisation Neptune. Ne les renvoyez pas.\`);\n  }\n}\n\nasync function api(path, payload = {}) {`,'pending registration helpers');
  body=requiredReplace(body,`    drive_registration_failed: 'Le fichier est dans Drive mais Neptune n’a pas pu l’enregistrer. Actualisez le Drive.',`,`    drive_registration_pending: 'Le fichier est bien arrivé dans Drive. Sa finalisation Neptune sera reprise automatiquement : ne renvoyez pas ce fichier.',\n    drive_registration_failed: 'Le fichier est dans Drive mais Neptune n’a pas pu l’enregistrer. Actualisez le Drive.',`,'pending registration error label');
  return rebuild(response,body,{'X-Neptune-Drive-Upload-Resilience':RELEASE});
}

export async function injectDriveUploadResilienceV137(response){
  let body=await response.text();
  body=body.replace(/\/studio\/drive-upload-v94\.js\?v=[^"']+/gu,'/studio/drive-upload-v94.js?v=137');
  return rebuild(response,body,{'X-Neptune-Drive-Upload-Resilience':RELEASE,'Cache-Control':'private, no-store, max-age=0'});
}

export async function augmentDriveUploadReleaseV137(response){
  const current=await response.json().catch(()=>({}));
  const headers=new Headers(response.headers);
  headers.delete('Content-Length');
  headers.set('Content-Type','application/json; charset=utf-8');
  headers.set('Cache-Control','no-store');
  headers.set('X-Neptune-Drive-Upload-Resilience',RELEASE);
  return new Response(JSON.stringify({...current,driveUploadResilience:RELEASE,driveUploadLargeFileRecovery:'progress-aware-resume+pending-registration'}),{status:response.status,statusText:response.statusText,headers});
}

function requiredReplace(body,needle,replacement,label){
  const matches=count(body,needle);
  if(matches!==1)throw new Error(`drive_upload_v137_transform_failed:${label}:${matches}`);
  return body.replace(needle,replacement);
}

function count(body,needle){
  return body.split(needle).length-1;
}

function rebuild(response,body,extraHeaders={}){
  const headers=new Headers(response.headers);
  for(const name of ['Content-Length','Content-Encoding','ETag','Last-Modified'])headers.delete(name);
  for(const [name,value] of Object.entries(extraHeaders))headers.set(name,value);
  return new Response(body,{status:response.status,statusText:response.statusText,headers});
}
