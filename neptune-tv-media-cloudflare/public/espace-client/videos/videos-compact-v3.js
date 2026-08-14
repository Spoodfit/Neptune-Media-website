const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const FINAL_TYPES = new Set(['final', 'emission', 'full', 'master', 'episode', 'long']);
const SHORT_TYPES = new Set(['short', 'shorts', 'reel', 'teaser']);
const INITIAL_LIMITS = { final: 4, short: 8 };
const requestedOrderId = new URLSearchParams(location.search).get('passage') || '';

let orders = [];
let activeOrderId = '';
let activeFolder = 'final';
const expanded = { final: false, short: false };

load();

async function load() {
  try {
    const state = await api('/api/client/session');
    orders = (Array.isArray(state.orders) ? state.orders : [])
      .map(normalizeOrder)
      .filter((order) => order.files.some((file) => ['final', 'short'].includes(categoryOf(file))))
      .sort((a, b) => timestamp(b) - timestamp(a));

    activeOrderId = orders.some((order) => String(order.id) === String(requestedOrderId))
      ? requestedOrderId
      : orders[0]?.id || '';
    const initialOrder = orders.find((order) => String(order.id) === String(activeOrderId)) || orders[0];
    activeFolder = preferredFolder(initialOrder);
    renderSummary();
    prepareLibraryShell();
    renderLibrary();
  } catch (error) {
    if (['unauthorized', 'http_401'].includes(error.message)) {
      location.href = '/espace-client/';
      return;
    }
    $('#resultLabel').textContent = 'Impossible de charger votre bibliothèque.';
    $('#contentGrid').innerHTML = '<div class="empty-state"><div><strong>Bibliothèque indisponible</strong>Rechargez la page ou revenez au tableau de bord.</div></div>';
  }
}

function normalizeOrder(order) {
  return { ...order, files: (order.files || []).map((file) => ({ ...file, orderId: order.id })) };
}

function prepareLibraryShell() {
  const grid = $('#contentGrid');
  if (!grid) return;

  if (!$('#passageSelector')) {
    const selector = document.createElement('nav');
    selector.id = 'passageSelector';
    selector.className = 'passage-selector';
    selector.setAttribute('aria-label', 'Choisir un passage');
    grid.before(selector);
  }

  if (!$('#videoPreviewDialog')) {
    const dialog = document.createElement('dialog');
    dialog.id = 'videoPreviewDialog';
    dialog.className = 'video-preview-dialog';
    dialog.innerHTML = '<button type="button" class="preview-close" aria-label="Fermer">×</button><div class="preview-content"></div>';
    document.body.append(dialog);
    $('.preview-close', dialog).addEventListener('click', () => closePreview(dialog));
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) closePreview(dialog);
    });
  }
}

function renderSummary() {
  const items = orders.flatMap((order) => order.files).filter((file) => ['final', 'short'].includes(categoryOf(file)));
  $('#contentCount').textContent = items.length;
  $('#shortCount').textContent = items.filter((file) => categoryOf(file) === 'short').length;
  $('#projectCount').textContent = orders.length;
}

function renderLibrary() {
  if (!orders.length) {
    $('#resultLabel').textContent = 'Aucun contenu disponible pour le moment';
    $('#contentGrid').innerHTML = '<div class="empty-state"><div><strong>Vos vidéos apparaîtront ici</strong>Neptune les classera automatiquement par passage.</div></div>';
    $('#passageSelector')?.replaceChildren();
    return;
  }

  if (!orders.some((order) => String(order.id) === String(activeOrderId))) activeOrderId = orders[0].id;
  renderPassageSelector();

  const order = orders.find((item) => String(item.id) === String(activeOrderId)) || orders[0];
  const finalFiles = order.files.filter((file) => categoryOf(file) === 'final');
  const shortFiles = order.files.filter((file) => categoryOf(file) === 'short');
  const total = finalFiles.length + shortFiles.length;
  if ((activeFolder === 'final' && !finalFiles.length && shortFiles.length) || (activeFolder === 'short' && !shortFiles.length && finalFiles.length)) {
    activeFolder = preferredFolder(order);
  }
  const activeFiles = activeFolder === 'short' ? shortFiles : finalFiles;

  $('#resultLabel').textContent = `${total} contenu${total > 1 ? 's' : ''} · ${order.title || order.format || 'Passage Neptune Media'}`;
  $('#contentGrid').innerHTML = `
    <section class="active-passage-summary">
      <div>
        <span>${esc(order.format || 'NEPTUNE MEDIA')}</span>
        <h3>${esc(order.title || 'Passage Neptune Media')}</h3>
        <p>${esc(formatDate(order.filmingAt || order.createdAt))}</p>
      </div>
      <div>
        <b>${finalFiles.length}</b><small>long${finalFiles.length > 1 ? 's' : ''}</small>
        <b>${shortFiles.length}</b><small>courts</small>
      </div>
    </section>
    ${folderSelectorMarkup(finalFiles, shortFiles)}
    <div class="media-dashboard-section">
      ${mediaStripMarkup(activeFiles, activeFolder)}
    </div>`;

  $$('[data-media-folder]').forEach((button) => {
    button.addEventListener('click', () => {
      const next = button.dataset.mediaFolder === 'short' ? 'short' : 'final';
      if (next === activeFolder) return;
      activeFolder = next;
      expanded[next] = false;
      renderLibrary();
      requestAnimationFrame(() => document.querySelector('.media-folder-selector')?.scrollIntoView({ block: 'nearest' }));
    });
  });

  $$('[data-open-video]').forEach((button) => {
    button.addEventListener('click', () => openPreview(button.dataset.openVideo, order));
  });

  $$('[data-toggle-media]').forEach((button) => {
    button.addEventListener('click', () => {
      const type = button.dataset.toggleMedia === 'short' ? 'short' : 'final';
      expanded[type] = !expanded[type];
      renderLibrary();
      requestAnimationFrame(() => {
        document.querySelector(`[data-media-section="${type}"]`)?.scrollIntoView({ block: 'nearest', behavior: prefersMotion() ? 'smooth' : 'auto' });
      });
    });
  });
}

function folderSelectorMarkup(finalFiles, shortFiles) {
  return `<nav class="media-folder-selector" aria-label="Dossiers de contenus synchronisés avec Drive">
    ${folderMarkup('final', 'Format long', 'Émissions et vidéos horizontales', finalFiles.length)}
    ${folderMarkup('short', 'Format court', 'Shorts, Reels et déclinaisons verticales', shortFiles.length)}
  </nav>`;
}

function folderMarkup(type, title, description, count) {
  const active = activeFolder === type;
  const disabled = count === 0;
  return `<button type="button" class="media-format-folder ${active ? 'is-active' : ''}" data-media-folder="${type}" aria-pressed="${active}" ${disabled ? 'disabled' : ''}>
    <span class="media-format-folder-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M3.5 7.5A2.5 2.5 0 0 1 6 5h4l2 2h6A2.5 2.5 0 0 1 20.5 9.5v7A2.5 2.5 0 0 1 18 19H6a2.5 2.5 0 0 1-2.5-2.5z"/></svg></span>
    <span class="media-format-folder-copy"><small>DOSSIER</small><strong>${title}</strong><em>${description}</em></span>
    <span class="media-format-folder-count"><b>${count}</b><small>vidéo${count > 1 ? 's' : ''}</small></span>
    <span class="media-format-folder-arrow" aria-hidden="true">→</span>
  </button>`;
}

function mediaStripMarkup(files, type) {
  const isShort = type === 'short';
  const limit = INITIAL_LIMITS[type];
  const visible = expanded[type] ? files : files.slice(0, limit);
  const hasMore = files.length > limit;
  const title = isShort ? 'Format court' : 'Format long';
  const kicker = 'CONTENU DU DOSSIER';
  const emptyTitle = isShort ? 'Aucun format court livré' : 'Aucun format long livré';
  const emptyCopy = isShort
    ? 'Les formats courts apparaîtront ici dès leur livraison.'
    : 'Les formats longs apparaîtront ici dès leur livraison.';

  return `
    <section class="media-strip-section media-strip-section--${type}" data-media-section="${type}" aria-labelledby="${type}Title">
      <header class="media-row-head">
        <div>
          <span>${kicker}</span>
          <h3 id="${type}Title">${title}</h3>
          <small>${files.length} vidéo${files.length > 1 ? 's' : ''}</small>
        </div>
        ${hasMore ? `<button type="button" data-toggle-media="${type}" aria-expanded="${expanded[type]}">${expanded[type] ? 'Réduire' : `Voir plus (${files.length - limit})`}</button>` : ''}
      </header>
      ${files.length
        ? `<div class="media-strip media-strip--${type}" tabindex="0" aria-label="${title}">${visible.map((file) => cardMarkup(file, type)).join('')}</div>`
        : `<div class="media-strip-empty"><strong>${emptyTitle}</strong><span>${emptyCopy}</span></div>`}
    </section>`;
}

function renderPassageSelector() {
  const nav = $('#passageSelector');
  nav.innerHTML = orders.map((order, index) => {
    const active = String(order.id) === String(activeOrderId);
    const longCount = order.files.filter((file) => categoryOf(file) === 'final').length;
    const shortCount = order.files.filter((file) => categoryOf(file) === 'short').length;
    return `<button type="button" class="${active ? 'active' : ''}" data-passage-id="${esc(order.id)}" aria-pressed="${active}"><span>Passage ${String(index + 1).padStart(2, '0')}</span><strong>${esc(order.title || order.format || 'Neptune Media')}</strong><small>${longCount} long · ${shortCount} courts</small></button>`;
  }).join('');

  $$('[data-passage-id]', nav).forEach((button) => {
    button.addEventListener('click', () => {
      activeOrderId = button.dataset.passageId;
      const nextOrder = orders.find((order) => String(order.id) === String(activeOrderId));
      activeFolder = preferredFolder(nextOrder);
      expanded.final = false;
      expanded.short = false;
      const url = new URL(location.href);
      url.searchParams.set('passage', activeOrderId);
      history.replaceState(null, '', url.pathname + url.search);
      renderLibrary();
    });
  });
}

function preferredFolder(order) {
  if (!order) return 'final';
  const hasLong = order.files.some((file) => categoryOf(file) === 'final');
  const hasShort = order.files.some((file) => categoryOf(file) === 'short');
  return hasLong || !hasShort ? 'final' : 'short';
}

function cardMarkup(file, type) {
  const isShort = type === 'short';
  const title = cleanName(file.name) || (isShort ? 'Short Neptune Media' : 'Émission complète');
  const identifier = file.id || file.driveFileId || title;
  const media = mediaUrls(file);

  return `<article class="compact-media-card compact-media-card--${type}">
    <button type="button" class="compact-media-open" data-open-video="${esc(identifier)}" aria-label="Lire ${esc(title)}">
      <span class="compact-media-preview ${media.drive ? 'compact-media-preview--drive' : 'compact-media-preview--direct'}">
        <i aria-hidden="true">▶</i>
        <em>${isShort ? 'COURT' : 'LONG'}</em>
      </span>
      <span class="compact-media-copy">
        <strong>${esc(title)}</strong>
        <small>${esc(file.sizeLabel || formatDate(file.createdAt))}</small>
      </span>
    </button>
    <div class="compact-media-actions">
      <a href="${esc(media.download)}">Télécharger</a>
      ${isShort ? '<a href="/espace-client/calendrier/">Planifier</a>' : ''}
    </div>
  </article>`;
}

function openPreview(id, order) {
  const file = order.files.find((item) => String(item.id || item.driveFileId || cleanName(item.name)) === String(id));
  const dialog = $('#videoPreviewDialog');
  const content = $('.preview-content', dialog);
  if (!file || !dialog || !content) return;

  const format = categoryOf(file) === 'short' ? 'short' : 'final';
  const media = mediaUrls(file);
  const type = format === 'short' ? 'FORMAT COURT' : 'FORMAT LONG';
  dialog.dataset.format = format;
  content.className = `preview-content preview-content--${format}`;
  content.innerHTML = `<div class="preview-player-shell preview-player-shell--${format}">${playerMarkup(media, format)}</div><section><span>${type}</span><h2>${esc(cleanName(file.name) || 'Contenu Neptune Media')}</h2><p>${esc(file.sizeLabel || 'Disponible dans votre espace Neptune Media')}</p><div><a href="${esc(media.download)}">Télécharger</a>${format === 'short' ? '<a href="/espace-client/calendrier/">Planifier ce short</a>' : ''}</div></section>`;
  dialog.showModal();
}

function playerMarkup(media, format) {
  if (media.drive) {
    return `<iframe class="preview-player preview-player--${format}" src="${esc(media.preview)}" title="Lecture du contenu Neptune Media" loading="eager" allow="autoplay; encrypted-media; picture-in-picture" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>`;
  }
  return `<video class="preview-player preview-player--${format}" controls autoplay playsinline preload="metadata" src="${esc(media.preview)}"></video>`;
}

function closePreview(dialog) {
  dialog.querySelector('video')?.pause();
  const iframe = dialog.querySelector('iframe');
  if (iframe) iframe.src = 'about:blank';
  dialog.close();
}

function mediaUrls(file) {
  const driveId = driveFileId(file);
  const authorized = file.id ? `/api/client/files/${encodeURIComponent(file.id)}` : safeUrl(file.downloadUrl || file.externalUrl || file.webViewUrl);
  return {
    drive: Boolean(driveId),
    download: authorized,
    preview: driveId ? `https://drive.google.com/file/d/${encodeURIComponent(driveId)}/preview` : authorized,
  };
}

function driveFileId(file) {
  const direct = String(file.driveFileId || '').trim();
  if (direct) return direct;
  for (const raw of [file.downloadUrl, file.externalUrl, file.webViewUrl]) {
    const value = String(raw || '').trim();
    if (!value) continue;
    const pathMatch = value.match(/\/file\/d\/([^/?#]+)/u);
    if (pathMatch?.[1]) return decodeURIComponent(pathMatch[1]);
    try {
      const url = new URL(value, location.origin);
      if (/drive\.google\.com$/iu.test(url.hostname)) {
        const queryId = url.searchParams.get('id');
        if (queryId) return queryId;
      }
    } catch {
      // Une URL externe invalide est simplement ignorée.
    }
  }
  return '';
}

function categoryOf(file) {
  const type = String(file.fileType || '').toLowerCase();
  if (SHORT_TYPES.has(type)) return 'short';
  if (FINAL_TYPES.has(type)) return 'final';
  return /\.(mp4|webm|mov|m4v)(\?|$)/iu.test(String(file.name || file.downloadUrl || '')) ? 'final' : 'other';
}

function timestamp(order) {
  const date = new Date(order.filmingAt || order.updatedAt || order.createdAt || 0);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function formatDate(value) {
  const date = new Date(value || '');
  return Number.isNaN(date.getTime()) ? 'Date à confirmer' : new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
}

function cleanName(value) {
  return String(value || '').replace(/\.[a-z0-9]{2,5}$/iu, '').replace(/[_-]+/gu, ' ').replace(/\s+/gu, ' ').trim();
}

function safeUrl(value) {
  const text = String(value || '');
  return /^(https?:\/\/|\/)/iu.test(text) ? text : '#';
}

function prefersMotion() {
  return !matchMedia('(prefers-reduced-motion: reduce)').matches;
}

async function api(url) {
  const response = await fetch(url, { headers: { Accept: 'application/json' }, credentials: 'same-origin' });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `http_${response.status}`);
  return payload;
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/gu, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}
