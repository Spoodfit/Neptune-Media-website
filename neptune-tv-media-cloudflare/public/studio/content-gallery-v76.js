const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const PAGE_SIZE = 24;

let adminState = { orders: [] };
let currentOrderId = '';
let activeFilter = 'all';
let activePage = 1;
let activeQuery = '';
let viewMode = localStorage.getItem('neptune_studio_content_view') === 'list' ? 'list' : 'grid';
let observer = null;
let observedRoot = null;
let frame = 0;
let refreshTimer = 0;
let thumbnailObserver = null;

start();

function start() {
  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', boot, { once: true })
    : boot();
}

function boot() {
  observedRoot = $('#clientDetail');
  if (!observedRoot) return;
  observer = new MutationObserver(scheduleDecoration);
  observe();
  window.addEventListener('focus', refreshState);
  $('#refresh')?.addEventListener('click', () => setTimeout(refreshState, 180));
  ensurePreviewDialog();
  refreshState();
}

function observe() {
  if (observer && observedRoot) {
    observer.observe(observedRoot, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class'],
    });
  }
}

function scheduleDecoration() {
  if (frame) return;
  frame = requestAnimationFrame(() => {
    frame = 0;
    decorate();
  });
}

async function refreshState() {
  clearTimeout(refreshTimer);
  try {
    adminState = await api('/api/admin/clients');
    scheduleDecoration();
  } catch (error) {
    console.error('studio_content_gallery_v76_failed', error);
  }
  refreshTimer = setTimeout(refreshState, 60_000);
}

function decorate() {
  observer?.disconnect();
  try {
    const root = $('#clientDetail');
    if (!root || !root.children.length) return;
    const activeTab = $('.tabs button.active', root)?.dataset.detailTab;
    if (activeTab !== 'content') return;
    const orderId = decodeURIComponent(location.hash.slice(1));
    const order = (adminState.orders || []).find((item) => item.id === orderId);
    if (!order) return;
    if (currentOrderId !== orderId) {
      currentOrderId = orderId;
      activeFilter = 'all';
      activePage = 1;
      activeQuery = '';
    }
    const detailGrid = $('#detailBody .detail-grid', root);
    if (!detailGrid) return;
    const panel = $(':scope > .panel', detailGrid);
    if (!panel) return;
    compactUpload(detailGrid);
    renderPanel(panel, order);
  } finally {
    observe();
  }
}

function compactUpload(detailGrid) {
  const aside = $(':scope > aside', detailGrid);
  if (!aside) return;
  aside.classList.add('studio-content-side');
  $$('a[href*="video-ai"],a[href*="neptune-video-clean"]', aside).forEach((item) => item.remove());
  const form = $('#uploadForm', aside);
  if (!form || form.closest('.studio-upload-details')) return;
  const details = document.createElement('details');
  details.className = 'studio-upload-details';
  details.innerHTML = '<summary><span>AJOUT MANUEL</span><strong>Importer un contenu hors Drive</strong><i>+</i></summary>';
  form.before(details);
  details.append(form);
}

function renderPanel(panel, order) {
  const files = order.files || [];
  const counts = { all: files.length, long: 0, short: 0, rush: 0, document: 0 };
  files.forEach((file) => {
    const key = category(file);
    counts[key] = (counts[key] || 0) + 1;
  });

  const query = normalize(activeQuery);
  const filtered = files.filter((file) => {
    if (activeFilter !== 'all' && category(file) !== activeFilter) return false;
    if (!query) return true;
    return normalize([file.name, file.fileType, file.sizeLabel, file.createdAt].join(' ')).includes(query);
  });
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  activePage = Math.min(activePage, totalPages);
  const visible = filtered.slice((activePage - 1) * PAGE_SIZE, activePage * PAGE_SIZE);
  const signature = [
    order.id,
    activeFilter,
    activePage,
    activeQuery,
    viewMode,
    ...files.map((file) => `${file.id || file.driveFileId}:${file.driveVersion || file.updatedAt || file.createdAt || file.name}`),
  ].join('|');
  if (panel.dataset.contentGallerySignature === signature) return;
  panel.dataset.contentGallerySignature = signature;
  panel.className = 'panel studio-content-gallery-panel';
  panel.innerHTML = `
    <header class="studio-content-head">
      <div>
        <p class="eyebrow">CONTENUS DU PASSAGE</p>
        <h3>Bibliothèque de contenus</h3>
        <p>${files.length} fichier${files.length > 1 ? 's' : ''} synchronisé${files.length > 1 ? 's' : ''} · 24 éléments par page</p>
      </div>
      <div class="studio-content-counts">
        <span><b>${counts.long}</b> longs</span>
        <span><b>${counts.short}</b> shorts</span>
        <span><b>${counts.rush}</b> rushs</span>
      </div>
    </header>
    <div class="studio-content-toolbar">
      <label class="studio-content-search">
        <span aria-hidden="true">⌕</span>
        <input type="search" value="${esc(activeQuery)}" placeholder="Rechercher un titre ou un format" aria-label="Rechercher dans les contenus">
      </label>
      <div class="studio-content-view" role="group" aria-label="Mode d’affichage">
        <button type="button" data-studio-view="grid" class="${viewMode === 'grid' ? 'active' : ''}" aria-pressed="${viewMode === 'grid'}">Grille</button>
        <button type="button" data-studio-view="list" class="${viewMode === 'list' ? 'active' : ''}" aria-pressed="${viewMode === 'list'}">Liste</button>
      </div>
    </div>
    <nav class="studio-content-filters" aria-label="Filtrer les contenus">
      ${filterButton('all', 'Tous', counts.all)}
      ${filterButton('long', 'Long format', counts.long)}
      ${filterButton('short', 'Shorts', counts.short)}
      ${filterButton('rush', 'Rushs', counts.rush)}
      ${filterButton('document', 'Documents', counts.document)}
    </nav>
    ${filtered.length
      ? `<div class="studio-media-grid studio-media-grid--${viewMode}">${visible.map(mediaCard).join('')}</div>${pager(totalPages, filtered.length)}`
      : `<div class="studio-content-empty"><strong>Aucun contenu correspondant</strong><span>Modifiez la recherche ou le filtre. Les fichiers Drive apparaissent automatiquement après synchronisation.</span></div>`}
  `;

  $$('[data-studio-filter]', panel).forEach((button) => button.addEventListener('click', () => {
    activeFilter = button.dataset.studioFilter;
    activePage = 1;
    panel.dataset.contentGallerySignature = '';
    renderPanel(panel, order);
  }));
  $$('[data-studio-view]', panel).forEach((button) => button.addEventListener('click', () => {
    viewMode = button.dataset.studioView === 'list' ? 'list' : 'grid';
    localStorage.setItem('neptune_studio_content_view', viewMode);
    panel.dataset.contentGallerySignature = '';
    renderPanel(panel, order);
  }));
  $('.studio-content-search input', panel)?.addEventListener('input', (event) => {
    activeQuery = event.currentTarget.value;
    activePage = 1;
    panel.dataset.contentGallerySignature = '';
    renderPanel(panel, order);
    requestAnimationFrame(() => {
      const input = $('.studio-content-search input', panel);
      input?.focus();
      input?.setSelectionRange(input.value.length, input.value.length);
    });
  });
  $$('[data-studio-media]', panel).forEach((button) => button.addEventListener('click', () => openPreview(button.dataset.studioMedia, order)));
  $('[data-studio-prev]', panel)?.addEventListener('click', () => {
    activePage = Math.max(1, activePage - 1);
    panel.dataset.contentGallerySignature = '';
    renderPanel(panel, order);
  });
  $('[data-studio-next]', panel)?.addEventListener('click', () => {
    activePage = Math.min(totalPages, activePage + 1);
    panel.dataset.contentGallerySignature = '';
    renderPanel(panel, order);
  });
  hydrateThumbnails(panel);
}

function filterButton(id, label, count) {
  const active = activeFilter === id;
  return `<button type="button" class="${active ? 'active' : ''}" data-studio-filter="${id}" aria-pressed="${active}"><span>${label}</span><b>${count || 0}</b></button>`;
}

function mediaCard(file) {
  const kind = category(file);
  const id = String(file.id || file.driveFileId || file.name || 'content');
  const title = cleanName(file.name) || label(kind);
  const thumbnail = safeUrl(file.thumbnailUrl || '');
  const preview = safeUrl(file.previewUrl || file.downloadUrl || file.externalUrl || '');
  const source = file.source === 'google-drive' || file.driveFileId ? 'Drive' : file.source === 'r2' || file.storageKey ? 'Neptune' : 'Lien externe';
  const image = thumbnail !== '#'
    ? `<img src="${esc(thumbnail)}" alt="" loading="lazy" decoding="async" data-studio-thumbnail>`
    : '';
  const frameSource = thumbnail === '#' && isSameOriginMedia(preview) ? ` data-frame-src="${esc(preview)}"` : '';
  return `
    <article class="studio-media-card studio-media-card--${kind}">
      <button type="button" data-studio-media="${esc(id)}" aria-label="Ouvrir ${esc(title)}">
        <span class="studio-media-preview"${frameSource}>
          ${image}
          <span class="studio-media-fallback"><b>${esc(shortLabel(kind))}</b><small>${esc(source)}</small></span>
          <i aria-hidden="true">${kind === 'document' ? 'DOC' : '▶'}</i>
          <em>${esc(label(kind))}</em>
        </span>
        <span class="studio-media-copy">
          <strong>${esc(title)}</strong>
          <span class="studio-media-meta"><small>${esc(file.sizeLabel || 'Taille inconnue')}</small><small>${esc(relativeDate(file.modifiedAt || file.createdAt))}</small></span>
        </span>
      </button>
    </article>`;
}

function pager(totalPages, totalItems) {
  if (totalPages <= 1) return `<p class="studio-content-result-count">${totalItems} résultat${totalItems > 1 ? 's' : ''}</p>`;
  return `<nav class="studio-content-pager" aria-label="Pagination des contenus"><button type="button" data-studio-prev ${activePage === 1 ? 'disabled' : ''}>←</button><span>Page ${activePage} / ${totalPages} · ${totalItems} contenus</span><button type="button" data-studio-next ${activePage === totalPages ? 'disabled' : ''}>→</button></nav>`;
}

function hydrateThumbnails(panel) {
  thumbnailObserver?.disconnect();
  thumbnailObserver = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      thumbnailObserver.unobserve(entry.target);
      captureFrame(entry.target);
    }
  }, { rootMargin: '180px' });
  $$('[data-frame-src]', panel).forEach((element) => thumbnailObserver.observe(element));
  $$('[data-studio-thumbnail]', panel).forEach((image) => {
    image.addEventListener('error', () => {
      image.remove();
      const holder = image.closest('.studio-media-preview');
      if (holder && isSameOriginMedia(holder.dataset.frameSrc || '')) thumbnailObserver.observe(holder);
    }, { once: true });
  });
}

function captureFrame(holder) {
  const source = safeUrl(holder.dataset.frameSrc || '');
  if (source === '#' || holder.dataset.frameLoading) return;
  holder.dataset.frameLoading = '1';
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'metadata';
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    video.removeAttribute('src');
    video.load();
  };
  const timeout = setTimeout(finish, 7000);
  video.addEventListener('loadedmetadata', () => {
    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    video.currentTime = Math.min(Math.max(duration * 0.08, 0.15), 1.5);
  }, { once: true });
  video.addEventListener('seeked', () => {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = Math.min(640, video.videoWidth || 640);
      canvas.height = Math.round(canvas.width * ((video.videoHeight || 360) / (video.videoWidth || 640)));
      canvas.getContext('2d', { alpha: false }).drawImage(video, 0, 0, canvas.width, canvas.height);
      const image = document.createElement('img');
      image.alt = '';
      image.decoding = 'async';
      image.src = canvas.toDataURL('image/jpeg', 0.76);
      holder.prepend(image);
      holder.classList.add('has-generated-frame');
    } catch (error) {
      console.debug('studio_thumbnail_capture_skipped', error);
    } finally {
      clearTimeout(timeout);
      finish();
    }
  }, { once: true });
  video.addEventListener('error', () => {
    clearTimeout(timeout);
    finish();
  }, { once: true });
  video.src = source;
}

function ensurePreviewDialog() {
  if ($('#studioMediaPreview')) return;
  const dialog = document.createElement('dialog');
  dialog.id = 'studioMediaPreview';
  dialog.className = 'studio-media-dialog';
  dialog.innerHTML = '<button type="button" class="studio-media-close" aria-label="Fermer">×</button><div data-studio-preview-body></div>';
  document.body.append(dialog);
  $('.studio-media-close', dialog).addEventListener('click', () => closePreview(dialog));
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) closePreview(dialog);
  });
}

function openPreview(id, order) {
  const file = (order.files || []).find((item) => String(item.id || item.driveFileId || item.name) === String(id));
  const dialog = $('#studioMediaPreview');
  const body = $('[data-studio-preview-body]', dialog);
  if (!file || !dialog || !body) return;
  const kind = category(file);
  const url = safeUrl(file.previewUrl || file.downloadUrl || file.externalUrl);
  const download = safeUrl(file.downloadUrl || file.externalUrl || file.previewUrl);
  const video = ['long', 'short', 'rush'].includes(kind);
  body.innerHTML = `
    <section class="studio-preview-media studio-preview-media--${kind}">
      ${video && url !== '#'
        ? `<video controls autoplay playsinline preload="metadata" src="${esc(url)}"></video>`
        : '<div class="studio-document-preview">DOCUMENT</div>'}
    </section>
    <section class="studio-preview-info">
      <span>${esc(label(kind))}</span>
      <h2>${esc(cleanName(file.name) || 'Contenu Neptune Media')}</h2>
      <dl>
        <div><dt>Taille</dt><dd>${esc(file.sizeLabel || 'Non renseignée')}</dd></div>
        <div><dt>Importé</dt><dd>${esc(relativeDate(file.modifiedAt || file.createdAt))}</dd></div>
        <div><dt>Source</dt><dd>${esc(file.source === 'google-drive' || file.driveFileId ? 'Google Drive synchronisé' : 'Neptune Media')}</dd></div>
      </dl>
      <div>
        ${url !== '#' ? `<a href="${esc(url)}" target="_blank" rel="noopener">Ouvrir dans un nouvel onglet</a>` : ''}
        ${download !== '#' ? `<a href="${esc(download)}" download>Télécharger</a>` : ''}
      </div>
    </section>`;
  dialog.showModal();
}

function closePreview(dialog) {
  dialog.querySelector('video')?.pause();
  dialog.close();
}

function category(file) {
  const type = String(file.fileType || '').toLowerCase();
  if (['short', 'shorts', 'reel', 'teaser'].includes(type)) return 'short';
  if (['final', 'emission', 'full', 'master', 'episode', 'long'].includes(type)) return 'long';
  if (['rush', 'rushes', 'source', 'sources'].includes(type)) return 'rush';
  return 'document';
}

function label(kind) {
  return ({ long: 'Long format', short: 'Short / Reel', rush: 'Rushes', document: 'Document' })[kind] || 'Contenu';
}

function shortLabel(kind) {
  return ({ long: '16:9', short: '9:16', rush: 'SRC', document: 'DOC' })[kind] || 'MEDIA';
}

function cleanName(value) {
  return String(value || '').replace(/\.[a-z0-9]{2,5}$/iu, '').replace(/[_-]+/gu, ' ').replace(/\s+/gu, ' ').trim();
}

function safeUrl(value) {
  const text = String(value || '');
  return /^(https?:\/\/|\/)/iu.test(text) ? text : '#';
}

function isSameOriginMedia(value) {
  if (!value || value === '#') return false;
  try {
    const url = new URL(value, location.origin);
    return url.origin === location.origin;
  } catch {
    return false;
  }
}

function relativeDate(value) {
  const date = new Date(value || '');
  if (Number.isNaN(date.getTime())) return 'Synchronisé';
  return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
}

function normalize(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/gu, '').toLowerCase().trim();
}

async function api(url) {
  const response = await fetch(url, {
    headers: { Accept: 'application/json', 'X-CSRF-Token': sessionStorage.getItem('neptune_csrf') || '' },
    credentials: 'same-origin',
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `http_${response.status}`);
  return data;
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/gu, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}
