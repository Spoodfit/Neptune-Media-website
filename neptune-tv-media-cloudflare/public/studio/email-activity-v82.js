const qs = (selector, root = document) => root.querySelector(selector);
const qsa = (selector, root = document) => [...root.querySelectorAll(selector)];

const RECIPIENT_LABELS = {
  client: 'Client',
  admin: 'Neptune / organisateur',
  supplier: 'Studio fournisseur',
};
const STATUS_LABELS = {
  queued: 'En attente',
  sent: 'Envoyé',
  delivered: 'Distribué',
  opened: 'Ouvert · lecture détectée',
  clicked: 'Ouvert et cliqué',
  delayed: 'Retardé',
  failed: 'Échec',
  bounced: 'Rejeté',
  complained: 'Signalé comme indésirable',
  suppressed: 'Bloqué par le fournisseur',
};

let emailActive = false;
let activeOrderId = '';
let historyState = { items: [], summary: {}, tracking: {} };
let refreshTimer = 0;
let scheduled = 0;
const animatedEmailIds = new Set();
const animationQueue = [];
let animationRunning = false;

boot();

function boot() {
  document.body.classList.add('studio-email-activity-v82');
  patchFetch();
  document.addEventListener('click', onGlobalClick, true);
  window.addEventListener('hashchange', () => {
    emailActive = false;
    activeOrderId = currentOrderId();
    stopAutoRefresh();
    scheduleInstall();
  });
  new MutationObserver(scheduleInstall).observe(document.body, { childList: true, subtree: true });
  scheduleInstall();
}

function scheduleInstall() {
  if (scheduled) return;
  scheduled = requestAnimationFrame(() => {
    scheduled = 0;
    installEmailTab();
    if (emailActive) maintainEmailView();
  });
}

function installEmailTab() {
  const root = qs('#clientDetail');
  const tabs = qs('.tabs', root);
  if (!tabs || !currentOrderId() || qs('[data-email-tab-v82]', tabs)) return;
  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.emailTabV82 = 'true';
  button.dataset.detailTab = 'email-v82';
  button.innerHTML = '<span aria-hidden="true">✉</span> E-mails';
  const passage = qs('[data-passage-tab-v80]', tabs);
  passage ? passage.after(button) : tabs.append(button);
}

async function onGlobalClick(event) {
  const emailTab = event.target.closest('[data-email-tab-v82]');
  if (emailTab) {
    event.preventDefault();
    event.stopImmediatePropagation();
    await openEmailHistory(true);
    return;
  }

  const regularTab = event.target.closest('[data-detail-tab]');
  if (regularTab && !regularTab.dataset.emailTabV82) {
    emailActive = false;
    stopAutoRefresh();
    return;
  }

  const refresh = event.target.closest('[data-email-refresh-v82]');
  if (refresh) {
    event.preventDefault();
    await loadEmailHistory(true);
    return;
  }

  if (event.target.closest('[data-email-back-passage-v82]')) {
    event.preventDefault();
    emailActive = false;
    stopAutoRefresh();
    qs('[data-passage-tab-v80]')?.click();
    return;
  }
}

async function openEmailHistory(refreshProvider = true) {
  const orderId = currentOrderId();
  if (!orderId) return;
  emailActive = true;
  activeOrderId = orderId;
  setEmailTabActive();
  renderLoading();
  await loadEmailHistory(refreshProvider);
  startAutoRefresh();
}

function maintainEmailView() {
  const orderId = currentOrderId();
  if (!orderId || activeOrderId !== orderId) return;
  setEmailTabActive();
  const body = qs('#detailBody');
  if (body && body.dataset.emailActivityV82 !== orderId) renderHistory();
}

function setEmailTabActive() {
  const tabs = qs('#clientDetail .tabs');
  if (!tabs) return;
  qsa('button', tabs).forEach((button) => button.classList.toggle('active', Boolean(button.dataset.emailTabV82)));
}

function renderLoading() {
  const body = qs('#detailBody');
  if (!body) return;
  body.className = 'email-v82-body';
  body.dataset.emailActivityV82 = activeOrderId;
  body.innerHTML = '<section class="email-v82-shell"><div class="email-v82-loading">Chargement de l’historique des e-mails…</div></section>';
}

async function loadEmailHistory(refreshProvider = false) {
  const orderId = currentOrderId();
  if (!emailActive || !orderId) return;
  const refreshButton = qs('[data-email-refresh-v82]');
  if (refreshButton) refreshButton.disabled = true;
  try {
    const query = new URLSearchParams({ orderId, limit: '150', refresh: refreshProvider ? '1' : '0' });
    historyState = await api(`/api/admin/email-history?${query}`);
    renderHistory();
  } catch (error) {
    const body = qs('#detailBody');
    if (body) {
      body.className = 'email-v82-body';
      body.innerHTML = `<section class="email-v82-shell"><div class="email-v82-error">${escapeHtml(errorLabel(error.message))}</div></section>`;
    }
  } finally {
    if (refreshButton) refreshButton.disabled = false;
  }
}

function renderHistory() {
  if (!emailActive || activeOrderId !== currentOrderId()) return;
  const body = qs('#detailBody');
  if (!body) return;
  body.className = 'email-v82-body';
  body.dataset.emailActivityV82 = activeOrderId;
  body.innerHTML = `
    <section class="email-v82-shell">
      <header class="email-v82-header">
        <div>
          <p class="eyebrow">COMMUNICATIONS DU PASSAGE</p>
          <h3>Historique des e-mails</h3>
          <p>Visualisez les destinataires, le contenu communiqué et les signaux techniques d’envoi, de distribution, d’ouverture et de clic.</p>
        </div>
        <div class="email-v82-header-actions">
          <button type="button" data-email-back-passage-v82>Retour au passage</button>
          <button type="button" class="primary" data-email-refresh-v82>Actualiser les statuts</button>
        </div>
      </header>
      ${metricsMarkup(historyState.summary || {})}
      <div class="email-v82-toolbar">
        <input type="search" data-email-search-v82 aria-label="Rechercher dans les e-mails" placeholder="Rechercher un destinataire, un objet…">
        <select data-email-recipient-filter-v82 aria-label="Filtrer par destinataire">
          <option value="all">Tous les destinataires</option>
          <option value="client">Client</option>
          <option value="admin">Neptune / organisateur</option>
          <option value="supplier">Studio fournisseur</option>
        </select>
        <select data-email-status-filter-v82 aria-label="Filtrer par statut">
          <option value="all">Tous les statuts</option>
          <option value="sent">Envoyés</option>
          <option value="delivered">Distribués</option>
          <option value="opened">Ouverts</option>
          <option value="clicked">Cliqués</option>
          <option value="failed">En échec</option>
        </select>
      </div>
      <p class="email-v82-note">Le statut « Ouvert » est un signal fourni par le pixel de suivi du prestataire. Il indique qu’une ouverture a été détectée, mais ne constitue pas une preuve absolue de lecture humaine. Un clic est un signal d’engagement plus fort.</p>
      <div class="email-v82-list" data-email-list-v82></div>
    </section>`;

  const search = qs('[data-email-search-v82]', body);
  const recipient = qs('[data-email-recipient-filter-v82]', body);
  const status = qs('[data-email-status-filter-v82]', body);
  [search, recipient, status].forEach((control) => control?.addEventListener('input', renderFilteredItems));
  [recipient, status].forEach((control) => control?.addEventListener('change', renderFilteredItems));
  renderFilteredItems();
}

function metricsMarkup(summary) {
  const metrics = [
    ['Envoyés', summary.sent || 0],
    ['Distribués', summary.delivered || 0],
    ['Ouverts', summary.opened || 0],
    ['Cliqués', summary.clicked || 0],
    ['Échecs', summary.failed || 0],
  ];
  return `<div class="email-v82-metrics">${metrics.map(([label, value]) => `<div class="email-v82-metric"><span>${label}</span><strong>${Number(value)}</strong></div>`).join('')}</div>`;
}

function renderFilteredItems() {
  const list = qs('[data-email-list-v82]');
  if (!list) return;
  const search = normalize(qs('[data-email-search-v82]')?.value).toLowerCase();
  const recipient = qs('[data-email-recipient-filter-v82]')?.value || 'all';
  const status = qs('[data-email-status-filter-v82]')?.value || 'all';
  const items = (historyState.items || []).filter((item) => {
    if (recipient !== 'all' && item.recipientType !== recipient) return false;
    if (status === 'failed' && !['failed', 'bounced', 'complained', 'suppressed'].includes(item.status)) return false;
    if (status !== 'all' && status !== 'failed') {
      if (status === 'sent' && !item.sentAt) return false;
      if (status === 'delivered' && !(item.deliveredAt || ['delivered', 'opened', 'clicked'].includes(item.status))) return false;
      if (status === 'opened' && !(item.openedAt || ['opened', 'clicked'].includes(item.status))) return false;
      if (status === 'clicked' && !(item.clickedAt || item.status === 'clicked')) return false;
    }
    if (!search) return true;
    return [item.subject, item.toEmail, item.messageKey, item.clientName, item.passageTitle]
      .some((value) => normalize(value).toLowerCase().includes(search));
  });

  list.innerHTML = items.length
    ? items.map(emailCard).join('')
    : '<div class="email-v82-empty">Aucun e-mail ne correspond aux filtres sélectionnés.</div>';
}

function emailCard(item) {
  const changes = Array.isArray(item.payload?.changes) ? item.payload.changes : [];
  const eventReference = item.lastEventAt || item.sentAt || item.createdAt;
  return `
    <details class="email-v82-card">
      <summary class="email-v82-card-summary">
        <div><h4>${escapeHtml(item.subject || 'Notification Neptune Media')}</h4><p>${escapeHtml(dateTime(eventReference))} · ${escapeHtml(item.messageKey || 'notification')}</p></div>
        <div class="email-v82-recipient"><strong>${escapeHtml(item.toEmail || 'Destinataire inconnu')}</strong><span>${escapeHtml(RECIPIENT_LABELS[item.recipientType] || item.recipientType || 'Destinataire')}</span></div>
        <span class="email-v82-status is-${escapeHtml(item.status)}">${escapeHtml(STATUS_LABELS[item.status] || item.status)}</span>
      </summary>
      <div class="email-v82-details">
        ${timelineMarkup(item)}
        <div class="email-v82-detail-grid">
          ${detailItem('Destinataire', item.toEmail || 'Non renseigné')}
          ${detailItem('Type', RECIPIENT_LABELS[item.recipientType] || item.recipientType || 'Non renseigné')}
          ${detailItem('Identifiant Resend', item.emailId || 'Non disponible')}
          ${detailItem('Tentatives / signaux', `${Number(item.openCount || 0)} ouverture(s) · ${Number(item.clickCount || 0)} clic(s)`)}
          ${item.lastClickUrl ? detailLink('Dernier lien cliqué', item.lastClickUrl) : ''}
          ${item.lastError ? detailItem('Dernière erreur', item.lastError) : ''}
        </div>
        ${changes.length ? `<div class="email-v82-changes">${changes.map(changeMarkup).join('')}</div>` : ''}
      </div>
    </details>`;
}

function timelineMarkup(item) {
  const steps = [
    ['Envoyé', item.sentAt],
    ['Distribué', item.deliveredAt],
    ['Ouvert', item.openedAt],
    ['Cliqué', item.clickedAt],
  ];
  if (['failed', 'bounced', 'complained', 'suppressed'].includes(item.status)) {
    steps.push(['Incident', item.failedAt || item.bouncedAt || item.complainedAt || item.suppressedAt || item.lastEventAt]);
  }
  return `<div class="email-v82-timeline">${steps.map(([label, value]) => `<div class="email-v82-event ${value ? 'is-done' : ''}"><b>${label}</b><span>${value ? escapeHtml(dateTime(value)) : 'Non détecté'}</span></div>`).join('')}</div>`;
}

function detailItem(label, value) {
  return `<div class="email-v82-detail-item"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
}

function detailLink(label, value) {
  return `<div class="email-v82-detail-item"><span>${escapeHtml(label)}</span><a href="${escapeHtml(value)}" target="_blank" rel="noopener noreferrer">${escapeHtml(value)}</a></div>`;
}

function changeMarkup(change) {
  return `<div class="email-v82-change"><small>${escapeHtml(change.label || change.field || 'Information')}</small><span>${escapeHtml(change.before || 'Non renseigné')}</span><span aria-hidden="true">→</span><strong>${escapeHtml(change.after || 'Non renseigné')}</strong></div>`;
}

function patchFetch() {
  if (window.__neptuneEmailActivityFetchV82) return;
  window.__neptuneEmailActivityFetchV82 = true;
  const nativeFetch = window.fetch.bind(window);
  window.fetch = async (...args) => {
    const input = args[0];
    const options = args[1] || {};
    const url = typeof input === 'string' ? input : input?.url || '';
    const method = String(options.method || (typeof input !== 'string' ? input?.method : '') || 'GET').toUpperCase();
    const startedAt = Date.now();
    const response = await nativeFetch(...args);

    if (method === 'POST' && String(url).includes('/api/admin/')) {
      response.clone().json().then((result) => {
        const delivery = result?.emailDelivery;
        if (delivery?.sent > 0) {
          enqueueSendAnimation(delivery);
          delivery.sentItems?.forEach((item) => item.emailId && animatedEmailIds.add(item.emailId));
          if (emailActive) setTimeout(() => loadEmailHistory(false), 500);
          return;
        }
        if (delivery?.failed > 0) {
          enqueueSendAnimation(delivery);
          return;
        }
        if (response.ok) setTimeout(() => detectUnreportedSends(startedAt), 900);
      }).catch(() => {});
    }
    return response;
  };
}

async function detectUnreportedSends(startedAt) {
  const orderId = currentOrderId();
  if (!orderId) return;
  try {
    const query = new URLSearchParams({ orderId, limit: '25', refresh: '0' });
    const result = await api(`/api/admin/email-history?${query}`);
    const recent = (result.items || []).filter((item) => {
      const sentAt = new Date(item.sentAt || 0).getTime();
      return item.emailId && sentAt >= startedAt - 1500 && !animatedEmailIds.has(item.emailId);
    });
    if (!recent.length) return;
    recent.forEach((item) => animatedEmailIds.add(item.emailId));
    enqueueSendAnimation({ sent: recent.length, failed: 0, sentItems: recent });
    if (emailActive) {
      historyState = result;
      renderHistory();
    }
  } catch {}
}

function enqueueSendAnimation(delivery) {
  animationQueue.push(delivery);
  if (!animationRunning) runNextAnimation();
}

function runNextAnimation() {
  const delivery = animationQueue.shift();
  if (!delivery) {
    animationRunning = false;
    return;
  }
  animationRunning = true;
  const failed = Number(delivery.failed || 0);
  const sent = Number(delivery.sent || 0);
  const recipients = [...new Set((delivery.sentItems || []).map((item) => RECIPIENT_LABELS[item.recipientType] || item.toEmail).filter(Boolean))];
  const toast = document.createElement('aside');
  toast.className = 'email-send-toast-v82';
  toast.dataset.state = failed ? 'failed' : 'sending';
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  toast.innerHTML = `
    <div class="email-send-visual-v82"><div class="email-send-envelope-v82" aria-hidden="true"></div></div>
    <div class="email-send-copy-v82"><strong>${failed ? 'Envoi incomplet' : 'Envoi des e-mails confirmé'}</strong><p>${failed ? `${failed} notification(s) seront réessayées automatiquement.` : `${sent} e-mail(s) transmis au prestataire.`}</p>${recipients.length ? `<div class="email-send-recipients-v82">${recipients.map((label) => `<span>${escapeHtml(label)}</span>`).join('')}</div>` : ''}</div>`;
  document.body.append(toast);
  requestAnimationFrame(() => toast.classList.add('is-visible', failed ? '' : 'is-flying'));
  if (!failed) setTimeout(() => toast.classList.add('is-success'), 950);
  setTimeout(() => {
    toast.classList.remove('is-visible');
    setTimeout(() => {
      toast.remove();
      runNextAnimation();
    }, 260);
  }, failed ? 3300 : 3000);
}

function startAutoRefresh() {
  stopAutoRefresh();
  const webhook = Boolean(historyState.tracking?.webhookConfigured);
  const interval = webhook ? 30_000 : 60_000;
  refreshTimer = window.setInterval(() => {
    if (emailActive && document.visibilityState === 'visible') loadEmailHistory(!webhook);
  }, interval);
}

function stopAutoRefresh() {
  if (refreshTimer) window.clearInterval(refreshTimer);
  refreshTimer = 0;
}

async function api(url, options = {}) {
  const headers = { Accept: 'application/json', ...(options.headers || {}) };
  if (options.body) headers['Content-Type'] = 'application/json';
  headers['X-CSRF-Token'] = sessionStorage.getItem('neptune_csrf') || '';
  const response = await fetch(url, { ...options, headers, credentials: 'same-origin' });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(result.error || `http_${response.status}`);
    error.data = result;
    throw error;
  }
  return result;
}

function currentOrderId() {
  try { return decodeURIComponent(location.hash.slice(1) || ''); } catch { return ''; }
}

function dateTime(value) {
  const date = new Date(value || '');
  if (Number.isNaN(date.getTime())) return 'Date inconnue';
  return new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Europe/Paris',
  }).format(date);
}

function normalize(value) {
  return String(value ?? '').trim();
}

function errorLabel(code) {
  return ({
    unauthorized: 'La session Studio a expiré. Reconnectez-vous.',
    csrf_failed: 'La session a expiré. Rechargez la page.',
    email_activity_failed: 'L’historique des e-mails n’a pas pu être chargé.',
  })[code] || 'L’historique des e-mails n’a pas pu être chargé.';
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/gu, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character]);
}
