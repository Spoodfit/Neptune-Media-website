const qs = (selector, root = document) => root.querySelector(selector);
const qsa = (selector, root = document) => [...root.querySelectorAll(selector)];

const STATUS_LABELS = {
  payment_confirmed: 'Paiement reçu',
  reservation_confirmed: 'Rendez-vous à réserver',
  preparation_booking_pending: 'Rendez-vous à réserver',
  appointment_confirmed: 'Préparation réservée',
  appointment_booked: 'Préparation réservée',
  preparation: 'Préparation en cours',
  studio_date_confirmation_pending: 'Date à confirmer',
  preparation_complete: 'Préparation terminée',
  filming_scheduled: 'Passage confirmé',
  filming_confirmed: 'Passage confirmé',
  filmed: 'Passage réalisé',
  videos_pending: 'Vidéos attendues',
  videos_received: 'Vidéos reçues',
  editing: 'Traitement en cours',
  approval: 'Traitement en cours',
  delivered: 'Livré',
  completed: 'Terminé',
};

const PAYMENT_LABELS = {
  paid: 'Payé',
  pending: 'En attente',
  refunded: 'Remboursé',
  failed: 'Échec',
  cancelled: 'Annulé',
};

let adminState = { clients: [], orders: [] };
let stateLoadedAt = 0;
let passageActive = false;
let activeOrderId = '';
let scheduled = 0;
let saving = false;

boot();

function boot() {
  document.body.classList.add('studio-passage-editor-v80');
  document.addEventListener('click', onGlobalClick, true);
  new MutationObserver(scheduleEnhance).observe(document.body, { childList: true, subtree: true });
  window.addEventListener('hashchange', () => {
    passageActive = false;
    activeOrderId = currentOrderId();
    scheduleEnhance();
  });
  loadState(false).finally(scheduleEnhance);
}

function scheduleEnhance() {
  if (scheduled) return;
  scheduled = requestAnimationFrame(() => {
    scheduled = 0;
    enhance();
  });
}

function enhance() {
  const root = qs('#clientDetail');
  const tabs = qs('.tabs', root);
  const title = qs('.detail-title', root);
  const orderId = currentOrderId();
  if (!root || !tabs || !title || !orderId) return;

  activeOrderId = orderId;
  installPassageTab(tabs);
  installPassageAction(title);

  if (passageActive && activeOrderId === orderId) {
    setPassageTabActive(tabs);
    const body = qs('#detailBody', root);
    if (body && body.dataset.passageEditorV80 !== orderId) renderPassage(body, orderId);
  }
}

function installPassageTab(tabs) {
  if (qs('[data-passage-tab-v80]', tabs)) return;
  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.passageTabV80 = 'true';
  button.textContent = 'Passage';
  const tracking = qs('[data-detail-tab="tracking"]', tabs);
  tracking?.after(button);
}

function installPassageAction(title) {
  if (qs('[data-edit-passage-v80]', title)) return;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'studio-current-passage-edit';
  button.dataset.editPassageV80 = 'true';
  button.innerHTML = '<span aria-hidden="true">✎</span> Modifier le passage';
  const close = qs('.close', title);
  close ? close.before(button) : title.append(button);
}

async function onGlobalClick(event) {
  const passageTrigger = event.target.closest('[data-passage-tab-v80],[data-edit-passage-v80]');
  if (passageTrigger) {
    event.preventDefault();
    event.stopPropagation();
    await openPassage();
    return;
  }

  const regularTab = event.target.closest('[data-detail-tab]');
  if (regularTab) {
    passageActive = false;
    return;
  }

  if (event.target.closest('[data-passage-manage-client]')) {
    event.preventDefault();
    qs('#manageClientAccounts')?.click();
    return;
  }

  if (event.target.closest('[data-passage-reset]')) {
    event.preventDefault();
    const body = qs('#detailBody');
    if (body) {
      delete body.dataset.passageEditorV80;
      renderPassage(body, currentOrderId());
    }
  }
}

async function openPassage() {
  const orderId = currentOrderId();
  if (!orderId) return;
  passageActive = true;
  activeOrderId = orderId;
  await loadState(false);
  const root = qs('#clientDetail');
  const tabs = qs('.tabs', root);
  const body = qs('#detailBody', root);
  if (!tabs || !body) return;
  setPassageTabActive(tabs);
  renderPassage(body, orderId);
}

function setPassageTabActive(tabs) {
  qsa('button', tabs).forEach((button) => button.classList.toggle('active', Boolean(button.dataset.passageTabV80)));
}

function renderPassage(body, orderId) {
  const order = getOrder(orderId);
  if (!order) {
    body.innerHTML = '<section class="passage-v80-state"><strong>Dossier introuvable.</strong><button type="button" data-passage-retry>Recharger</button></section>';
    body.dataset.passageEditorV80 = orderId;
    qs('[data-passage-retry]', body)?.addEventListener('click', () => loadState(true).then(() => renderPassage(body, orderId)));
    return;
  }

  body.className = 'passage-v80-body';
  body.dataset.passageEditorV80 = orderId;
  body.innerHTML = `
    <section class="passage-v80-shell">
      <header class="passage-v80-header">
        <div>
          <p class="eyebrow">FICHE DU PASSAGE</p>
          <h3>Tout ce qui doit être juste avant le tournage</h3>
          <p>Dates, format, statut, liens et informations commerciales sont modifiables au même endroit.</p>
        </div>
        <div class="passage-v80-header-actions">
          <button type="button" class="secondary" data-passage-manage-client>Compte client</button>
          <button type="submit" form="passageEditorFormV80" class="button">Enregistrer</button>
        </div>
      </header>

      <div class="passage-v80-snapshot" aria-label="Résumé du passage">
        ${snapshotCard('Préparation', order.appointmentAt ? dateLabel(order.appointmentAt) : 'À planifier', order.appointmentAt ? 'ready' : 'warning')}
        ${snapshotCard('Passage studio', order.filmingAt ? dateLabel(order.filmingAt) : 'À confirmer', order.filmingAt ? 'ready' : 'warning')}
        ${snapshotCard('Format', order.format || 'Non renseigné', order.format ? 'ready' : 'warning')}
        ${snapshotCard('Statut', STATUS_LABELS[order.status] || order.status || 'En cours', order.status === 'completed' ? 'done' : 'ready')}
      </div>

      <form id="passageEditorFormV80" class="passage-v80-form" novalidate>
        <input type="hidden" name="orderId" value="${escapeHtml(order.id)}">
        <input type="hidden" name="expectedUpdatedAt" value="${escapeHtml(order.updatedAt || '')}">

        <section class="passage-v80-card passage-v80-card--primary">
          <div class="passage-v80-card-head"><span>1</span><div><h4>Identité du passage</h4><p>Ce que l’équipe et le client doivent reconnaître immédiatement.</p></div></div>
          <div class="passage-v80-fields">
            <label class="wide"><span>Nom du passage *</span><input name="title" maxlength="200" required value="${escapeHtml(order.title || '')}" placeholder="Passage Neptune Media"></label>
            <label><span>Format *</span><input name="format" list="passageFormatsV80" maxlength="100" required value="${escapeHtml(order.format || '')}" placeholder="Hors Norme"></label>
            <datalist id="passageFormatsV80"><option value="Hors Norme"><option value="Concept Libre"><option value="Sur mesure"></datalist>
            <label><span>Statut opérationnel</span><select name="status">${statusOptions(order.status)}</select></label>
            <label><span>Référence de commande</span><input name="orderReference" maxlength="160" value="${escapeHtml(order.orderReference || '')}" placeholder="NM-2026-001"></label>
            <label><span>Code produit</span><input name="productCode" maxlength="100" value="${escapeHtml(order.productCode || '')}" placeholder="HORS-NORME"></label>
          </div>
        </section>

        <section class="passage-v80-card passage-v80-card--dates">
          <div class="passage-v80-card-head"><span>2</span><div><h4>Dates et rendez-vous</h4><p>La préparation doit précéder le passage. Une incohérence est bloquée avant l’enregistrement.</p></div></div>
          <div class="passage-v80-fields">
            <label><span>Rendez-vous de préparation</span><input name="appointmentAt" type="datetime-local" value="${isoToLocal(order.appointmentAt)}"></label>
            <label><span>Date et heure du passage</span><input name="filmingAt" type="datetime-local" value="${isoToLocal(order.filmingAt)}"></label>
            <label class="wide"><span>Prochaine action affichée</span><input name="nextAction" maxlength="320" value="${escapeHtml(order.nextAction || '')}" placeholder="Laisser vide pour la générer selon le statut"></label>
          </div>
        </section>

        <section class="passage-v80-card">
          <div class="passage-v80-card-head"><span>3</span><div><h4>Accès et préparation</h4><p>Les liens réellement utiles au client, sans les chercher dans plusieurs écrans.</p></div></div>
          <div class="passage-v80-fields">
            <label class="wide"><span>Lien du rendez-vous ou document de préparation</span><input name="preparationUrl" type="url" value="${escapeHtml(order.preparationUrl || '')}" placeholder="https://…"></label>
            <label class="wide"><span>Lien de réservation du rendez-vous</span><input name="bookingUrl" type="url" value="${escapeHtml(order.bookingUrl || '')}" placeholder="https://calendar.app.google/…"></label>
          </div>
        </section>

        <section class="passage-v80-card">
          <div class="passage-v80-card-head"><span>4</span><div><h4>Commande et paiement</h4><p>Les données commerciales du passage restent visibles, mais séparées de l’opérationnel.</p></div></div>
          <div class="passage-v80-fields passage-v80-fields--finance">
            <label><span>Montant payé</span><div class="passage-v80-money"><input name="amountEuros" inputmode="decimal" value="${escapeHtml(amountInEuros(order.amountTotal))}"><select name="currency" aria-label="Devise">${currencyOptions(order.currency)}</select></div></label>
            <label><span>Statut du paiement</span><select name="paymentStatus">${paymentOptions(order.paymentStatus)}</select></label>
          </div>
        </section>

        <footer class="passage-v80-footer">
          <label class="passage-v80-notify"><input name="notifyClient" type="checkbox"><span><b>Notifier le client après l’enregistrement</b><small>À activer lorsque la date ou le statut change réellement.</small></span></label>
          <div><button type="button" class="secondary" data-passage-reset>Annuler les modifications</button><button type="submit" class="button">Enregistrer le passage</button></div>
          <p class="message" data-passage-message aria-live="polite"></p>
        </footer>
      </form>
    </section>`;

  const form = qs('#passageEditorFormV80', body);
  form?.addEventListener('submit', savePassage);
  form?.addEventListener('input', () => form.classList.add('is-dirty'));
}

async function savePassage(event) {
  event.preventDefault();
  if (saving) return;
  const form = event.currentTarget;
  const message = qs('[data-passage-message]', form);
  const buttons = qsa('button[type="submit"],button[form="passageEditorFormV80"]');
  const data = new FormData(form);
  const appointmentAt = localToIso(data.get('appointmentAt'));
  const filmingAt = localToIso(data.get('filmingAt'));
  const title = String(data.get('title') || '').trim();
  const format = String(data.get('format') || '').trim();
  const amountEuros = parseMoney(data.get('amountEuros'));

  if (!title || !format) return setMessage(message, 'Le nom et le format du passage sont obligatoires.', true);
  if (appointmentAt && filmingAt && new Date(filmingAt) < new Date(appointmentAt)) {
    return setMessage(message, 'La date du passage ne peut pas être antérieure au rendez-vous de préparation.', true);
  }
  if (['filming_scheduled', 'filming_confirmed'].includes(data.get('status')) && !filmingAt) {
    return setMessage(message, 'Ajoutez la date du passage avant de le marquer comme confirmé.', true);
  }
  if (amountEuros === null) return setMessage(message, 'Le montant payé doit être un nombre valide.', true);

  saving = true;
  buttons.forEach((button) => { button.disabled = true; });
  setMessage(message, 'Enregistrement du passage…');

  const payload = {
    orderId: data.get('orderId'),
    expectedUpdatedAt: data.get('expectedUpdatedAt'),
    title,
    format,
    status: data.get('status'),
    appointmentAt,
    filmingAt,
    preparationUrl: String(data.get('preparationUrl') || '').trim(),
    bookingUrl: String(data.get('bookingUrl') || '').trim(),
    nextAction: String(data.get('nextAction') || '').trim(),
    orderReference: String(data.get('orderReference') || '').trim(),
    productCode: String(data.get('productCode') || '').trim(),
    paymentStatus: data.get('paymentStatus'),
    amountTotal: Math.round(amountEuros * 100),
    currency: data.get('currency'),
  };

  try {
    await api('/api/admin/passage-update', { method: 'POST', body: JSON.stringify(payload) });
    let notificationWarning = '';
    if (data.get('notifyClient')) {
      try {
        await api('/api/admin/client-update', {
          method: 'POST',
          body: JSON.stringify({
            orderId: payload.orderId,
            status: payload.status,
            appointmentAt: payload.appointmentAt,
            filmingAt: payload.filmingAt,
            preparationUrl: payload.preparationUrl,
          }),
        });
      } catch (error) {
        notificationWarning = ` Les informations sont enregistrées, mais la notification n’a pas été confirmée : ${errorLabel(error.message)}`;
      }
    }

    setMessage(message, `Passage mis à jour.${notificationWarning}`, Boolean(notificationWarning));
    form.classList.remove('is-dirty');
    await loadState(true);
    qs('#refresh')?.click();
    setTimeout(() => {
      const body = qs('#detailBody');
      if (body && passageActive) {
        delete body.dataset.passageEditorV80;
        renderPassage(body, payload.orderId);
      }
    }, 350);
  } catch (error) {
    setMessage(message, errorLabel(error.message), true);
    if (error.message === 'passage_conflict') {
      await loadState(true);
      const body = qs('#detailBody');
      if (body) {
        delete body.dataset.passageEditorV80;
        renderPassage(body, payload.orderId);
      }
    }
  } finally {
    saving = false;
    buttons.forEach((button) => { button.disabled = false; });
  }
}

async function loadState(force = false) {
  if (!force && Date.now() - stateLoadedAt < 15_000 && adminState.orders.length) return adminState;
  try {
    adminState = await api('/api/admin/clients');
    stateLoadedAt = Date.now();
    return adminState;
  } catch (error) {
    console.warn('passage_editor_state_failed', error.message);
    return adminState;
  }
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

function getOrder(orderId) {
  return (adminState.orders || []).find((order) => order.id === orderId);
}

function currentOrderId() {
  return decodeURIComponent(location.hash.slice(1) || '');
}

function snapshotCard(label, value, tone) {
  return `<div class="passage-v80-snapshot-card is-${tone}"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
}

function statusOptions(selected) {
  return Object.entries(STATUS_LABELS).map(([value, label]) => `<option value="${value}" ${value === selected ? 'selected' : ''}>${escapeHtml(label)}</option>`).join('');
}

function paymentOptions(selected = 'paid') {
  return Object.entries(PAYMENT_LABELS).map(([value, label]) => `<option value="${value}" ${value === selected ? 'selected' : ''}>${escapeHtml(label)}</option>`).join('');
}

function currencyOptions(selected = 'eur') {
  return ['eur', 'usd', 'gbp', 'chf'].map((value) => `<option value="${value}" ${value === String(selected || 'eur').toLowerCase() ? 'selected' : ''}>${value.toUpperCase()}</option>`).join('');
}

function amountInEuros(value) {
  const cents = Number(value || 0);
  return Number.isFinite(cents) ? (cents / 100).toFixed(2).replace('.', ',') : '0,00';
}

function parseMoney(value) {
  const normalized = String(value || '').trim().replace(/\s/gu, '').replace(',', '.');
  if (!normalized) return 0;
  const number = Number(normalized);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function isoToLocal(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function localToIso(value) {
  const text = String(value || '').trim();
  if (!text) return null;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function dateLabel(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Date invalide';
  return new Intl.DateTimeFormat('fr-FR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Paris',
  }).format(date);
}

function setMessage(element, text, error = false) {
  if (!element) return;
  element.textContent = text;
  element.className = `message${error ? ' error' : ' success'}`;
}

function errorLabel(code) {
  return ({
    invalid_order: 'Le dossier du passage est invalide.',
    order_not_found: 'Ce passage n’existe plus.',
    passage_required_fields: 'Le nom et le format du passage sont obligatoires.',
    filming_before_preparation: 'La date du passage ne peut pas précéder la préparation.',
    filming_date_required: 'Une date est obligatoire pour confirmer le passage.',
    passage_conflict: 'Le dossier a été modifié ailleurs. Les données les plus récentes viennent d’être rechargées.',
    passage_update_failed: 'La mise à jour du passage a échoué. Réessayez.',
    unauthorized: 'La session Studio a expiré. Reconnectez-vous.',
    csrf_failed: 'La session a expiré. Rechargez la page.',
    origin_forbidden: 'La requête a été bloquée pour des raisons de sécurité.',
  })[code] || 'Une erreur est survenue. Réessayez.';
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
