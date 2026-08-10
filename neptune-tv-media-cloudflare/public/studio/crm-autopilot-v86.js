const RELEASE = 'neptune-studio-crm-autopilot-20260810-v86';
const $ = (selector, root = document) => root.querySelector(selector);
let snapshot = { contacts: [], pipeline: {} };
let refreshTimer = 0;

// Registered before v85 by entry-v26 so this handler owns Nouveau passage.
document.addEventListener('submit', interceptNewPassage, true);
document.readyState === 'loading'
  ? document.addEventListener('DOMContentLoaded', boot, { once: true })
  : boot();

function boot() {
  document.body.dataset.crmAutopilotRelease = RELEASE;
  mountCrm();
  enhanceNewPassage();
  loadCrm();
  new MutationObserver(scheduleEnhance).observe(document.body, { childList: true, subtree: true });
  $('#refresh')?.addEventListener('click', () => setTimeout(loadCrm, 250));
}

function scheduleEnhance() {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(enhanceNewPassage, 70);
}

function mountCrm() {
  if ($('#crmAutopilotV86')) return;
  const hero = $('.clients-hero');
  if (!hero) return;
  hero.insertAdjacentHTML('afterend', `
    <section id="crmAutopilotV86" class="crm-v86" aria-labelledby="crmV86Title">
      <header class="crm-v86__head">
        <div><p class="eyebrow">CRM NEPTUNE</p><h2 id="crmV86Title">À convertir et à organiser</h2><p>Neptune affiche uniquement la prochaine action utile. Aucun e-mail à rédiger.</p></div>
        <button class="crm-v86__refresh" type="button" data-crm-refresh aria-label="Actualiser le CRM">↻</button>
      </header>
      <div class="crm-v86__stages" data-crm-stages></div>
      <div class="crm-v86__list" data-crm-list aria-live="polite"><p class="crm-v86__empty">Chargement du parcours commercial…</p></div>
    </section>`);
  $('[data-crm-refresh]')?.addEventListener('click', loadCrm);
  $('[data-crm-list]')?.addEventListener('click', handleCrmClick);
}

async function loadCrm() {
  const list = $('[data-crm-list]');
  try {
    snapshot = await api('/api/admin/crm-v86');
    renderStages();
    renderCrm();
    enhanceNewPassage();
  } catch (error) {
    if (list) list.innerHTML = `<p class="crm-v86__empty crm-v86__empty--error">Impossible de charger le CRM. ${e(errorLabel(error.message))}</p>`;
  }
}

function renderStages() {
  const p = snapshot.pipeline || {};
  const node = $('[data-crm-stages]');
  if (!node) return;
  node.innerHTML = [
    ['À convertir', p.toConvert || 0],
    ['Paiement', p.payment || 0],
    ['Préparation', p.preparation || 0],
    ['Passage', p.filming || 0],
    ['Confirmé', p.ready || 0],
  ].map(([label, count]) => `<span><b>${count}</b>${e(label)}</span>`).join('');
}

function renderCrm() {
  const list = $('[data-crm-list]');
  if (!list) return;
  const contacts = (snapshot.contacts || []).filter((item) => ['to_convert', 'payment_pending', 'preparation_pending', 'filming_pending'].includes(item.stage));
  if (!contacts.length) {
    list.innerHTML = '<p class="crm-v86__empty">Rien à traiter. Les dossiers en cours avancent normalement.</p>';
    return;
  }
  list.innerHTML = contacts.slice(0, 18).map(contactCard).join('');
}

function contactCard(contact) {
  const order = contact.order || {};
  const opportunity = contact.opportunity || {};
  const preference = contact.preference || {};
  let action = '';
  if (contact.recommendedAction === 'create_passage') {
    action = `<button class="button crm-v86__action" data-crm-create="${e(contact.id)}">Créer un passage</button>`;
  } else if (contact.recommendedAction === 'payment') {
    action = `<button class="button crm-v86__action" data-crm-action="payment" data-client-id="${e(contact.id)}" data-opportunity-id="${e(opportunity.id || '')}">Envoyer le paiement</button>`;
  } else if (contact.recommendedAction === 'preparation') {
    action = `<button class="button crm-v86__action" data-crm-action="preparation" data-client-id="${e(contact.id)}" data-order-id="${e(order.id || '')}">Demander la préparation</button>`;
  } else if (contact.recommendedAction === 'filming_preferences') {
    action = `<button class="button crm-v86__action" data-crm-action="filming_preferences" data-client-id="${e(contact.id)}" data-order-id="${e(order.id || '')}">Demander les disponibilités</button>`;
  } else if (contact.recommendedAction === 'apply_preference' && Array.isArray(preference.preferences)) {
    action = `<div class="crm-v86__choices">${preference.preferences.map((value, index) => `<button type="button" data-apply-preference="${e(preference.id)}" data-choice-index="${index}"><small>Choix ${index + 1}</small><b>${e(formatDate(value))}</b></button>`).join('')}</div>`;
  }
  const detail = contact.stage === 'payment_pending'
    ? `${e(opportunity.format || 'Passage Neptune Media')} · ${e(money(opportunity.amountTotal || order.amountTotal, opportunity.currency || order.currency))}`
    : contact.stage === 'preparation_pending'
      ? e(order.format || 'Passage Neptune Media')
      : contact.stage === 'filming_pending'
        ? (preference.status === 'submitted' ? 'Le client a envoyé ses disponibilités.' : 'Aucune date de passage définie.')
        : (contact.prospect ? `Prospect · ${e(contact.prospect.source || 'Neptune Media')}` : 'Contact Neptune');
  return `<article class="crm-v86__card" data-stage="${e(contact.stage)}">
    <div class="crm-v86__identity"><span class="crm-v86__avatar">${e(initials(contact.fullName || contact.company || contact.email))}</span><div><strong>${e(contact.fullName || contact.company || contact.email)}</strong><small>${e(contact.company || contact.email)}</small></div></div>
    <div class="crm-v86__state"><span>${e(contact.stageLabel)}</span><p>${detail}</p></div>
    <div class="crm-v86__actions">${action}</div>
  </article>`;
}

function enhanceNewPassage() {
  const form = $('#newOrder');
  if (!form) return;
  form.dataset.crmAutopilotV86 = 'true';
  const title = $('.dialog-head h2', form);
  if (title) title.textContent = 'Créer ou relancer un passage';
  const eyebrow = $('.dialog-head .eyebrow', form);
  if (eyebrow) eyebrow.textContent = 'NOUVEAU PASSAGE';
  const fields = $('.fields', form);
  if (!fields) return;

  if (!$('[name="clientId"]', form)) {
    fields.insertAdjacentHTML('beforebegin', `
      <section class="crm-v86__picker">
        <label><span>Qui passe ?</span><div class="crm-v86__picker-input"><span>⌕</span><input type="search" data-client-search placeholder="Rechercher un client, un prospect ou une entreprise" autocomplete="off"></div></label>
        <input name="clientId" type="hidden">
        <div class="crm-v86__picker-results" data-client-results hidden></div>
        <div class="crm-v86__selected" data-client-selected hidden></div>
        <button class="crm-v86__new-contact" data-new-contact type="button">+ Nouveau contact</button>
      </section>`);
    $('[data-client-search]', form)?.addEventListener('input', renderClientPicker);
    $('[data-client-search]', form)?.addEventListener('focus', renderClientPicker);
    $('[data-client-results]', form)?.addEventListener('click', selectClientFromPicker);
    $('[data-new-contact]', form)?.addEventListener('click', () => clearSelectedClient(form));
  }

  const amount = $('[name="amountEuros"]', form);
  if (amount) {
    const label = amount.closest('label')?.querySelector('span');
    if (label) label.textContent = 'Montant du format (€)';
    if (!$('[name="paymentMode"]', form)) {
      amount.closest('label')?.insertAdjacentHTML('afterend', `<label><span>Paiement</span><select name="paymentMode"><option value="payment_pending" selected>À demander au client</option><option value="paid">Déjà payé</option><option value="no_payment_required">Sans paiement requis</option></select></label>`);
    }
  }

  const sendEmail = $('[name="sendEmail"]', form)?.closest('.check');
  if (sendEmail) {
    sendEmail.hidden = true;
    const input = $('[name="sendEmail"]', sendEmail);
    if (input) input.checked = false;
  }
  if (!$('.crm-v86__autopilot-note', form)) {
    const submit = $('button[type="submit"]', form);
    submit?.insertAdjacentHTML('beforebegin', '<p class="crm-v86__autopilot-note"><b>Mode automatique</b> Neptune envoie uniquement le prochain message nécessaire : paiement, préparation ou disponibilités.</p>');
  }
  const submit = $('button[type="submit"]', form);
  if (submit) submit.textContent = 'Lancer le parcours';
}

function renderClientPicker(event) {
  const form = event.currentTarget.closest('form');
  const results = $('[data-client-results]', form);
  const query = String(event.currentTarget.value || '').trim().toLowerCase();
  if (!results) return;
  const contacts = (snapshot.contacts || []).filter((item) => {
    if (!query) return true;
    return `${item.fullName || ''} ${item.company || ''} ${item.email || ''}`.toLowerCase().includes(query);
  }).slice(0, 8);
  results.innerHTML = contacts.length ? contacts.map((item) => `<button type="button" data-pick-client="${e(item.id)}"><b>${e(item.fullName || item.company || item.email)}</b><span>${e(item.company || '')}${item.company ? ' · ' : ''}${e(item.email)}</span><small>${e(item.stageLabel || 'Client')}</small></button>`).join('') : '<p>Aucun contact trouvé. Utilisez « Nouveau contact ».</p>';
  results.hidden = false;
}

function selectClientFromPicker(event) {
  const button = event.target.closest('[data-pick-client]');
  if (!button) return;
  const form = button.closest('form');
  const contact = (snapshot.contacts || []).find((item) => item.id === button.dataset.pickClient);
  if (!contact) return;
  $('[name="clientId"]', form).value = contact.id;
  $('[name="email"]', form).value = contact.email || '';
  $('[name="fullName"]', form).value = contact.fullName || '';
  $('[name="company"]', form).value = contact.company || '';
  $('[data-client-search]', form).value = contact.fullName || contact.company || contact.email || '';
  $('[data-client-results]', form).hidden = true;
  const selected = $('[data-client-selected]', form);
  selected.innerHTML = `<span>✓</span><div><b>${e(contact.fullName || contact.email)}</b><small>${e(contact.company || contact.email)} · fiche existante réutilisée</small></div>`;
  selected.hidden = false;
}

function clearSelectedClient(form) {
  $('[name="clientId"]', form).value = '';
  $('[name="email"]', form).value = '';
  $('[name="fullName"]', form).value = '';
  $('[name="company"]', form).value = '';
  $('[data-client-search]', form).value = '';
  $('[data-client-selected]', form).hidden = true;
  $('[data-client-results]', form).hidden = true;
  $('[name="email"]', form)?.focus();
}

async function interceptNewPassage(event) {
  const form = event.target;
  if (!(form instanceof HTMLFormElement) || form.id !== 'newOrder' || form.dataset.crmAutopilotV86 !== 'true') return;
  event.preventDefault();
  event.stopImmediatePropagation();
  await createPassage(form);
}

async function createPassage(form) {
  const data = new FormData(form);
  const message = $('#formMessage', form);
  const button = $('button[type="submit"]', form);
  const amountEuros = Number(data.get('amountEuros') || 0);
  const amountTotal = Math.max(0, Math.round((Number.isFinite(amountEuros) ? amountEuros : 0) * 100));
  const paymentMode = String(data.get('paymentMode') || (amountTotal > 0 ? 'payment_pending' : 'no_payment_required'));
  const appointmentAt = localToIso(data.get('appointmentAt'));
  const filmingAt = localToIso(data.get('filmingAt'));
  const common = {
    clientId: data.get('clientId') || '', email: data.get('email'), fullName: data.get('fullName'), company: data.get('company'),
    title: data.get('title'), format: data.get('format'), amountTotal, currency: 'eur', sourceType: data.get('sourceType') || 'direct',
  };
  if (!common.clientId && !String(common.email || '').trim()) return setMessage(message, 'Sélectionnez un client existant ou renseignez son e-mail.', true);
  if (appointmentAt && filmingAt && new Date(filmingAt) < new Date(appointmentAt)) return setMessage(message, 'La date du passage doit être postérieure à la préparation.', true);
  if (paymentMode === 'payment_pending' && amountTotal <= 0) return setMessage(message, 'Indiquez le montant à demander, ou choisissez « Sans paiement requis ».', true);

  button.disabled = true;
  setMessage(message, 'Neptune détermine la prochaine action…');
  try {
    if (paymentMode === 'payment_pending') {
      const result = await api('/api/admin/crm-v86/opportunity', { method: 'POST', body: JSON.stringify({ ...common, autopilot: true }) });
      const note = result.delivery?.suppressed ? 'Le mail récent n’a pas été renvoyé.' : 'Le lien de paiement préconfiguré a été envoyé.';
      setMessage(message, `Parcours créé. ${note}`);
    } else {
      const created = await api('/api/admin/manual-passage', {
        method: 'POST',
        body: JSON.stringify({
          ...common,
          amountTotal,
          paymentStatus: paymentMode,
          appointmentAt,
          filmingAt,
          preparationUrl: data.get('preparationUrl'),
          filmingConfirmed: data.get('filmingConfirmed') === 'on',
          sendEmail: false,
        }),
      });
      let calendarWarning = '';
      if (data.get('createCalendar') === 'on' && appointmentAt) {
        try {
          await api('/api/admin/preparation-calendar', { method: 'POST', body: JSON.stringify({ orderId: created.orderId, appointmentAt, durationMinutes: 30 }) });
        } catch (error) { calendarWarning = calendarErrorLabel(error.message); }
      }
      let actionNote = 'Le dossier est prêt.';
      if (!appointmentAt || !filmingAt || data.get('createCalendar') !== 'on') {
        const delivery = await api('/api/admin/crm-v86/action', { method: 'POST', body: JSON.stringify({ orderId: created.orderId, action: 'autopilot' }) });
        actionNote = actionLabel(delivery);
      } else {
        actionNote = 'L’invitation Agenda contient déjà les informations utiles ; aucun second e-mail n’a été envoyé.';
      }
      setMessage(message, `Passage créé. ${actionNote}${calendarWarning ? ` ${calendarWarning}` : ''}`, Boolean(calendarWarning));
    }
    form.reset();
    $('[name="title"]', form).value = 'Passage Neptune Media';
    $('[name="paymentMode"]', form).value = 'payment_pending';
    $('[name="createCalendar"]', form) && ($('[name="createCalendar"]', form).checked = true);
    clearSelectedClient(form);
    await loadCrm();
    $('#refresh')?.click();
    setTimeout(() => $('#newDialog')?.close(), 1000);
  } catch (error) {
    setMessage(message, errorLabel(error.message), true);
  } finally { button.disabled = false; }
}

async function handleCrmClick(event) {
  const create = event.target.closest('[data-crm-create]');
  if (create) {
    $('#newClient')?.click();
    setTimeout(() => {
      const input = $('[data-client-search]', $('#newOrder'));
      const contact = (snapshot.contacts || []).find((item) => item.id === create.dataset.crmCreate);
      if (input && contact) {
        input.value = contact.fullName || contact.company || contact.email;
        renderClientPicker({ currentTarget: input });
        $('[data-client-results] [data-pick-client]', $('#newOrder'))?.click();
      }
    }, 80);
    return;
  }
  const action = event.target.closest('[data-crm-action]');
  if (action) {
    action.disabled = true;
    try {
      const result = await api('/api/admin/crm-v86/action', {
        method: 'POST',
        body: JSON.stringify({ action: action.dataset.crmAction, clientId: action.dataset.clientId || '', opportunityId: action.dataset.opportunityId || '', orderId: action.dataset.orderId || '' }),
      });
      toast(actionLabel(result));
      await loadCrm();
    } catch (error) { toast(errorLabel(error.message), true); }
    finally { action.disabled = false; }
    return;
  }
  const choice = event.target.closest('[data-apply-preference]');
  if (choice) {
    choice.disabled = true;
    try {
      const result = await api('/api/admin/crm-v86/apply-preference', {
        method: 'POST',
        body: JSON.stringify({ preferenceId: choice.dataset.applyPreference, choiceIndex: Number(choice.dataset.choiceIndex || 0) }),
      });
      toast(result.supplierConfirmationRequired ? 'Créneau appliqué. La confirmation est partie au studio fournisseur.' : 'Créneau appliqué au passage.');
      await loadCrm();
      $('#refresh')?.click();
    } catch (error) { toast(errorLabel(error.message), true); }
    finally { choice.disabled = false; }
  }
}

async function api(url, options = {}) {
  const headers = { Accept: 'application/json', ...(options.headers || {}) };
  if (options.body) headers['Content-Type'] = 'application/json';
  headers['X-CSRF-Token'] = sessionStorage.getItem('neptune_csrf') || '';
  const response = await fetch(url, { ...options, headers, credentials: 'same-origin', cache: 'no-store' });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `http_${response.status}`);
  return data;
}

function actionLabel(result = {}) {
  if (result.suppressed) return 'Un message équivalent a déjà été envoyé récemment : aucun doublon.';
  return ({ payment: 'Lien de paiement envoyé.', preparation: 'Demande de rendez-vous de préparation envoyée.', filming_preferences: 'Demande de disponibilités envoyée.', access: 'Accès client envoyé.' })[result.action] || 'Parcours mis à jour.';
}
function localToIso(value) { if (!value) return null; const date = new Date(String(value)); return Number.isNaN(date.getTime()) ? null : date.toISOString(); }
function formatDate(value) { const date = new Date(value || ''); return Number.isNaN(date.getTime()) ? 'Date invalide' : new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }).format(date); }
function money(cents, currency = 'eur') { try { return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: String(currency || 'eur').toUpperCase() }).format(Number(cents || 0) / 100); } catch { return `${Number(cents || 0) / 100} €`; } }
function initials(value) { return String(value || '?').trim().split(/\s+/u).slice(0, 2).map((part) => part[0] || '').join('').toUpperCase(); }
function calendarErrorLabel(code) { return ({ calendar_access_missing: 'Agenda Google reste à autoriser.', calendar_permission_required: 'Agenda Google doit être réautorisé.', calendar_sync_failed: 'Agenda Google n’a pas pu être synchronisé.' })[code] || 'Agenda Google n’a pas été confirmé.'; }
function errorLabel(code) { return ({ unauthorized: 'Reconnectez-vous au Studio.', csrf_failed: 'Rechargez la page : la session de sécurité a expiré.', payment_amount_required: 'Un montant est nécessaire pour demander le paiement.', payment_passage_required: 'Créez d’abord le passage commercial.', client_not_found: 'Client introuvable.', filming_before_preparation: 'Le passage ne peut pas être placé avant la préparation.', preferences_required: 'Le client doit choisir au moins un créneau.', crm_v86_failed: 'Le CRM Neptune n’a pas pu terminer cette action.' })[code] || 'Action impossible pour le moment.'; }
function setMessage(node, text, error = false) { if (!node) return; node.textContent = text; node.className = `message ${error ? 'error' : 'success'}`; }
function toast(text, error = false) { const node = $('#toast'); if (!node) return; node.textContent = text; node.className = `toast${error ? ' error' : ''}`; node.hidden = false; clearTimeout(toast.timer); toast.timer = setTimeout(() => { node.hidden = true; }, 4500); }
function e(value) { return String(value || '').replace(/[&<>"']/gu, (x) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[x]); }
