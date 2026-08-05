const $ = (selector, root = document) => root.querySelector(selector);

const SNAPSHOT_LIMITS = { long: 4, short: 4 };

let snapshotState = { orders: [] };
let activeOrderId = '';
let snapshotTimer = 0;
let snapshotInFlight = false;
let dashboardObserver = null;

start();

function start() {
  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', boot, { once: true })
    : boot();
}

function boot() {
  const dashboard = $('#dashboard');
  if (!dashboard) return;

  dashboardObserver = new MutationObserver(() => {
    if (dashboard.hidden) {
      clearTimeout(snapshotTimer);
      stopPreview($('#clientContentSnapshot'));
      return;
    }
    refreshSnapshot({ force: true });
  });
  dashboardObserver.observe(dashboard, { attributes: true, attributeFilter: ['hidden'] });

  if (!dashboard.hidden) refreshSnapshot({ force: true });
}

async function refreshSnapshot({ force = false } = {}) {
  clearTimeout(snapshotTimer);
  const dashboard = $('#dashboard');
  if (!dashboard || dashboard.hidden || snapshotInFlight) return;

  snapshotInFlight = true;
  try {
    const response = await fetch('/api/client/session', {
      headers: { Accept: 'application/json' },
      credentials: 'same-origin',
    });
    if (!response.ok) {
      if (response.status !== 401) console.error('client_content_snapshot_http_failed', response.status);
      return;
    }
    snapshotState = await response.json();
    renderSnapshot({ force });
  } catch (error) {
    console.error('client_content_snapshot_failed', error);
  } finally {
    snapshotInFlight = false;
    if (dashboard && !dashboard.hidden) snapshotTimer = setTimeout(refreshSnapshot, 60_000);
  }
}

function renderSnapshot({ force = false } = {}) {
  const orders = (snapshotState.orders || [])
    .filter((order) => (order.files || []).length)
    .sort((a, b) => timestamp(b) - timestamp(a));

  const existing = $('#clientContentSnapshot');
  if (!orders.length) {
    stopPreview(existing);
    existing?.remove();
    return;
  }

  if (!orders.some((order) => order.id === activeOrderId)) activeOrderId = orders[0].id;
  const order = orders.find((item) => item.id === activeOrderId) || orders[0];
  const longFiles = (order.files || []).filter((file) => category(file) === 'long');
  const shortFiles = (order.files || []).filter((file) => category(file) === 'short');
  const signature = snapshotSignature(orders, order.id);

  const anchor = $('.overview-grid');
  if (!anchor) return;

  let section = existing;
  if (!section) {
    section = document.createElement('section');
    section.id = 'clientContentSnapshot';
    section.className = 'client-content-snapshot';
    anchor.after(section);
  }
  if (!force && section.dataset.snapshotSignature === signature) return;

  stopPreview(section);
  section.dataset.snapshotSignature = signature;

  const passageOptions = orders.map((item, index) => `<option value="${esc(item.id)}" ${item.id === order.id ? 'selected' : ''}>Passage ${String(index + 1).padStart(2, '0')} · ${esc(item.title || item.format || 'Neptune Media')}</option>`).join('');
  const longRail = renderRail(longFiles, 'long', SNAPSHOT_LIMITS.long);
  const shortRail = renderRail(shortFiles, 'short', SNAPSHOT_LIMITS.short);

  section.innerHTML = `<header><div><p>VOS CONTENUS</p><h2>Tout voir sans parcourir une longue liste</h2></div><a href="/espace-client/videos/">Ouvrir la bibliothèque</a></header><div class="snapshot-toolbar"><label><span>Passage</span><select data-snapshot-passage>${passageOptions}</select></label><div><span><b>${longFiles.length}</b> long</span><span><b>${shortFiles.length}</b> shorts</span></div></div><div class="snapshot-layout"><section class="snapshot-row snapshot-long"><div class="snapshot-section-head"><strong>Émissions complètes</strong><span>${longFiles.length}</span></div><div class="snapshot-rail snapshot-rail--long">${longRail}</div></section><section class="snapshot-row snapshot-shorts"><div class="snapshot-section-head"><strong>Derniers shorts</strong><span>${shortFiles.length}</span></div><div class="snapshot-rail snapshot-rail--short">${shortRail}</div></section></div><dialog class="snapshot-preview" data-snapshot-preview aria-modal="true"><button type="button" data-preview-close aria-label="Fermer">×</button><div data-preview-body></div></dialog>`;

  section.querySelector('[data-snapshot-passage]')?.addEventListener('change', (event) => {
    activeOrderId = event.target.value;
    renderSnapshot({ force: true });
  });
  section.querySelectorAll('[data-snapshot-file]').forEach((button) => {
    button.addEventListener('click', () => openPreview(button.dataset.snapshotFile, order));
  });
  section.querySelector('[data-preview-close]')?.addEventListener('click', () => closePreview(section));
  const dialog = section.querySelector('[data-snapshot-preview]');
  dialog?.addEventListener('click', (event) => {
    if (event.target === dialog) closePreview(section);
  });
}

function renderRail(files, kind, limit) {
  if (!files.length) {
    const label = kind === 'long' ? 'ÉMISSION' : 'SHORTS';
    const message = kind === 'long'
      ? 'La vidéo longue apparaîtra ici'
      : 'Les formats courts seront ajoutés progressivement';
    return `<div class="snapshot-empty snapshot-empty--rail snapshot-empty--${kind}"><span>${label}</span><strong>${message}</strong></div>`;
  }

  const visible = files.slice(0, limit).map((file) => mediaTile(file, kind)).join('');
  const remaining = files.length - limit;
  return `${visible}${remaining > 0 ? moreTile(kind, remaining, files.length) : ''}`;
}

function moreTile(kind, remaining, total) {
  if (kind === 'short') {
    return `<a class="snapshot-rail-more snapshot-rail-more--short" href="/espace-client/videos/"><small>VOIR PLUS</small><strong>Voir les ${total} shorts</strong><i aria-hidden="true">→</i></a>`;
  }
  return `<a class="snapshot-rail-more snapshot-rail-more--long" href="/espace-client/videos/"><small>VOIR PLUS</small><strong>${remaining} autre${remaining > 1 ? 's' : ''} émission${remaining > 1 ? 's' : ''}</strong><i aria-hidden="true">→</i></a>`;
}

function mediaTile(file, kind) {
  const media = mediaUrls(file);
  const title = cleanName(file.name) || (kind === 'long' ? 'Émission complète' : 'Short Neptune Media');
  return `<button type="button" class="snapshot-media snapshot-media--${kind} ${media.drive ? 'snapshot-media--drive' : 'snapshot-media--direct'}" data-snapshot-file="${esc(file.id || file.driveFileId || title)}"><span class="snapshot-media-overlay"><i>▶</i><small>${kind === 'long' ? 'ÉMISSION COMPLÈTE' : 'SHORT / REEL'}</small><strong>${esc(title)}</strong></span></button>`;
}

function openPreview(id, order) {
  const section = $('#clientContentSnapshot');
  const file = (order.files || []).find((item) => String(item.id || item.driveFileId || cleanName(item.name)) === String(id));
  const dialog = section?.querySelector('[data-snapshot-preview]');
  const body = section?.querySelector('[data-preview-body]');
  if (!file || !dialog || !body) return;

  const format = category(file) === 'short' ? 'short' : 'long';
  const media = mediaUrls(file);
  dialog.dataset.format = format;
  body.className = format === 'short' ? 'is-short' : 'is-long';
  body.innerHTML = `<div class="snapshot-player-shell snapshot-player-shell--${format}">${playerMarkup(media, format)}</div><div><span>${esc(format === 'short' ? 'SHORT / REEL' : 'ÉMISSION COMPLÈTE')}</span><h3>${esc(cleanName(file.name) || 'Contenu Neptune Media')}</h3><p>${esc(file.sizeLabel || 'Disponible dans votre espace client')}</p><a href="${esc(media.download)}">Télécharger</a></div>`;
  dialog.showModal();
}

function playerMarkup(media, format) {
  if (media.drive) return `<iframe class="snapshot-player snapshot-player--${format}" src="${esc(media.preview)}" title="Lecture du contenu Neptune Media" loading="eager" allow="autoplay; encrypted-media; picture-in-picture" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>`;
  return `<video class="snapshot-player snapshot-player--${format}" controls autoplay playsinline preload="metadata" src="${esc(media.preview)}"></video>`;
}

function closePreview(section) {
  const dialog = section?.querySelector('[data-snapshot-preview]');
  cleanupDialog(dialog);
  if (dialog?.open) dialog.close();
}

function stopPreview(section) {
  cleanupDialog(section?.querySelector?.('[data-snapshot-preview]'));
}

function cleanupDialog(dialog) {
  dialog?.querySelector('video')?.pause();
  const iframe = dialog?.querySelector('iframe');
  if (iframe) iframe.src = 'about:blank';
  dialog?.querySelector('[data-preview-body]')?.replaceChildren();
}

function snapshotSignature(orders, selectedOrderId) {
  return [
    selectedOrderId,
    ...orders.map((order) => [
      order.id,
      order.updatedAt || order.createdAt || '',
      ...(order.files || []).map((file) => `${file.id || file.driveFileId || file.name}:${file.modifiedAt || file.updatedAt || file.createdAt || ''}`),
    ].join(':')),
  ].join('|');
}

function mediaUrls(file) {
  const driveId = driveFileId(file);
  const authorized = file.id
    ? `/api/client/files/${encodeURIComponent(file.id)}`
    : safeUrl(file.downloadUrl || file.externalUrl || file.webViewUrl);
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
      // Une URL invalide est ignorée sans bloquer le tableau de bord.
    }
  }
  return '';
}

function category(file) {
  const type = String(file.fileType || '').toLowerCase();
  return ['short', 'shorts', 'reel', 'teaser'].includes(type) ? 'short' : 'long';
}

function timestamp(order) {
  const date = new Date(order.filmingAt || order.updatedAt || order.createdAt || 0);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function cleanName(value) {
  return String(value || '').replace(/\.[a-z0-9]{2,5}$/iu, '').replace(/[_-]+/gu, ' ').replace(/\s+/gu, ' ').trim();
}

function safeUrl(value) {
  const text = String(value || '');
  return /^(https?:\/\/|\/)/iu.test(text) ? text : '#';
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/gu, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}
