const RELEASE = 'neptune-simple-client-journey-20260810-v92';
const $ = (selector, root = document) => root?.querySelector(selector) || null;
const $$ = (selector, root = document) => [...(root?.querySelectorAll(selector) || [])];
const cache = new Map();
let frame = 0;
let loading = '';
let currentData = null;
let agendaMode = 'filming';
let agendaMonth = null;

start();

function start() {
  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', boot, { once: true })
    : boot();
}

function boot() {
  document.body.dataset.simpleJourneyRelease = RELEASE;
  installDialogs();
  new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['open'] });
  window.addEventListener('hashchange', () => { cache.clear(); schedule(); });
  $('#refresh')?.addEventListener('click', () => { cache.clear(); setTimeout(schedule, 150); });
  schedule();
}

function schedule() {
  if (frame) return;
  frame = requestAnimationFrame(() => {
    frame = 0;
    enhance();
  });
}

async function enhance(force = false) {
  const dialog = $('#clientDialog');
  const root = $('#clientDetail');
  const orderId = hashOrderId();
  if (!dialog?.open || !root || !orderId) return;
  if (!force && root.dataset.simpleJourneyOwner === RELEASE && root.dataset.orderId === orderId) return;
  if (loading === orderId) return;
  loading = orderId;
  root.dataset.simpleJourneyOwner = RELEASE;
  root.dataset.orderId = orderId;
  root.innerHTML = loadingMarkup();
  try {
    const data = await load(orderId, force);
    if (!root.isConnected || !dialog.open || hashOrderId() !== orderId) return;
    currentData = data;
    render(root, data);
  } catch (error) {
    root.innerHTML = errorMarkup(errorLabel(error.message));
    $('[data-v92-retry]', root)?.addEventListener('click', () => enhance(true));
  } finally {
    if (loading === orderId) loading = '';
  }
}

async function load(orderId, force = false) {
  const cached = cache.get(orderId);
  if (!force && cached && Date.now() - cached.at < 30000) return cached.data;
  const data = await api('/api/admin/journey-v92/context', { orderId });
  cache.set(orderId, { at: Date.now(), data });
  return data;
}

function render(root, data) {
  const o = data.order;
  const stripe = data.stripe?.stripe || {};
  const payment = paymentStatus(o, stripe);
  const steps = buildSteps(data, payment);
  const completed = steps.filter((step) => ['done', 'done-muted'].includes(step.tone)).length;
  const active = steps.find((step) => !['done', 'done-muted'].includes(step.tone)) || steps.at(-1);

  root.className = 'v92-detail';
  root.innerHTML = `
    <header class="v92-header">
      <button type="button" class="v92-icon" data-v92-close aria-label="Fermer le dossier">×</button>
      <div class="v92-identity">
        <p class="v92-eyebrow">DOSSIER CLIENT · PASSAGE</p>
        <div class="v92-title-row">
          <h2>${esc(o.fullName || o.company || o.email)}</h2>
          ${data.siblings.length > 1 ? passageSwitcher(data) : ''}
        </div>
        <p>${esc(o.company || '')}${o.company ? ' · ' : ''}${esc(o.email)} · ${esc(o.title || 'Passage Neptune Media')}</p>
      </div>
      <div class="v92-header-actions">
        <button type="button" class="v92-secondary" data-v92-agenda="filming">Agenda global</button>
        <button type="button" class="v92-secondary" data-v92-refresh>Actualiser</button>
      </div>
    </header>
    <section class="v92-summary">
      <div><span>${completed}/8 étapes validées</span><strong>${esc(active?.headline || 'Parcours terminé')}</strong></div>
      <div class="v92-progress" aria-label="${completed} étapes sur 8"><i style="width:${Math.round(completed / 8 * 100)}%"></i></div>
    </section>
    <main class="v92-scroll" data-v92-scroll>
      <div class="v92-steps">${steps.map(stepMarkup).join('')}</div>
      <section class="v92-secondary-info">
        <details><summary>Informations techniques du passage</summary>${technicalInfo(data)}</details>
      </section>
      <p class="v92-message" data-v92-message aria-live="polite"></p>
    </main>`;
  bind(root, data);
  root.closest('.drawer-card')?.classList.add('v92-drawer-card');
  root.closest('#clientDialog')?.classList.add('v92-dialog');
}

function buildSteps(data, payment) {
  const o = data.order;
  const w = workflow(o);
  const now = Date.now();
  const appointment = date(o.appointmentAt);
  const filming = date(o.filmingAt);
  const filmed = isFilmed(o);
  const sourceReceived = Boolean(w.sourceReceivedAt || o.inventory?.hasSource);
  const editingStarted = date(w.editingStartedAt || w.sourceReceivedAt);
  const deliverablesReady = Boolean(o.inventory?.hasFinal && o.inventory?.hasShort);
  const prepMailSent = sent(data.messages, 'preparation_link');
  const reservationMailSent = sent(data.messages, 'reservation_link');

  const step1 = o.formatSelected
    ? step(1, 'Format', 'done', `Format sélectionné : ${o.format}`, 'Le format reste modifiable si le client change d’avis.', null, [action('Modifier', 'edit-format', 'secondary'), action('Renvoyer le lien', 'send_reservation_link', 'link')])
    : step(1, 'Format', 'current', 'Le client doit choisir son format', reservationMailSent ? 'Le lien de réservation a déjà été envoyé.' : 'Envoyez le lien de réservation Neptune Media.', action('Envoyer le lien de réservation', 'send_reservation_link'));

  let step2;
  if (payment.done) {
    step2 = step(2, 'Paiement', 'done', payment.headline, payment.detail, null, []);
  } else if (!o.formatSelected) {
    step2 = step(2, 'Paiement', 'pending', 'En attente du format', 'Le tarif sera proposé une fois le format sélectionné.');
  } else if (stripeState(data) === 'payment_found') {
    step2 = step(2, 'Paiement', 'current', 'Paiement Stripe trouvé', 'Neptune a trouvé un paiement correspondant à ce passage. Rattachez-le pour continuer.', action('Rattacher le paiement', 'reconcile-payment'));
  } else if (stripeState(data) === 'ambiguous') {
    step2 = step(2, 'Paiement', 'warning', 'Plusieurs paiements possibles', 'Neptune ne choisit jamais arbitrairement. Vérifiez Stripe puis actualisez.', action('Actualiser Stripe', 'refresh'));
  } else {
    const options = paymentOptions(data);
    step2 = step(2, 'Paiement', 'current', 'Paiement à envoyer', options.length ? 'Choisissez l’offre puis envoyez le lien Stripe en un clic.' : 'Aucun lien adapté n’a été trouvé automatiquement.', options.length ? action('Envoyer le lien de paiement', 'send-payment') : action('Actualiser Stripe', 'refresh'));
    step2.extra = options.length ? paymentSelect(options) : '';
  }

  let step3;
  if (!payment.done) {
    step3 = lockedStep(3, 'Date du passage', 'Paiement à valider avant la réservation du studio');
  } else if (filmed) {
    step3 = step(3, 'Date du passage', 'done', `Passage organisé · ${fmt(filming)}`, 'Le créneau studio a été confirmé et le tournage a eu lieu.');
  } else if (!filming) {
    const pref = data.preference?.status === 'submitted';
    step3 = step(3, 'Date du passage', 'current', pref ? 'Disponibilités reçues' : 'Date à organiser', pref ? preferenceText(data.preference) : 'Demandez au client ses disponibilités ou choisissez directement une date dans l’agenda.', pref ? action('Choisir la date', 'edit-filming') : action('Demander ses disponibilités', 'request_filming_preferences'), [action('Voir l’agenda', 'agenda-filming', 'secondary')]);
  } else if (w.supplierStatus === 'pending') {
    const overdue = o.supplierRelaunchAvailable;
    step3 = step(3, 'Date du passage', overdue ? 'warning' : 'current', `En attente du studio · ${fmt(filming)}`, overdue ? `Aucune confirmation depuis ${Math.floor(o.supplierWaitHours)} h. La relance est disponible.` : `Demande envoyée au studio. Relance disponible à partir de 48 h.`, overdue ? action('Relancer le studio', 'resend_supplier_confirmation') : null, [action('Voir l’agenda', 'agenda-filming', 'secondary')]);
  } else {
    const locked = o.dateLocked;
    step3 = step(3, 'Date du passage', 'done', `Date confirmée · ${fmt(filming)}`, locked ? 'À moins de 15 jours, le passage ne peut plus être déplacé ou annulé hors force majeure.' : 'Le créneau est confirmé. Il reste modifiable tant que le délai minimum de 15 jours est respecté.', null, locked ? [action('Force majeure', 'force-majeure', 'danger-link')] : [action('Modifier la date', 'edit-filming', 'secondary'), action('Voir l’agenda', 'agenda-filming', 'link')]);
  }

  let step4;
  if (!payment.done) {
    step4 = lockedStep(4, 'Préparation', 'Paiement à valider avant la préparation');
  } else if (w.preparationStatus === 'completed') {
    step4 = step(4, 'Préparation', 'done-muted', `Rendez-vous effectué · ${fmt(appointment)}`, 'La préparation est terminée.', null, [action('Voir les rendez-vous', 'agenda-preparation', 'link')]);
  } else if (appointment && appointment.getTime() <= now) {
    step4 = step(4, 'Préparation', 'current', `Rendez-vous passé · ${fmt(appointment)}`, 'Confirmez uniquement si la préparation a bien eu lieu.', action('Marquer effectué', 'preparation_completed'), [action('Modifier', 'edit-preparation', 'secondary')]);
  } else if (appointment) {
    step4 = step(4, 'Préparation', 'done', `Rendez-vous confirmé · ${fmt(appointment)}`, o.preparationUrl ? 'Le rendez-vous et le lien de réunion sont disponibles.' : 'Le créneau est enregistré.', o.preparationUrl ? action('Rejoindre la réunion', 'open-meeting') : null, [action('Modifier', 'edit-preparation', 'secondary'), action('Voir l’agenda', 'agenda-preparation', 'link')]);
  } else if (prepMailSent) {
    step4 = step(4, 'Préparation', 'current', 'Lien de prise de rendez-vous envoyé', 'Vérifiez Google Agenda pour détecter automatiquement le rendez-vous choisi par le client.', action('Vérifier Google Agenda', 'sync-preparation'), [action('Renvoyer le lien', 'send_preparation_link', 'secondary'), action('Choisir manuellement', 'edit-preparation', 'link')]);
  } else {
    step4 = step(4, 'Préparation', 'current', 'Rendez-vous à planifier', 'Envoyez le lien Google Appointment Scheduling au client.', action('Envoyer le lien de préparation', 'send_preparation_link'), [action('Ouvrir l’agenda', 'agenda-preparation', 'secondary')]);
  }

  let step5;
  if (!filming) {
    step5 = lockedStep(5, 'Passage', 'La date du passage doit d’abord être confirmée');
  } else if (filmed) {
    step5 = step(5, 'Passage', 'done', `Passage effectué · ${fmt(filming)}`, 'Le tournage est terminé. Les vidéos du fournisseur sont maintenant attendues.');
  } else if (filming.getTime() <= now) {
    step5 = step(5, 'Passage', 'current', `Créneau passé · ${fmt(filming)}`, 'Confirmez que le tournage a bien eu lieu.', action('Marquer le passage effectué', 'filming_completed'));
  } else {
    step5 = step(5, 'Passage', 'current', `Prévu le ${fmt(filming)}`, 'Les rappels automatiques et les informations utiles sont visibles ci-dessous.');
  }
  step5.extra = passageDetail(data);

  let step6;
  if (!filmed && !sourceReceived) {
    step6 = lockedStep(6, 'Réception des vidéos', 'Le passage doit être effectué avant la réception des vidéos');
  } else if (sourceReceived) {
    step6 = step(6, 'Réception des vidéos', 'done', `Vidéos reçues · ${fmt(date(w.sourceReceivedAt) || latestSourceDate(data))}`, o.sourceMailSent ? 'Le client a été informé de la réception.' : 'Les fichiers sont détectés. Vous pouvez maintenant informer le client.', o.sourceMailSent ? null : action('Informer le client', 'send_sources_received'));
  } else {
    step6 = step(6, 'Réception des vidéos', 'current', deadlineHeadline(w.sourceDeliveryDueAt, 'Vidéos fournisseur'), deadlineDetail(w.sourceDeliveryDueAt, '7 jours après le passage'), action('Actualiser le Drive', 'refresh'), [action('Marquer reçues manuellement', 'source_received', 'secondary')]);
  }

  let step7;
  if (deliverablesReady) {
    step7 = step(7, 'Montage', 'done', 'Livrables détectés dans le Drive', `${Number(o.inventory.finalCount || 0)} long format · ${Number(o.inventory.shortCount || 0)} contenu(s) court(s).`);
  } else if (editingStarted || sourceReceived) {
    const due = w.deliveryDueAt || (editingStarted ? new Date(addDays(editingStarted, 7)).toISOString() : null);
    step7 = step(7, 'Montage', 'current', deadlineHeadline(due, 'Montage en cours'), deadlineDetail(due, '7 jours après réception des vidéos'), action('Actualiser le Drive', 'refresh'));
  } else {
    step7 = lockedStep(7, 'Montage', 'Les vidéos du fournisseur doivent d’abord être réceptionnées');
  }

  const allCoreDone = o.formatSelected && payment.done && Boolean(filmed) && Boolean(sourceReceived) && deliverablesReady && w.preparationStatus === 'completed';
  const step8 = allCoreDone
    ? step(8, 'Terminé', 'done', 'Passage terminé', 'Toutes les étapes opérationnelles sont validées. Les livrables sont disponibles pour ce passage.')
    : step(8, 'Terminé', 'pending', 'Processus en cours', 'Cette étape devient verte automatiquement lorsque les étapes précédentes sont terminées.');

  return [step1, step2, step3, step4, step5, step6, step7, step8];
}

function bind(root) {
  $('[data-v92-close]', root)?.addEventListener('click', () => $('#clientDialog')?.close());
  $('[data-v92-refresh]', root)?.addEventListener('click', () => refreshCurrent());
  $('[data-v92-passage]', root)?.addEventListener('change', (event) => switchPassage(event.target.value));
  $$('[data-v92-agenda]', root).forEach((button) => button.addEventListener('click', () => openAgenda(button.dataset.v92Agenda)));
  root.addEventListener('click', onAction);
}

async function onAction(event) {
  const button = event.target.closest('[data-v92-action]');
  if (!button || button.disabled) return;
  const actionName = button.dataset.v92Action;
  if (actionName === 'refresh') return refreshCurrent();
  if (actionName === 'agenda-filming') return openAgenda('filming');
  if (actionName === 'agenda-preparation') return openAgenda('preparation');
  if (actionName === 'edit-format') return openFormatEditor();
  if (actionName === 'edit-filming') return openFilmingEditor();
  if (actionName === 'edit-preparation') return openPreparationEditor();
  if (actionName === 'force-majeure') return openForceMajeure();
  if (actionName === 'open-meeting') {
    const url = safeUrl(currentData?.order?.preparationUrl);
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
    return;
  }
  if (actionName === 'send-payment') return sendPayment(button);
  if (actionName === 'reconcile-payment') return reconcilePayment(button);
  if (actionName === 'sync-preparation') return syncPreparation(button);
  await runAction(actionName, button);
}

async function runAction(actionName, button, extra = {}) {
  const orderId = currentData?.order?.id;
  if (!orderId) return;
  const original = button?.textContent || '';
  setBusy(button, true, 'Envoi…');
  message('Traitement en cours…');
  try {
    const result = await api('/api/admin/journey-v92/action', { orderId, action: actionName, ...extra });
    const delivery = result.emailDelivery;
    if (delivery?.failed) message(`Action enregistrée. ${delivery.failed} e-mail devra être réessayé.`, true);
    else if (result.delivery?.suppressed) message('L’e-mail est volontairement différé pour éviter plusieurs messages à la suite.');
    else message(successText(actionName));
    await refreshCurrent(true);
  } catch (error) {
    message(errorLabel(error.message), true);
    setBusy(button, false, original);
  }
}

async function sendPayment(button) {
  const select = $('[data-v92-payment-select]');
  const option = select?.selectedOptions?.[0];
  if (!option?.value) return message('Choisissez une offre Stripe.', true);
  await runAction('send_payment_link', button, { paymentUrl: option.value, paymentName: option.dataset.name || option.textContent });
}

async function reconcilePayment(button) {
  const orderId = currentData?.order?.id;
  setBusy(button, true, 'Vérification…');
  try {
    const result = await api('/api/admin/stripe/reconcile', { orderId });
    if (result.applied || result.stripe?.state === 'paid_verified') message('Paiement Stripe rattaché au passage.');
    else message('Aucun paiement unique n’a pu être rattaché automatiquement.', true);
    await refreshCurrent(true);
  } catch (error) {
    message(errorLabel(error.message), true);
    setBusy(button, false, 'Rattacher le paiement');
  }
}

async function syncPreparation(button) {
  const orderId = currentData?.order?.id;
  setBusy(button, true, 'Vérification…');
  try {
    const result = await api('/api/admin/journey-v92/preparation-sync', { orderId });
    if (result.state === 'synced' || result.state === 'already_synced') message('Rendez-vous Google Agenda synchronisé.');
    else if (result.state === 'ambiguous') message('Plusieurs rendez-vous correspondent à ce client. Choisissez la date manuellement pour éviter une erreur.', true);
    else message('Aucun nouveau rendez-vous n’a encore été trouvé dans Google Agenda.');
    await refreshCurrent(true);
  } catch (error) {
    message(errorLabel(error.message), true);
    setBusy(button, false, 'Vérifier Google Agenda');
  }
}

async function refreshCurrent(silent = false) {
  const orderId = currentData?.order?.id || hashOrderId();
  if (!orderId) return;
  cache.delete(orderId);
  if (!silent) message('Actualisation des sources de vérité…');
  const root = $('#clientDetail');
  if (root) root.dataset.simpleJourneyOwner = '';
  await enhance(true);
}

function openFormatEditor() {
  const o = currentData.order;
  openActionDialog('Modifier le format', `
    <label class="v92-field"><span>Format du passage</span><select data-v92-edit-format>
      ${['Hors Norme', 'Concept Libre', 'Sur mesure'].map((value) => `<option ${normalize(value) === normalize(o.format) ? 'selected' : ''}>${esc(value)}</option>`).join('')}
    </select></label>
    <p class="v92-dialog-note">Si le format change après un paiement, vérifiez de nouveau l’étape Paiement avant de poursuivre.</p>`, 'Enregistrer', async () => {
      const format = $('[data-v92-edit-format]', $('#v92ActionDialog'))?.value;
      await modalAction('set_format', { format });
    });
}

function openFilmingEditor() {
  const o = currentData.order;
  if (o.dateLocked) return openForceMajeure();
  openActionDialog('Choisir ou modifier la date du passage', `
    <p class="v92-dialog-note">Les passages de tous les clients sont visibles dans l’agenda. Pour Hors Norme, la date choisie est ensuite envoyée au studio pour confirmation.</p>
    <button type="button" class="v92-secondary v92-inline" data-v92-open-global-filming>Voir l’agenda de tous les passages</button>
    <label class="v92-field"><span>Date et heure du passage</span><input type="datetime-local" data-v92-edit-filming value="${localValue(o.filmingAt)}"></label>`, 'Enregistrer la date', async () => {
      const filmingAt = $('[data-v92-edit-filming]', $('#v92ActionDialog'))?.value;
      if (!filmingAt) throw new Error('filming_date_invalid');
      await modalAction('set_filming_date', { filmingAt: new Date(filmingAt).toISOString() });
    });
  $('[data-v92-open-global-filming]', $('#v92ActionDialog'))?.addEventListener('click', () => openAgenda('filming'));
}

function openPreparationEditor() {
  const o = currentData.order;
  openActionDialog('Rendez-vous de préparation', `
    <div class="v92-scheduler-wrap"><iframe src="https://calendar.google.com/calendar/appointments/schedules/AcZssZ0Zxy57HrKj43TqUhbv9bMsGMbkgyg1MnuGdxFhb3W_LcNr2SqGtfO0AR8noAdLDwlnSqriORjU?gv=true" title="Prise de rendez-vous Neptune Media" loading="lazy"></iframe></div>
    <div class="v92-dialog-separator"><span>ou renseigner manuellement</span></div>
    <label class="v92-field"><span>Date et heure de préparation</span><input type="datetime-local" data-v92-edit-preparation value="${localValue(o.appointmentAt)}"></label>
    <p class="v92-dialog-note">Une saisie manuelle crée ou met à jour l’événement Google Agenda + Meet lorsque l’accès Agenda est disponible.</p>`, 'Enregistrer manuellement', async () => {
      const appointmentAt = $('[data-v92-edit-preparation]', $('#v92ActionDialog'))?.value;
      if (!appointmentAt) throw new Error('appointment_invalid');
      await modalAction('set_appointment', { appointmentAt: new Date(appointmentAt).toISOString(), createCalendar: true });
    });
}

function openForceMajeure() {
  const o = currentData.order;
  openActionDialog('Report exceptionnel · Force majeure', `
    <div class="v92-warning-box"><strong>Le passage est à moins de 15 jours.</strong><p>Une modification ou une annulation normale n’est plus autorisée. Cette action est réservée à un cas de force majeure et prévient le studio fournisseur.</p></div>
    <p>Créneau actuel : <strong>${esc(fmt(date(o.filmingAt)))}</strong></p>
    <label class="v92-field"><span>Motif de force majeure *</span><textarea rows="5" maxlength="1200" data-v92-force-note placeholder="Expliquez précisément la raison du report…"></textarea></label>`, 'Demander le report au studio', async () => {
      const note = $('[data-v92-force-note]', $('#v92ActionDialog'))?.value?.trim();
      if (!note) throw new Error('force_majeure_reason_required');
      await modalAction('force_majeure_reschedule', { note });
    }, 'danger');
}

async function modalAction(actionName, extra) {
  const dialog = $('#v92ActionDialog');
  const button = $('[data-v92-dialog-submit]', dialog);
  setBusy(button, true, 'Enregistrement…');
  try {
    await api('/api/admin/journey-v92/action', { orderId: currentData.order.id, action: actionName, ...extra });
    dialog.close();
    message(successText(actionName));
    await refreshCurrent(true);
  } catch (error) {
    const box = $('[data-v92-dialog-message]', dialog);
    if (box) { box.textContent = errorLabel(error.message); box.classList.add('is-error'); }
    setBusy(button, false, button.dataset.originalLabel || 'Enregistrer');
    throw error;
  }
}

function openAgenda(mode = 'filming') {
  agendaMode = mode === 'preparation' ? 'preparation' : 'filming';
  const events = agendaEvents(currentData, agendaMode);
  const basis = events.find((item) => item.date >= new Date())?.date || events[0]?.date || new Date();
  if (!agendaMonth || agendaMonth.getFullYear() !== basis.getFullYear() || agendaMonth.getMonth() !== basis.getMonth()) agendaMonth = new Date(basis.getFullYear(), basis.getMonth(), 1);
  renderAgenda();
  $('#v92AgendaDialog')?.showModal();
}

function renderAgenda() {
  const dialog = $('#v92AgendaDialog');
  if (!dialog || !currentData) return;
  const events = agendaEvents(currentData, agendaMode);
  const month = agendaMonth || new Date();
  const inMonth = events.filter((item) => sameMonth(item.date, month));
  $('#v92AgendaTitle', dialog).textContent = agendaMode === 'filming' ? 'Agenda de tous les passages' : 'Agenda des préparations';
  $('#v92AgendaSubtitle', dialog).textContent = `${monthName(month)} · ${inMonth.length} rendez-vous`;
  const monthLabelNode = $('[data-v92-month-label]', dialog);
  if (monthLabelNode) monthLabelNode.textContent = monthName(month);
  const grid = $('#v92AgendaGrid', dialog);
  if (grid) grid.innerHTML = calendarGrid(month, inMonth);
  const list = $('#v92AgendaList', dialog);
  if (list) list.innerHTML = events.length ? events.map(agendaListItem).join('') : '<p class="v92-empty">Aucun rendez-vous enregistré.</p>';
  $$('[data-v92-agenda-order]', dialog).forEach((button) => button.addEventListener('click', () => { dialog.close(); switchPassage(button.dataset.v92AgendaOrder); }));
  $$('[data-v92-agenda-mode]', dialog).forEach((button) => {
    button.classList.toggle('active', button.dataset.v92AgendaMode === agendaMode);
    button.onclick = () => { agendaMode = button.dataset.v92AgendaMode; agendaMonth = null; renderAgenda(); };
  });
}

function installDialogs() {
  if (!$('#v92AgendaDialog')) {
    const dialog = document.createElement('dialog');
    dialog.id = 'v92AgendaDialog';
    dialog.className = 'v92-modal v92-agenda-dialog';
    dialog.innerHTML = `<section class="v92-modal-card"><header><div><p class="v92-eyebrow">VUE GLOBALE</p><h2 id="v92AgendaTitle">Agenda</h2><p id="v92AgendaSubtitle"></p></div><button type="button" class="v92-icon" data-v92-agenda-close>×</button></header><div class="v92-agenda-tabs"><button type="button" data-v92-agenda-mode="filming">Passages</button><button type="button" data-v92-agenda-mode="preparation">Préparations</button></div><div class="v92-agenda-toolbar"><button type="button" data-v92-month="prev">‹</button><strong data-v92-month-label></strong><button type="button" data-v92-month="next">›</button></div><div id="v92AgendaGrid" class="v92-agenda-grid"></div><div id="v92AgendaList" class="v92-agenda-list"></div></section>`;
    document.body.append(dialog);
    $('[data-v92-agenda-close]', dialog).onclick = () => dialog.close();
    $$('[data-v92-month]', dialog).forEach((button) => button.onclick = () => {
      agendaMonth = new Date(agendaMonth.getFullYear(), agendaMonth.getMonth() + (button.dataset.v92Month === 'next' ? 1 : -1), 1);
      renderAgenda();
    });
  }
  if (!$('#v92ActionDialog')) {
    const dialog = document.createElement('dialog');
    dialog.id = 'v92ActionDialog';
    dialog.className = 'v92-modal v92-action-dialog';
    document.body.append(dialog);
  }
}

function openActionDialog(title, content, submitLabel, submit, tone = '') {
  const dialog = $('#v92ActionDialog');
  dialog.innerHTML = `<form method="dialog" class="v92-modal-card ${tone === 'danger' ? 'is-danger' : ''}" data-v92-action-form><header><div><p class="v92-eyebrow">ACTION SUR CE PASSAGE</p><h2>${esc(title)}</h2></div><button type="button" class="v92-icon" data-v92-action-close>×</button></header><div class="v92-modal-body">${content}<p class="v92-dialog-message" data-v92-dialog-message></p></div><footer><button type="button" class="v92-secondary" data-v92-action-cancel>Annuler</button><button type="button" class="v92-primary ${tone === 'danger' ? 'danger' : ''}" data-v92-dialog-submit data-original-label="${esc(submitLabel)}">${esc(submitLabel)}</button></footer></form>`;
  $('[data-v92-action-close]', dialog).onclick = () => dialog.close();
  $('[data-v92-action-cancel]', dialog).onclick = () => dialog.close();
  $('[data-v92-dialog-submit]', dialog).onclick = async () => { try { await submit(); } catch {} };
  dialog.showModal();
}

function step(number, title, tone, headline, detail, primary = null, secondary = []) {
  return { number, title, tone, headline, detail, primary, secondary, extra: '' };
}
function lockedStep(number, title, detail) { return step(number, title, 'pending', 'En attente', detail); }
function action(label, name, style = 'primary') { return { label, name, style }; }

function stepMarkup(step) {
  const state = ({ done: 'Validé', 'done-muted': 'Effectué', current: 'À faire', warning: 'À surveiller', pending: 'En attente' })[step.tone] || '';
  const buttons = [step.primary, ...(step.secondary || [])].filter(Boolean).map(actionButton).join('');
  return `<article class="v92-step is-${step.tone}"><div class="v92-step-marker"><span>${step.number}</span><i>✓</i></div><div class="v92-step-copy"><div class="v92-step-title"><h3>${esc(step.title)}</h3><span>${esc(state)}</span></div><strong>${esc(step.headline)}</strong><p>${esc(step.detail)}</p>${step.extra || ''}</div><div class="v92-step-actions">${buttons || '<small>Aucune action nécessaire</small>'}</div></article>`;
}

function actionButton(item) {
  const cls = item.style === 'primary' ? 'v92-primary' : item.style === 'secondary' ? 'v92-secondary' : item.style === 'danger-link' ? 'v92-text danger' : 'v92-text';
  return `<button type="button" class="${cls}" data-v92-action="${esc(item.name)}">${esc(item.label)}</button>`;
}

function passageSwitcher(data) {
  return `<label class="v92-passage-switch"><span>Passage</span><select data-v92-passage>${data.siblings.map((item, index) => `<option value="${esc(item.id)}" ${item.id === data.order.id ? 'selected' : ''}>${esc(passageLabel(item, data.siblings.length - index))}</option>`).join('')}</select></label>`;
}

function passageLabel(item, number) {
  const d = date(item.filmingAt);
  return `${d ? shortDate(d) : `#${number}`} · ${item.format || item.title || 'Passage'}`;
}

function paymentStatus(order, stripe) {
  const state = String(stripe.state || 'unconfigured');
  if (state === 'not_required') return { done: true, headline: 'Aucun paiement requis', detail: 'Le passage peut continuer sans règlement.' };
  if (state === 'paid_verified') return { done: true, headline: `Paiement Stripe vérifié${order.amountTotal ? ` · ${money(order.amountTotal, order.currency)}` : ''}`, detail: 'Le paiement est rattaché à ce passage précis.' };
  return { done: false, headline: 'Paiement à vérifier', detail: 'Aucun paiement Stripe vérifié n’est encore rattaché à ce passage.' };
}

function paymentOptions(data) {
  const live = Array.isArray(data.stripe?.stripe?.options) ? data.stripe.stripe.options.map((item) => ({
    id: item.id, url: item.url, name: item.description || 'Paiement Stripe', amountTotal: item.amountTotal, currency: item.currency, recommended: item.recommended, source: 'stripe', score: item.score || 0,
  })) : [];
  const fallback = Array.isArray(data.fallbackPaymentLinks) ? data.fallbackPaymentLinks : [];
  const byBase = new Map();
  for (const item of [...live, ...fallback]) {
    const key = baseStripeUrl(item.url);
    if (!key || byBase.has(key)) continue;
    byBase.set(key, item);
  }
  return [...byBase.values()].sort((a, b) => Number(b.recommended) - Number(a.recommended) || Number(b.score || 0) - Number(a.score || 0));
}

function paymentSelect(options) {
  return `<label class="v92-inline-select"><span>Offre à envoyer</span><select data-v92-payment-select>${options.map((item) => `<option value="${esc(item.url)}" data-name="${esc(item.name || item.description || 'Offre Stripe')}" ${item.recommended ? 'selected' : ''}>${esc(item.name || item.description || 'Offre Stripe')}${item.amountTotal ? ` · ${esc(money(item.amountTotal, item.currency))}` : ''}${item.recommended ? ' · recommandé' : ''}</option>`).join('')}</select></label>`;
}

function passageDetail(data) {
  const o = data.order;
  const reminders = data.messages.filter((item) => /reminder_(7d|3d|1d)|filming_reminder|passage_reminder/iu.test(item.messageKey || '')).slice(0, 6);
  const pref = data.preference?.preferences;
  const info = [];
  if (pref?.dates?.length) info.push(`Disponibilités communiquées : ${pref.dates.map((value) => fmt(date(value))).join(' · ')}`);
  if (o.supplierNote) info.push(`Note studio : ${o.supplierNote}`);
  return `<div class="v92-passage-detail"><div><small>CLIENT</small><span>${esc(o.fullName || '—')} · ${esc(o.email)}</span></div><div><small>INFOS / COMMENTAIRES</small><span>${esc(info.join(' · ') || 'Aucune information complémentaire enregistrée.')}</span></div><div class="v92-reminders"><small>RAPPELS E-MAIL</small>${reminders.length ? reminders.map(reminderChip).join('') : '<span class="v92-muted">Les rappels J-7, J-3 et J-1 apparaîtront ici lorsqu’ils seront programmés.</span>'}</div></div>`;
}

function reminderChip(item) {
  const label = /7d/u.test(item.messageKey) ? 'J-7' : /3d/u.test(item.messageKey) ? 'J-3' : /1d/u.test(item.messageKey) ? 'J-1' : 'Rappel';
  const state = item.status === 'sent' ? 'envoyé' : item.status === 'pending' ? `prévu ${shortDateTime(item.scheduledAt)}` : item.status;
  return `<span class="v92-reminder ${item.status === 'sent' ? 'sent' : ''}"><b>${label}</b>${esc(state || '')}</span>`;
}

function technicalInfo(data) {
  const o = data.order;
  return `<div class="v92-tech-grid"><div><span>Référence passage</span><strong>${esc(o.orderReference || o.id)}</strong></div><div><span>Statut interne</span><strong>${esc(o.status || '—')}</strong></div><div><span>Studio</span><strong>${esc(o.supplierName || '—')}</strong></div><div><span>Source paiement</span><strong>Stripe</strong></div><div><span>Sources Drive</span><strong>${Number(o.inventory?.sourceCount || 0)}</strong></div><div><span>Livrables</span><strong>${Number(o.inventory?.finalCount || 0)} long · ${Number(o.inventory?.shortCount || 0)} court(s)</strong></div></div>`;
}

function agendaEvents(data, mode) {
  const field = mode === 'preparation' ? 'appointmentAt' : 'filmingAt';
  return (data?.agenda || []).map((item) => ({ ...item, date: date(item[field]) })).filter((item) => item.date).sort((a, b) => a.date - b.date);
}

function calendarGrid(month, events) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const last = new Date(month.getFullYear(), month.getMonth() + 1, 0);
  const offset = (first.getDay() + 6) % 7;
  const cells = [];
  for (let i = 0; i < offset; i += 1) cells.push('<div class="v92-day is-empty"></div>');
  for (let day = 1; day <= last.getDate(); day += 1) {
    const d = new Date(month.getFullYear(), month.getMonth(), day);
    const items = events.filter((item) => sameDay(item.date, d));
    cells.push(`<div class="v92-day ${sameDay(d, new Date()) ? 'is-today' : ''}"><b>${day}</b><div>${items.slice(0, 4).map((item) => `<button type="button" data-v92-agenda-order="${esc(item.orderId)}"><strong>${esc(item.fullName || item.company || item.email)}</strong><small>${time(item.date)} · ${esc(item.format || '')}</small></button>`).join('')}</div>${items.length > 4 ? `<small>+${items.length - 4} autre(s)</small>` : ''}</div>`);
  }
  return `<div class="v92-weekdays">${['Lun','Mar','Mer','Jeu','Ven','Sam','Dim'].map((d) => `<span>${d}</span>`).join('')}</div><div class="v92-days">${cells.join('')}</div>`;
}

function agendaListItem(item) {
  return `<button type="button" data-v92-agenda-order="${esc(item.orderId)}"><time>${esc(shortDateTime(item.date))}</time><span><strong>${esc(item.fullName || item.company || item.email)}</strong><small>${esc(item.format || '')} · ${esc(item.company || '')}</small></span></button>`;
}

function switchPassage(orderId) {
  if (!orderId || orderId === currentData?.order?.id) return;
  const search = $('#search');
  if (search?.value) { search.value = ''; search.dispatchEvent(new Event('input', { bubbles: true })); }
  setTimeout(() => {
    const card = $(`[data-order-card="${cssEscape(orderId)}"]`);
    if (card) card.click();
    else location.href = `/studio/clients#${encodeURIComponent(orderId)}`;
  }, 30);
}

function message(text, error = false) {
  const node = $('[data-v92-message]');
  if (!node) return;
  node.textContent = text || '';
  node.classList.toggle('is-error', error);
}

function setBusy(button, busy, text) {
  if (!button) return;
  button.disabled = busy;
  if (text) button.textContent = text;
}

function successText(actionName) {
  return ({
    send_reservation_link: 'Lien de réservation envoyé.',
    send_payment_link: 'Lien de paiement envoyé.',
    request_filming_preferences: 'Demande de disponibilités envoyée au client.',
    resend_supplier_confirmation: 'Relance envoyée au studio.',
    send_preparation_link: 'Lien de préparation envoyé.',
    preparation_completed: 'Préparation marquée comme effectuée.',
    filming_completed: 'Passage marqué comme effectué.',
    source_received: 'Réception des vidéos enregistrée.',
    send_sources_received: 'Confirmation de réception envoyée au client.',
    set_format: 'Format mis à jour.',
    set_filming_date: 'Date du passage mise à jour.',
    set_appointment: 'Rendez-vous de préparation mis à jour.',
    force_majeure_reschedule: 'Demande exceptionnelle de report envoyée au studio.',
  })[actionName] || 'Action enregistrée.';
}

function errorLabel(code) {
  return ({
    unauthorized: 'Votre session Studio a expiré.',
    csrf_failed: 'La session de sécurité doit être actualisée. Rechargez la page.',
    payment_not_verified: 'Le paiement Stripe doit être vérifié avant cette étape.',
    supplier_relaunch_too_early: 'La relance fournisseur sera disponible après 48 heures.',
    date_change_locked_15_days: 'Cette date est à moins de 15 jours : seule une force majeure permet un report.',
    normal_reschedule_available: 'La date est encore à plus de 15 jours : utilisez la modification normale.',
    force_majeure_reason_required: 'Renseignez le motif de force majeure.',
    filming_date_invalid: 'Choisissez une date de passage valide dans le futur.',
    appointment_invalid: 'Choisissez une date de préparation valide.',
    appointment_after_filming: 'La préparation doit avoir lieu avant le passage.',
    filming_before_preparation: 'Le passage doit avoir lieu après la préparation.',
    preparation_not_due: 'Le rendez-vous de préparation n’est pas encore passé.',
    filming_not_due: 'Le passage n’est pas encore passé.',
    sources_not_received: 'Aucune vidéo source n’est encore détectée.',
    invalid_payment_link: 'Le lien Stripe sélectionné est invalide.',
    calendar_access_missing: 'La connexion Google Agenda doit être réautorisée.',
    calendar_sync_failed: 'Google Agenda n’a pas pu être synchronisé.',
    stripe_target_failed: 'Impossible de lire le statut Stripe de ce passage.',
    simple_journey_context_failed: 'Impossible de charger le parcours de ce passage.',
  })[code] || String(code || 'Une erreur est survenue.').replace(/^http_/u, 'Erreur HTTP ');
}

async function api(path, payload = {}) {
  const csrf = sessionStorage.getItem('neptune_csrf') || '';
  const response = await fetch(path, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...(csrf ? { 'X-CSRF-Token': csrf } : {}) },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `http_${response.status}`);
  return data;
}

function stripeState(data) { return String(data.stripe?.stripe?.state || 'unconfigured'); }
function workflow(order) { return {
  supplierStatus: order.supplierStatus || '', preparationStatus: order.preparationStatus || '', sourceReceivedAt: order.sourceReceivedAt || null,
  sourceDeliveryDueAt: order.sourceDeliveryDueAt || null, sourceQcStatus: order.sourceQcStatus || '', editingStartedAt: order.editingStartedAt || null,
  deliveryDueAt: order.deliveryDueAt || null, deliveredAt: order.deliveredAt || null,
}; }
function sent(messages, part) { return (messages || []).some((item) => String(item.messageKey || '').includes(part) && item.status === 'sent'); }
function preferenceText(preference) { const dates = preference?.preferences?.dates || []; return dates.length ? `Le client a proposé ${dates.length} créneau(x) : ${dates.slice(0, 3).map((value) => fmt(date(value))).join(' · ')}.` : 'Le client a transmis ses disponibilités.'; }
function isFilmed(order) { return ['filmed','videos_pending','videos_received','editing','approval','delivered','completed'].includes(String(order.status || '')) || Boolean(order.sourceReceivedAt || order.editingStartedAt || order.deliveredAt); }
function latestSourceDate(data) { return date(data.order?.sourceReceivedAt) || null; }
function deadlineHeadline(value, label) { const d = date(value); if (!d) return label; const days = daysRemaining(d); return days < 0 ? `${label} · en retard de ${Math.abs(days)} j` : days === 0 ? `${label} · échéance aujourd’hui` : `${label} · ${days} j restant${days > 1 ? 's' : ''}`; }
function deadlineDetail(value, fallback) { const d = date(value); return d ? `Échéance : ${fmt(d)}.` : fallback; }
function daysRemaining(d) { return Math.ceil((d.getTime() - Date.now()) / 86400000); }
function addDays(d, n) { return new Date(d.getTime() + n * 86400000); }
function hashOrderId() { return decodeURIComponent(location.hash.slice(1)).trim(); }
function date(value) { if (!value) return null; const d = value instanceof Date ? value : new Date(value); return Number.isNaN(d.getTime()) ? null : d; }
function fmt(d) { return d ? new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Paris' }).format(d) : 'À définir'; }
function shortDate(d) { return d ? new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Europe/Paris' }).format(d) : '—'; }
function shortDateTime(value) { const d = date(value); return d ? new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' }).format(d) : '—'; }
function time(d) { return new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' }).format(d); }
function money(cents, currency = 'eur') { return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: String(currency || 'eur').toUpperCase() }).format(Number(cents || 0) / 100); }
function localValue(value) { const d = date(value); if (!d) return ''; const parts = new Intl.DateTimeFormat('sv-SE', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Europe/Paris' }).formatToParts(d); const map = Object.fromEntries(parts.map((p) => [p.type, p.value])); return `${map.year}-${map.month}-${map.day}T${map.hour}:${map.minute}`; }
function safeUrl(value) { try { const url = new URL(String(value || ''), location.origin); return ['https:','http:'].includes(url.protocol) ? url.toString() : ''; } catch { return ''; } }
function baseStripeUrl(value) { try { const u = new URL(value); return `${u.origin}${u.pathname}`; } catch { return ''; } }
function normalize(value) { return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/gu, '').toLowerCase().replace(/[^a-z0-9]+/gu, ''); }
function sameMonth(a, b) { return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth(); }
function sameDay(a, b) { return sameMonth(a, b) && a.getDate() === b.getDate(); }
function monthName(d) { return new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' }).format(d); }
function cssEscape(value) { return window.CSS?.escape ? CSS.escape(value) : String(value).replace(/["\\]/gu, '\\$&'); }
function esc(value) { return String(value ?? '').replace(/[&<>"']/gu, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]); }
function loadingMarkup() { return '<section class="v92-loading"><span></span><strong>Lecture du passage…</strong><p>Stripe, Agenda, studio et Drive sont vérifiés.</p></section>'; }
function errorMarkup(text) { return `<section class="v92-loading is-error"><strong>Impossible de charger ce passage</strong><p>${esc(text)}</p><button type="button" class="v92-primary" data-v92-retry>Réessayer</button></section>`; }
