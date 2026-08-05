const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const cache = new Map();
const ui = new Map();
let scheduled = 0;
let importOrigin = null;

boot();

function boot() {
  document.body.classList.add('studio-content-command-center-v79');
  installDialogs();
  enhance();
  new MutationObserver(scheduleEnhance).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
  window.addEventListener('hashchange', () => { cache.clear(); scheduleEnhance(); });
  document.addEventListener('click', globalClick);
  document.addEventListener('input', globalInput);
  document.addEventListener('change', globalChange);
  document.addEventListener('dragstart', globalDragStart);
  document.addEventListener('dragover', globalDragOver);
  document.addEventListener('drop', globalDrop);
}

function scheduleEnhance() {
  if (scheduled) return;
  scheduled = requestAnimationFrame(() => {
    scheduled = 0;
    enhance();
  });
}

async function enhance() {
  const root = $('#clientDetail');
  const body = $('#detailBody', root);
  const active = $('.tabs button.active', root)?.dataset.detailTab;
  const orderId = currentOrderId();
  if (!root || !body || !orderId || !['content', 'calendar'].includes(active)) return;
  body.dataset.commandCenterLoading = active;
  const data = await loadData(orderId).catch((error) => ({ error: error.message }));
  if (!body.isConnected || currentOrderId() !== orderId || $('.tabs button.active', root)?.dataset.detailTab !== active) return;
  if (data.error) {
    body.innerHTML = `<section class="v79-state v79-state--error"><strong>Impossible de charger le pilotage éditorial.</strong><span>${escapeHtml(errorLabel(data.error))}</span><button type="button" data-v79-retry>Réessayer</button></section>`;
    return;
  }
  active === 'content' ? renderContent(body, data) : renderCalendar(body, data);
}

async function loadData(orderId, force = false) {
  const item = cache.get(orderId);
  if (!force && item && Date.now() - item.loadedAt < 30_000) return item.data;
  const response = await fetch(`/api/admin/content-calendar?orderId=${encodeURIComponent(orderId)}`, { credentials: 'same-origin', headers: { Accept: 'application/json' } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `http_${response.status}`);
  cache.set(orderId, { loadedAt: Date.now(), data });
  return data;
}

function stateFor(orderId) {
  if (!ui.has(orderId)) ui.set(orderId, { query: '', filter: 'all', sort: 'recent', view: 'grid', month: null, queueQuery: '' });
  return ui.get(orderId);
}

function renderContent(body, data) {
  const state = stateFor(data.order.id);
  const files = filteredFiles(data.files, state);
  body.className = 'v79-detail-body v79-detail-body--content';
  body.innerHTML = `
    <section class="v79-command-center" data-v79-content>
      <header class="v79-command-header">
        <div><p class="eyebrow">PILOTAGE DES CONTENUS</p><h3>Bibliothèque éditoriale</h3><p>Identifiez, programmez et retrouvez chaque contenu sans ouvrir plusieurs écrans.</p></div>
        <div class="v79-header-actions"><button type="button" class="v79-secondary" data-v79-calendar>Voir le calendrier</button><button type="button" class="v79-primary" data-v79-import><span>＋</span> Importer</button></div>
      </header>
      ${metricsMarkup(data.metrics)}
      <div class="v79-toolbar" aria-label="Filtres de la bibliothèque">
        <label class="v79-search"><span>⌕</span><input type="search" data-v79-search value="${escapeHtml(state.query)}" placeholder="Rechercher un titre ou un fichier"></label>
        <select data-v79-sort aria-label="Trier les contenus">
          <option value="recent" ${state.sort === 'recent' ? 'selected' : ''}>Plus récents</option>
          <option value="scheduled" ${state.sort === 'scheduled' ? 'selected' : ''}>Prochaine diffusion</option>
          <option value="name" ${state.sort === 'name' ? 'selected' : ''}>Nom A–Z</option>
        </select>
        <div class="v79-view-toggle" role="group" aria-label="Mode d’affichage"><button type="button" data-v79-view="grid" class="${state.view === 'grid' ? 'active' : ''}">Grille</button><button type="button" data-v79-view="list" class="${state.view === 'list' ? 'active' : ''}">Liste</button></div>
      </div>
      <div class="v79-filter-row">${filterButton('all', 'Tous', data.metrics.total, state)}${filterButton('unscheduled', 'À programmer', data.metrics.unscheduled, state)}${filterButton('scheduled', 'Programmés', data.metrics.scheduled, state)}${filterButton('published', 'Publiés', data.metrics.published, state)}${filterButton('short', 'Shorts', data.files.filter((file) => file.kind === 'short').length, state)}${filterButton('long', 'Longs', data.files.filter((file) => file.kind === 'long').length, state)}</div>
      <div class="v79-results-head"><strong>${files.length} contenu${files.length > 1 ? 's' : ''}</strong><span>Miniatures au format natif · cartes de hauteur uniforme</span></div>
      ${files.length ? `<div class="v79-media-${state.view}">${files.map((file) => contentCard(file, data)).join('')}</div>` : emptyMarkup('Aucun contenu ne correspond à ces filtres.', 'Réinitialiser les filtres', 'data-v79-reset')}
    </section>`;
  hydrateThumbnails(body);
}

function metricsMarkup(metrics) {
  return `<div class="v79-metrics" aria-label="Résumé des contenus">
    <button type="button" data-v79-filter="all"><span>Total</span><b>${metrics.total}</b><small>dans la bibliothèque</small></button>
    <button type="button" data-v79-filter="unscheduled"><span>À programmer</span><b>${metrics.unscheduled}</b><small>action recommandée</small></button>
    <button type="button" data-v79-filter="scheduled"><span>Programmés</span><b>${metrics.scheduled}</b><small>à venir</small></button>
    <button type="button" data-v79-filter="published"><span>Publiés</span><b>${metrics.published}</b><small>déjà exploités</small></button>
  </div>`;
}

function filterButton(id, label, count, state) {
  return `<button type="button" data-v79-filter="${id}" class="${state.filter === id ? 'active' : ''}">${label}<b>${count}</b></button>`;
}

function contentCard(file, data) {
  const status = statusInfo(file.scheduleStatus);
  const schedule = file.occurrenceId ? data.occurrences.find((item) => item.occurrenceId === file.occurrenceId) : null;
  const date = file.nextPublishAt ? shortDate(file.nextPublishAt) : '';
  return `<article class="v79-media-card v79-media-card--${escapeHtml(file.orientation)}" data-v79-file="${escapeHtml(file.fileId)}" draggable="${file.scheduleStatus === 'unscheduled'}">
    <button type="button" class="v79-media-well" data-v79-preview="${escapeHtml(file.fileId)}" aria-label="Prévisualiser ${escapeHtml(file.name)}">
      <span class="v79-media-backdrop"></span>
      <span class="v79-media-frame"><img src="/api/admin/content-thumbnail?fileId=${encodeURIComponent(file.fileId)}" alt="" data-v79-thumb data-media-src="/api/admin/content-media?fileId=${encodeURIComponent(file.fileId)}"><i>▶</i></span>
      <em>${escapeHtml(typeLabel(file.kind))}</em>
      <span class="v79-status v79-status--${status.tone}">${status.label}</span>
    </button>
    <div class="v79-media-copy">
      <div class="v79-media-title"><strong title="${escapeHtml(file.aiTitle || file.name)}">${escapeHtml(file.aiTitle || cleanName(file.name))}</strong><button type="button" data-v79-more="${escapeHtml(file.fileId)}" aria-label="Plus d’actions">•••</button></div>
      <p>${escapeHtml(file.name)}</p>
      <div class="v79-media-facts"><span>${escapeHtml(file.sizeLabel || 'Taille inconnue')}</span><span>${date ? `Diffusion ${escapeHtml(date)}` : 'Non programmé'}</span></div>
      <div class="v79-platforms">${schedule ? schedule.networks.map(networkBadge).join('') : '<span class="v79-muted">Aucun canal choisi</span>'}</div>
      <div class="v79-card-actions"><button type="button" class="v79-secondary" data-v79-preview="${escapeHtml(file.fileId)}">Aperçu</button><button type="button" class="v79-primary" data-v79-schedule="${escapeHtml(file.fileId)}" data-occurrence="${escapeHtml(file.occurrenceId || '')}">${file.scheduleStatus === 'unscheduled' ? 'Programmer' : 'Modifier'}</button></div>
    </div>
  </article>`;
}

function renderCalendar(body, data) {
  const state = stateFor(data.order.id);
  if (!state.month) {
    const firstUpcoming = data.occurrences.find((item) => new Date(item.publishAt).getTime() >= Date.now());
    const basis = firstUpcoming ? new Date(firstUpcoming.publishAt) : new Date();
    state.month = new Date(basis.getFullYear(), basis.getMonth(), 1);
  }
  const month = state.month;
  const unscheduled = data.files.filter((file) => file.scheduleStatus === 'unscheduled' && matches(file, state.queueQuery));
  body.className = 'v79-detail-body v79-detail-body--calendar';
  body.innerHTML = `
    <section class="v79-calendar-shell" data-v79-calendar-shell>
      <header class="v79-command-header v79-calendar-header">
        <div><p class="eyebrow">CALENDRIER ÉDITORIAL</p><h3>Planifier sans friction</h3><p>Cliquez ou glissez un contenu sur une date. Les modifications sont enregistrées dans le calendrier client.</p></div>
        <div class="v79-header-actions"><button type="button" class="v79-secondary" data-v79-content-tab>Bibliothèque</button><button type="button" class="v79-primary" data-v79-import><span>＋</span> Importer</button></div>
      </header>
      ${metricsMarkup(data.metrics)}
      <div class="v79-calendar-layout">
        <div class="v79-calendar-main">
          <div class="v79-calendar-toolbar"><div><button type="button" data-v79-month="prev" aria-label="Mois précédent">‹</button><button type="button" data-v79-today>Aujourd’hui</button><button type="button" data-v79-month="next" aria-label="Mois suivant">›</button></div><h4>${escapeHtml(monthLabel(month))}</h4><span>${data.occurrences.filter((item) => sameMonth(new Date(item.publishAt), month)).length} publication(s)</span></div>
          ${monthGrid(month, data)}
        </div>
        <aside class="v79-calendar-queue">
          <div class="v79-queue-head"><div><span>À PROGRAMMER</span><strong>${unscheduled.length} contenu${unscheduled.length > 1 ? 's' : ''}</strong></div><small>Glissez vers une date</small></div>
          <label class="v79-search v79-queue-search"><span>⌕</span><input type="search" data-v79-queue-search value="${escapeHtml(state.queueQuery)}" placeholder="Rechercher"></label>
          <div class="v79-queue-list">${unscheduled.length ? unscheduled.map(queueCard).join('') : `<div class="v79-queue-empty"><b>Tout est programmé</b><span>Aucune action immédiate.</span></div>`}</div>
        </aside>
      </div>
    </section>`;
  hydrateThumbnails(body);
}

function monthGrid(month, data) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const last = new Date(month.getFullYear(), month.getMonth() + 1, 0);
  const offset = (first.getDay() + 6) % 7;
  const cells = [];
  for (let index = 0; index < offset; index += 1) cells.push('<div class="v79-day v79-day--empty"></div>');
  for (let day = 1; day <= last.getDate(); day += 1) {
    const date = new Date(month.getFullYear(), month.getMonth(), day);
    const entries = data.occurrences.filter((item) => sameDay(new Date(item.publishAt), date));
    const today = sameDay(date, new Date());
    cells.push(`<div class="v79-day ${today ? 'is-today' : ''}" data-v79-drop-date="${dateKey(date)}"><div class="v79-day-head"><b>${day}</b>${entries.length ? `<span>${entries.length}</span>` : ''}</div><div class="v79-day-items">${entries.slice(0, 3).map((entry) => calendarChip(entry, data)).join('')}${entries.length > 3 ? `<button type="button" class="v79-more-count" data-v79-day-list="${dateKey(date)}">+${entries.length - 3} autres</button>` : ''}</div><button type="button" class="v79-day-add" data-v79-day-add="${dateKey(date)}" aria-label="Programmer un contenu le ${day}">＋</button></div>`);
  }
  return `<div class="v79-calendar-grid"><div class="v79-weekdays">${['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map((day) => `<span>${day}</span>`).join('')}</div><div class="v79-days">${cells.join('')}</div></div>`;
}

function calendarChip(entry, data) {
  const file = data.files.find((item) => item.fileId === entry.fileId);
  const published = entry.publications?.some((item) => item.status === 'published');
  return `<button type="button" class="v79-calendar-chip ${published ? 'is-published' : ''}" data-v79-edit-occurrence="${escapeHtml(entry.occurrenceId)}" title="${escapeHtml(entry.title || file?.name || 'Contenu')}"><span class="v79-chip-thumb v79-chip-thumb--${file?.orientation || 'landscape'}"><img src="/api/admin/content-thumbnail?fileId=${encodeURIComponent(entry.fileId)}" alt="" data-v79-thumb></span><span><b>${escapeHtml(entry.title || cleanName(file?.name || 'Contenu'))}</b><small>${timeLabel(entry.publishAt)} · ${entry.networks.map(shortNetwork).join(' ')}</small></span></button>`;
}

function queueCard(file) {
  return `<article class="v79-queue-card" draggable="true" data-v79-drag-file="${escapeHtml(file.fileId)}"><span class="v79-queue-thumb v79-queue-thumb--${escapeHtml(file.orientation)}"><img src="/api/admin/content-thumbnail?fileId=${encodeURIComponent(file.fileId)}" alt="" data-v79-thumb data-media-src="/api/admin/content-media?fileId=${encodeURIComponent(file.fileId)}"></span><div><strong>${escapeHtml(file.aiTitle || cleanName(file.name))}</strong><small>${escapeHtml(typeLabel(file.kind))} · ${escapeHtml(file.sizeLabel || '')}</small></div><button type="button" data-v79-schedule="${escapeHtml(file.fileId)}">＋</button></article>`;
}

function globalClick(event) {
  const target = event.target.closest('button,[data-v79-action]');
  if (!target) return;
  const orderId = currentOrderId();
  if (target.matches('[data-v79-retry]')) { cache.delete(orderId); enhance(); return; }
  if (target.matches('[data-v79-import]')) { openImport(); return; }
  if (target.matches('[data-v79-calendar]')) { switchTab('calendar'); return; }
  if (target.matches('[data-v79-content-tab]')) { switchTab('content'); return; }
  if (target.dataset.v79Filter) { stateFor(orderId).filter = target.dataset.v79Filter; enhance(); return; }
  if (target.dataset.v79View) { stateFor(orderId).view = target.dataset.v79View; enhance(); return; }
  if (target.matches('[data-v79-reset]')) { Object.assign(stateFor(orderId), { query: '', filter: 'all' }); enhance(); return; }
  if (target.dataset.v79Preview) { openPreview(target.dataset.v79Preview); return; }
  if (target.dataset.v79Schedule) { openSchedule(target.dataset.v79Schedule, target.dataset.occurrence || '', null); return; }
  if (target.dataset.v79EditOccurrence) { openOccurrence(target.dataset.v79EditOccurrence); return; }
  if (target.dataset.v79Month) { shiftMonth(target.dataset.v79Month === 'next' ? 1 : -1); return; }
  if (target.matches('[data-v79-today]')) { const now = new Date(); stateFor(orderId).month = new Date(now.getFullYear(), now.getMonth(), 1); enhance(); return; }
  if (target.dataset.v79DayAdd) { chooseContentForDate(target.dataset.v79DayAdd); return; }
  if (target.matches('[data-v79-close-preview]')) $('#v79PreviewDialog')?.close();
  if (target.matches('[data-v79-close-schedule]')) $('#v79ScheduleDialog')?.close();
  if (target.matches('[data-v79-close-import]')) closeImport();
  if (target.matches('[data-v79-delete-schedule]')) deleteSchedule();
}

function globalInput(event) {
  const orderId = currentOrderId();
  if (event.target.matches('[data-v79-search]')) { stateFor(orderId).query = event.target.value; debounceEnhance(); }
  if (event.target.matches('[data-v79-queue-search]')) { stateFor(orderId).queueQuery = event.target.value; debounceEnhance(); }
}
function globalChange(event) {
  if (event.target.matches('[data-v79-sort]')) { stateFor(currentOrderId()).sort = event.target.value; enhance(); }
}
function globalDragStart(event) {
  const card = event.target.closest('[data-v79-drag-file],[data-v79-file]');
  if (!card) return;
  const fileId = card.dataset.v79DragFile || card.dataset.v79File;
  if (!fileId) return;
  event.dataTransfer.effectAllowed = 'copy';
  event.dataTransfer.setData('text/neptune-file-id', fileId);
  event.dataTransfer.setData('text/plain', fileId);
}
function globalDragOver(event) {
  if (!event.target.closest('[data-v79-drop-date]')) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = 'copy';
}
function globalDrop(event) {
  const day = event.target.closest('[data-v79-drop-date]');
  if (!day) return;
  event.preventDefault();
  const fileId = event.dataTransfer.getData('text/neptune-file-id') || event.dataTransfer.getData('text/plain');
  if (fileId) openSchedule(fileId, '', day.dataset.v79DropDate);
}

function debounceEnhance() {
  clearTimeout(debounceEnhance.timer);
  debounceEnhance.timer = setTimeout(enhance, 120);
}

function installDialogs() {
  if (!$('#v79PreviewDialog')) {
    const dialog = document.createElement('dialog');
    dialog.id = 'v79PreviewDialog';
    dialog.className = 'v79-dialog v79-preview-dialog';
    dialog.innerHTML = '<section><button type="button" class="v79-dialog-close" data-v79-close-preview>×</button><div data-v79-preview-body></div></section>';
    document.body.append(dialog);
    dialog.addEventListener('close', () => { const video = $('video', dialog); if (video) { video.pause(); video.removeAttribute('src'); video.load(); } });
  }
  if (!$('#v79ScheduleDialog')) {
    const dialog = document.createElement('dialog');
    dialog.id = 'v79ScheduleDialog';
    dialog.className = 'v79-dialog v79-schedule-dialog';
    dialog.innerHTML = `<form data-v79-schedule-form>
      <header><div><p class="eyebrow">PROGRAMMATION</p><h2 data-v79-schedule-title>Programmer le contenu</h2><p>Une seule action claire : choisissez la date, les canaux et validez.</p></div><button type="button" data-v79-close-schedule>×</button></header>
      <input type="hidden" name="fileId"><input type="hidden" name="occurrenceId">
      <div class="v79-schedule-preview" data-v79-schedule-preview></div>
      <div class="v79-form-grid"><label><span>Date et heure</span><input name="publishAt" type="datetime-local" required></label><fieldset><legend>Canaux</legend><label><input type="checkbox" name="networks" value="youtube"> YouTube</label><label><input type="checkbox" name="networks" value="instagram"> Instagram</label><label><input type="checkbox" name="networks" value="tiktok"> TikTok</label></fieldset><label class="wide"><span>Titre</span><input name="title" maxlength="140" required></label><label class="wide"><span>Description</span><textarea name="description" rows="4" maxlength="1800"></textarea></label><label class="wide"><span>Hashtags</span><input name="hashtags" placeholder="#entrepreneuriat #business"></label></div>
      <p class="v79-form-message" data-v79-schedule-message></p>
      <footer><button type="button" class="v79-danger" data-v79-delete-schedule hidden>Retirer du calendrier</button><span></span><button type="button" class="v79-secondary" data-v79-close-schedule>Annuler</button><button type="submit" class="v79-primary">Enregistrer</button></footer>
    </form>`;
    document.body.append(dialog);
    $('[data-v79-schedule-form]', dialog).addEventListener('submit', saveSchedule);
  }
  if (!$('#v79ImportDialog')) {
    const dialog = document.createElement('dialog');
    dialog.id = 'v79ImportDialog';
    dialog.className = 'v79-dialog v79-import-dialog';
    dialog.innerHTML = '<section><header><div><p class="eyebrow">IMPORT MANUEL</p><h2>Ajouter un contenu</h2></div><button type="button" data-v79-close-import>×</button></header><div data-v79-import-body></div></section>';
    document.body.append(dialog);
    dialog.addEventListener('close', restoreImport);
  }
}

async function openPreview(fileId) {
  const data = await loadData(currentOrderId());
  const file = data.files.find((item) => item.fileId === fileId);
  if (!file) return;
  const dialog = $('#v79PreviewDialog');
  const body = $('[data-v79-preview-body]', dialog);
  const isDocument = file.kind === 'document';
  body.innerHTML = `<div class="v79-preview-media v79-preview-media--${file.orientation}">${isDocument ? '<div class="v79-document-icon">DOC</div>' : `<video controls playsinline preload="metadata" src="/api/admin/content-media?fileId=${encodeURIComponent(fileId)}"></video>`}</div><aside><span>${escapeHtml(typeLabel(file.kind))}</span><h2>${escapeHtml(file.aiTitle || cleanName(file.name))}</h2><p>${escapeHtml(file.name)}</p><dl><div><dt>Statut</dt><dd>${statusInfo(file.scheduleStatus).label}</dd></div><div><dt>Taille</dt><dd>${escapeHtml(file.sizeLabel || '—')}</dd></div><div><dt>Utilisations</dt><dd>${Number(file.usageCount || 0)}</dd></div></dl><div><button type="button" class="v79-primary" data-v79-schedule="${escapeHtml(file.fileId)}" data-occurrence="${escapeHtml(file.occurrenceId || '')}">${file.scheduleStatus === 'unscheduled' ? 'Programmer' : 'Modifier la programmation'}</button>${file.webViewUrl || file.externalUrl ? `<a class="v79-secondary" href="${safeHref(file.webViewUrl || file.externalUrl)}" target="_blank" rel="noopener">Ouvrir la source</a>` : ''}</div></aside>`;
  dialog.showModal();
}

async function openOccurrence(occurrenceId) {
  const data = await loadData(currentOrderId());
  const occurrence = data.occurrences.find((item) => item.occurrenceId === occurrenceId);
  if (occurrence) openSchedule(occurrence.fileId, occurrenceId, null);
}

async function openSchedule(fileId, occurrenceId = '', day = null) {
  const data = await loadData(currentOrderId());
  const file = data.files.find((item) => item.fileId === fileId);
  const occurrence = occurrenceId ? data.occurrences.find((item) => item.occurrenceId === occurrenceId) : data.occurrences.find((item) => item.fileId === fileId && new Date(item.publishAt).getTime() >= Date.now()) || data.occurrences.find((item) => item.fileId === fileId);
  if (!file) return;
  const dialog = $('#v79ScheduleDialog');
  const form = $('[data-v79-schedule-form]', dialog);
  form.reset();
  form.elements.fileId.value = fileId;
  form.elements.occurrenceId.value = occurrence?.occurrenceId || '';
  form.elements.title.value = occurrence?.title || file.aiTitle || cleanName(file.name);
  form.elements.description.value = occurrence?.description || file.aiDescription || '';
  form.elements.hashtags.value = (occurrence?.hashtags || file.hashtags || []).map((tag) => `#${tag}`).join(' ');
  const date = day ? new Date(`${day}T09:00:00`) : occurrence?.publishAt ? new Date(occurrence.publishAt) : nextDefaultDate();
  form.elements.publishAt.value = toLocalInput(date);
  const selected = occurrence?.networks?.length ? occurrence.networks : ['youtube', 'instagram', 'tiktok'];
  $$('input[name="networks"]', form).forEach((input) => { input.checked = selected.includes(input.value); });
  $('[data-v79-schedule-title]', form).textContent = occurrence ? 'Modifier la programmation' : 'Programmer le contenu';
  $('[data-v79-schedule-preview]', form).innerHTML = `<span class="v79-schedule-thumb v79-schedule-thumb--${file.orientation}"><img src="/api/admin/content-thumbnail?fileId=${encodeURIComponent(fileId)}" alt=""></span><div><strong>${escapeHtml(file.aiTitle || cleanName(file.name))}</strong><small>${escapeHtml(typeLabel(file.kind))} · ${escapeHtml(file.sizeLabel || '')}</small></div>`;
  $('[data-v79-delete-schedule]', form).hidden = !occurrence;
  $('[data-v79-schedule-message]', form).textContent = '';
  dialog.showModal();
  requestAnimationFrame(() => form.elements.publishAt.focus());
}

async function saveSchedule(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const submit = $('button[type="submit"]', form);
  const message = $('[data-v79-schedule-message]', form);
  const networks = $$('input[name="networks"]:checked', form).map((input) => input.value);
  if (!networks.length) { message.textContent = 'Choisissez au moins un canal.'; message.className = 'v79-form-message is-error'; return; }
  submit.disabled = true;
  message.textContent = 'Enregistrement…';
  message.className = 'v79-form-message';
  try {
    const result = await api('/api/admin/content-schedule', {
      method: 'POST',
      body: JSON.stringify({
        orderId: currentOrderId(), fileId: form.elements.fileId.value, occurrenceId: form.elements.occurrenceId.value,
        publishAt: new Date(form.elements.publishAt.value).toISOString(), networks,
        title: form.elements.title.value, description: form.elements.description.value, hashtags: form.elements.hashtags.value,
      }),
    });
    cache.delete(currentOrderId());
    $('#v79ScheduleDialog').close();
    toast(`Programmation enregistrée le ${shortDate(result.publishAt)}.`);
    await enhance();
  } catch (error) {
    message.textContent = errorLabel(error.message, error.data);
    message.className = 'v79-form-message is-error';
  } finally { submit.disabled = false; }
}

async function deleteSchedule() {
  const form = $('[data-v79-schedule-form]');
  const occurrenceId = form.elements.occurrenceId.value;
  if (!occurrenceId || !confirm('Retirer ce contenu du calendrier ? Le fichier restera dans la bibliothèque.')) return;
  try {
    await api('/api/admin/content-schedule-delete', { method: 'POST', body: JSON.stringify({ orderId: currentOrderId(), occurrenceId }) });
    cache.delete(currentOrderId());
    $('#v79ScheduleDialog').close();
    toast('Contenu retiré du calendrier.');
    await enhance();
  } catch (error) { $('[data-v79-schedule-message]', form).textContent = errorLabel(error.message, error.data); }
}

async function chooseContentForDate(day) {
  const data = await loadData(currentOrderId());
  const file = data.files.find((item) => item.scheduleStatus === 'unscheduled');
  if (!file) { toast('Tous les contenus sont déjà programmés.'); return; }
  openSchedule(file.fileId, '', day);
}

function openImport() {
  const details = $('.studio-upload-details');
  const dialog = $('#v79ImportDialog');
  const body = $('[data-v79-import-body]', dialog);
  if (!details || !dialog) { toast('Le formulaire d’import n’est pas disponible.', true); return; }
  importOrigin = { parent: details.parentNode, next: details.nextSibling };
  body.append(details);
  details.open = true;
  dialog.showModal();
}
function closeImport() { $('#v79ImportDialog')?.close(); }
function restoreImport() {
  const details = $('.studio-upload-details', $('#v79ImportDialog'));
  if (!details || !importOrigin) return;
  importOrigin.parent.insertBefore(details, importOrigin.next);
  importOrigin = null;
}

function shiftMonth(amount) {
  const state = stateFor(currentOrderId());
  state.month = new Date(state.month.getFullYear(), state.month.getMonth() + amount, 1);
  enhance();
}
function switchTab(name) { $(`.tabs button[data-detail-tab="${name}"]`)?.click(); }
function currentOrderId() { return decodeURIComponent(location.hash.slice(1) || ''); }

function filteredFiles(files, state) {
  const filtered = files.filter((file) => matches(file, state.query)).filter((file) => {
    if (state.filter === 'all') return true;
    if (['unscheduled', 'scheduled', 'published'].includes(state.filter)) return file.scheduleStatus === state.filter;
    return file.kind === state.filter;
  });
  return filtered.sort((a, b) => {
    if (state.sort === 'name') return String(a.aiTitle || a.name).localeCompare(String(b.aiTitle || b.name), 'fr');
    if (state.sort === 'scheduled') return (new Date(a.nextPublishAt || '9999-12-31') - new Date(b.nextPublishAt || '9999-12-31'));
    return new Date(b.modifiedAt || b.createdAt) - new Date(a.modifiedAt || a.createdAt);
  });
}
function matches(file, query) { return !String(query || '').trim() || normalize(`${file.name} ${file.aiTitle || ''}`).includes(normalize(query)); }

function hydrateThumbnails(root) {
  $$('[data-v79-thumb]', root).forEach((image) => {
    image.addEventListener('load', () => image.closest('.v79-media-frame,.v79-queue-thumb,.v79-chip-thumb')?.classList.add('has-image'), { once: true });
    image.addEventListener('error', () => {
      image.hidden = true;
      const frame = image.closest('.v79-media-frame,.v79-queue-thumb,.v79-chip-thumb');
      frame?.classList.add('is-fallback');
      if (image.dataset.mediaSrc && frame && !frame.dataset.captureStarted) capturePoster(frame, image.dataset.mediaSrc);
    }, { once: true });
  });
}
function capturePoster(frame, src) {
  frame.dataset.captureStarted = '1';
  const video = document.createElement('video');
  video.muted = true; video.playsInline = true; video.preload = 'metadata'; video.src = src;
  video.addEventListener('loadedmetadata', () => { video.currentTime = Math.min(Math.max(video.duration * .12, .4), Math.max(video.duration - .2, .4)); }, { once: true });
  video.addEventListener('seeked', () => {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = Math.min(video.videoWidth || 640, 960); canvas.height = Math.round(canvas.width * (video.videoHeight / video.videoWidth));
      canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
      const image = document.createElement('img'); image.alt = ''; image.src = canvas.toDataURL('image/jpeg', .78);
      frame.prepend(image); frame.classList.add('has-image');
    } catch {}
    video.removeAttribute('src'); video.load();
  }, { once: true });
  video.addEventListener('error', () => { frame.classList.add('is-unavailable'); }, { once: true });
}

async function api(url, options = {}) {
  const headers = { Accept: 'application/json', ...(options.headers || {}) };
  if (options.body) headers['Content-Type'] = 'application/json';
  headers['X-CSRF-Token'] = sessionStorage.getItem('neptune_csrf') || '';
  const response = await fetch(url, { ...options, headers, credentials: 'same-origin' });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) { const error = new Error(data.error || `http_${response.status}`); error.data = data; throw error; }
  return data;
}

function errorLabel(code, data = {}) {
  if (code === 'reuse_too_soon') return `Ce contenu doit être espacé de 30 jours. Prochaine date possible : ${shortDate(data.nextAllowedAt)}.`;
  return ({ unauthorized: 'Reconnectez-vous au Studio.', csrf_failed: 'La session a expiré. Rechargez la page.', invalid_schedule: 'La date ou le contenu est invalide.', content_not_found: 'Ce contenu n’existe plus.', content_management_failed: 'La mise à jour a échoué. Réessayez.' })[code] || 'Une erreur est survenue. Réessayez.';
}
function statusInfo(status) { return ({ unscheduled: { label: 'À programmer', tone: 'warning' }, scheduled: { label: 'Programmé', tone: 'info' }, published: { label: 'Publié', tone: 'success' } })[status] || { label: 'Disponible', tone: 'neutral' }; }
function typeLabel(kind) { return ({ short: 'Short / Reel', long: 'Long format', rush: 'Rush', document: 'Document', other: 'Contenu' })[kind] || 'Contenu'; }
function networkBadge(value) { return `<span title="${escapeHtml(value)}">${escapeHtml(shortNetwork(value))}</span>`; }
function shortNetwork(value) { return ({ youtube: 'YT', instagram: 'IG', tiktok: 'TT' })[value] || String(value || '').slice(0, 2).toUpperCase(); }
function emptyMarkup(text, action, attribute) { return `<div class="v79-state"><strong>${escapeHtml(text)}</strong><button type="button" ${attribute}>${escapeHtml(action)}</button></div>`; }
function cleanName(value) { return String(value || '').replace(/\.[a-z0-9]{2,5}$/iu, '').replace(/[_-]+/gu, ' ').trim(); }
function normalize(value) { return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/gu, '').toLowerCase().trim(); }
function monthLabel(date) { return new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' }).format(date).replace(/^./u, (letter) => letter.toUpperCase()); }
function shortDate(value) { if (!value) return '—'; const date = new Date(value); return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date); }
function timeLabel(value) { return new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' }).format(new Date(value)); }
function sameMonth(date, month) { return date.getFullYear() === month.getFullYear() && date.getMonth() === month.getMonth(); }
function sameDay(a, b) { return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(); }
function dateKey(date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; }
function nextDefaultDate() { const date = new Date(); date.setDate(date.getDate() + 1); date.setHours(9, 0, 0, 0); return date; }
function toLocalInput(value) { const date = value instanceof Date ? value : new Date(value); const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000); return local.toISOString().slice(0, 16); }
function safeHref(value) { return /^https?:\/\//iu.test(String(value || '')) ? escapeHtml(value) : '#'; }
function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/gu, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]); }
function toast(text, error = false) { const element = $('#toast'); if (!element) return; element.textContent = text; element.className = `toast${error ? ' error' : ''}`; element.hidden = false; clearTimeout(toast.timer); toast.timer = setTimeout(() => { element.hidden = true; }, 3800); }
