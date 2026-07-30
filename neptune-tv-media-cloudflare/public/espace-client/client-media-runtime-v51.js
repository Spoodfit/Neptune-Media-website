const FILE_TRIGGER_SELECTOR = '[data-snapshot-file],[data-open-video]';
const DOWNLOAD_SELECTOR = 'a[href*="/api/client/files/"]';
const DYNAMIC_MEDIA_SELECTOR = `${FILE_TRIGGER_SELECTOR},${DOWNLOAD_SELECTOR},#broadcastPreview`;
const LONG_TYPES = new Set(['final', 'emission', 'full', 'master', 'episode', 'long']);
const SHORT_TYPES = new Set(['short', 'shorts', 'reel', 'teaser']);

let state = null;
let fileIndex = new Map();
let youtubeState = null;
let refreshInFlight = false;
let decorationTimer = 0;

start();

function start() {
  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', boot, { once: true })
    : boot();
}

function boot() {
  installStyles();
  installMediaDialog();
  document.addEventListener('click', interceptMediaClick, true);
  document.addEventListener('click', interceptDownloadClick, true);

  const dashboard = document.querySelector('#dashboard');
  if (dashboard) {
    const observer = new MutationObserver(() => {
      if (!dashboard.hidden) refresh({ force: true });
    });
    observer.observe(dashboard, { attributes: true, attributeFilter: ['hidden'] });
    if (!dashboard.hidden) refresh({ force: true });
  } else if (location.pathname.startsWith('/espace-client/')) {
    refresh({ force: true });
  }

  const contentObserver = new MutationObserver((mutations) => {
    const relevant = mutations.some((mutation) => [...mutation.addedNodes].some((node) => {
      if (node.nodeType !== Node.ELEMENT_NODE) return false;
      return node.matches?.(DYNAMIC_MEDIA_SELECTOR) || Boolean(node.querySelector?.(DYNAMIC_MEDIA_SELECTOR));
    }));
    if (relevant) scheduleDecorate();
  });
  contentObserver.observe(document.body, { childList: true, subtree: true });
}

async function refresh({ force = false } = {}) {
  if (refreshInFlight) return;
  if (!force && state) {
    decorateMediaCards();
    renderBroadcastPublication();
    return;
  }

  refreshInFlight = true;
  try {
    const response = await fetch('/api/client/session', {
      credentials: 'same-origin',
      headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' },
    });
    if (!response.ok) return;
    state = await response.json();
    fileIndex = indexFiles(state);
    decorateMediaCards();
    await loadYoutubePublications();
    renderBroadcastPublication();
  } catch (error) {
    console.error('client_media_runtime_failed', error);
  } finally {
    refreshInFlight = false;
  }
}

async function loadYoutubePublications() {
  try {
    const response = await fetch('/api/client/youtube-publications', {
      credentials: 'same-origin',
      headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' },
    });
    youtubeState = response.ok ? await response.json() : null;
  } catch {
    youtubeState = null;
  }
}

function indexFiles(payload) {
  const map = new Map();
  for (const order of payload?.orders || []) {
    for (const file of order.files || []) {
      const enriched = { ...file, order };
      for (const key of [file.id, file.driveFileId, cleanName(file.name)]) {
        if (key) map.set(String(key), enriched);
      }
    }
  }
  return map;
}

function scheduleDecorate() {
  clearTimeout(decorationTimer);
  decorationTimer = setTimeout(() => {
    decorateMediaCards();
    renderBroadcastPublication();
  }, 80);
}

function decorateMediaCards() {
  if (!fileIndex.size) return;
  document.querySelectorAll(FILE_TRIGGER_SELECTOR).forEach((trigger) => {
    const id = trigger.dataset.snapshotFile || trigger.dataset.openVideo || '';
    const file = fileIndex.get(String(id));
    if (!file) return;
    const thumbnail = file.thumbnailUrl || (file.id ? `/api/client/files/${encodeURIComponent(file.id)}?thumbnail=1` : '');
    const target = trigger.matches('.compact-media-open')
      ? trigger.querySelector('.compact-media-preview')
      : trigger;
    if (target && thumbnail && target.dataset.neptuneThumbnail !== thumbnail) {
      target.style.backgroundImage = `linear-gradient(180deg,rgba(4,12,39,.08),rgba(4,12,39,.82)),url("${cssUrl(thumbnail)}")`;
      target.style.backgroundSize = 'cover';
      target.style.backgroundPosition = 'center';
      target.dataset.neptuneThumbnail = thumbnail;
    }
    trigger.dataset.neptuneProxyReady = 'true';
  });

  document.querySelectorAll(DOWNLOAD_SELECTOR).forEach((link) => {
    const url = new URL(link.href, location.origin);
    if (![...url.searchParams.keys()].length) url.searchParams.set('download', '1');
    const normalized = `${url.pathname}${url.search}`;
    if (link.getAttribute('href') !== normalized) link.setAttribute('href', normalized);
    link.setAttribute('download', '');
    link.dataset.neptuneDownload = 'true';
  });
}

function interceptMediaClick(event) {
  const trigger = event.target.closest(FILE_TRIGGER_SELECTOR);
  if (!trigger) return;
  const id = trigger.dataset.snapshotFile || trigger.dataset.openVideo || '';
  const file = fileIndex.get(String(id));
  if (!file?.id) return;

  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
  openMediaDialog(file);
}

function interceptDownloadClick(event) {
  const link = event.target.closest(DOWNLOAD_SELECTOR);
  if (!link || link.dataset.neptuneDownloadBusy === 'true') return;

  const original = link.dataset.neptuneDownloadLabel || link.textContent.trim() || 'Télécharger';
  link.dataset.neptuneDownloadLabel = original;
  link.dataset.neptuneDownloadBusy = 'true';
  link.setAttribute('aria-busy', 'true');
  link.classList.remove('neptune-download-launched');
  link.classList.add('neptune-download-busy');
  link.textContent = 'Préparation du téléchargement…';

  window.setTimeout(() => {
    if (!link.isConnected) return;
    link.classList.remove('neptune-download-busy');
    link.classList.add('neptune-download-launched');
    link.textContent = 'Téléchargement lancé';
  }, 700);

  window.setTimeout(() => resetDownloadLink(link), 5200);
}

function resetDownloadLink(link) {
  if (!link?.isConnected) return;
  link.classList.remove('neptune-download-busy', 'neptune-download-launched');
  link.removeAttribute('aria-busy');
  link.dataset.neptuneDownloadBusy = 'false';
  link.textContent = link.dataset.neptuneDownloadLabel || 'Télécharger';
}

function installMediaDialog() {
  if (document.querySelector('#neptuneMediaProxyDialog')) return;
  const dialog = document.createElement('dialog');
  dialog.id = 'neptuneMediaProxyDialog';
  dialog.className = 'neptune-media-proxy-dialog';
  dialog.innerHTML = '<button type="button" class="neptune-media-close" aria-label="Fermer">×</button><div class="neptune-media-proxy-body"></div>';
  document.body.append(dialog);
  dialog.querySelector('.neptune-media-close')?.addEventListener('click', () => closeMediaDialog(dialog));
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) closeMediaDialog(dialog);
  });
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    closeMediaDialog(dialog);
  });
}

function openMediaDialog(file) {
  const dialog = document.querySelector('#neptuneMediaProxyDialog');
  const body = dialog?.querySelector('.neptune-media-proxy-body');
  if (!dialog || !body) return;

  closeMediaPlayers(dialog);
  const isShort = SHORT_TYPES.has(String(file.fileType || '').toLowerCase());
  dialog.dataset.format = isShort ? 'short' : 'long';
  const preview = file.previewUrl || `/api/client/files/${encodeURIComponent(file.id)}?inline=1`;
  const download = file.downloadUrl || `/api/client/files/${encodeURIComponent(file.id)}?download=1`;
  const title = cleanName(file.name) || 'Contenu Neptune Media';

  body.innerHTML = `<div class="neptune-media-player-shell neptune-media-player-shell--${isShort ? 'short' : 'long'}"><video controls autoplay playsinline preload="metadata" src="${esc(preview)}"></video><div class="neptune-media-load-error" hidden><strong>Lecture indisponible</strong><span>Les permissions Drive ont été refusées ou le fichier n’est plus accessible.</span></div></div><aside><span>${isShort ? 'SHORT / REEL' : 'ÉMISSION COMPLÈTE'}</span><h2>${esc(title)}</h2><p>${esc(file.sizeLabel || 'Disponible dans votre espace client')}</p><a href="${esc(download)}" download data-neptune-download="true">Télécharger</a></aside>`;

  const video = body.querySelector('video');
  video?.addEventListener('error', () => {
    body.querySelector('.neptune-media-load-error')?.removeAttribute('hidden');
  }, { once: true });
  dialog.showModal();
}

function closeMediaDialog(dialog) {
  closeMediaPlayers(dialog);
  dialog.querySelector('.neptune-media-proxy-body')?.replaceChildren();
  if (dialog.open) dialog.close();
}

function closeMediaPlayers(root) {
  root.querySelectorAll('video,audio').forEach((media) => {
    try { media.pause(); } catch {}
    media.removeAttribute('src');
    try { media.load(); } catch {}
  });
  root.querySelectorAll('iframe').forEach((frame) => { frame.src = 'about:blank'; });
}

function renderBroadcastPublication() {
  const target = document.querySelector('#broadcastPreview');
  if (!target || !state) return;
  const footerLink = target.closest('.show-card')?.querySelector('.show-footer a');
  const youtube = youtubeState?.matched?.[0] || null;

  if (youtube?.videoId) {
    const renderKey = `youtube:${youtube.videoId}`;
    if (target.dataset.neptuneBroadcastKey !== renderKey || !target.querySelector('iframe[data-neptune-broadcast-player]')) {
      target.innerHTML = `<iframe data-neptune-broadcast-player src="${esc(youtube.embedUrl)}" title="${esc(youtube.title)}" loading="eager" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>`;
      target.dataset.neptuneBroadcastKey = renderKey;
      target.dataset.source = 'youtube';
    }
    if (footerLink) {
      footerLink.href = youtube.watchUrl;
      footerLink.textContent = 'Voir sur YouTube';
    }
    return;
  }

  const files = [...fileIndex.values()];
  const longFile = files
    .filter((file) => LONG_TYPES.has(String(file.fileType || '').toLowerCase()))
    .sort((a, b) => fileTimestamp(b) - fileTimestamp(a))[0];
  if (longFile?.id) {
    const renderKey = `drive:${longFile.id}:${longFile.modifiedAt || longFile.createdAt || ''}`;
    if (target.dataset.neptuneBroadcastKey !== renderKey || !target.querySelector('video[data-neptune-broadcast-player]')) {
      const preview = longFile.previewUrl || `/api/client/files/${encodeURIComponent(longFile.id)}?inline=1`;
      target.innerHTML = `<video data-neptune-broadcast-player controls preload="metadata" playsinline src="${esc(preview)}" aria-label="${esc(longFile.name || 'Votre émission')}"></video>`;
      target.dataset.neptuneBroadcastKey = renderKey;
      target.dataset.source = 'drive';
    }
  }
  if (footerLink && youtubeState?.channelUrl) footerLink.href = youtubeState.channelUrl;
}

function installStyles() {
  if (document.querySelector('#neptuneMediaRuntimeStyles')) return;
  const style = document.createElement('style');
  style.id = 'neptuneMediaRuntimeStyles';
  style.textContent = `
    #broadcastPreview iframe,#broadcastPreview video{display:block;width:100%;height:100%;border:0;object-fit:contain;background:#050b1c}
    .neptune-media-proxy-dialog{width:min(1080px,calc(100vw - 32px));max-width:none;max-height:calc(100vh - 32px);padding:0;border:0;border-radius:24px;background:#fff;box-shadow:0 30px 100px rgba(2,10,35,.42);overflow:hidden}
    .neptune-media-proxy-dialog::backdrop{background:rgba(4,10,30,.76);backdrop-filter:blur(8px)}
    .neptune-media-close{position:absolute;z-index:4;top:14px;right:14px;width:42px;height:42px;border:0;border-radius:999px;background:rgba(255,255,255,.94);color:#111827;font-size:26px;cursor:pointer}
    .neptune-media-proxy-body{display:grid;grid-template-columns:minmax(0,1.45fr) minmax(260px,.55fr);min-height:520px}
    .neptune-media-player-shell{position:relative;display:grid;place-items:center;min-width:0;background:#030817;overflow:hidden}
    .neptune-media-player-shell video{display:block;width:100%;height:100%;max-height:calc(100vh - 32px);object-fit:contain;background:#030817}
    .neptune-media-player-shell--short video{aspect-ratio:9/16;max-width:min(52vh,460px)}
    .neptune-media-player-shell--long video{aspect-ratio:16/9}
    .neptune-media-proxy-body aside{display:flex;flex-direction:column;justify-content:center;padding:34px}
    .neptune-media-proxy-body aside>span{color:#6550dc;font-size:10px;font-weight:900;letter-spacing:.12em}
    .neptune-media-proxy-body h2{margin:10px 0;color:#101828;font-size:clamp(1.25rem,2.2vw,2rem);line-height:1.08}
    .neptune-media-proxy-body p{margin:0;color:#667085;font-size:13px}
    .neptune-media-proxy-body aside>a{display:flex;align-items:center;justify-content:center;gap:9px;min-height:48px;margin-top:24px;border-radius:13px;background:#10275f;color:#fff;font-size:12px;font-weight:900;text-decoration:none}
    ${DOWNLOAD_SELECTOR}{transition:opacity .18s ease,transform .18s ease}
    ${DOWNLOAD_SELECTOR}.neptune-download-busy,${DOWNLOAD_SELECTOR}.neptune-download-launched{pointer-events:none;opacity:.82}
    ${DOWNLOAD_SELECTOR}.neptune-download-busy::before{content:'';width:14px;height:14px;border:2px solid currentColor;border-right-color:transparent;border-radius:50%;animation:neptuneDownloadSpin .7s linear infinite}
    ${DOWNLOAD_SELECTOR}.neptune-download-launched::before{content:'✓';font-size:14px;font-weight:900}
    @keyframes neptuneDownloadSpin{to{transform:rotate(360deg)}}
    .neptune-media-load-error{position:absolute;inset:auto 20px 20px;display:grid;gap:4px;padding:14px;border-radius:12px;background:rgba(123,31,31,.92);color:#fff}
    .neptune-media-load-error[hidden]{display:none}
    @media(max-width:800px){.neptune-media-proxy-body{grid-template-columns:1fr;min-height:0}.neptune-media-player-shell{min-height:52vh}.neptune-media-proxy-body aside{padding:22px}.neptune-media-proxy-dialog{width:calc(100vw - 16px);max-height:calc(100vh - 16px)}}
  `;
  document.head.append(style);
}

function fileTimestamp(file) {
  const date = new Date(file.modifiedAt || file.createdAt || file.order?.updatedAt || 0);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function cleanName(value) {
  return String(value || '').replace(/\.[a-z0-9]{2,5}$/iu, '').replace(/[_-]+/gu, ' ').replace(/\s+/gu, ' ').trim();
}

function cssUrl(value) {
  return String(value || '').replace(/["\\\n\r]/gu, '');
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/gu, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}
