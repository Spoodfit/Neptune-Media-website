const RELEASE = 'neptune-studio-client-journey-20260810-v91';
const $ = (selector, root = document) => root?.querySelector(selector) || null;
const $$ = (selector, root = document) => [...(root?.querySelectorAll(selector) || [])];
const cache = new Map();
let frame = 0;
let loadingOrderId = '';

start();

function start() {
  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', boot, { once: true })
    : boot();
}

function boot() {
  document.body.dataset.clientJourneyRelease = RELEASE;
  new MutationObserver(schedule).observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['open', 'class'],
  });
  window.addEventListener('hashchange', schedule);
  window.addEventListener('focus', () => {
    const id = currentOrderId();
    if (id) cache.delete(id);
    schedule();
  });
  $('#refresh')?.addEventListener('click', () => {
    const id = currentOrderId();
    if (id) cache.delete(id);
    setTimeout(schedule, 250);
  });
  schedule();
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
  const shell = $('.dossier-v89-shell');
  const trackingActive = Boolean($('#clientDetail .tabs [data-detail-tab="tracking"].active'));
  const orderId = currentOrderId();
  if (!dialog?.open || !shell || !trackingActive || !orderId) return;

  let host = $('.j90-host', shell);
  if (!host) {
    host = document.createElement('section');
    host.className = 'j90-host';
    const state = $('.dossier-v89-state', shell);
    if (state) state.insertAdjacentElement('afterend', host);
    else shell.prepend(host);
  }
  host.dataset.orderId = orderId;

  const cached = cache.get(orderId);
  if (cached && Date.now() - cached.at < 90000) {
    render(host, cached.data);
    return;
  }
  if (loadingOrderId === orderId) return;
  loadingOrderId = orderId;
  host.innerHTML = loadingMarkup();
  loadJourney(orderId, false)
    .then((data) => {
      cache.set(orderId, { at: Date.now(), data });
      if (host.isConnected && host.dataset.orderId === orderId) render(host, data);
    })
    .catch((error) => {
      if (host.isConnected) host.innerHTML = errorMarkup(errorLabel(error.message));
    })
    .finally(() => {
      if (loadingOrderId === orderId) loadingOrderId = '';
    });
}

async function loadJourney(orderId, applyStripe) {
  const stripe = await api(applyStripe ? '/api/admin/stripe/reconcile' : '/api/admin/stripe/status', {
    method: 'POST',
    body: JSON.stringify({ orderId }),
  });
  const clients = await api('/api/admin/clients');
  const order = (clients.orders || []).find((item) => item.id === (stripe.target?.orderId || orderId))
    || stripe.target?.order
    || null;
  if (!order) throw new Error('order_not_found');
  return { order, stripe, clients };
}

function render(host, data) {
  const order = data.order || {};
  const workflow = order.workflow || {};
  const stripe = data.stripe?.stripe || {};
  const target = data.stripe?.target || {};
  const payment = paymentState(order, stripe, target);
  const checks = [
    preparationCheck(order, workflow),
    filmingCheck(order, workflow),
    filesCheck(order, workflow),
  ];
  const shell = host.closest('.dossier-v89-shell');
  shell?.classList.toggle('j90-payment-attention', payment.tone === 'warning' || payment.tone === 'current');
  if (shell) shell.dataset.j90PaymentState = stripe.state || 'unknown';

  host.innerHTML = `
    <section class="j90-journey" aria-label="Vérifications automatiques du dossier">
      <header class="j90-head">
        <div>
          <p class="eyebrow">VÉRIFICATIONS AUTOMATIQUES</p>
          <h4>${escapeHtml(payment.heading)}</h4>
          <p>Neptune contrôle les données utiles. Le panneau « Prochaine action » plus bas reste l’unique endroit où valider l’avancement du dossier.</p>
        </div>
        <button type="button" class="j90-refresh" data-j90-refresh>Actualiser les vérifications</button>
      </header>

      <div class="j90-layout">
        ${paymentMarkup(payment)}
        <div class="j90-checks">${checks.map(checkMarkup).join('')}</div>
      </div>
      <p class="j90-global-message" data-j90-global-message aria-live="polite"></p>
    </section>`;
  bind(host, data);
}

function paymentState(order, stripe, target) {
  const state = String(stripe.state || 'unpaid');
  const options = Array.isArray(stripe.options) ? stripe.options : [];
  const amount = money(order.amountTotal || target.amountTotal, order.currency || target.currency);
  if (state === 'not_required') {
    return {
      state, tone: 'done', heading: 'Aucun paiement requis', title: 'Paiement', value: 'Aucun paiement requis',
      detail: 'Ce dossier a été créé comme partenaire, adhérent ou exception interne sans règlement à encaisser.', options: [], actions: [],
    };
  }
  if (state === 'paid_verified') {
    return {
      state, tone: 'done', heading: 'Paiement Stripe vérifié', title: 'Paiement', value: amount,
      detail: 'Le règlement est rattaché à ce dossier dans Stripe. Aucune action n’est nécessaire.', options: [], actions: [],
    };
  }
  if (state === 'payment_found') {
    return {
      state, tone: 'current', heading: 'Un paiement Stripe a été trouvé', title: 'Paiement', value: amount,
      detail: 'Neptune a trouvé un paiement correspondant. Vérifiez puis rattachez-le explicitement à ce dossier.', options,
      actions: [{ kind: 'reconcile', label: 'Vérifier et rattacher le paiement', tone: 'primary' }],
    };
  }
  if (state === 'ambiguous') {
    return {
      state, tone: 'warning', heading: 'Le paiement doit être vérifié', title: 'Paiement', value: amount,
      detail: 'Plusieurs paiements Stripe peuvent correspondre à ce dossier. Neptune refuse de choisir automatiquement.', options,
      actions: [{ kind: 'reconcile', label: 'Rechercher à nouveau dans Stripe' }],
    };
  }
  if (state === 'local_paid_unverified') {
    return {
      state, tone: 'warning', heading: 'Ancien statut « payé » à vérifier', title: 'Paiement', value: amount,
      detail: 'Le dossier était marqué payé dans Neptune, mais aucun identifiant Stripe n’est encore rattaché. Ce statut local ne vaut pas preuve de paiement.', options,
      actions: [{ kind: 'reconcile', label: 'Vérifier le paiement dans Stripe', tone: 'primary' }],
    };
  }
  if (state === 'unconfigured') {
    return {
      state, tone: 'warning', heading: 'Stripe n’est pas disponible', title: 'Paiement', value: amount,
      detail: 'La connexion Stripe du Worker n’est pas configurée. Le dossier reste visible mais le paiement ne peut pas être vérifié.', options: [], actions: [],
    };
  }

  const actions = [{ kind: 'reconcile', label: 'Vérifier le paiement dans Stripe', tone: 'primary' }];
  const preferred = options.find((item) => item.recommended) || (options.length === 1 ? options[0] : null);
  if (preferred) {
    actions.push({ kind: 'copy-payment', label: 'Copier le lien de paiement', payload: preferred.url });
    if (target.opportunityId) actions.push({ kind: 'send-payment', label: 'Envoyer le lien au client' });
  }
  return {
    state, tone: 'current', heading: 'Paiement en attente', title: 'Paiement', value: amount,
    detail: 'Aucun règlement Stripe vérifié n’est rattaché à ce dossier pour le moment.', options, actions,
  };
}

function preparationCheck(order, workflow) {
  const completed = workflow.preparationStatus === 'completed';
  const booked = Boolean(order.appointmentAt);
  const meeting = /^https?:\/\//iu.test(String(order.preparationUrl || ''));
  return {
    label: 'Rendez-vous', source: 'Google Agenda / Meet',
    tone: completed ? 'done' : booked ? 'current' : 'pending',
    value: completed ? 'Terminé' : booked ? formatDate(order.appointmentAt) : 'À planifier',
    detail: completed ? 'Préparation effectuée' : booked ? (meeting ? 'Invitation et lien de réunion disponibles' : 'Créneau enregistré, lien Meet à vérifier') : 'Aucun rendez-vous défini',
  };
}

function filmingCheck(order, workflow) {
  const filmed = ['filmed', 'videos_pending', 'videos_received', 'editing', 'approval', 'delivered', 'completed'].includes(order.status)
    || Boolean(workflow.sourceReceivedAt || workflow.editingStartedAt || workflow.deliveredAt);
  const supplier = String(workflow.supplierStatus || '');
  const confirmed = Boolean(order.filmingAt) && ['confirmed', 'not_required'].includes(supplier);
  const pendingSupplier = Boolean(order.filmingAt) && supplier === 'pending';
  return {
    label: 'Passage', source: /hors\s*norme/iu.test(String(order.format || '')) ? 'Studio fournisseur' : 'Neptune',
    tone: filmed ? 'done' : confirmed ? 'current' : pendingSupplier ? 'warning' : 'pending',
    value: filmed ? 'Réalisé' : order.filmingAt ? formatDate(order.filmingAt) : 'À définir',
    detail: filmed ? 'Tournage enregistré' : pendingSupplier ? 'Confirmation du studio attendue' : confirmed ? 'Date confirmée' : 'Date définitive manquante',
  };
}

function filesCheck(order, workflow) {
  const inventory = workflow.inventory || {};
  const delivered = Boolean(workflow.deliveredAt) || ['delivered', 'completed'].includes(order.status);
  const editing = Boolean(workflow.editingStartedAt) || ['editing', 'approval'].includes(order.status);
  const sources = Boolean(workflow.sourceReceivedAt || inventory.hasSource);
  const ready = Boolean(inventory.hasFinal && inventory.hasShort);
  if (delivered) return { label: 'Fichiers', source: 'Google Drive / R2', tone: 'done', value: 'Livrés', detail: 'Livrables accessibles au client' };
  if (ready) return { label: 'Fichiers', source: 'Google Drive / R2', tone: 'current', value: 'Livrables prêts', detail: `${Number(inventory.finalCount || 0)} long · ${Number(inventory.shortCount || 0)} court(s)` };
  if (editing) return { label: 'Fichiers', source: 'Neptune', tone: 'current', value: 'Montage en cours', detail: 'Les livrables ne sont pas encore complets' };
  if (sources) return { label: 'Fichiers', source: 'Google Drive / R2', tone: 'current', value: 'Sources reçues', detail: `${Number(inventory.sourceCount || 0)} source(s) détectée(s)` };
  return { label: 'Fichiers', source: 'Google Drive / R2', tone: 'pending', value: 'En attente', detail: 'Aucune source reçue pour le moment' };
}

function paymentMarkup(payment) {
  const options = payment.options?.length
    ? `<details class="j90-payment-options"><summary>Voir les liens Stripe disponibles</summary><div>${payment.options.slice(0, 4).map((option) => `
        <article>
          <span><b>${escapeHtml(option.description || 'Tarif Stripe')}</b><small>${escapeHtml(money(option.amountTotal, option.currency))}${option.recommended ? ' · recommandé' : ''}</small></span>
          <button type="button" data-j90-copy-payment="${escapeHtml(option.url)}">Copier ce lien</button>
        </article>`).join('')}</div></details>`
    : '';
  const actions = payment.actions?.length
    ? `<div class="j90-actions">${payment.actions.map(actionButton).join('')}</div>`
    : '<span class="j90-no-action">Aucune action nécessaire.</span>';
  return `<article class="j90-payment is-${escapeHtml(payment.tone)}"><div class="j90-payment-head"><span class="j90-dot"></span><div><small>${escapeHtml(payment.title)}</small><strong>${escapeHtml(payment.value)}</strong></div></div><p>${escapeHtml(payment.detail)}</p>${options}${actions}<div class="j90-confirm" data-j90-confirm hidden></div><p class="j90-message" data-j90-message></p></article>`;
}

function checkMarkup(check) {
  const icon = check.tone === 'done' ? '✓' : check.tone === 'warning' ? '!' : check.tone === 'current' ? '●' : '○';
  return `<article class="j90-check is-${escapeHtml(check.tone)}"><i>${icon}</i><div><small>${escapeHtml(check.label)} · ${escapeHtml(check.source)}</small><strong>${escapeHtml(check.value)}</strong><span>${escapeHtml(check.detail)}</span></div></article>`;
}

function actionButton(action) {
  const attrs = [];
  if (action.kind === 'reconcile') attrs.push('data-j90-reconcile');
  if (action.kind === 'send-payment') attrs.push('data-j90-send-payment');
  if (action.kind === 'copy-payment') attrs.push(`data-j90-copy-payment="${escapeHtml(action.payload)}"`);
  return `<button type="button" class="${action.tone === 'primary' ? 'primary' : ''}" ${attrs.join(' ')}>${escapeHtml(action.label)}</button>`;
}

function bind(host, data) {
  $('[data-j90-refresh]', host)?.addEventListener('click', () => refresh(host.dataset.orderId, host, false));
  $$('[data-j90-reconcile]', host).forEach((button) => button.addEventListener('click', () => reconcile(host.dataset.orderId, host, button)));
  $$('[data-j90-copy-payment]', host).forEach((button) => button.addEventListener('click', async () => {
    const url = safeHttp(button.dataset.j90CopyPayment);
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCardMessage(button.closest('.j90-payment'), 'Lien Stripe copié.');
    } catch {
      setCardMessage(button.closest('.j90-payment'), 'Copie impossible sur cet appareil.', true);
    }
  }));
  $$('[data-j90-send-payment]', host).forEach((button) => button.addEventListener('click', () => {
    const card = button.closest('.j90-payment');
    confirmAction(card, 'Envoyer maintenant le lien de paiement Stripe au client ?', async () => {
      button.disabled = true;
      try {
        const target = data.stripe?.target || {};
        const result = await api('/api/admin/crm-v86/action', {
          method: 'POST',
          body: JSON.stringify({
            clientId: target.clientId || '',
            opportunityId: target.opportunityId || '',
            orderId: target.orderId || '',
            action: 'payment',
          }),
        });
        setCardMessage(card, result.suppressed ? 'Un lien de paiement récent a déjà été envoyé. Aucun doublon.' : 'Lien de paiement envoyé au client.');
      } catch (error) {
        setCardMessage(card, errorLabel(error.message), true);
      } finally {
        button.disabled = false;
      }
    });
  }));
}

async function reconcile(orderId, host, button) {
  if (!orderId) return;
  button.disabled = true;
  setGlobalMessage(host, 'Vérification Stripe et rattachement du paiement…');
  try {
    cache.delete(orderId);
    const data = await loadJourney(orderId, true);
    cache.set(orderId, { at: Date.now(), data });
    render(host, data);
    $('#refresh')?.click();
  } catch (error) {
    setGlobalMessage(host, errorLabel(error.message), true);
  } finally {
    button.disabled = false;
  }
}

async function refresh(orderId, host, applyStripe) {
  if (!orderId) return;
  cache.delete(orderId);
  setGlobalMessage(host, 'Actualisation des vérifications…');
  try {
    const data = await loadJourney(orderId, applyStripe);
    cache.set(orderId, { at: Date.now(), data });
    render(host, data);
  } catch (error) {
    setGlobalMessage(host, errorLabel(error.message), true);
  }
}

function confirmAction(card, text, callback) {
  const box = $('[data-j90-confirm]', card);
  if (!box) return;
  box.innerHTML = `<p>${escapeHtml(text)}</p><div><button type="button" data-cancel>Annuler</button><button type="button" class="primary" data-confirm>Confirmer</button></div>`;
  box.hidden = false;
  $('[data-cancel]', box)?.addEventListener('click', () => { box.hidden = true; }, { once: true });
  $('[data-confirm]', box)?.addEventListener('click', async () => { box.hidden = true; await callback(); }, { once: true });
}

function loadingMarkup() {
  return `<section class="j90-journey is-loading"><header class="j90-head"><div><p class="eyebrow">VÉRIFICATIONS AUTOMATIQUES</p><h4>Actualisation du dossier…</h4><p>Neptune vérifie Stripe, Google Agenda, le studio et les fichiers.</p></div></header><div class="j90-skeleton"></div></section>`;
}

function errorMarkup(message) {
  return `<section class="j90-journey"><div class="j90-error"><strong>Vérifications indisponibles</strong><span>${escapeHtml(message)}</span><button type="button" onclick="location.reload()">Actualiser la page</button></div></section>`;
}

function setCardMessage(card, text, error = false) {
  const node = $('[data-j90-message]', card);
  if (!node) return;
  node.textContent = text || '';
  node.classList.toggle('is-error', error);
}

function setGlobalMessage(host, text, error = false) {
  const node = $('[data-j90-global-message]', host);
  if (!node) return;
  node.textContent = text || '';
  node.classList.toggle('is-error', error);
}

async function api(url, options = {}) {
  const response = await fetch(url, {
    credentials: 'same-origin',
    cache: 'no-store',
    ...options,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-CSRF-Token': sessionStorage.getItem('neptune_csrf') || '',
      ...(options.headers || {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `http_${response.status}`);
  return data;
}

function currentOrderId() {
  const id = decodeURIComponent(String(location.hash || '').replace(/^#/u, '')).trim();
  return /^[0-9a-f-]{20,100}$/iu.test(id) ? id : '';
}

function money(cents, currency = 'eur') {
  const value = Number(cents || 0) / 100;
  try {
    return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: String(currency || 'eur').toUpperCase() }).format(value);
  } catch {
    return `${value.toFixed(2)} €`;
  }
}

function formatDate(value) {
  const date = new Date(value || '');
  if (Number.isNaN(date.getTime())) return 'À confirmer';
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Paris' }).format(date);
}

function safeHttp(value) {
  try {
    const url = new URL(String(value || ''), location.origin);
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : '';
  } catch {
    return '';
  }
}

function errorLabel(value) {
  return ({
    stripe_not_configured: 'Stripe n’est pas connecté au Worker.',
    stripe_payment_link_ambiguous: 'Plusieurs tarifs Stripe correspondent. Vérifiez le montant avant l’envoi.',
    stripe_payment_link_missing: 'Aucun lien de paiement Stripe actif ne correspond à ce montant.',
    stripe_payment_unmatched: 'Le paiement Stripe existe mais ne peut pas être rattaché automatiquement à ce dossier.',
    stripe_payment_already_linked: 'Ce paiement Stripe est déjà rattaché à un autre dossier.',
    stripe_target_not_found: 'Le dossier ne peut pas être rapproché avec Stripe.',
    order_not_found: 'Dossier introuvable.',
    unauthorized: 'Votre session Studio a expiré.',
    csrf_failed: 'Votre session de sécurité a expiré. Actualisez la page.',
    payment_passage_required: 'Ce dossier ne possède pas encore de lien de paiement envoyable automatiquement. Utilisez « Copier le lien de paiement ».',
  })[value] || String(value || 'Erreur de synchronisation.');
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/gu, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}
