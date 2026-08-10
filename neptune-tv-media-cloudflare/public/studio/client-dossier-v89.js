const RELEASE = 'neptune-studio-client-dossier-20260810-v89';
const $ = (selector, root = document) => root?.querySelector(selector) || null;
const $$ = (selector, root = document) => [...(root?.querySelectorAll(selector) || [])];

let state = { orders: [] };
let loading = false;
let frame = 0;
let lastOrderId = '';
let sidebarObserver = null;

start();

function start() {
  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', boot, { once: true })
    : boot();
}

function boot() {
  document.body.dataset.clientDossierRelease = RELEASE;
  repairSidebarNavigation();
  observeSidebarNavigation();

  const dialog = $('#clientDialog');
  dialog?.addEventListener('studio-open', () => requestAnimationFrame(() => resetDetailScroll(true)));
  dialog?.addEventListener('close', () => {
    lastOrderId = '';
    document.body.classList.remove('studio-dossier-v89-open');
  });

  document.addEventListener('click', (event) => {
    if (event.target.closest?.('#clientDetail .tabs button')) {
      requestAnimationFrame(() => resetDetailScroll(true));
    }
  }, true);

  new MutationObserver(schedule).observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'open', 'hidden'],
  });

  window.addEventListener('hashchange', () => {
    lastOrderId = '';
    loadState();
    schedule();
  });
  window.addEventListener('focus', loadState);
  $('#refresh')?.addEventListener('click', () => setTimeout(loadState, 180));
  loadState();
}

function observeSidebarNavigation() {
  const sidebar = $('.studio-sidebar');
  if (!sidebar || sidebarObserver) return;
  sidebarObserver = new MutationObserver(() => repairSidebarNavigation());
  sidebarObserver.observe(sidebar, { subtree: true, attributes: true, attributeFilter: ['hidden'] });
}

function repairSidebarNavigation() {
  const sidebar = $('.studio-sidebar');
  if (!sidebar) return;
  $$('.studio-nav-link,.neptune-studio-nav-link', sidebar).forEach((item) => {
    if (item.hidden) item.hidden = false;
    item.removeAttribute('hidden');
  });
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
    console.error('client_dossier_v89_state_failed', error);
  } finally {
    loading = false;
  }
}

function schedule() {
  if (frame) return;
  frame = requestAnimationFrame(() => {
    frame = 0;
    repairSidebarNavigation();
    enhance();
  });
}

function enhance() {
  const dialog = $('#clientDialog');
  const root = $('#clientDetail');
  if (!dialog?.open || !root?.children.length) {
    document.body.classList.remove('studio-dossier-v89-open');
    return;
  }

  const order = currentOrder();
  if (!order) return;
  document.body.classList.add('studio-dossier-v89-open');
  dialog.classList.add('client-dossier-v89-dialog');
  root.classList.add('client-dossier-v89');

  normalizeHeader(root);
  removeLegacyTrackingLayers(root);

  const trackingActive = Boolean($('.tabs [data-detail-tab="tracking"].active', root));
  root.classList.toggle('client-dossier-v89--tracking', trackingActive);

  if (order.id !== lastOrderId) {
    lastOrderId = order.id;
    resetDetailScroll(true);
  }

  if (!trackingActive) return;
  renderTracking(root, order);
}

function normalizeHeader(root) {
  const title = $('.detail-title', root);
  if (!title) return;
  title.classList.add('dossier-v89-title');
  title.querySelector('.studio-detail-back')?.remove();
  title.dataset.workspaceV42 = '1';
  const eyebrow = $('.eyebrow', title);
  if (eyebrow) eyebrow.textContent = 'DOSSIER CLIENT';
  const close = $('.close', title);
  if (close) {
    close.setAttribute('aria-label', 'Fermer le dossier client');
    title.append(close);
  }
}

function removeLegacyTrackingLayers(root) {
  root.querySelector('#workflowCommandCenter')?.remove();
  const preparation = root.querySelector('.studio-preparation-v77');
  if (preparation) preparation.hidden = true;
  const body = $('#detailBody', root);
  if (body) body.hidden = false;
}

function renderTracking(root, order) {
  const body = $('#detailBody', root);
  if (!body) return;
  const w = order.workflow || {};
  const inventory = w.inventory || {};
  const chronology = chronologyState(order);
  const signature = [
    order.id, order.updatedAt, order.status, order.appointmentAt, order.filmingAt, order.preparationUrl,
    w.updatedAt, w.currentLabel, w.nextAction, w.preparationStatus, w.preparationCompletedAt, w.supplierStatus,
    w.sourceReceivedAt, w.sourceQcStatus, w.editingStartedAt, w.deliveredAt, w.broadcastStatus, w.broadcastAt,
    inventory.finalCount, inventory.shortCount, inventory.hasFinal, inventory.hasShort, chronology.invalid,
  ].join('|');

  if (body.dataset.dossierV89Signature === signature && $('.dossier-v89-shell', body)) return;
  body.dataset.dossierV89Signature = signature;
  body.className = 'dossier-v89-body';
  body.hidden = false;
  body.innerHTML = trackingMarkup(order, chronology, inventory);
  bindTracking(body, order, chronology, inventory);
}

function trackingMarkup(order, chronology, inventory) {
  const w = order.workflow || {};
  const currentLabel = w.currentLabel || statusLabel(order.status);
  const currentText = actionContextText(order, chronology, inventory);
  const action = actionDescriptor(order, chronology, inventory);
  const filming = validDate(order.filmingAt);
  const appointment = validDate(order.appointmentAt);
  const prepComplete = w.preparationStatus === 'completed' && !chronology.invalid;
  const finalCount = count(inventory.finalCount);
  const shortCount = count(inventory.shortCount);
  const ready = Boolean(inventory.hasFinal && inventory.hasShort);

  return `
    <section class="dossier-v89-shell" aria-label="Suivi du dossier client">
      <header class="dossier-v89-state">
        <div>
          <p class="eyebrow">ÉTAPE ACTUELLE</p>
          <h3>${escapeHtml(currentLabel)}</h3>
          <p>${escapeHtml(currentText)}</p>
        </div>
        <span class="dossier-v89-sync"><i></i> Synchronisé</span>
      </header>

      ${chronology.invalid ? chronologyAlertMarkup(chronology) : ''}
      ${progressMarkup(order)}

      <div class="dossier-v89-layout">
        <section class="dossier-v89-summary">
          <div class="dossier-v89-section-head"><div><span>REPÈRES</span><h4>Ce qu’il faut savoir maintenant</h4></div></div>
          <div class="dossier-v89-facts">
            ${factMarkup('Passage studio', filming ? formatDateTime(filming) : 'À confirmer', isFilmed(order) ? 'Passage réalisé' : filming ? 'Créneau confirmé' : 'Date définitive manquante', filming ? 'ready' : 'warning')}
            ${factMarkup('Préparation', chronology.invalid ? 'Dates à corriger' : prepComplete ? 'Terminée' : appointment ? formatDateTime(appointment) : 'À planifier', chronology.invalid ? chronology.shortDetail : prepComplete ? 'Aucune action requise' : appointment ? appointmentSourceLabel(order) : 'Rendez-vous non planifié', chronology.invalid ? 'warning' : prepComplete ? 'ready' : '')}
            ${factMarkup('Livrables', `${finalCount} long · ${shortCount} court${shortCount > 1 ? 's' : ''}`, ready ? 'Prêts pour livraison' : `Manque ${missingAssets(inventory)}`, ready ? 'ready' : '')}
          </div>
        </section>

        <aside class="dossier-v89-action" data-d89-action-card>
          ${actionMarkup(action)}
          <div class="dossier-v89-confirm" data-d89-confirm hidden></div>
          <p class="dossier-v89-message" data-d89-message aria-live="polite"></p>
        </aside>
      </div>

      <details class="dossier-v89-details">
        <summary><span>Chronologie détaillée</span><small>${(order.steps || []).length} étape(s)</small></summary>
        <div class="dossier-v89-timeline">${timelineMarkup(order.steps || [])}</div>
      </details>

      <details class="dossier-v89-details dossier-v89-details--manage">
        <summary><span>Informations et corrections</span><small>Dates, statut, compte client</small></summary>
        <div class="dossier-v89-manage">
          <div><strong>Besoin de corriger le dossier ?</strong><span>Les modifications opérationnelles sont regroupées dans l’éditeur du passage pour éviter les champs contradictoires dans le suivi.</span></div>
          <button type="button" data-d89-edit-passage>Modifier le passage</button>
          <button type="button" class="secondary" data-d89-manage-client>Gérer le compte</button>
        </div>
      </details>
    </section>`;
}

function chronologyAlertMarkup(chronology) {
  return `<section class="dossier-v89-alert" role="alert"><i aria-hidden="true">!</i><div><strong>${escapeHtml(chronology.title)}</strong><span>${escapeHtml(chronology.detail)}</span></div><button type="button" data-d89-edit-passage>Corriger les dates</button></section>`;
}

function progressMarkup(order) {
  const w = order.workflow || {};
  const stages = [
    ['Préparation', w.preparationStatus === 'completed'], ['Passage', isFilmed(order)], ['Sources', Boolean(w.sourceReceivedAt)],
    ['Montage', Boolean(w.editingStartedAt)], ['Livraison', Boolean(w.deliveredAt)], ['Diffusion', w.broadcastStatus === 'published'],
  ];
  const pendingIndex = stages.findIndex(([, done]) => !done);
  const currentIndex = pendingIndex === -1 ? stages.length - 1 : pendingIndex;
  return `<nav class="dossier-v89-progress" aria-label="Progression du dossier">${stages.map(([label, done], index) => {
    const stateClass = done ? 'is-done' : index === currentIndex ? 'is-current' : 'is-pending';
    return `<div class="dossier-v89-progress-step ${stateClass}"><i>${done ? '✓' : index + 1}</i><span>${escapeHtml(label)}</span></div>`;
  }).join('')}</nav>`;
}

function factMarkup(label, value, detail, tone = '') {
  return `<article class="dossier-v89-fact ${tone ? `is-${tone}` : ''}"><small>${escapeHtml(label)}</small><strong>${escapeHtml(value)}</strong><span>${escapeHtml(detail)}</span></article>`;
}

function actionMarkup(action) {
  if (action.kind === 'broadcast-form') {
    return `<small>PROCHAINE ACTION</small><h4>${escapeHtml(action.title)}</h4><p>${escapeHtml(action.text)}</p><form class="dossier-v89-broadcast-form" data-d89-broadcast-form><label><span>Date et heure</span><input name="broadcastAt" type="datetime-local" required></label><label><span>Lien de diffusion <em>(optionnel)</em></span><input name="broadcastUrl" type="url" placeholder="https://…"></label><button type="submit">Programmer la diffusion</button></form>`;
  }
  if (action.kind === 'qc') {
    return `<small>PROCHAINE ACTION</small><h4>${escapeHtml(action.title)}</h4><p>${escapeHtml(action.text)}</p><div class="dossier-v89-action-buttons"><button type="button" data-d89-workflow="source_qc_passed">Sources conformes</button><button type="button" class="secondary" data-d89-show-qc-fail>Signaler un problème</button></div><form class="dossier-v89-qc-fail" data-d89-qc-fail hidden><label><span>Ce qui doit être corrigé</span><textarea name="note" rows="3" maxlength="1200" required></textarea></label><div><button type="button" class="secondary" data-d89-hide-qc-fail>Annuler</button><button type="submit" class="danger">Envoyer au fournisseur</button></div></form>`;
  }
  const button = action.button ? `<button type="button" class="${action.buttonStyle || ''}" ${action.workflow ? `data-d89-workflow="${escapeHtml(action.workflow)}"` : action.local ? `data-d89-local="${escapeHtml(action.local)}"` : ''}>${escapeHtml(action.button)}</button>` : '';
  const secondary = action.secondary ? `<button type="button" class="secondary" data-d89-local="${escapeHtml(action.secondary.local)}">${escapeHtml(action.secondary.label)}</button>` : '';
  return `<small>${escapeHtml(action.eyebrow || 'PROCHAINE ACTION')}</small><h4>${escapeHtml(action.title)}</h4><p>${escapeHtml(action.text)}</p>${button || secondary ? `<div class="dossier-v89-action-buttons">${button}${secondary}</div>` : '<span class="dossier-v89-no-action">Aucune action manuelle requise maintenant.</span>'}`;
}

function timelineMarkup(steps) {
  if (!steps.length) return '<p class="dossier-v89-empty">Aucune chronologie disponible.</p>';
  return steps.map((step) => `<article class="dossier-v89-timeline-row is-${escapeHtml(step.state || 'pending')}"><i></i><div><strong>${escapeHtml(step.label || 'Étape')}</strong><span>${escapeHtml(step.detail || step.note || '')}</span>${step.completedAt ? `<small>${escapeHtml(formatDateTime(step.completedAt))}</small>` : ''}</div></article>`).join('');
}

function bindTracking(body, order, chronology, inventory) {
  $$('[data-d89-edit-passage]', body).forEach((button) => button.addEventListener('click', openPassageEditor));
  $('[data-d89-manage-client]', body)?.addEventListener('click', () => $('#manageClientAccounts')?.click());
  $$('[data-d89-local]', body).forEach((button) => button.addEventListener('click', () => runLocal(button.dataset.d89Local)));
  $$('[data-d89-workflow]', body).forEach((button) => button.addEventListener('click', () => requestWorkflowAction(order, button.dataset.d89Workflow, {}, button)));

  $('[data-d89-show-qc-fail]', body)?.addEventListener('click', () => { const form = $('[data-d89-qc-fail]', body); if (form) { form.hidden = false; $('textarea', form)?.focus(); } });
  $('[data-d89-hide-qc-fail]', body)?.addEventListener('click', () => { const form = $('[data-d89-qc-fail]', body); if (form) form.hidden = true; });
  $('[data-d89-qc-fail]', body)?.addEventListener('submit', (event) => {
    event.preventDefault();
    const note = String(new FormData(event.currentTarget).get('note') || '').trim();
    if (!note) return;
    requestWorkflowAction(order, 'source_qc_failed', { note }, $('button[type="submit"]', event.currentTarget));
  });
  $('[data-d89-broadcast-form]', body)?.addEventListener('submit', (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const date = validDate(String(data.get('broadcastAt') || ''));
    if (!date) return setMessage(body, 'Renseignez une date de diffusion valide.', true);
    requestWorkflowAction(order, 'schedule_broadcast', { broadcastAt: date.toISOString(), broadcastUrl: String(data.get('broadcastUrl') || '').trim() }, $('button[type="submit"]', event.currentTarget), false);
  });

  if (chronology.invalid) setMessage(body, 'Corrigez les dates avant de poursuivre les validations du parcours.', true);
  if (['editing', 'approval', 'videos_received'].includes(order.status) && !(inventory.hasFinal && inventory.hasShort)) { /* livraison volontairement bloquée */ }
}

function runLocal(action) {
  if (action === 'edit-passage') openPassageEditor();
  if (action === 'content') $('#clientDetail .tabs [data-detail-tab="content"]')?.click();
  if (action === 'meeting') { const order = currentOrder(); const url = meetingUrl(order); if (url) window.open(url, '_blank', 'noopener,noreferrer'); }
}

function openPassageEditor() {
  const trigger = $('[data-edit-passage-v80]');
  if (trigger) trigger.click();
  else $('#clientDetail .tabs [data-passage-tab-v80]')?.click();
}

function requestWorkflowAction(order, action, payload, button, confirm = true) {
  const body = $('#detailBody');
  if (!body || !button) return;
  const text = confirmText(action);
  if (!confirm || !text) return runWorkflowAction(order, action, payload, button);
  const host = $('[data-d89-confirm]', body);
  if (!host) return runWorkflowAction(order, action, payload, button);
  host.hidden = false;
  host.innerHTML = `<p>${escapeHtml(text)}</p><div><button type="button" class="secondary" data-d89-confirm-cancel>Annuler</button><button type="button" data-d89-confirm-accept>Confirmer</button></div>`;
  $('[data-d89-confirm-cancel]', host)?.addEventListener('click', () => { host.hidden = true; host.replaceChildren(); }, { once: true });
  $('[data-d89-confirm-accept]', host)?.addEventListener('click', () => { host.hidden = true; host.replaceChildren(); runWorkflowAction(order, action, payload, button); }, { once: true });
}

async function runWorkflowAction(order, action, payload, button) {
  const body = $('#detailBody');
  const original = button?.textContent || '';
  if (button) { button.disabled = true; button.textContent = 'Validation…'; }
  setMessage(body, 'Mise à jour du dossier…');
  try {
    await api('/api/admin/workflow/action', { method: 'POST', body: JSON.stringify({ orderId: order.id, action, ...payload }) });
    setMessage(body, 'Étape enregistrée. Les notifications utiles sont déclenchées.');
    await loadState();
    $('#refresh')?.click();
  } catch (error) {
    setMessage(body, errorText(error.message), true);
    if (button) { button.disabled = false; button.textContent = original; }
  }
}

function actionDescriptor(order, chronology, inventory) {
  const w = order.workflow || {};
  const now = Date.now();
  const appointment = validDate(order.appointmentAt);
  const filming = validDate(order.filmingAt);

  if (chronology.invalid) return { eyebrow: 'À CORRIGER', title: 'La chronologie du dossier est incohérente', text: 'Corrigez les dates avant toute autre validation. Le suivi ne doit pas continuer avec une préparation placée après le passage.', button: 'Corriger les dates', local: 'edit-passage', buttonStyle: 'warning' };
  if (['alternate_proposed', 'rejected'].includes(w.supplierStatus)) return { eyebrow: 'DÉCISION REQUISE', title: w.supplierStatus === 'alternate_proposed' ? 'Le studio a proposé une autre date' : 'La date du passage a été refusée', text: w.supplierNote || 'Une décision humaine est nécessaire avant de poursuivre le parcours.', button: 'Modifier / confirmer la date', local: 'edit-passage' };
  if (w.supplierStatus === 'pending') return { title: 'Confirmation du studio attendue', text: 'La date demandée n’est pas encore confirmée par le fournisseur studio.', button: 'Relancer le studio', workflow: 'resend_supplier_confirmation' };

  if (w.preparationStatus !== 'completed') {
    if (!appointment) return { title: 'Planifier la préparation', text: 'Aucun rendez-vous de préparation n’est défini pour ce passage.', button: 'Planifier la préparation', local: 'edit-passage' };
    if (appointment.getTime() <= now) return { title: 'Valider la préparation', text: `Le rendez-vous du ${formatDateTime(appointment)} est passé. Confirmez uniquement s’il a bien eu lieu.`, button: 'Marquer la préparation terminée', workflow: 'preparation_completed' };
    return { title: 'Préparation planifiée', text: `Rendez-vous prévu le ${formatDateTime(appointment)}. Aucune validation n’est nécessaire avant la visio.`, button: meetingUrl(order) ? 'Ouvrir la réunion' : 'Modifier le rendez-vous', local: meetingUrl(order) ? 'meeting' : 'edit-passage', secondary: meetingUrl(order) ? { label: 'Modifier le rendez-vous', local: 'edit-passage' } : null };
  }

  if (!isFilmed(order)) {
    if (!filming) return { title: 'Définir la date du passage', text: 'La préparation est terminée mais aucune date studio définitive n’est disponible.', button: 'Définir le passage', local: 'edit-passage' };
    if (filming.getTime() <= now) return { title: 'Confirmer la fin du passage', text: `Le créneau du ${formatDateTime(filming)} est passé. Confirmez que le tournage est terminé.`, button: 'Marquer le passage terminé', workflow: 'filming_completed' };
    return { title: 'Passage studio confirmé', text: `Le passage est prévu le ${formatDateTime(filming)}. Le dossier avancera après le tournage.`, button: 'Modifier le passage', local: 'edit-passage', buttonStyle: 'secondary' };
  }

  if (!w.sourceReceivedAt) return { title: 'Attente des fichiers studio', text: w.sourceDeliveryDueAt ? `Les sources sont attendues avant le ${formatDateTime(w.sourceDeliveryDueAt)}.` : 'Confirmez la réception dès que les fichiers du studio sont disponibles.', button: 'Confirmer la réception des sources', workflow: 'source_received' };
  if (w.sourceQcStatus === 'pending') return { kind: 'qc', title: 'Contrôler les fichiers reçus', text: 'Validez les sources uniquement si elles sont complètes et exploitables pour le montage.' };
  if (w.sourceQcStatus === 'failed') return { eyebrow: 'EN ATTENTE', title: 'Corrections demandées au fournisseur', text: 'Le parcours reprendra lorsque les sources corrigées auront été reçues.' };

  if (w.editingStartedAt && !w.deliveredAt) {
    if (inventory.hasFinal && inventory.hasShort) return { eyebrow: 'PRÊT À LIVRER', title: 'Les livrables requis sont disponibles', text: `${count(inventory.finalCount)} émission finale et ${count(inventory.shortCount)} contenu(s) court(s) sont présents.`, button: 'Confirmer la livraison au client', workflow: 'delivery_complete' };
    return { eyebrow: 'MONTAGE EN COURS', title: 'La livraison n’est pas encore disponible', text: `Il manque ${missingAssets(inventory)}. Le bouton de livraison reste bloqué tant que l’inventaire n’est pas complet.`, button: 'Voir les contenus', local: 'content', buttonStyle: 'secondary' };
  }

  if (w.deliveredAt && w.broadcastStatus === 'not_scheduled') return { kind: 'broadcast-form', title: 'Programmer la diffusion', text: 'Les contenus sont livrés. Fixez maintenant la diffusion du long format.' };
  if (w.broadcastStatus === 'scheduled') return { title: 'Diffusion programmée', text: w.broadcastAt ? `Diffusion prévue le ${formatDateTime(w.broadcastAt)}.` : 'La diffusion est programmée.', button: 'Marquer comme diffusée', workflow: 'mark_broadcast_published' };
  return { eyebrow: 'RAS', title: 'Aucune action requise', text: 'Le dossier est cohérent et le parcours continue automatiquement.' };
}

function actionContextText(order, chronology, inventory) {
  if (chronology.invalid) return chronology.detail;
  const w = order.workflow || {};
  if (w.editingStartedAt && !w.deliveredAt && !(inventory.hasFinal && inventory.hasShort)) return `Montage en cours. La livraison se débloquera lorsque ${missingAssets(inventory)} ${missingAssets(inventory).includes(' et ') ? 'seront disponibles' : 'sera disponible'}.`;
  return w.nextAction || order.nextAction || 'Le parcours est synchronisé. Consultez uniquement la prochaine action utile.';
}

function chronologyState(order) {
  const appointment = validDate(order.appointmentAt);
  const filming = validDate(order.filmingAt);
  const w = order.workflow || {};
  const prepComplete = w.preparationStatus === 'completed';
  const now = Date.now();
  if (appointment && filming && appointment.getTime() > filming.getTime()) return { invalid: true, title: 'Dates incohérentes', detail: `La préparation est fixée au ${formatDateTime(appointment)}, après le passage studio du ${formatDateTime(filming)}.`, shortDetail: 'Préparation planifiée après le passage' };
  if (prepComplete && appointment && appointment.getTime() > now + 5 * 60 * 1000) return { invalid: true, title: 'Préparation marquée terminée alors que le rendez-vous est futur', detail: `Le dossier indique une préparation terminée, mais un rendez-vous reste planifié au ${formatDateTime(appointment)}.`, shortDetail: 'Statut et rendez-vous incompatibles' };
  return { invalid: false, title: '', detail: '', shortDetail: '' };
}

function isFilmed(order) { return ['videos_pending', 'videos_received', 'editing', 'approval', 'delivered', 'completed'].includes(order.status) || Boolean(order.workflow?.sourceReceivedAt) || Boolean(order.workflow?.editingStartedAt) || Boolean(order.workflow?.deliveredAt); }
function appointmentSourceLabel(order) { return order.appointmentSource === 'google_calendar' || order.workflow?.appointmentSource === 'google_calendar' ? 'Synchronisé avec Google Agenda' : 'Planifié depuis le Studio'; }
function meetingUrl(order) { return [order?.appointmentUrl, order?.workflow?.appointmentUrl, order?.preparationUrl].map(safeUrl).find(Boolean) || ''; }
function safeUrl(value) { try { const url = new URL(String(value || ''), location.origin); return ['http:', 'https:'].includes(url.protocol) ? url.toString() : ''; } catch { return ''; } }
function missingAssets(inventory) { const missing = []; if (!inventory?.hasFinal) missing.push('l’émission finale'); if (!inventory?.hasShort) missing.push('au moins un contenu court'); return missing.join(' et ') || 'aucun livrable'; }
function statusLabel(status) { return ({ payment_confirmed: 'Paiement confirmé', reservation_confirmed: 'Réservation confirmée', preparation_booking_pending: 'Préparation à planifier', appointment_confirmed: 'Préparation réservée', appointment_booked: 'Préparation réservée', preparation: 'Préparation en cours', studio_date_confirmation_pending: 'Date studio en confirmation', preparation_complete: 'Préparation terminée', filming_scheduled: 'Passage studio confirmé', filming_confirmed: 'Passage studio confirmé', filmed: 'Passage réalisé', videos_pending: 'Fichiers studio attendus', videos_received: 'Fichiers reçus', editing: 'Montage Neptune en cours', approval: 'Validation des contenus', delivered: 'Contenus livrés', completed: 'Parcours terminé' })[status] || 'Parcours client'; }
function confirmText(action) { return ({ resend_supplier_confirmation: 'Renvoyer la demande de confirmation au studio ?', preparation_completed: 'Confirmer que le rendez-vous de préparation a bien eu lieu ?', filming_completed: 'Confirmer que le passage studio est terminé ?', source_received: 'Confirmer que les fichiers du studio ont bien été reçus ?', source_qc_passed: 'Valider les sources et lancer le montage ?', source_qc_failed: 'Signaler ces corrections au fournisseur ?', delivery_complete: 'Confirmer la livraison au client ? Cette action déclenche les notifications associées.', mark_broadcast_published: 'Confirmer que la diffusion a eu lieu ?' })[action] || ''; }

function resetDetailScroll(force = false) { const body = $('#clientDetail #detailBody'); if (body && (force || body.scrollTop > 0)) body.scrollTop = 0; const dialog = $('#clientDialog'); if (dialog && dialog.scrollTop) dialog.scrollTop = 0; const card = $('#clientDialog .drawer-card'); if (card && card.scrollTop) card.scrollTop = 0; }
function currentOrder() { const orderId = decodeURIComponent(location.hash.slice(1)); return (state.orders || []).find((item) => item.id === orderId) || null; }
function setMessage(root, text, isError = false) { const target = $('[data-d89-message]', root); if (!target) return; target.classList.toggle('is-error', isError); target.textContent = text || ''; }
async function api(url, options = {}) { const headers = { Accept: 'application/json', ...(options.headers || {}), 'X-CSRF-Token': sessionStorage.getItem('neptune_csrf') || '' }; if (options.body) headers['Content-Type'] = 'application/json'; const response = await fetch(url, { ...options, headers, credentials: 'same-origin', cache: 'no-store' }); const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.error || `http_${response.status}`); return data; }
function errorText(value) { return ({ delivery_assets_incomplete: 'La livraison reste bloquée : ajoutez une émission finale et au moins un contenu court.', filming_date_required: 'Renseignez une date de passage définitive.', broadcast_date_required: 'Renseignez une date de diffusion.', forbidden: 'Votre rôle ne permet pas cette action.', unauthorized: 'Votre session a expiré.' })[value] || 'L’action a échoué. Vérifiez le dossier et réessayez.'; }
function validDate(value) { const date = value instanceof Date ? value : new Date(value || ''); return Number.isNaN(date.getTime()) ? null : date; }
function formatDateTime(value) { const date = validDate(value); if (!date) return 'À définir'; return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' }).format(date).replace(' à ', ' · '); }
function count(value) { const number = Number(value || 0); return Number.isFinite(number) ? Math.max(0, Math.round(number)) : 0; }
function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/gu, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]); }
