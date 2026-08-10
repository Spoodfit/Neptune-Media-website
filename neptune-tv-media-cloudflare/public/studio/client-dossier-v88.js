const RELEASE = 'neptune-studio-client-dossier-20260810-v88';
const $ = (selector, root = document) => root?.querySelector(selector) || null;
let state = { orders: [] };
let loading = false;
let frame = 0;

start();

function start() {
  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', boot, { once: true })
    : boot();
}

function boot() {
  document.body.dataset.clientDossierRelease = RELEASE;
  new MutationObserver(schedule).observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'open'],
  });
  window.addEventListener('hashchange', () => {
    loadState();
    schedule();
  });
  window.addEventListener('focus', loadState);
  $('#refresh')?.addEventListener('click', () => setTimeout(loadState, 220));
  loadState();
}

async function loadState() {
  if (loading) return;
  loading = true;
  try {
    const response = await fetch('/api/admin/clients', {
      credentials: 'same-origin',
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        'X-CSRF-Token': sessionStorage.getItem('neptune_csrf') || '',
      },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `http_${response.status}`);
    state = data;
    schedule();
  } catch (error) {
    console.error('client_dossier_v88_state_failed', error);
  } finally {
    loading = false;
  }
}

function schedule() {
  if (frame) return;
  frame = requestAnimationFrame(() => {
    frame = 0;
    enhance();
  });
}

function enhance() {
  const dialog = $('#clientDialog');
  const root = $('#clientDetail');
  if (!dialog?.open || !root?.children.length) return;

  const order = currentOrder();
  if (!order) return;
  dialog.classList.add('client-dossier-v88-dialog');
  root.classList.add('client-dossier-v88');
  compactHeader(root);

  const trackingActive = Boolean($('.tabs [data-detail-tab="tracking"].active', root));
  root.classList.toggle('client-dossier-v88--tracking', trackingActive);
  const preparationStrip = $('.studio-preparation-v77', root);
  if (preparationStrip) preparationStrip.hidden = trackingActive;
  if (!trackingActive) return;

  const panel = $('#workflowCommandCenter', root);
  if (!panel || !order.workflow) return;
  enhanceCommandCenter(panel, order);
}

function currentOrder() {
  const orderId = decodeURIComponent(location.hash.slice(1));
  return (state.orders || []).find((item) => item.id === orderId) || null;
}

function compactHeader(root) {
  const title = $('.detail-title', root);
  if (!title) return;
  const eyebrow = $('.eyebrow', title);
  if (eyebrow) eyebrow.textContent = 'DOSSIER CLIENT';
  const close = $('.close', title);
  if (close) close.setAttribute('aria-label', 'Fermer le dossier client');
}

function enhanceCommandCenter(panel, order) {
  const w = order.workflow || {};
  const inventory = w.inventory || {};
  const signature = [
    order.id,
    order.updatedAt,
    order.status,
    order.appointmentAt,
    order.filmingAt,
    w.updatedAt,
    w.preparationStatus,
    w.preparationCompletedAt,
    w.sourceReceivedAt,
    w.editingStartedAt,
    w.deliveredAt,
    w.broadcastStatus,
    inventory.finalCount,
    inventory.shortCount,
    inventory.hasFinal,
    inventory.hasShort,
  ].join('|');
  if (panel.dataset.dossierV88 === signature) return;
  panel.dataset.dossierV88 = signature;

  const chronology = chronologyState(order);
  renderChronologyAlert(panel, chronology);
  renderHeader(panel, order, inventory);
  renderEssentials(panel, order, chronology, inventory);
  renderProgress(panel, order);
  renderActionState(panel, order, inventory);
  bindLocalActions(panel);
}

function renderHeader(panel, order, inventory) {
  const w = order.workflow || {};
  const eyebrow = $('header .eyebrow', panel);
  const description = $('header p:last-child', panel);
  if (eyebrow) eyebrow.textContent = 'ÉTAPE EN COURS';
  if (!description) return;

  const deliveryCandidate = ['editing', 'approval', 'videos_received'].includes(order.status) && !w.deliveredAt;
  if (deliveryCandidate && !(inventory.hasFinal && inventory.hasShort)) {
    description.textContent = `Le montage reste en cours. La livraison se débloque lorsque ${missingAssets(inventory)} ${missingAssets(inventory).includes(' et ') ? 'sont disponibles' : 'est disponible'} dans les contenus.`;
  }
}

function renderChronologyAlert(panel, chronology) {
  panel.querySelector('.dossier-v88-alert')?.remove();
  if (!chronology.invalid) return;
  const alert = document.createElement('section');
  alert.className = 'dossier-v88-alert';
  alert.innerHTML = `
    <i aria-hidden="true">!</i>
    <div><strong>${escapeHtml(chronology.title)}</strong><small>${escapeHtml(chronology.detail)}</small></div>
    <button type="button" data-dossier-fix-dates>Corriger les dates</button>`;
  const header = $('header', panel);
  header?.after(alert);
}

function renderEssentials(panel, order, chronology, inventory) {
  const w = order.workflow || {};
  const host = $('.workflow-essential', panel);
  if (!host) return;

  const filming = validDate(order.filmingAt);
  const appointment = validDate(order.appointmentAt);
  const prepComplete = w.preparationStatus === 'completed' && !chronology.invalid;
  const prepCompletedAt = validDate(w.preparationCompletedAt);
  const passageDone = isFilmed(order);
  const inventoryReady = Boolean(inventory.hasFinal && inventory.hasShort);
  const finalCount = number(inventory.finalCount);
  const shortCount = number(inventory.shortCount);

  const filmingValue = filming ? formatDateTime(filming) : 'À confirmer';
  const filmingDetail = passageDone ? 'Passage réalisé' : filming ? 'Créneau confirmé' : 'Date définitive manquante';
  const prepValue = chronology.invalid
    ? 'Dates à corriger'
    : prepComplete
      ? 'Terminée'
      : appointment
        ? formatDateTime(appointment)
        : 'À réserver';
  const prepDetail = chronology.invalid
    ? chronology.shortDetail
    : prepComplete
      ? prepCompletedAt ? `Réalisée ${relativeDateLabel(prepCompletedAt)}` : 'Aucune action requise'
      : appointment
        ? order.appointmentSource === 'google_calendar' ? 'Synchronisée avec Google Agenda' : 'Rendez-vous planifié'
        : 'Préparation non planifiée';
  const inventoryValue = `${finalCount} long · ${shortCount} court${shortCount > 1 ? 's' : ''}`;
  const inventoryDetail = inventoryReady ? 'Prêt pour la livraison' : `Manque ${missingAssets(inventory)}`;

  host.innerHTML = `
    ${factCard('Passage studio', filmingValue, filmingDetail, filming ? 'ready' : 'warning')}
    ${factCard('Préparation', prepValue, prepDetail, chronology.invalid ? 'warning' : prepComplete ? 'ready' : '')}
    ${factCard('Livrables', inventoryValue, inventoryDetail, inventoryReady ? 'ready' : '')}`;
}

function renderProgress(panel, order) {
  let progress = $('.dossier-v88-progress', panel);
  if (!progress) {
    progress = document.createElement('div');
    progress.className = 'dossier-v88-progress';
    $('.workflow-essential', panel)?.after(progress);
  }

  const w = order.workflow || {};
  const filmed = isFilmed(order);
  const steps = [
    ['Préparation', w.preparationStatus === 'completed'],
    ['Passage', filmed],
    ['Sources', Boolean(w.sourceReceivedAt)],
    ['Montage', Boolean(w.editingStartedAt)],
    ['Livraison', Boolean(w.deliveredAt)],
  ];
  const firstPending = steps.findIndex(([, done]) => !done);
  progress.innerHTML = steps.map(([label, done], index) => {
    const stateClass = done ? 'is-done' : index === firstPending ? 'is-current' : 'is-pending';
    return `<div class="dossier-v88-progress__step ${stateClass}"><i>${done ? '✓' : index + 1}</i><span>${escapeHtml(label)}</span></div>`;
  }).join('');
}

function renderActionState(panel, order, inventory) {
  const actionBox = $('.workflow-actions>div', panel);
  if (!actionBox) return;
  const label = $(':scope>small', actionBox);
  if (label) label.textContent = 'PROCHAINE ACTION';

  actionBox.querySelector('.dossier-v88-delivery-gate')?.remove();
  const deliveryButton = $('[data-workflow-action="delivery_complete"]', actionBox);
  if (!deliveryButton) return;

  const ready = Boolean(inventory.hasFinal && inventory.hasShort);
  if (ready) {
    deliveryButton.hidden = false;
    deliveryButton.textContent = 'Confirmer la livraison au client';
    if (label) label.textContent = 'PRÊT À LIVRER';
    return;
  }

  deliveryButton.hidden = true;
  const gate = document.createElement('section');
  gate.className = 'dossier-v88-delivery-gate';
  gate.innerHTML = `
    <div><strong>Livraison pas encore prête</strong><span>${escapeHtml(deliveryGateText(inventory))}</span></div>
    <button type="button" data-dossier-open-content>Voir les contenus</button>`;
  actionBox.insertBefore(gate, actionBox.querySelector('[data-inline-confirm]'));
}

function bindLocalActions(panel) {
  $('[data-dossier-fix-dates]', panel)?.addEventListener('click', () => {
    $('[data-edit-passage-v80]')?.click();
  }, { once: true });

  $('[data-dossier-open-content]', panel)?.addEventListener('click', () => {
    const contentTab = $('#clientDetail .tabs [data-detail-tab="content"]');
    contentTab?.click();
  }, { once: true });
}

function chronologyState(order) {
  const appointment = validDate(order.appointmentAt);
  const filming = validDate(order.filmingAt);
  const w = order.workflow || {};
  const prepComplete = w.preparationStatus === 'completed';
  const now = Date.now();

  if (appointment && filming && appointment.getTime() > filming.getTime()) {
    return {
      invalid: true,
      title: 'Dates incohérentes dans le dossier',
      detail: `La préparation est fixée au ${formatDateTime(appointment)}, après le passage studio du ${formatDateTime(filming)}. Corrigez la date de préparation ou celle du passage avant de poursuivre.`,
      shortDetail: 'Préparation placée après le passage',
    };
  }
  if (prepComplete && appointment && appointment.getTime() > now + 5 * 60 * 1000) {
    return {
      invalid: true,
      title: 'Statut de préparation incohérent',
      detail: `La préparation est marquée terminée alors que le rendez-vous est encore planifié au ${formatDateTime(appointment)}. Vérifiez le rendez-vous avant de considérer la préparation comme réalisée.`,
      shortDetail: 'Rendez-vous futur mais statut terminé',
    };
  }
  return { invalid: false, title: '', detail: '', shortDetail: '' };
}

function isFilmed(order) {
  return ['videos_pending', 'videos_received', 'editing', 'approval', 'delivered', 'completed'].includes(order.status)
    || Boolean(order.workflow?.sourceReceivedAt)
    || Boolean(order.workflow?.editingStartedAt)
    || Boolean(order.workflow?.deliveredAt);
}

function deliveryGateText(inventory) {
  const finalCount = number(inventory.finalCount);
  const shortCount = number(inventory.shortCount);
  const missing = missingAssets(inventory);
  return `${finalCount} émission finale · ${shortCount} contenu${shortCount > 1 ? 's' : ''} court${shortCount > 1 ? 's' : ''}. Il manque ${missing} avant de pouvoir confirmer la livraison.`;
}

function missingAssets(inventory) {
  const missing = [];
  if (!inventory.hasFinal) missing.push('l’émission finale');
  if (!inventory.hasShort) missing.push('au moins un contenu court');
  return missing.join(' et ') || 'aucun livrable';
}

function factCard(label, value, detail, tone = '') {
  return `<article ${tone ? `data-tone="${tone}"` : ''}><small>${escapeHtml(label)}</small><strong>${escapeHtml(value)}</strong><span>${escapeHtml(detail)}</span></article>`;
}

function validDate(value) {
  const date = new Date(value || '');
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDateTime(value) {
  const date = value instanceof Date ? value : new Date(value || '');
  if (Number.isNaN(date.getTime())) return 'À définir';
  return new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Paris',
  }).format(date).replace(' à ', ' · ');
}

function relativeDateLabel(value) {
  const date = value instanceof Date ? value : new Date(value || '');
  if (Number.isNaN(date.getTime())) return '';
  return `le ${new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/Paris' }).format(date)}`;
}

function number(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/gu, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}
