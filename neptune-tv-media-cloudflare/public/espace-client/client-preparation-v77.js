const RELEASE = 'neptune-client-preparation-20260805-v77';
const PREPARATION_BOOKING = 'https://calendar.app.google/nkYDeheuV8qjSMcRA';
const FINISHED = new Set(['filmed', 'videos_pending', 'videos_received', 'editing', 'approval', 'delivered', 'completed']);
const SERIES = [
  ['Conducteur d’épisode', 'Le déroulé complet de votre interview'],
  ['L’étincelle', 'Le point de départ de votre parcours'],
  ['Le déclic', 'Le moment où votre regard a changé'],
  ['Le miroir', 'Ce que votre expérience révèle aux autres'],
  ['Les pièges', 'Les erreurs et fausses pistes à éviter'],
  ['Le basculement', 'Le moment où tout devient concret'],
  ['Le chemin', 'Les étapes qui ont construit votre méthode'],
  ['Les preuves', 'Les résultats et signaux qui crédibilisent votre message'],
  ['Le message à retenir', 'L’idée essentielle que le public doit garder'],
  ['Contact et clôture', 'La manière simple de poursuivre la conversation'],
];

let refreshTimer = 0;
let currentState = null;
let activeCard = 0;

start();

function start() {
  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', boot, { once: true })
    : boot();
}

function boot() {
  document.body.dataset.clientPreparationRelease = RELEASE;
  ensureDialog();
  new MutationObserver(scheduleRefresh).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden'] });
  window.addEventListener('focus', () => refresh(true));
  scheduleRefresh();
}

function scheduleRefresh() {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => refresh(false), 180);
}

async function refresh(force = false) {
  const dashboard = document.querySelector('#dashboard');
  if (!dashboard || dashboard.hidden) {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => refresh(false), 900);
    return;
  }
  if (!force && currentState && document.querySelector('#clientPreparationActionV77')) {
    decorate(currentState);
    return;
  }
  try {
    const response = await fetch('/api/client/session', { headers: { Accept: 'application/json' }, credentials: 'same-origin', cache: 'no-store' });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.authenticated) return;
    currentState = data;
    decorate(data);
  } catch (error) {
    console.error('client_preparation_v77_failed', error);
  }
}

function decorate(data) {
  const order = currentOrder(data.orders || []);
  if (!order) return;
  const signature = clientSignature(order);
  if (document.body.dataset.clientPreparationSignature === signature) return;
  document.body.dataset.clientPreparationSignature = signature;
  renderPreparationAction(order);
  renderHorsNormeSeries(order);
}

function clientSignature(order) {
  return [
    order.id,
    order.status,
    order.format,
    order.appointmentAt,
    order.filmingAt,
    order.appointmentUrl,
    order.preparationUrl,
    order.bookingUrl,
    order.appointmentSource,
    order.workflow?.preparationStatus,
    order.workflow?.supplierStatus,
    [...seenCards()].sort((a, b) => a - b).join(','),
  ].join('|');
}

function currentOrder(orders) {
  return orders.find((order) => order.status !== 'completed') || orders[0] || null;
}

function renderPreparationAction(order) {
  const production = document.querySelector('.production-card');
  const anchor = production?.querySelector('.production-main');
  if (!production || !anchor) return;

  const appointmentAt = validDate(order.appointmentAt);
  const appointmentUrl = appointmentLink(order);
  const bookingUrl = safeUrl(order.bookingUrl) || PREPARATION_BOOKING;
  const filmingAt = validDate(order.filmingAt);
  const preparationDone = order.workflow?.preparationStatus === 'completed' || order.status === 'preparation_complete';
  const booked = Boolean(appointmentAt) && !preparationDone;

  let card = document.querySelector('#clientPreparationActionV77');
  if (!card) {
    card = document.createElement('section');
    card.id = 'clientPreparationActionV77';
    card.className = 'client-preparation-action-v77';
    anchor.after(card);
  }

  const actionUrl = booked && appointmentUrl ? appointmentUrl : bookingUrl;
  const actionLabel = preparationDone
    ? 'Préparation terminée'
    : booked
      ? appointmentUrl ? 'Ouvrir mon rendez-vous' : 'Retrouver ou modifier le rendez-vous'
      : 'Réserver ma préparation';
  const prepTitle = preparationDone
    ? 'Votre échange de préparation est terminé'
    : booked
      ? `Préparation réservée · ${formatDateTime(appointmentAt)}`
      : 'Votre rendez-vous de préparation est à réserver';
  const prepDetail = preparationDone
    ? 'Vous pouvez maintenant parcourir les cartes de préparation ci-dessous avant votre passage.'
    : booked
      ? `${order.appointmentSource === 'google_calendar' ? 'Synchronisé depuis Google Agenda. ' : ''}${appointmentUrl ? 'Le lien du rendez-vous est prêt.' : 'Le lien visio sera ajouté automatiquement dès sa réception.'}`
      : 'Un échange de 15 à 30 minutes suffit. Choisissez votre créneau en un clic.';
  const studioTitle = filmingAt ? `Passage confirmé · ${formatDateTime(filmingAt)}` : 'Date du passage en validation';
  const studioDetail = filmingAt
    ? 'Le studio a confirmé le créneau. Les rappels sont automatiques.'
    : 'La préparation peut être réservée sans attendre la confirmation définitive du studio.';

  card.innerHTML = `
    <div class="client-preparation-action-copy">
      <span>PROCHAINE ACTION</span>
      <strong>${escapeHtml(prepTitle)}</strong>
      <p>${escapeHtml(prepDetail)}</p>
    </div>
    <div class="client-preparation-action-status">
      <span>${filmingAt ? 'PASSAGE STUDIO' : 'VALIDATION STUDIO'}</span>
      <strong>${escapeHtml(studioTitle)}</strong>
      <p>${escapeHtml(studioDetail)}</p>
    </div>
    ${preparationDone
      ? '<span class="client-preparation-complete">✓ Terminé</span>'
      : `<a href="${escapeHtml(actionUrl)}" target="_blank" rel="noopener">${escapeHtml(actionLabel)} <i aria-hidden="true">→</i></a>`}
  `;

  const primary = document.querySelector('#prepareLink');
  if (primary && !FINISHED.has(order.status) && !preparationDone) {
    primary.textContent = actionLabel;
    primary.href = actionUrl;
    primary.target = '_blank';
    primary.rel = 'noopener';
    primary.onclick = null;
  }
}

function renderHorsNormeSeries(order) {
  const existing = document.querySelector('#horsNormePreparationV77');
  if (!/hors\s*norme/iu.test(String(order.format || ''))) {
    existing?.remove();
    return;
  }
  const dashboard = document.querySelector('.dashboard-canvas');
  const anchor = document.querySelector('.metrics-section');
  if (!dashboard || !anchor) return;
  let section = existing;
  if (!section) {
    section = document.createElement('section');
    section.id = 'horsNormePreparationV77';
    section.className = 'hors-norme-preparation-v77';
    anchor.after(section);
  }
  const seen = seenCards();
  section.innerHTML = `
    <header>
      <div>
        <p class="section-label">PRÉPARER HORS NORME</p>
        <h2>Votre conducteur, expliqué carte par carte</h2>
        <p>Parcourez les étapes avant votre rendez-vous. Aucun texte n’est à apprendre : ces cartes servent à faire émerger vos meilleures histoires.</p>
      </div>
      <span class="hors-norme-progress-v77"><b>${seen.size}</b> / ${SERIES.length} consultées</span>
    </header>
    <div class="hors-norme-series-v77" role="list">
      ${SERIES.map(([title, description], index) => `
        <button type="button" role="listitem" data-preparation-card="${index}" class="${seen.has(index) ? 'is-seen' : ''}">
          <span class="hors-norme-card-image-v77"><img src="/espace-client/preparation-hors-norme/hors-norme-card-${String(index + 1).padStart(2, '0')}.webp" alt="" loading="lazy"><i>${seen.has(index) ? '✓' : String(index + 1).padStart(2, '0')}</i></span>
          <span class="hors-norme-card-copy-v77"><strong>${escapeHtml(title)}</strong><small>${escapeHtml(description)}</small></span>
        </button>`).join('')}
    </div>
  `;
  section.querySelectorAll('[data-preparation-card]').forEach((button) => button.addEventListener('click', () => openCard(Number(button.dataset.preparationCard))));
}

function ensureDialog() {
  if (document.querySelector('#horsNormeCardDialogV77')) return;
  const dialog = document.createElement('dialog');
  dialog.id = 'horsNormeCardDialogV77';
  dialog.className = 'hors-norme-card-dialog-v77';
  dialog.innerHTML = `
    <section>
      <header><div><span data-card-counter></span><h2 data-card-title></h2></div><button type="button" data-card-close aria-label="Fermer">×</button></header>
      <img data-card-image alt="">
      <footer><button type="button" data-card-prev>← Précédente</button><button type="button" data-card-next>Suivante →</button></footer>
    </section>`;
  document.body.append(dialog);
  dialog.querySelector('[data-card-close]').addEventListener('click', () => dialog.close());
  dialog.querySelector('[data-card-prev]').addEventListener('click', () => openCard((activeCard + SERIES.length - 1) % SERIES.length));
  dialog.querySelector('[data-card-next]').addEventListener('click', () => openCard((activeCard + 1) % SERIES.length));
  dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
  dialog.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowLeft') openCard((activeCard + SERIES.length - 1) % SERIES.length);
    if (event.key === 'ArrowRight') openCard((activeCard + 1) % SERIES.length);
  });
}

function openCard(index) {
  activeCard = Math.max(0, Math.min(SERIES.length - 1, index));
  const dialog = document.querySelector('#horsNormeCardDialogV77');
  if (!dialog) return;
  const [title] = SERIES[activeCard];
  dialog.querySelector('[data-card-counter]').textContent = `CARTE ${activeCard + 1} SUR ${SERIES.length}`;
  dialog.querySelector('[data-card-title]').textContent = title;
  dialog.querySelector('[data-card-image]').src = `/espace-client/preparation-hors-norme/hors-norme-card-${String(activeCard + 1).padStart(2, '0')}.webp`;
  const seen = seenCards();
  seen.add(activeCard);
  localStorage.setItem('neptune_hors_norme_preparation_seen_v77', JSON.stringify([...seen]));
  document.body.dataset.clientPreparationSignature = '';
  if (!dialog.open) dialog.showModal();
  if (currentState) decorate(currentState);
}

function seenCards() {
  try {
    return new Set(JSON.parse(localStorage.getItem('neptune_hors_norme_preparation_seen_v77') || '[]').map(Number).filter(Number.isInteger));
  } catch {
    return new Set();
  }
}

function appointmentLink(order) {
  const candidates = [order.appointmentUrl, order.workflow?.appointmentUrl, order.preparationUrl];
  return candidates.map(safeUrl).find(Boolean) || '';
}

function safeUrl(value) {
  try {
    const url = new URL(String(value || ''), location.origin);
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : '';
  } catch {
    return '';
  }
}

function validDate(value) {
  const date = new Date(value || '');
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDateTime(value) {
  const date = value instanceof Date ? value : new Date(value || '');
  return Number.isNaN(date.getTime()) ? 'À confirmer' : new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Europe/Paris' }).format(date);
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/gu, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}
