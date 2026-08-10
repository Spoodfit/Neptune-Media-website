const RELEASE = 'neptune-studio-drive-upload-20260811-v94';
const TARGET_API = '/api/admin/drive-upload-v94/target';
const SESSION_API = '/api/admin/drive-upload-v94/session';
const REGISTER_API = '/api/admin/drive-upload-v94/register';
const CHUNK_BYTES = 8 * 1024 * 1024;
const MAX_RETRIES = 3;
const ACCEPT = '.mp4,.mov,.m4v,.webm,.zip,video/mp4,video/quicktime,video/x-m4v,video/webm,application/zip';
let scheduled = false;
let busy = false;
const targetCache = new Map();

start();

function start() {
  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', boot, { once: true })
    : boot();
}

function boot() {
  document.body.dataset.driveUploadRelease = RELEASE;
  enhance();
  new MutationObserver(scheduleEnhance).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'open'] });
  window.addEventListener('hashchange', () => { targetCache.clear(); scheduleEnhance(); });
  document.querySelector('#refresh')?.addEventListener('click', () => { targetCache.clear(); });
}

function scheduleEnhance() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    enhance();
  });
}

function enhance() {
  const root = document.querySelector('#clientDetail.v92-detail');
  if (!root) return;
  const orderId = String(root.dataset.orderId || decodeURIComponent(location.hash.slice(1)) || '').trim();
  if (!orderId) return;
  const card = findMontageCard(root);
  if (!card || card.querySelector('[data-drive-upload-v94]')) return;

  const mount = document.createElement('section');
  mount.className = 'v94-drive-upload';
  mount.dataset.driveUploadV94 = '';
  mount.innerHTML = loadingMarkup();
  const actions = card.querySelector('.v92-step-actions');
  if (actions) actions.before(mount);
  else card.append(mount);
  loadTarget(orderId, mount);
}

function findMontageCard(root) {
  const byV93 = root.querySelector('.v92-step[data-v93-step="6"]');
  if (byV93) return byV93;
  return [...root.querySelectorAll('.v92-step')].find((card) => /montage/iu.test(card.querySelector('.v92-step-title h3')?.textContent || '')) || null;
}

async function loadTarget(orderId, mount, force = false) {
  if (!mount?.isConnected) return;
  try {
    const cached = targetCache.get(orderId);
    const data = !force && cached && Date.now() - cached.at < 30000
      ? cached.data
      : await api(TARGET_API, { orderId });
    targetCache.set(orderId, { at: Date.now(), data });
    if (!mount.isConnected) return;
    renderUploader(mount, data);
  } catch (error) {
    if (!mount.isConnected) return;
    mount.innerHTML = unavailableMarkup(error.message);
    mount.querySelector('[data-v94-retry]')?.addEventListener('click', () => {
      mount.innerHTML = loadingMarkup();
      targetCache.delete(orderId);
      loadTarget(orderId, mount, true);
    });
  }
}

function renderUploader(mount, target) {
  const folderLink = safeUrl(target.passageFolderUrl);
  mount.innerHTML = `
    <div class="v94-head">
      <div>
        <span>DÉPÔT DIRECT GOOGLE DRIVE</span>
        <strong>Ajouter les livrables de ce passage</strong>
        <p>Les vidéos vont directement dans le Drive de ce client. Aucun fichier lourd n’est stocké en double dans Neptune.</p>
      </div>
      ${folderLink ? `<a class="v94-drive-link" href="${esc(folderLink)}" target="_blank" rel="noopener noreferrer">Ouvrir le Drive ↗</a>` : ''}
    </div>
    <div class="v94-destinations">
      ${dropzone('long', 'Long format', 'Émission complète / master', '1')}
      ${dropzone('short', 'Shorts', 'Reels / extraits verticaux', '∞')}
    </div>
    <div class="v94-queue" data-v94-queue hidden aria-live="polite"></div>
    <p class="v94-status" data-v94-status>Passage ${Number(target.passageNumber || 1)} · Drive synchronisé.</p>`;

  mount.querySelectorAll('[data-v94-zone]').forEach((zone) => bindZone(zone, mount, target));
}

function dropzone(category, title, detail, count) {
  return `<div class="v94-zone" data-v94-zone="${category}" tabindex="0" role="button" aria-label="Déposer ${esc(title)} dans Google Drive">
    <input type="file" data-v94-input="${category}" accept="${ACCEPT}" multiple hidden>
    <span class="v94-zone-icon">＋</span>
    <div><strong>${esc(title)}</strong><small>${esc(detail)}</small></div>
    <span class="v94-zone-count">${esc(count)}</span>
    <button type="button" data-v94-pick>Choisir les fichiers</button>
    <p>ou glissez-déposez ici</p>
  </div>`;
}

function bindZone(zone, mount, target) {
  const category = zone.dataset.v94Zone;
  const input = zone.querySelector('[data-v94-input]');
  const picker = zone.querySelector('[data-v94-pick]');
  const openPicker = () => { if (!busy) input?.click(); };
  picker?.addEventListener('click', (event) => { event.stopPropagation(); openPicker(); });
  zone.addEventListener('click', (event) => { if (!event.target.closest('button')) openPicker(); });
  zone.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openPicker(); }
  });
  input?.addEventListener('change', () => {
    const files = [...(input.files || [])];
    input.value = '';
    if (files.length) uploadBatch(files, category, mount, target);
  });
  for (const eventName of ['dragenter', 'dragover']) zone.addEventListener(eventName, (event) => {
    event.preventDefault();
    if (!busy) zone.classList.add('is-dragging');
  });
  for (const eventName of ['dragleave', 'drop']) zone.addEventListener(eventName, (event) => {
    event.preventDefault();
    zone.classList.remove('is-dragging');
  });
  zone.addEventListener('drop', (event) => {
    if (busy) return;
    const files = [...(event.dataTransfer?.files || [])];
    if (files.length) uploadBatch(files, category, mount, target);
  });
}

async function uploadBatch(files, category, mount, target) {
  if (busy) return setStatus(mount, 'Un dépôt est déjà en cours.', true);
  const valid = files.filter(isSupportedFile);
  if (!valid.length) return setStatus(mount, 'Utilisez une vidéo MP4, MOV, M4V, WebM ou une archive ZIP.', true);
  if (valid.length !== files.length) setStatus(mount, `${files.length - valid.length} fichier(s) non compatible(s) ont été ignorés.`, true);

  busy = true;
  mount.classList.add('is-uploading');
  setZonesDisabled(mount, true);
  const queue = mount.querySelector('[data-v94-queue]');
  queue.hidden = false;
  queue.innerHTML = valid.map((file, index) => queueItem(index, file, category)).join('');
  let completed = 0;
  let failed = 0;

  for (let index = 0; index < valid.length; index += 1) {
    const file = valid[index];
    const row = queue.querySelector(`[data-v94-file="${index}"]`);
    try {
      await uploadOne(file, category, target.orderId, row);
      completed += 1;
      finishRow(row, 'done', 'Déposé dans Drive');
    } catch (error) {
      failed += 1;
      finishRow(row, 'error', errorLabel(error.message));
    }
  }

  busy = false;
  mount.classList.remove('is-uploading');
  setZonesDisabled(mount, false);
  targetCache.delete(target.orderId);
  if (failed) setStatus(mount, `${completed} fichier(s) déposé(s), ${failed} en erreur. Vous pouvez relancer uniquement les fichiers concernés.`, true);
  else setStatus(mount, `${completed} fichier(s) rangé(s) dans le Drive et enregistré(s) dans Neptune.`);

  if (completed) {
    setTimeout(() => document.querySelector('[data-v92-refresh]')?.click(), 500);
  }
}

async function uploadOne(file, category, orderId, row) {
  updateRow(row, 0, 'Création de la session Drive…');
  const session = await api(SESSION_API, {
    orderId,
    category,
    name: file.name,
    mimeType: mimeFor(file),
    size: file.size,
  });
  if (!session.uploadUrl) throw new Error('drive_upload_session_missing');

  const metadata = await uploadChunks(session.uploadUrl, file, row);
  const fileId = String(metadata?.id || '');
  if (!fileId) throw new Error('drive_upload_incomplete');
  updateRow(row, 99, 'Vérification dans le Drive client…');
  await api(REGISTER_API, { orderId, category, fileId });
  updateRow(row, 100, 'Enregistré dans Neptune');
}

async function uploadChunks(uploadUrl, file, row) {
  let offset = 0;
  let retries = 0;
  while (offset < file.size) {
    const endExclusive = Math.min(file.size, offset + CHUNK_BYTES);
    const chunk = file.slice(offset, endExclusive);
    let response;
    try {
      response = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': mimeFor(file),
          'Content-Range': `bytes ${offset}-${endExclusive - 1}/${file.size}`,
        },
        body: chunk,
      });
    } catch (error) {
      if (retries >= MAX_RETRIES) throw new Error('drive_network_error');
      retries += 1;
      await wait(retries * 900);
      const resumed = await resumePosition(uploadUrl, file.size);
      if (resumed.complete) return resumed.metadata;
      offset = resumed.next;
      continue;
    }

    if (response.status === 200 || response.status === 201) {
      updateRow(row, 100, 'Upload terminé');
      return response.json().catch(() => ({}));
    }
    if (response.status === 308) {
      const next = nextOffset(response.headers.get('Range'), endExclusive);
      offset = next;
      retries = 0;
      updateRow(row, Math.min(99, Math.round(offset / file.size * 100)), `${formatBytes(offset)} / ${formatBytes(file.size)}`);
      continue;
    }
    if (response.status >= 500 && retries < MAX_RETRIES) {
      retries += 1;
      await wait(retries * 900);
      const resumed = await resumePosition(uploadUrl, file.size);
      if (resumed.complete) return resumed.metadata;
      offset = resumed.next;
      continue;
    }
    if (response.status === 404) throw new Error('drive_upload_session_expired');
    throw new Error(`drive_upload_http_${response.status}`);
  }
  const resumed = await resumePosition(uploadUrl, file.size);
  if (resumed.complete) return resumed.metadata;
  throw new Error('drive_upload_incomplete');
}

async function resumePosition(uploadUrl, total) {
  const response = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Range': `bytes */${total}` },
  });
  if (response.status === 200 || response.status === 201) {
    return { complete: true, next: total, metadata: await response.json().catch(() => ({})) };
  }
  if (response.status === 308) return { complete: false, next: nextOffset(response.headers.get('Range'), 0), metadata: null };
  if (response.status === 404) throw new Error('drive_upload_session_expired');
  throw new Error(`drive_resume_http_${response.status}`);
}

function nextOffset(range, fallback) {
  const match = String(range || '').match(/bytes=0-(\d+)/u);
  return match ? Number(match[1]) + 1 : Number(fallback || 0);
}

function queueItem(index, file, category) {
  return `<article class="v94-file" data-v94-file="${index}">
    <div class="v94-file-top"><span>${category === 'long' ? 'LONG' : 'SHORT'}</span><strong title="${esc(file.name)}">${esc(file.name)}</strong><small>${esc(formatBytes(file.size))}</small></div>
    <div class="v94-file-progress"><i data-v94-progress style="width:0%"></i></div>
    <p data-v94-file-status>En attente…</p>
  </article>`;
}

function updateRow(row, percent, text) {
  if (!row) return;
  const progress = row.querySelector('[data-v94-progress]');
  if (progress) progress.style.width = `${Math.max(0, Math.min(100, Number(percent || 0)))}%`;
  const status = row.querySelector('[data-v94-file-status]');
  if (status) status.textContent = text || '';
}

function finishRow(row, state, text) {
  if (!row) return;
  row.classList.remove('is-done', 'is-error');
  row.classList.add(state === 'done' ? 'is-done' : 'is-error');
  updateRow(row, state === 'done' ? 100 : Number(row.querySelector('[data-v94-progress]')?.style.width?.replace('%', '') || 0), text);
}

function setZonesDisabled(mount, disabled) {
  mount.querySelectorAll('[data-v94-zone]').forEach((zone) => {
    zone.classList.toggle('is-disabled', disabled);
    zone.setAttribute('aria-disabled', disabled ? 'true' : 'false');
    zone.querySelector('button')?.toggleAttribute('disabled', disabled);
  });
}

function setStatus(mount, text, error = false) {
  const node = mount.querySelector('[data-v94-status]');
  if (!node) return;
  node.textContent = text || '';
  node.classList.toggle('is-error', error);
}

function isSupportedFile(file) {
  const mime = mimeFor(file);
  if (mime.startsWith('video/') || mime === 'application/zip') return true;
  return /\.(mp4|mov|m4v|webm|zip)$/iu.test(file.name || '');
}

function mimeFor(file) {
  const mime = String(file.type || '').trim().toLowerCase();
  if (mime.startsWith('video/') || mime === 'application/zip') return mime;
  const name = String(file.name || '').toLowerCase();
  if (name.endsWith('.mp4')) return 'video/mp4';
  if (name.endsWith('.mov')) return 'video/quicktime';
  if (name.endsWith('.m4v')) return 'video/x-m4v';
  if (name.endsWith('.webm')) return 'video/webm';
  if (name.endsWith('.zip')) return 'application/zip';
  return 'application/octet-stream';
}

async function api(path, payload = {}) {
  const csrf = sessionStorage.getItem('neptune_csrf') || '';
  const response = await fetch(path, {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
    },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `http_${response.status}`);
  return data;
}

function loadingMarkup() {
  return `<div class="v94-loading"><span></span><p>Vérification du dossier Google Drive de ce passage…</p></div>`;
}

function unavailableMarkup(code) {
  return `<div class="v94-unavailable"><strong>Dépôt Drive indisponible</strong><p>${esc(errorLabel(code))}</p><button type="button" data-v94-retry>Réessayer</button></div>`;
}

function errorLabel(code) {
  if (String(code || '').startsWith('drive_upload_http_')) return `Google Drive a refusé une partie du fichier (${String(code).split('_').at(-1)}).`;
  if (String(code || '').startsWith('drive_resume_http_')) return 'La reprise Google Drive a échoué. Relancez ce fichier.';
  return ({
    unauthorized: 'Votre session Studio a expiré.',
    csrf_failed: 'Rechargez la page pour renouveler la session de sécurité.',
    drive_passage_not_provisioned: 'Le dossier Drive de ce passage n’a pas encore été créé. Lancez la synchronisation Drive puis réessayez.',
    drive_passage_not_ready: 'Le dossier Drive de ce passage est encore en préparation.',
    drive_access_missing: 'La connexion Google Drive doit être réautorisée.',
    drive_access_expired: 'La connexion Google Drive a expiré. Réautorisez-la puis relancez le dépôt.',
    invalid_upload_metadata: 'Ce fichier ne peut pas être envoyé dans Google Drive.',
    drive_upload_session_failed: 'Google Drive n’a pas pu ouvrir la session de dépôt.',
    drive_upload_session_missing: 'Google Drive n’a pas renvoyé de session de dépôt.',
    drive_upload_session_expired: 'La session de dépôt a expiré. Relancez uniquement ce fichier.',
    drive_network_error: 'La connexion a été interrompue plusieurs fois. Relancez ce fichier.',
    drive_upload_incomplete: 'Le fichier n’a pas été complètement reçu par Google Drive.',
    drive_file_verification_failed: 'Neptune n’a pas pu vérifier le fichier dans Google Drive.',
    drive_file_wrong_folder: 'Le fichier n’est pas dans le dossier Drive attendu pour ce passage.',
    drive_file_metadata_mismatch: 'Le fichier ne correspond pas au passage en cours.',
    drive_registration_failed: 'Le fichier est dans Drive mais Neptune n’a pas pu l’enregistrer. Actualisez le Drive.',
  })[code] || String(code || 'Une erreur est survenue.');
}

function safeUrl(value) {
  try {
    const url = new URL(String(value || ''));
    return url.protocol === 'https:' ? url.toString() : '';
  } catch { return ''; }
}

function formatBytes(bytes) {
  const value = Number(bytes || 0);
  if (value < 1024) return `${value} o`;
  if (value < 1024 ** 2) return `${(value / 1024).toFixed(1).replace('.', ',')} Ko`;
  if (value < 1024 ** 3) return `${(value / 1024 ** 2).toFixed(1).replace('.', ',')} Mo`;
  return `${(value / 1024 ** 3).toFixed(2).replace('.', ',')} Go`;
}

function wait(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function esc(value) { return String(value ?? '').replace(/[&<>"']/gu, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]); }
