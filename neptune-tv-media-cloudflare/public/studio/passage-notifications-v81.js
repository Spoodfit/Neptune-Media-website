const RECIPIENT_LABELS = {
  client: 'Client',
  admin: 'Neptune / organisateur',
  supplier: 'Studio fournisseur',
};

const FIELD_LABELS = {
  title: 'Nom du passage',
  format: 'Format',
  status: 'Statut opérationnel',
  appointmentAt: 'Rendez-vous de préparation',
  filmingAt: 'Date et heure du passage',
  preparationUrl: 'Lien de préparation',
  bookingUrl: 'Lien de réservation',
  nextAction: 'Prochaine action',
  orderReference: 'Référence de commande',
  productCode: 'Code produit',
  paymentStatus: 'Statut du paiement',
  amountEuros: 'Montant',
  currency: 'Devise',
};

const SUPPLIER_STATUSES = new Set([
  'studio_date_confirmation_pending',
  'filming_scheduled',
  'filming_confirmed',
  'filmed',
  'videos_pending',
]);
const CLIENT_PAYMENT_NOTICES = new Set(['pending', 'refunded', 'failed', 'cancelled']);

let scheduled = 0;
let lastResult = null;

boot();

function boot() {
  document.body.classList.add('studio-passage-notifications-v81');
  patchFetch();
  new MutationObserver(scheduleInstall).observe(document.body, { childList: true, subtree: true });
  document.addEventListener('input', onFieldChange, true);
  document.addEventListener('change', onFieldChange, true);
  scheduleInstall();
}

function scheduleInstall() {
  if (scheduled) return;
  scheduled = requestAnimationFrame(() => {
    scheduled = 0;
    installPreview();
  });
}

function installPreview() {
  const form = document.querySelector('#passageEditorFormV80');
  if (!form || form.dataset.notificationPreviewV81 === 'true') return;
  form.dataset.notificationPreviewV81 = 'true';
  form.__passageNotificationBaseline = formSnapshot(form);

  const legacy = form.querySelector('.passage-v80-notify');
  const preview = document.createElement('section');
  preview.className = 'passage-v81-notification-preview';
  preview.dataset.passageNotificationPreview = 'true';
  preview.setAttribute('aria-live', 'polite');
  legacy?.replaceWith(preview);

  renderPreview(form);
}

function onFieldChange(event) {
  const form = event.target.closest?.('#passageEditorFormV80');
  if (!form) return;
  renderPreview(form);
}

function renderPreview(form) {
  const preview = form.querySelector('[data-passage-notification-preview]');
  if (!preview) return;
  const baseline = form.__passageNotificationBaseline || formSnapshot(form);
  const current = formSnapshot(form);
  const changes = Object.keys(FIELD_LABELS).filter((field) => normalize(baseline[field]) !== normalize(current[field]));
  const plan = notificationPlan(changes, current);

  if (!changes.length) {
    preview.innerHTML = `
      <div class="passage-v81-notification-icon" aria-hidden="true">✓</div>
      <div><strong>Notifications automatiques</strong><p>Aucune modification détectée. Aucun e-mail ne sera envoyé.</p></div>`;
    preview.dataset.state = 'idle';
    return;
  }

  if (!plan.recipients.size) {
    preview.innerHTML = `
      <div class="passage-v81-notification-icon" aria-hidden="true">↳</div>
      <div><strong>Correction interne</strong><p>${escapeHtml(changes.map((field) => FIELD_LABELS[field]).join(', '))}. Aucun e-mail n’est nécessaire.</p></div>`;
    preview.dataset.state = 'internal';
    return;
  }

  const chips = [...plan.recipients].map((recipient) => `<span>${escapeHtml(RECIPIENT_LABELS[recipient])}</span>`).join('');
  const fields = changes
    .filter((field) => plan.notifiedFields.has(field))
    .map((field) => FIELD_LABELS[field])
    .join(', ');
  preview.innerHTML = `
    <div class="passage-v81-notification-icon" aria-hidden="true">✉</div>
    <div class="passage-v81-notification-copy">
      <strong>Notifications envoyées automatiquement après l’enregistrement</strong>
      <p>Changements communiqués : ${escapeHtml(fields || 'informations importantes du passage')}.</p>
      <div class="passage-v81-recipient-chips" aria-label="Destinataires prévus">${chips}</div>
    </div>`;
  preview.dataset.state = 'notify';
}

function notificationPlan(changes, current) {
  const recipients = new Set();
  const notifiedFields = new Set();
  const add = (field, ...types) => {
    notifiedFields.add(field);
    types.forEach((type) => recipients.add(type));
  };

  for (const field of changes) {
    if (field === 'appointmentAt') add(field, 'client', 'admin');
    else if (['filmingAt', 'format'].includes(field)) add(field, 'client', 'admin', 'supplier');
    else if (['title', 'preparationUrl', 'bookingUrl', 'nextAction'].includes(field)) add(field, 'client', 'admin');
    else if (field === 'status') {
      add(field, 'client', 'admin');
      if (SUPPLIER_STATUSES.has(current.status)) recipients.add('supplier');
    } else if (field === 'paymentStatus') {
      add(field, 'admin');
      if (CLIENT_PAYMENT_NOTICES.has(current.paymentStatus)) recipients.add('client');
    }
  }
  return { recipients, notifiedFields };
}

function formSnapshot(form) {
  const data = new FormData(form);
  return {
    title: data.get('title'),
    format: data.get('format'),
    status: data.get('status'),
    appointmentAt: data.get('appointmentAt'),
    filmingAt: data.get('filmingAt'),
    preparationUrl: data.get('preparationUrl'),
    bookingUrl: data.get('bookingUrl'),
    nextAction: data.get('nextAction'),
    orderReference: data.get('orderReference'),
    productCode: data.get('productCode'),
    paymentStatus: data.get('paymentStatus'),
    amountEuros: data.get('amountEuros'),
    currency: data.get('currency'),
  };
}

function patchFetch() {
  if (window.__neptunePassageNotificationFetchV81) return;
  window.__neptunePassageNotificationFetchV81 = true;
  const nativeFetch = window.fetch.bind(window);
  window.fetch = async (...args) => {
    const response = await nativeFetch(...args);
    const input = args[0];
    const url = typeof input === 'string' ? input : input?.url || '';
    if (String(url).includes('/api/admin/passage-update')) {
      response.clone().json().then((result) => {
        if (!result?.ok) return;
        lastResult = result;
        setTimeout(showDeliveryResult, 80);
      }).catch(() => {});
    }
    return response;
  };
}

function showDeliveryResult() {
  if (!lastResult) return;
  const message = document.querySelector('[data-passage-message]');
  if (!message) return;
  const delivery = lastResult.emailDelivery || {};
  const plan = lastResult.notificationPlan || {};
  const sent = Number(delivery.sent || 0);
  const failed = Number(delivery.failed || 0);
  const changes = Array.isArray(lastResult.changes) ? lastResult.changes.length : 0;

  if (failed > 0) {
    message.textContent = `Passage enregistré. ${failed} notification(s) seront réessayées automatiquement.`;
    message.classList.add('error');
  } else if (sent > 0) {
    message.textContent = `Passage mis à jour. ${sent} notification(s) envoyée(s) automatiquement aux parties concernées.`;
    message.classList.remove('error');
  } else if (plan.internalOnly) {
    message.textContent = 'Passage mis à jour. Cette correction interne ne nécessitait aucun e-mail.';
    message.classList.remove('error');
  } else if (!changes) {
    message.textContent = 'Aucune information n’a changé.';
    message.classList.remove('error');
  }
  lastResult = null;
}

function normalize(value) {
  return String(value ?? '').trim();
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/gu, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character]);
}
