const RELEASE = 'neptune-client-command-center-20260814-v117';
const SESSION_API = '/api/client/session';
const CATALOG_API = '/api/reservation/catalog-v96';
const BOOKING_URL = '/reserver';
const FINAL_STATUSES = new Set(['delivered', 'completed']);
const POST_FILMING_STATUSES = new Set(['filmed', 'videos_pending', 'videos_received', 'editing', 'approval', 'delivered', 'completed']);
const EDITING_STATUSES = new Set(['videos_received', 'editing', 'approval']);
const SOURCE_RECEIVED_STATUSES = new Set(['videos_received', 'editing', 'approval', 'delivered', 'completed']);
const FILMED_STATUSES = new Set(['filmed', 'videos_pending', 'videos_received', 'editing', 'approval', 'delivered', 'completed']);
const FILMING_CONFIRMED_STATUSES = new Set(['filming_scheduled', 'filming_confirmed', ...FILMED_STATUSES]);
const PREPARATION_DONE_STATUSES = new Set(['preparation_complete', ...FILMING_CONFIRMED_STATUSES]);
const PAYMENT_DONE_STATUSES = new Set([
  'payment_confirmed', 'reservation_confirmed', 'preparation_booking_pending', 'appointment_confirmed', 'appointment_booked',
  'preparation', 'studio_date_confirmation_pending', 'preparation_complete', ...FILMING_CONFIRMED_STATUSES,
]);
const STAGE_META = [
  ['format', 'Format', iconClapper()],
  ['payment', 'Paiement', iconCard()],
  ['date', 'Date du passage', iconCalendar()],
  ['preparation', 'Préparation', iconHeadset()],
  ['filming', 'Passage', iconCamera()],
  ['source', 'Réception des vidéos', iconTransfer()],
  ['editing', 'Montage', iconEdit()],
  ['complete', 'Terminé', iconSpark()],
];

let refreshTimer = 0;
let state = null;
let currentOrder = null;
let root = null;
let catalogAbort = null;
let renderVersion = 0;

markRelease();
start();

function markRelease() {
  document.documentElement.dataset.clientCommandCenter = 'v117';
  document.documentElement.dataset.clientCommandRelease = RELEASE;
  if (!document.querySelector('link[data-client-command-css]')) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/espace-client/client-command-center-v117.css?v=1';
    link.dataset.clientCommandCss = 'v117';
    document.head.append(link);
  }
}

function start() {
  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', boot, { once: true })
    : boot();
}

function boot() {
  const dashboard = document.querySelector('#dashboard');
  if (!dashboard) return;
  installShell();
  const observer = new MutationObserver(() => {
    removeLegacyWorkflow();
    if (!dashboard.hidden) refresh({ reason: 'dashboard-visible' });
  });
  observer.observe(dashboard, { attributes: true, attributeFilter: ['hidden'] });
  const legacyObserver = new MutationObserver(removeLegacyWorkflow);
  const production = document.querySelector('.production-card');
  if (production) legacyObserver.observe(production, { childList: true, subtree: true });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && !dashboard.hidden) refresh({ reason: 'visibility' });
  });
  if (!dashboard.hidden) refresh({ reason: 'boot' });
}

function installShell() {
  const overview = document.querySelector('.overview-grid');
  const production = overview?.querySelector('.production-card');
  if (!overview || !production) return;
  root = production;
  overview.classList.add('client-command-overview');
  production.classList.add('client-command-center', 'is-loading');
  production.setAttribute('aria-labelledby', 'ccTitle');
  production.innerHTML = shellMarkup();

  const showCard = overview.querySelector('.show-card');
  const metrics = document.querySelector('.metrics-section');
  if (showCard && metrics) {
    let secondary = document.querySelector('#clientSecondaryRow');
    if (!secondary) {
      secondary = document.createElement('section');
      secondary.id = 'clientSecondaryRow';
      secondary.className = 'client-secondary-row';
      secondary.setAttribute('aria-label', 'Informations complémentaires');
      secondary.innerHTML = '<article id="ccActivity" class="cc-activity-card" aria-live="polite"></article>';
      metrics.after(secondary);
    }
    showCard.classList.add('cc-delivery-card');
    secondary.append(showCard);
  }

  const formats = document.querySelector('.formats-panel');
  if (formats) {
    formats.hidden = true;
    formats.classList.add('cc-legacy-formats');
  }
  document.querySelector('.dashboard-content-grid')?.classList.add('cc-utility-grid');
  removeLegacyWorkflow();
}

function shellMarkup() {
  return `
    <div class="cc-legacy-bridge" aria-hidden="true">
      <span id="passageBadge"></span><span id="countdownText"></span><span id="projectNextAction"></span>
      <span id="projectPhaseValue"></span><span id="studioDateValue"></span><span id="studioTimeValue"></span>
      <span id="deadlineLabel"></span><span id="deadlineValue"></span><span id="deadlineDateValue"></span>
      <span id="projectProgressLabel"></span><span id="projectProgressFill"></span>
      <a id="prepareLink" href="${BOOKING_URL}"></a><button type="button" data-open-panel="tracking"></button>
    </div>
    <div class="cc-skeleton" data-cc-skeleton aria-hidden="true">
      <div class="cc-skeleton-head"><i></i><span></span><b></b></div>
      <div class="cc-skeleton-title"></div>
      <div class="cc-skeleton-copy"></div>
      <div class="cc-skeleton-flow">${Array.from({ length: 8 }, () => '<span></span>').join('')}</div>
    </div>
    <div id="ccContent" class="cc-content" hidden></div>`;
}

async function refresh({ reason = 'timer' } = {}) {
  clearTimeout(refreshTimer);
  if (!root || root.dataset.ccBusy === 'true') return;
  root.dataset.ccBusy = 'true';
  const version = ++renderVersion;
  try {
    const response = await fetch(SESSION_API, {
      credentials: 'same-origin',
      headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' },
    });
    if (!response.ok) {
      if (response.status === 401) return;
      throw new Error(`http_${response.status}`);
    }
    state = await response.json();
    if (version !== renderVersion) return;
    const orders = Array.isArray(state?.orders) ? state.orders : [];
    currentOrder = orders.find(isActiveOrder) || null;
    if (currentOrder) {
      renderJourney(currentOrder);
    } else {
      await renderCatalogHero(orders);
    }
    renderSecondary(orders, currentOrder);
    renderQuickSignals(orders, currentOrder);
    root.classList.remove('is-loading', 'is-error');
    document.querySelector('[data-cc-skeleton]')?.setAttribute('hidden', '');
    document.querySelector('#ccContent')?.removeAttribute('hidden');
  } catch (error) {
    if (version !== renderVersion) return;
    renderFailure(error);
  } finally {
    if (root) root.dataset.ccBusy = 'false';
    scheduleRefresh(reason);
  }
}

function scheduleRefresh(reason) {
  clearTimeout(refreshTimer);
  const delay = reason === 'error' ? 30_000 : 60_000;
  refreshTimer = window.setTimeout(() => refresh({ reason: 'timer' }), delay);
}

function isActiveOrder(order) {
  const status = String(order?.status || '').toLowerCase();
  return Boolean(order?.id) && !FINAL_STATUSES.has(status);
}

function renderJourney(order) {
  const content = document.querySelector('#ccContent');
  if (!content) return;
  const steps = buildSteps(order);
  const focusIndex = resolveFocusIndex(steps);
  const action = clientAction(order, steps);
  const waiting = waitingContext(order, steps, action);
  const summary = journeySummary(order, steps, focusIndex, action, waiting);
  const completed = steps.filter((step) => step.state === 'done').length;
  const progress = Math.round((completed / STAGE_META.length) * 100);
  root.dataset.mode = action ? 'action' : 'journey';
  root.dataset.focus = String(focusIndex + 1);

  content.innerHTML = `
    <header class="cc-header">
      <div class="cc-status-line">
        <span class="cc-live-dot" aria-hidden="true"></span>
        <span>PASSAGE EN COURS</span>
        <span class="cc-sync"><i aria-hidden="true">↻</i> Synchronisé avec le Studio</span>
      </div>
      <span class="cc-state-pill" data-tone="${action ? 'action' : waiting ? 'waiting' : 'progress'}">${esc(action ? 'Action requise' : waiting ? 'Neptune s’en occupe' : summary.badge)}</span>
    </header>

    <section class="cc-focus" aria-live="polite">
      <div class="cc-focus-visual" data-tone="${action ? 'action' : 'progress'}">${STAGE_META[focusIndex]?.[2] || iconSpark()}</div>
      <div class="cc-focus-copy">
        <span>${esc(summary.eyebrow)}</span>
        <h2 id="ccTitle">${esc(summary.title)}</h2>
        <p>${esc(summary.detail)}</p>
      </div>
      <div class="cc-focus-actions">
        ${primaryActionMarkup(action, order)}
        <button type="button" class="cc-details-button" data-cc-details aria-expanded="false">Détails <span aria-hidden="true">⌄</span></button>
      </div>
    </section>

    <div class="cc-progress-summary" aria-label="${completed} étapes terminées sur 8">
      <span><b>${completed}/8</b> étapes validées</span>
      <div aria-hidden="true"><i style="width:${progress}%"></i></div>
      <strong>${esc(summary.progressLabel)}</strong>
    </div>

    <div class="cc-flow-scroll" tabindex="0" aria-label="Parcours de votre passage">
      <ol class="cc-flow">${steps.map((step, index) => stageMarkup(step, index, focusIndex)).join('')}</ol>
    </div>

    <section id="ccDetailRegion" class="cc-detail-region" hidden>
      ${detailMarkup(order, steps, action, waiting)}
    </section>`;

  bindJourneyEvents(order, focusIndex);
  requestAnimationFrame(() => centerFocusStage(focusIndex, false));
}

function buildSteps(order) {
  const status = String(order?.status || '').toLowerCase();
  const flow = order?.workflow || {};
  const filming = validDate(order?.filmingAt) ? new Date(order.filmingAt) : null;
  const requested = validDate(flow.requestedFilmingAt || order?.requestedFilmingAt) ? new Date(flow.requestedFilmingAt || order.requestedFilmingAt) : null;
  const appointment = validDate(order?.appointmentAt) ? new Date(order.appointmentAt) : null;
  const supplierStatus = String(flow.supplierStatus || '').toLowerCase();
  const preparationDone = flow.preparationStatus === 'completed' || PREPARATION_DONE_STATUSES.has(status);
  const filmed = Boolean(flow.filmedAt) || FILMED_STATUSES.has(status) || (filming && filming.getTime() < Date.now() && POST_FILMING_STATUSES.has(status));
  const sourceReceived = Boolean(flow.sourceReceivedAt) || SOURCE_RECEIVED_STATUSES.has(status);
  const editing = Boolean(flow.editingStartedAt) || EDITING_STATUSES.has(status);
  const delivered = Boolean(flow.deliveredAt) || FINAL_STATUSES.has(status);
  const completed = status === 'completed' || flow.broadcastStatus === 'published';
  const paymentDone = paymentComplete(order) || PAYMENT_DONE_STATUSES.has(status);
  const dateConfirmed = Boolean(filming) && (supplierStatus === 'confirmed' || FILMING_CONFIRMED_STATUSES.has(status));

  const models = [
    makeStep('format', order?.format ? 'done' : 'current', order?.format || 'Format à confirmer'),
    makeStep('payment', paymentDone ? 'done' : 'current', paymentDone ? 'Paiement validé' : 'Validation du paiement'),
    makeStep('date', dateConfirmed ? 'done' : supplierStatus === 'pending' || supplierStatus === 'alternate_proposed' || supplierStatus === 'rejected' ? 'waiting' : filming || requested ? 'current' : 'upcoming', dateCopy(filming, requested, supplierStatus)),
    makeStep('preparation', preparationDone ? 'done' : appointment ? 'current' : isPastFilmingPhase(status) ? 'done' : 'action', preparationCopy(appointment, preparationDone)),
    makeStep('filming', filmed ? 'done' : dateConfirmed ? 'current' : 'upcoming', filmingCopy(filming, filmed, dateConfirmed)),
    makeStep('source', sourceReceived ? 'done' : filmed || status === 'videos_pending' ? 'current' : 'upcoming', sourceCopy(sourceReceived, filmed)),
    makeStep('editing', delivered ? 'done' : editing || sourceReceived ? 'current' : 'upcoming', editingCopy(order, editing, delivered)),
    makeStep('complete', completed ? 'done' : delivered ? 'current' : 'upcoming', completed ? 'Passage terminé' : delivered ? 'Vos contenus sont livrés' : 'Livraison à venir'),
  ];

  if (models[3].state === 'action' && !shouldAskForPreparation(order)) models[3].state = 'upcoming';
  if (status === 'approval' && hasClientApprovalAction(order)) models[6].state = 'action';
  return models;
}

function makeStep(key, stateValue, copy) {
  const meta = STAGE_META.find(([id]) => id === key);
  return { key, label: meta?.[1] || key, icon: meta?.[2] || iconSpark(), state: stateValue, copy };
}

function paymentComplete(order) {
  const value = String(order?.paymentStatus || order?.payment_status || '').toLowerCase();
  return ['paid', 'succeeded', 'complete', 'completed', 'no_payment_required'].includes(value);
}

function isPastFilmingPhase(status) {
  return FILMED_STATUSES.has(String(status || '').toLowerCase());
}

function shouldAskForPreparation(order) {
  const status = String(order?.status || '').toLowerCase();
  if (POST_FILMING_STATUSES.has(status)) return false;
  return ['payment_confirmed', 'reservation_confirmed', 'preparation_booking_pending', 'appointment_confirmed', 'appointment_booked', 'preparation', 'studio_date_confirmation_pending', 'preparation_complete', 'filming_scheduled', 'filming_confirmed'].includes(status) || !status;
}

function dateCopy(filming, requested, supplierStatus) {
  if (filming && supplierStatus === 'confirmed') return `Confirmé · ${formatCompactDateTime(filming)}`;
  if (filming) return `Prévu · ${formatCompactDateTime(filming)}`;
  if (requested && supplierStatus === 'rejected') return 'Un autre créneau va être proposé';
  if (requested) return `Demandé · ${formatCompactDate(requested)}`;
  return 'Le créneau apparaîtra ici';
}

function preparationCopy(appointment, done) {
  if (done) return 'Visio réalisée';
  if (appointment) return `Visio · ${formatCompactDateTime(appointment)}`;
  return 'Réservez votre visio';
}

function filmingCopy(filming, filmed, confirmed) {
  if (filmed) return 'Tournage réalisé';
  if (filming && confirmed) return formatCompactDateTime(filming);
  return 'Après confirmation du créneau';
}

function sourceCopy(received, filmed) {
  if (received) return 'Rushs reçus par Neptune';
  if (filmed) return 'Transfert du studio vers Neptune';
  return 'Après votre passage';
}

function editingCopy(order, editing, delivered) {
  if (delivered) return 'Montage finalisé';
  if (editing) return deliveryEstimate(order);
  return 'Démarre dès réception des vidéos';
}

function deliveryEstimate(order) {
  const filming = validDate(order?.filmingAt) ? new Date(order.filmingAt) : null;
  if (!filming) return 'Montage en cours';
  const target = new Date(filming.getTime() + 15 * 86_400_000);
  const remaining = Math.ceil((target.getTime() - Date.now()) / 86_400_000);
  if (remaining > 1) return `Montage en cours · env. ${remaining} j`;
  if (remaining === 1) return 'Montage en cours · env. 1 j';
  return 'Montage en cours · livraison proche';
}

function resolveFocusIndex(steps) {
  const action = steps.findIndex((step) => step.state === 'action');
  if (action >= 0) return action;
  const current = steps.findIndex((step) => step.state === 'current');
  if (current >= 0) return current;
  const waiting = steps.findIndex((step) => step.state === 'waiting');
  if (waiting >= 0) return waiting;
  const upcoming = steps.findIndex((step) => step.state === 'upcoming');
  return upcoming >= 0 ? upcoming : steps.length - 1;
}

function clientAction(order, steps) {
  const prepStep = steps.find((step) => step.key === 'preparation');
  if (prepStep?.state === 'action') {
    return {
      stage: 'preparation',
      label: 'Réserver ma visio',
      title: 'Votre visio de préparation est à réserver',
      detail: 'Choisissez votre créneau : c’est la seule action nécessaire pour faire avancer votre passage.',
      href: safeHref(order?.bookingUrl || order?.preparationBookingUrl || BOOKING_URL),
    };
  }
  if (hasClientApprovalAction(order)) {
    return {
      stage: 'editing',
      label: 'Valider mes contenus',
      title: 'Votre validation est attendue',
      detail: 'Ouvrez les contenus concernés et confirmez votre validation pour poursuivre.',
      href: safeHref(order?.approvalUrl || order?.validationUrl || '/espace-client/videos/'),
    };
  }
  const confirmationUrl = order?.filmingConfirmationUrl || order?.confirmationUrl;
  if (String(order?.status || '') === 'studio_date_confirmation_pending' && confirmationUrl) {
    return {
      stage: 'date',
      label: 'Confirmer ma date',
      title: 'Votre date de passage doit être confirmée',
      detail: 'Confirmez le créneau proposé pour verrouiller votre passage studio.',
      href: safeHref(confirmationUrl),
    };
  }
  return null;
}

function hasClientApprovalAction(order) {
  if (!order || String(order.status || '') !== 'approval') return false;
  if (order.approvalUrl || order.validationUrl) return true;
  return /\b(valider|validation|approuver|confirmer)\b/iu.test(String(order.nextAction || '')) && /\b(vous|votre|vos)\b/iu.test(String(order.nextAction || ''));
}

function waitingContext(order, steps, action) {
  if (action) return null;
  const flow = order?.workflow || {};
  const supplier = String(flow.supplierStatus || '').toLowerCase();
  if (['pending', 'alternate_proposed', 'rejected'].includes(supplier)) {
    return {
      title: supplier === 'rejected' ? 'Neptune recherche un nouveau créneau' : 'Neptune confirme votre passage avec le studio',
      detail: supplier === 'rejected'
        ? 'Le premier créneau n’est pas disponible. Vous n’avez rien à faire : une alternative va vous être proposée.'
        : 'Votre demande est bien enregistrée. Aucune action n’est requise de votre part pour le moment.',
    };
  }
  const step = steps.find((item) => item.state === 'waiting');
  return step ? { title: `${step.label} en attente`, detail: step.copy } : null;
}

function journeySummary(order, steps, focusIndex, action, waiting) {
  if (action) return { badge: 'Action requise', eyebrow: 'À VOUS DE JOUER', title: action.title, detail: action.detail, progressLabel: action.label };
  if (waiting) return { badge: 'En attente', eyebrow: 'AUCUNE ACTION DE VOTRE CÔTÉ', title: waiting.title, detail: waiting.detail, progressLabel: 'Neptune s’en occupe' };
  const step = steps[focusIndex];
  const status = String(order?.status || '').toLowerCase();
  if (status === 'editing' || step?.key === 'editing') return { badge: 'En cours', eyebrow: 'ÉTAPE ACTUELLE', title: 'Votre émission est en montage', detail: 'Neptune prépare votre émission complète et vos contenus courts. Vous n’avez rien à faire.', progressLabel: deliveryEstimate(order) };
  if (status === 'videos_pending' || step?.key === 'source') return { badge: 'En cours', eyebrow: 'ÉTAPE ACTUELLE', title: 'Les vidéos sont en cours de réception', detail: 'Le studio transmet les rushs à Neptune avant le démarrage du montage.', progressLabel: 'Transfert en cours' };
  if (step?.key === 'filming') return { badge: 'Confirmé', eyebrow: 'PROCHAINE ÉTAPE', title: 'Votre passage studio est confirmé', detail: step.copy, progressLabel: 'Passage studio' };
  if (step?.key === 'preparation') return { badge: 'En cours', eyebrow: 'PROCHAINE ÉTAPE', title: 'Votre préparation est planifiée', detail: step.copy, progressLabel: 'Préparation' };
  return { badge: 'En cours', eyebrow: 'ÉTAPE ACTUELLE', title: step?.label || 'Votre passage avance', detail: step?.copy || 'Votre espace se met à jour automatiquement.', progressLabel: step?.label || 'En cours' };
}

function primaryActionMarkup(action, order) {
  if (action) return `<a class="cc-primary-action" data-cc-primary href="${esc(action.href)}">${esc(action.label)} <span aria-hidden="true">→</span></a>`;
  const status = String(order?.status || '').toLowerCase();
  if (FINAL_STATUSES.has(status)) return '<a class="cc-primary-action" href="/espace-client/videos/">Voir mes contenus <span aria-hidden="true">→</span></a>';
  return '<button type="button" class="cc-primary-action cc-primary-action--secondary" data-cc-track>Voir le suivi <span aria-hidden="true">→</span></button>';
}

function stageMarkup(step, index, focusIndex) {
  const active = index === focusIndex;
  return `<li class="cc-stage" data-state="${esc(step.state)}" data-stage-index="${index}" ${active ? 'aria-current="step"' : ''}>
    <button type="button" class="cc-stage-button" data-cc-stage="${index}" aria-label="${esc(`${step.label} — ${step.copy}`)}">
      <span class="cc-stage-node"><i class="cc-stage-icon">${step.icon}</i><b class="cc-stage-number">${index + 1}</b><em class="cc-stage-check">✓</em></span>
      <span class="cc-stage-copy"><strong>${esc(step.label)}</strong><small>${esc(step.copy)}</small></span>
      ${step.state === 'action' ? '<span class="cc-stage-flag">À faire</span>' : step.state === 'waiting' ? '<span class="cc-stage-flag cc-stage-flag--waiting">Neptune</span>' : ''}
    </button>
  </li>`;
}

function detailMarkup(order, steps, action, waiting) {
  const appointment = validDate(order?.appointmentAt) ? new Date(order.appointmentAt) : null;
  const filming = validDate(order?.filmingAt) ? new Date(order.filmingAt) : null;
  const facts = [
    ['Format', order?.format || 'À confirmer'],
    ['Préparation', appointment ? formatLongDateTime(appointment) : action?.stage === 'preparation' ? 'À réserver' : 'À confirmer'],
    ['Passage studio', filming ? formatLongDateTime(filming) : 'À confirmer'],
    ['Livraison cible', filming && POST_FILMING_STATUSES.has(String(order?.status || '')) ? formatLongDateTime(new Date(filming.getTime() + 15 * 86_400_000), false) : 'Mise à jour après le passage'],
  ];
  return `
    <div class="cc-detail-head"><div><span>INFORMATIONS DU PASSAGE</span><h3>Tout ce qu’il faut savoir, au même endroit</h3></div><button type="button" data-cc-track>Dossier complet <span aria-hidden="true">→</span></button></div>
    <div class="cc-fact-grid">${facts.map(([label, value]) => `<article><span>${esc(label)}</span><strong>${esc(value)}</strong></article>`).join('')}</div>
    <div class="cc-detail-note" data-tone="${action ? 'action' : waiting ? 'waiting' : 'neutral'}"><span>${action ? '!' : waiting ? '↻' : '✓'}</span><div><strong>${esc(action?.title || waiting?.title || 'Suivi automatique')}</strong><p>${esc(action?.detail || waiting?.detail || 'Chaque changement enregistré dans le Studio Neptune est répercuté automatiquement dans cet espace.')}</p></div></div>
    <div class="cc-detail-mini-flow">${steps.map((step) => `<span data-state="${esc(step.state)}"><i></i>${esc(step.label)}</span>`).join('')}</div>`;
}

function bindJourneyEvents(order, focusIndex) {
  document.querySelector('[data-cc-details]')?.addEventListener('click', toggleDetails);
  document.querySelectorAll('[data-cc-track]').forEach((button) => button.addEventListener('click', openTracking));
  document.querySelectorAll('[data-cc-stage]').forEach((button) => button.addEventListener('click', () => {
    const index = Number(button.dataset.ccStage || 0);
    centerFocusStage(index, true);
    const region = document.querySelector('#ccDetailRegion');
    if (region?.hidden) toggleDetails();
  }));
  const primary = document.querySelector('[data-cc-primary]');
  if (primary && primary.getAttribute('href') === '#') primary.addEventListener('click', (event) => { event.preventDefault(); openTracking(); });
  if (order?.id) root.dataset.orderId = String(order.id);
  requestAnimationFrame(() => centerFocusStage(focusIndex, false));
}

function toggleDetails() {
  const region = document.querySelector('#ccDetailRegion');
  const button = document.querySelector('[data-cc-details]');
  if (!region || !button) return;
  const open = region.hidden;
  region.hidden = !open;
  button.setAttribute('aria-expanded', String(open));
  button.classList.toggle('is-open', open);
  button.querySelector('span')?.replaceChildren(document.createTextNode(open ? '⌃' : '⌄'));
  if (open) requestAnimationFrame(() => region.scrollIntoView({ block: 'nearest', behavior: motionAllowed() ? 'smooth' : 'auto' }));
}

function openTracking() {
  const trigger = document.querySelector('[data-open-panel="tracking"]');
  if (trigger) trigger.click();
}

function centerFocusStage(index, smooth) {
  const scroller = document.querySelector('.cc-flow-scroll');
  const stage = document.querySelector(`[data-stage-index="${index}"]`);
  if (!scroller || !stage) return;
  const target = stage.offsetLeft - (scroller.clientWidth - stage.clientWidth) / 2;
  scroller.scrollTo({ left: Math.max(0, target), behavior: smooth && motionAllowed() ? 'smooth' : 'auto' });
}

async function renderCatalogHero(orders) {
  const content = document.querySelector('#ccContent');
  if (!content) return;
  root.dataset.mode = 'catalog';
  content.innerHTML = catalogShellMarkup(Boolean(orders.length));
  document.querySelector('[data-cc-catalog-prev]')?.addEventListener('click', () => scrollCatalog(-1));
  document.querySelector('[data-cc-catalog-next]')?.addEventListener('click', () => scrollCatalog(1));
  await loadCatalogCards();
}

function catalogShellMarkup(hasHistory) {
  return `
    <header class="cc-header cc-header--catalog">
      <div class="cc-status-line"><span class="cc-live-dot cc-live-dot--idle" aria-hidden="true"></span><span>${hasHistory ? 'AUCUN PASSAGE EN COURS' : 'VOTRE PROCHAIN PASSAGE'}</span><span class="cc-sync"><i aria-hidden="true">↻</i> Catalogue synchronisé avec le Studio</span></div>
      <a class="cc-state-pill" data-tone="catalog" href="${BOOKING_URL}">Voir le catalogue complet</a>
    </header>
    <section class="cc-catalog-head">
      <div><span>CHOISISSEZ VOTRE PROCHAINE EXPÉRIENCE</span><h2 id="ccTitle">${hasHistory ? 'Prêt pour un nouveau passage ?' : 'Quel format vous ressemble ?'}</h2><p>Un visuel, un concept, un clic. Sélectionnez le format qui correspond à votre prochain objectif.</p></div>
      <div class="cc-catalog-controls"><button type="button" data-cc-catalog-prev aria-label="Formats précédents">←</button><button type="button" data-cc-catalog-next aria-label="Formats suivants">→</button></div>
    </section>
    <div id="ccCatalog" class="cc-catalog" aria-live="polite">${catalogSkeleton()}</div>`;
}

async function loadCatalogCards() {
  const target = document.querySelector('#ccCatalog');
  if (!target) return;
  catalogAbort?.abort();
  catalogAbort = new AbortController();
  target.innerHTML = catalogSkeleton();
  target.dataset.state = 'loading';
  try {
    const response = await fetch(CATALOG_API, { credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' }, signal: catalogAbort.signal });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `http_${response.status}`);
    const cards = flattenCatalog(data);
    if (!cards.length) {
      target.dataset.state = 'empty';
      target.innerHTML = `<article class="cc-catalog-empty"><span>${iconClapper()}</span><div><strong>Aucun format ouvert actuellement</strong><p>Le catalogue Studio ne contient pas encore de format réservable.</p></div><a href="${BOOKING_URL}">Voir les disponibilités</a></article>`;
      return;
    }
    target.dataset.state = 'ready';
    target.innerHTML = cards.map(catalogCardMarkup).join('');
  } catch (error) {
    if (error?.name === 'AbortError') return;
    target.dataset.state = 'error';
    target.innerHTML = `<article class="cc-catalog-empty cc-catalog-empty--error"><span>↻</span><div><strong>Le catalogue ne répond pas</strong><p>Votre espace reste accessible. Vous pouvez réessayer sans perdre votre session.</p></div><button type="button" data-cc-catalog-retry>Réessayer</button><a href="${BOOKING_URL}">Réserver autrement</a></article>`;
    target.querySelector('[data-cc-catalog-retry]')?.addEventListener('click', loadCatalogCards);
  }
}

function flattenCatalog(data) {
  const result = [];
  for (const city of data?.cities || []) {
    for (const format of city?.formats || []) {
      result.push({ city, format, minPrice: minOfferPrice(format.offers) });
    }
  }
  return result.slice(0, 16);
}

function minOfferPrice(offers) {
  const values = (offers || []).map((offer) => Number(offer?.clientPriceCents || 0)).filter((value) => value > 0);
  return values.length ? Math.min(...values) : 0;
}

function catalogCardMarkup({ city, format, minPrice }) {
  const image = safeImage(format?.image);
  const url = new URL('/reserver', location.origin);
  if (city?.slug) url.searchParams.set('city', city.slug);
  if (format?.slug) url.searchParams.set('format', format.slug);
  const visual = image
    ? `<img src="${esc(image)}" alt="" loading="lazy" decoding="async">`
    : `<span class="cc-catalog-fallback">${iconClapper()}</span>`;
  return `<article class="cc-format-card">
    <a class="cc-format-visual" href="${esc(url.pathname + url.search)}" aria-label="Découvrir ${esc(format?.name || 'ce format')}">${visual}<span>${esc(city?.name || 'Neptune Media')}</span></a>
    <div class="cc-format-copy"><div><small>${esc(format?.concept || 'NEPTUNE MEDIA')}</small><h3>${esc(format?.name || 'Format Neptune Media')}</h3></div>${format?.durationLabel ? `<span class="cc-format-duration">${esc(format.durationLabel)}</span>` : ''}<p>${esc(shorten(format?.description || 'Un format Neptune Media prêt à réserver.', 132))}</p><footer><strong>${minPrice ? `Dès ${money(minPrice)}` : 'Voir les offres'}</strong><a href="${esc(url.pathname + url.search)}">Réserver <span aria-hidden="true">→</span></a></footer></div>
  </article>`;
}

function catalogSkeleton() {
  return Array.from({ length: 4 }, () => '<article class="cc-format-card cc-format-card--skeleton"><i></i><span></span><b></b><em></em></article>').join('');
}

function scrollCatalog(direction) {
  const target = document.querySelector('#ccCatalog');
  if (!target) return;
  target.scrollBy({ left: direction * Math.max(280, target.clientWidth * .72), behavior: motionAllowed() ? 'smooth' : 'auto' });
}

function renderSecondary(orders, active) {
  const activity = document.querySelector('#ccActivity');
  if (!activity) return;
  const latest = [...orders].sort((a, b) => orderTimestamp(b) - orderTimestamp(a))[0] || null;
  const files = orders.flatMap((order) => order.files || []);
  const schedules = orders.flatMap((order) => order.schedules || []);
  if (active) {
    const action = clientAction(active, buildSteps(active));
    activity.innerHTML = `<header><span>${action ? 'À FAIRE' : 'À SAVOIR'}</span><b>${action ? '1 action' : 'Tout est en ordre'}</b></header><div class="cc-activity-main"><span data-tone="${action ? 'action' : 'ok'}">${action ? '!' : '✓'}</span><div><strong>${esc(action?.label || 'Aucune action requise')}</strong><p>${esc(action ? 'Cette action fait avancer votre passage.' : 'Neptune vous préviendra ici dès qu’une intervention sera nécessaire.')}</p></div></div>`;
  } else {
    activity.innerHTML = `<header><span>VOTRE ESPACE</span><b>${files.length} contenu${files.length > 1 ? 's' : ''}</b></header><div class="cc-activity-main"><span data-tone="ok">${iconSpark()}</span><div><strong>${esc(latest ? 'Votre dernier passage reste accessible' : 'Votre espace est prêt')}</strong><p>${esc(schedules.length ? `${schedules.length} publication${schedules.length > 1 ? 's' : ''} enregistrée${schedules.length > 1 ? 's' : ''}.` : 'Réservez un format quand vous êtes prêt à lancer le prochain passage.')}</p></div></div>`;
  }
}

function renderQuickSignals(orders, active) {
  const files = orders.flatMap((order) => order.files || []);
  const schedules = orders.flatMap((order) => order.schedules || []);
  const appointmentBadge = document.querySelector('#appointmentBadge');
  const videoBadge = document.querySelector('#videoBadge');
  const publicationBadge = document.querySelector('#publicationBadge');
  if (appointmentBadge) {
    if (!active) appointmentBadge.textContent = 'Aucun rendez-vous';
    else if (validDate(active.appointmentAt)) appointmentBadge.textContent = `Visio · ${formatCompactDate(new Date(active.appointmentAt))}`;
    else appointmentBadge.textContent = shouldAskForPreparation(active) ? 'À réserver' : 'Pas d’action';
  }
  if (videoBadge) videoBadge.textContent = files.length ? `${files.length} disponible${files.length > 1 ? 's' : ''}` : 'Aucun contenu livré';
  if (publicationBadge) publicationBadge.textContent = schedules.length ? `${schedules.length} planifiée${schedules.length > 1 ? 's' : ''}` : 'Aucune planification';
}

function renderFailure(error) {
  if (!root) return;
  root.classList.remove('is-loading');
  root.classList.add('is-error');
  const skeleton = document.querySelector('[data-cc-skeleton]');
  if (skeleton) skeleton.hidden = true;
  const content = document.querySelector('#ccContent');
  if (!content) return;
  content.hidden = false;
  content.innerHTML = `<section class="cc-load-error"><span>↻</span><div><small>SYNCHRONISATION INTERROMPUE</small><h2 id="ccTitle">Le suivi n’a pas pu être actualisé</h2><p>Vos données ne sont pas perdues. Relancez simplement la synchronisation.</p></div><button type="button" data-cc-retry>Réessayer</button></section>`;
  content.querySelector('[data-cc-retry]')?.addEventListener('click', () => refresh({ reason: 'retry' }));
  console.error('client_command_center_v117_failed', error);
}

function removeLegacyWorkflow() {
  document.querySelectorAll('#clientMinimalFlow,.client-minimal-flow').forEach((element) => element.remove());
}

function validDate(value) {
  return !Number.isNaN(new Date(value || '').getTime());
}

function formatCompactDate(value) {
  return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', timeZone: 'Europe/Paris' }).format(value);
}

function formatCompactDateTime(value) {
  return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' }).format(value).replace(' à ', ' · ');
}

function formatLongDateTime(value, includeTime = true) {
  return new Intl.DateTimeFormat('fr-FR', includeTime
    ? { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' }
    : { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Paris' }).format(value).replace(' à ', ' · ');
}

function orderTimestamp(order) {
  const value = new Date(order?.updatedAt || order?.filmingAt || order?.createdAt || 0);
  return Number.isNaN(value.getTime()) ? 0 : value.getTime();
}

function safeHref(value) {
  const text = String(value || '').trim();
  return /^(https?:\/\/|\/)/iu.test(text) ? text : '#';
}

function safeImage(value) {
  const text = String(value || '').trim();
  if (/^\/(?:assets|media)\//u.test(text)) return text;
  try {
    const url = new URL(text);
    return url.protocol === 'https:' ? url.toString() : '';
  } catch {
    return '';
  }
}

function shorten(value, limit) {
  const text = String(value || '').replace(/\s+/gu, ' ').trim();
  return text.length > limit ? `${text.slice(0, Math.max(0, limit - 1)).trimEnd()}…` : text;
}

function money(cents) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(Number(cents || 0) / 100);
}

function motionAllowed() {
  return !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/gu, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

function svg(paths, viewBox = '0 0 24 24') {
  return `<svg viewBox="${viewBox}" aria-hidden="true" focusable="false">${paths}</svg>`;
}
function iconClapper() { return svg('<path d="M4 8h16v11H4zM4 8l3-4h4L8 8m5 0 3-4h4l-3 4"/><path d="m10 12 5 3-5 3Z"/>'); }
function iconCard() { return svg('<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M3 10h18M7 15h4"/>'); }
function iconCalendar() { return svg('<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 3v4m8-4v4M4 10h16"/>'); }
function iconHeadset() { return svg('<path d="M4 14v-2a8 8 0 0 1 16 0v2M4 14h3v5H5a1 1 0 0 1-1-1Zm16 0h-3v5h2a1 1 0 0 0 1-1Z"/><path d="M17 19c-1 2-3 2-5 2"/>'); }
function iconCamera() { return svg('<rect x="3" y="6" width="14" height="12" rx="3"/><path d="m17 10 4-2v8l-4-2ZM8 6l1-2h4l1 2"/>'); }
function iconTransfer() { return svg('<path d="M4 8h12m-4-4 4 4-4 4M20 16H8m4 4-4-4 4-4"/>'); }
function iconEdit() { return svg('<path d="M4 19h4L19 8l-4-4L4 15zM13 6l4 4M4 19l5-1"/>'); }
function iconSpark() { return svg('<path d="m12 3 1.7 4.3L18 9l-4.3 1.7L12 15l-1.7-4.3L6 9l4.3-1.7ZM18 15l.8 2.2L21 18l-2.2.8L18 21l-.8-2.2L15 18l2.2-.8Z"/>'); }
