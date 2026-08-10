const RELEASE = 'neptune-studio-client-journey-20260810-v90';
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
  if (cached && Date.now() - cached.at < 120000) {
    render(host, cached.data);
    return;
  }
  if (loadingOrderId === orderId) return;
  loadingOrderId = orderId;
  host.innerHTML = loadingMarkup();
  loadJourney(orderId)
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

async function loadJourney(orderId) {
  const [clients, stripe] = await Promise.all([
    api('/api/admin/clients'),
    api('/api/admin/stripe/reconcile', {
      method: 'POST',
      body: JSON.stringify({ orderId }),
    }),
  ]);
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
  const inventory = workflow.inventory || {};
  const stages = [
    paymentStage(order, stripe, target),
    preparationStage(order, workflow),
    filmingStage(order, workflow),
    sourcesStage(order, workflow, inventory),
    productionStage(order, workflow),
    deliveryStage(order, workflow, inventory),
  ];
  const current = stages.find((stage) => stage.state !== 'done') || stages[stages.length - 1];

  host.innerHTML = `
    <section class="j90-journey" aria-label="Parcours client synchronisé">
      <header class="j90-head">
        <div>
          <p class="eyebrow">PARCOURS CLIENT</p>
          <h4>${escapeHtml(current.heading)}</h4>
          <p>Chaque étape affiche sa source de vérité. Les actions manuelles déclenchent le workflow sans remplacer artificiellement un état Stripe, Agenda ou Drive.</p>
        </div>
        <button type="button" class="j90-refresh" data-j90-refresh>↻ Resynchroniser</button>
      </header>
      <div class="j90-grid">${stages.map(stageMarkup).join('')}</div>
      <p class="j90-global-message" data-j90-global-message aria-live="polite"></p>
    </section>`;
  bind(host, data);
}

function paymentStage(order, stripe, target) {
  const localStatus = String(order.paymentStatus || target.order?.paymentStatus || '').toLowerCase();
  const noPaymentRequired = localStatus === 'no_payment_required';
  const verified = stripe.state === 'paid_verified';
  const unconfigured = stripe.state === 'unconfigured';
  const ambiguous = stripe.state === 'ambiguous';
  const localUnverified = stripe.state === 'local_paid_unverified';
  const options = Array.isArray(stripe.options) ? stripe.options : [];
  const actions = [];
  if (!verified && !noPaymentRequired && stripe.configured !== false) {
    actions.push({ kind: 'reconcile', label: 'Vérifier Stripe' });
    const preferred = options.find((item) => item.recommended) || (options.length === 1 ? options[0] : null);
    if (preferred) {
      actions.push({ kind: 'copy-payment', label: 'Copier le lien de paiement', payload: preferred.url });
      if (target.opportunityId) actions.push({ kind: 'send-payment', label: 'Envoyer au client', tone: 'primary' });
    }
  }
  return {
    key: 'payment',
    label: 'Paiement',
    source: noPaymentRequired ? 'Neptune' : 'Stripe',
    state: verified || noPaymentRequired ? 'done' : ambiguous || localUnverified || unconfigured ? 'warning' : 'current',
    value: noPaymentRequired ? 'Aucun paiement requis' : verified ? money(order.amountTotal, order.currency) : 'Paiement à confirmer',
    detail: noPaymentRequired
      ? 'Exception Neptune enregistrée'
      : verified
        ? 'Paiement vérifié directement chez Stripe'
        : unconfigured
          ? 'STRIPE_SECRET_KEY non configurée'
          : ambiguous
            ? 'Plusieurs paiements Stripe pourraient correspondre'
            : localUnverified
              ? 'Le dossier est marqué payé dans Neptune, mais aucun paiement Stripe unique n’a été vérifié'
              : 'Aucun paiement Stripe correspondant détecté',
    heading: verified || noPaymentRequired ? 'Paiement confirmé' : 'Paiement à sécuriser',
    actions,
    options,
  };
}

function preparationStage(order, workflow) {
  const completed = workflow.preparationStatus === 'completed';
  const booked = Boolean(order.appointmentAt);
  const hasMeeting = /^https?:\/\//iu.test(String(order.preparationUrl || ''));
  const actions = [];
  if (!completed) {
    if (booked) actions.push({ kind: 'workflow', action: 'preparation_completed', label: 'Marquer la préparation terminée' });
    actions.push({ kind: 'edit', label: booked ? 'Modifier le rendez-vous' : 'Planifier le rendez-vous' });
  }
  if (hasMeeting) actions.push({ kind: 'open', url: order.preparationUrl, label: 'Rejoindre la réunion' });
  return {
    key: 'preparation', label: 'Préparation', source: 'Google Agenda / Meet',
    state: completed ? 'done' : booked ? 'current' : 'pending',
    value: completed ? 'Terminée' : booked ? formatDate(order.appointmentAt) : 'À planifier',
    detail: completed ? 'Rendez-vous effectué' : booked ? (hasMeeting ? 'Invitation et lien Meet synchronisés' : 'Créneau enregistré, lien de réunion à vérifier') : 'Aucun rendez-vous de préparation',
    heading: completed ? 'Préparation terminée' : booked ? 'Préparation planifiée' : 'Préparation à organiser',
    actions,
  };
}

function filmingStage(order, workflow) {
  const filmed = ['filmed', 'videos_pending', 'videos_received', 'editing', 'approval', 'delivered', 'completed'].includes(order.status)
    || Boolean(workflow.sourceDeliveryDueAt || workflow.sourceReceivedAt);
  const supplier = String(workflow.supplierStatus || '');
  const confirmed = Boolean(order.filmingAt) && ['confirmed', 'not_required'].includes(supplier);
  const pendingSupplier = Boolean(order.filmingAt) && supplier === 'pending';
  const actions = [];
  if (!filmed) {
    if (!order.filmingAt) actions.push({ kind: 'edit', label: 'Définir la date' });
    else if (pendingSupplier) actions.push({ kind: 'workflow', action: 'resend_supplier_confirmation', label: 'Relancer le studio fournisseur' });
    else if (confirmed) actions.push({ kind: 'workflow', action: 'filming_completed', label: 'Marquer le passage réalisé' });
    actions.push({ kind: 'edit', label: 'Modifier le passage' });
  }
  return {
    key: 'filming', label: 'Passage', source: /hors\s*norme/iu.test(String(order.format || '')) ? 'Studio fournisseur' : 'Neptune',
    state: filmed ? 'done' : confirmed ? 'current' : pendingSupplier ? 'warning' : 'pending',
    value: filmed ? 'Réalisé' : order.filmingAt ? formatDate(order.filmingAt) : 'À définir',
    detail: filmed ? 'Passage enregistré comme réalisé' : pendingSupplier ? 'Confirmation fournisseur attendue' : confirmed ? 'Date confirmée' : 'Date définitive manquante',
    heading: filmed ? 'Passage réalisé' : confirmed ? 'Passage planifié' : 'Passage à confirmer',
    actions: dedupeActions(actions),
  };
}

function sourcesStage(order, workflow, inventory) {
  const received = Boolean(workflow.sourceReceivedAt || inventory.hasSource);
  return {
    key: 'sources', label: 'Sources', source: 'Google Drive / R2',
    state: received ? 'done' : isAfterFilming(order, workflow) ? 'current' : 'pending',
    value: received ? `${Number(inventory.sourceCount || 0)} source(s)` : 'En attente',
    detail: received ? 'Fichiers détectés dans le stockage Neptune' : 'Les rushs du studio ne sont pas encore enregistrés',
    heading: received ? 'Sources reçues' : 'Sources à réceptionner',
    actions: received ? [] : [{ kind: 'workflow', action: 'source_received', label: 'Marquer les sources reçues' }],
  };
}

function productionStage(order, workflow) {
  const editing = Boolean(workflow.editingStartedAt) || ['editing', 'approval', 'delivered', 'completed'].includes(order.status);
  const qcPassed = workflow.sourceQcStatus === 'passed';
  const qcFailed = workflow.sourceQcStatus === 'failed';
  const actions = [];
  if (!editing && workflow.sourceReceivedAt && !qcPassed) {
    actions.push({ kind: 'workflow', action: 'source_qc_passed', label: 'Valider les sources et lancer le montage', tone: 'primary' });
  }
  return {
    key: 'production', label: 'Montage', source: 'Neptune',
    state: editing ? 'done' : qcFailed ? 'warning' : workflow.sourceReceivedAt ? 'current' : 'pending',
    value: editing ? 'En production' : qcFailed ? 'Sources à corriger' : 'À lancer',
    detail: editing ? 'Traitement Neptune démarré' : qcFailed ? 'Une correction fournisseur est attendue' : workflow.sourceReceivedAt ? 'Contrôle qualité à valider' : 'Attend la réception des sources',
    heading: editing ? 'Montage en cours' : 'Production à lancer', actions,
  };
}

function deliveryStage(order, workflow, inventory) {
  const delivered = Boolean(workflow.deliveredAt) || ['delivered', 'completed'].includes(order.status);
  const assetsReady = Boolean(inventory.hasFinal && inventory.hasShort);
  return {
    key: 'delivery', label: 'Livraison', source: 'Google Drive / R2',
    state: delivered ? 'done' : assetsReady ? 'current' : 'pending',
    value: delivered ? 'Livré' : assetsReady ? 'Livrables prêts' : 'En attente',
    detail: delivered ? 'Livraison enregistrée dans le dossier client' : assetsReady ? `${Number(inventory.finalCount || 0)} long · ${Number(inventory.shortCount || 0)} court(s)` : `Long : ${Number(inventory.finalCount || 0)} · Courts : ${Number(inventory.shortCount || 0)}`,
    heading: delivered ? 'Livraison terminée' : 'Livraison à finaliser',
    actions: !delivered && assetsReady ? [{ kind: 'workflow', action: 'delivery_complete', label: 'Valider la livraison', tone: 'primary' }] : [],
  };
}

function stageMarkup(stage) {
  const icon = stage.state === 'done' ? '✓' : stage.state === 'warning' ? '!' : stage.state === 'current' ? '●' : '○';
  const options = stage.key === 'payment' && stage.options?.length
    ? `<div class="j90-payment-options">${stage.options.slice(0, 4).map((option) => `<button type="button" data-j90-copy-payment="${escapeHtml(option.url)}"><span>${escapeHtml(option.description || 'Tarif Stripe')}</span><b>${escapeHtml(money(option.amountTotal, option.currency))}</b>${option.recommended ? '<small>Recommandé</small>' : ''}</button>`).join('')}</div>`
    : '';
  const actions = stage.actions?.length ? `<div class="j90-actions">${stage.actions.map(actionButton).join('')}</div>` : '<span class="j90-no-action">Aucune action manuelle requise.</span>';
  return `<article class="j90-stage is-${escapeHtml(stage.state)}" data-j90-stage="${escapeHtml(stage.key)}"><div class="j90-stage-top"><i>${icon}</i><div><small>${escapeHtml(stage.label)}</small><span>${escapeHtml(stage.source)}</span></div></div><strong>${escapeHtml(stage.value)}</strong><p>${escapeHtml(stage.detail)}</p>${options}${actions}<div class="j90-confirm" data-j90-confirm hidden></div><p class="j90-message" data-j90-message></p></article>`;
}

function actionButton(action) {
  const attrs = [];
  if (action.kind === 'workflow') attrs.push(`data-j90-workflow="${escapeHtml(action.action)}"`);
  if (action.kind === 'edit') attrs.push('data-j90-edit');
  if (action.kind === 'reconcile') attrs.push('data-j90-reconcile');
  if (action.kind === 'send-payment') attrs.push('data-j90-send-payment');
  if (action.kind === 'copy-payment') attrs.push(`data-j90-copy-payment="${escapeHtml(action.payload)}"`);
  if (action.kind === 'open') attrs.push(`data-j90-open="${escapeHtml(action.url)}"`);
  return `<button type="button" class="${action.tone === 'primary' ? 'primary' : ''}" ${attrs.join(' ')}>${escapeHtml(action.label)}</button>`;
}

function bind(host, data) {
  $('[data-j90-refresh]', host)?.addEventListener('click', () => refresh(host.dataset.orderId, host, true));
  $$('[data-j90-reconcile]', host).forEach((button) => button.addEventListener('click', () => refresh(host.dataset.orderId, host, true)));
  $$('[data-j90-edit]', host).forEach((button) => button.addEventListener('click', () => $('[data-d89-edit-passage]')?.click()));
  $$('[data-j90-open]', host).forEach((button) => button.addEventListener('click', () => { const url = safeHttp(button.dataset.j90Open); if (url) window.open(url, '_blank', 'noopener'); }));
  $$('[data-j90-copy-payment]', host).forEach((button) => button.addEventListener('click', async () => {
    const url = safeHttp(button.dataset.j90CopyPayment);
    if (!url) return;
    try { await navigator.clipboard.writeText(url); setCardMessage(button.closest('.j90-stage'), 'Lien Stripe copié.'); }
    catch { setCardMessage(button.closest('.j90-stage'), url); }
  }));
  $$('[data-j90-send-payment]', host).forEach((button) => button.addEventListener('click', () => {
    const stage = button.closest('.j90-stage');
    confirmAction(stage, 'Envoyer le lien Stripe correspondant à ce dossier ?', async () => {
      button.disabled = true;
      try {
        const target = data.stripe?.target || {};
        const result = await api('/api/admin/crm-v86/action', { method: 'POST', body: JSON.stringify({ clientId: target.clientId || '', opportunityId: target.opportunityId || '', orderId: target.orderId || '', action: 'payment' }) });
        setCardMessage(stage, result.suppressed ? 'Un message récent existe déjà : aucun doublon envoyé.' : 'Lien de paiement Stripe envoyé.');
      } catch (error) { setCardMessage(stage, errorLabel(error.message), true); }
      finally { button.disabled = false; }
    });
  }));
  $$('[data-j90-workflow]', host).forEach((button) => button.addEventListener('click', () => {
    const stage = button.closest('.j90-stage');
    const action = button.dataset.j90Workflow;
    confirmAction(stage, confirmationLabel(action), async () => {
      button.disabled = true;
      try {
        await api('/api/admin/workflow/action', { method: 'POST', body: JSON.stringify({ orderId: host.dataset.orderId, action }) });
        setCardMessage(stage, 'Étape enregistrée. Le parcours se resynchronise…');
        await refresh(host.dataset.orderId, host, true);
        $('#refresh')?.click();
      } catch (error) { setCardMessage(stage, errorLabel(error.message), true); }
      finally { button.disabled = false; }
    });
  }));
}

async function refresh(orderId, host, force = false) {
  if (!orderId) return;
  if (force) cache.delete(orderId);
  setGlobalMessage(host, 'Synchronisation des sources de vérité…');
  try { const data = await loadJourney(orderId); cache.set(orderId, { at: Date.now(), data }); render(host, data); }
  catch (error) { setGlobalMessage(host, errorLabel(error.message), true); }
}

function confirmAction(stage, text, callback) {
  const box = $('[data-j90-confirm]', stage);
  if (!box) return;
  box.innerHTML = `<p>${escapeHtml(text)}</p><div><button type="button" data-cancel>Annuler</button><button type="button" class="primary" data-confirm>Confirmer</button></div>`;
  box.hidden = false;
  $('[data-cancel]', box)?.addEventListener('click', () => { box.hidden = true; });
  $('[data-confirm]', box)?.addEventListener('click', async () => { box.hidden = true; await callback(); }, { once: true });
}

function confirmationLabel(action) {
  return ({
    preparation_completed: 'Confirmer que le rendez-vous de préparation est terminé ?',
    resend_supplier_confirmation: 'Renvoyer la demande de confirmation au studio fournisseur ?',
    filming_completed: 'Confirmer que le passage studio a bien eu lieu ?',
    source_received: 'Confirmer manuellement la réception des sources ?',
    source_qc_passed: 'Valider les sources et lancer l’étape de montage ?',
    delivery_complete: 'Confirmer que les livrables sont complets et accessibles au client ?',
  })[action] || 'Confirmer cette action du parcours ?';
}

function loadingMarkup() { return `<section class="j90-journey is-loading"><header class="j90-head"><div><p class="eyebrow">PARCOURS CLIENT</p><h4>Synchronisation en cours…</h4><p>Stripe, Agenda, workflow studio et stockage Neptune sont vérifiés.</p></div></header><div class="j90-skeleton"></div></section>`; }
function errorMarkup(message) { return `<section class="j90-journey"><div class="j90-error"><strong>Parcours indisponible</strong><span>${escapeHtml(message)}</span><button type="button" onclick="location.reload()">Actualiser</button></div></section>`; }
function setCardMessage(stage, text, error = false) { const node = $('[data-j90-message]', stage); if (!node) return; node.textContent = text || ''; node.classList.toggle('is-error', error); }
function setGlobalMessage(host, text, error = false) { const node = $('[data-j90-global-message]', host); if (!node) return; node.textContent = text || ''; node.classList.toggle('is-error', error); }

async function api(url, options = {}) {
  const response = await fetch(url, {
    credentials: 'same-origin', cache: 'no-store', ...options,
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'X-CSRF-Token': sessionStorage.getItem('neptune_csrf') || '', ...(options.headers || {}) },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `http_${response.status}`);
  return data;
}

function currentOrderId() { const id = decodeURIComponent(String(location.hash || '').replace(/^#/u, '')).trim(); return /^[0-9a-f-]{20,100}$/iu.test(id) ? id : ''; }
function isAfterFilming(order, workflow) { return Boolean(workflow.sourceDeliveryDueAt || workflow.sourceReceivedAt || ['filmed', 'videos_pending', 'videos_received', 'editing', 'approval', 'delivered', 'completed'].includes(order.status)); }
function dedupeActions(actions) { const seen = new Set(); return actions.filter((item) => { const key = `${item.kind}:${item.action || item.label}`; if (seen.has(key)) return false; seen.add(key); return true; }); }
function money(cents, currency = 'eur') { const value = Number(cents || 0) / 100; try { return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: String(currency || 'eur').toUpperCase() }).format(value); } catch { return `${value.toFixed(2)} €`; } }
function formatDate(value) { const date = new Date(value || ''); if (Number.isNaN(date.getTime())) return 'À confirmer'; return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Paris' }).format(date); }
function safeHttp(value) { try { const url = new URL(String(value || ''), location.origin); return ['http:', 'https:'].includes(url.protocol) ? url.toString() : ''; } catch { return ''; } }
function errorLabel(value) { return ({ stripe_not_configured: 'Stripe n’est pas encore connecté au Worker.', stripe_payment_link_ambiguous: 'Plusieurs tarifs Stripe correspondent. Vérifiez les métadonnées ou le montant avant envoi.', stripe_payment_link_missing: 'Aucun Payment Link Stripe actif ne correspond à ce tarif.', stripe_payment_unmatched: 'Le paiement Stripe existe mais ne peut pas être rattaché sans ambiguïté à ce dossier.', stripe_payment_already_linked: 'Ce paiement Stripe est déjà associé à un autre dossier.', order_not_found: 'Dossier introuvable.', unauthorized: 'Session Studio expirée.', csrf_failed: 'Session de sécurité expirée. Actualisez la page.', delivery_assets_incomplete: 'La livraison ne peut pas être validée : il manque le long format ou les contenus courts.', action_not_available: 'Cette action n’est pas disponible à cette étape.' })[value] || String(value || 'Erreur de synchronisation.'); }
function escapeHtml(value) { return String(value || '').replace(/[&<>"']/gu, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]); }
