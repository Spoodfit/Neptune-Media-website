const RELEASE = 'neptune-studio-manual-scheduling-20260810-v85';
const $ = (selector, root = document) => root.querySelector(selector);
let enhanceTimer = 0;
let adminStatePromise = null;

start();

function start() {
  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', boot, { once: true })
    : boot();
}

function boot() {
  document.body.dataset.manualSchedulingRelease = RELEASE;
  enhanceNewPassageForm();
  enhancePassageEditor();
  document.addEventListener('submit', interceptSubmit, true);
  new MutationObserver(scheduleEnhance).observe(document.body, { childList: true, subtree: true });
  window.addEventListener('hashchange', scheduleEnhance);
}

function scheduleEnhance() {
  clearTimeout(enhanceTimer);
  enhanceTimer = setTimeout(() => {
    enhanceNewPassageForm();
    enhancePassageEditor();
  }, 80);
}

function enhanceNewPassageForm() {
  const form = $('#newOrder');
  if (!form || form.dataset.manualSchedulingV85) return;
  form.dataset.manualSchedulingV85 = 'true';
  const trigger = $('#newClient');
  if (trigger) trigger.textContent = 'Nouveau passage';
  const title = $('.dialog-head h2', form);
  if (title) title.textContent = 'Créer un passage sans tunnel de vente';
  const eyebrow = $('.dialog-head .eyebrow', form);
  if (eyebrow) eyebrow.textContent = 'NOUVEAU PASSAGE MANUEL';

  const fields = $('.fields', form);
  if (!fields) return;
  const emailLabel = $('[name="email"]', fields)?.closest('label');
  if (emailLabel && !$('[name="sourceType"]', fields)) {
    emailLabel.insertAdjacentHTML('beforebegin', `
      <label><span>Origine du dossier</span><select name="sourceType">
        <option value="partner">Partenaire</option>
        <option value="member">Adhérent Neptune</option>
        <option value="direct" selected>Client direct</option>
        <option value="other">Autre</option>
      </select></label>`);
  }

  const appointmentLabel = $('[name="appointmentAt"]', fields)?.closest('label');
  if (appointmentLabel && !$('[name="filmingAt"]', fields)) {
    appointmentLabel.insertAdjacentHTML('afterend', `
      <label><span>Date et heure du passage</span><input name="filmingAt" type="datetime-local"></label>`);
  }

  const prepUrl = $('[name="preparationUrl"]', fields);
  if (prepUrl) {
    const label = prepUrl.closest('label')?.querySelector('span');
    if (label) label.textContent = 'Lien visio de préparation (optionnel)';
    prepUrl.placeholder = 'Créé automatiquement avec Google Meet si possible';
  }

  const sendEmail = $('[name="sendEmail"]', form)?.closest('.check');
  if (sendEmail && !$('.manual-scheduling-options-v85', form)) {
    sendEmail.insertAdjacentHTML('beforebegin', `
      <section class="manual-scheduling-options-v85">
        <label class="check"><input name="filmingConfirmed" type="checkbox"><span><b>Date de passage déjà convenue</b><small>À cocher uniquement si le créneau a déjà été validé en amont. Sinon Neptune demandera la confirmation au fournisseur.</small></span></label>
        <label class="check"><input name="createCalendar" type="checkbox" checked><span><b>Créer / synchroniser Google Agenda + Meet</b><small>Le client reçoit l’invitation Google et retrouve le bouton de réunion dans son espace.</small></span></label>
      </section>`);
  }

  const filmingInput = $('[name="filmingAt"]', form);
  const confirmedInput = $('[name="filmingConfirmed"]', form);
  const refreshConfirmed = () => {
    if (!confirmedInput) return;
    confirmedInput.disabled = !filmingInput?.value;
    if (confirmedInput.disabled) confirmedInput.checked = false;
  };
  filmingInput?.addEventListener('input', refreshConfirmed);
  refreshConfirmed();

  const submit = $('button[type="submit"]', form);
  if (submit) submit.textContent = 'Créer le passage';
}

function enhancePassageEditor() {
  const form = $('#passageEditorFormV80');
  if (!form || form.dataset.manualSchedulingV85) return;
  form.dataset.manualSchedulingV85 = 'true';
  const dateCard = $('[name="appointmentAt"]', form)?.closest('.passage-v80-card');
  const fields = dateCard?.querySelector('.passage-v80-fields');
  if (fields && !$('.passage-calendar-sync-v85', dateCard)) {
    fields.insertAdjacentHTML('afterend', `
      <label class="passage-calendar-sync-v85">
        <input name="syncGoogleCalendar" type="checkbox" checked>
        <span><b>Synchroniser la préparation avec Google Agenda + Meet</b><small>Créer, déplacer ou annuler le même événement Google sans doublon.</small></span>
      </label>`);
  }
  preserveNoPaymentStatus(form);
}

async function preserveNoPaymentStatus(form) {
  const select = $('[name="paymentStatus"]', form);
  if (!select || select.dataset.noPaymentChecked) return;
  select.dataset.noPaymentChecked = 'true';
  try {
    const state = await loadAdminState();
    const orderId = String(new FormData(form).get('orderId') || '');
    const order = (state.orders || []).find((item) => item.id === orderId);
    if (order?.paymentStatus !== 'no_payment_required') return;
    const option = document.createElement('option');
    option.value = 'no_payment_required';
    option.textContent = 'Sans paiement requis';
    option.selected = true;
    select.prepend(option);
  } catch {
    // Non-blocking: the existing editor remains usable.
  }
}

async function interceptSubmit(event) {
  const form = event.target;
  if (!(form instanceof HTMLFormElement)) return;

  if (form.id === 'newOrder' && form.dataset.manualSchedulingV85) {
    event.preventDefault();
    event.stopImmediatePropagation();
    await createManualPassage(form);
    return;
  }

  if (form.id !== 'passageEditorFormV80' || !form.dataset.manualSchedulingV85) return;
  if (form.dataset.calendarBypassV85 === 'true') {
    delete form.dataset.calendarBypassV85;
    return;
  }
  const sync = $('[name="syncGoogleCalendar"]', form);
  if (!sync?.checked) return;

  event.preventDefault();
  event.stopImmediatePropagation();
  await syncPassageCalendarThenSave(form);
}

async function createManualPassage(form) {
  const button = $('button[type="submit"]', form);
  const message = $('#formMessage', form) || $('#formMessage');
  const data = new FormData(form);
  const appointmentAt = localToIso(data.get('appointmentAt'));
  const filmingAt = localToIso(data.get('filmingAt'));
  const createCalendar = data.get('createCalendar') === 'on' && Boolean(appointmentAt);
  const amountEuros = Number(data.get('amountEuros') || 0);

  if (appointmentAt && filmingAt && new Date(filmingAt) < new Date(appointmentAt)) {
    return setMessage(message, 'La date du passage ne peut pas être antérieure au rendez-vous de préparation.', true);
  }

  button.disabled = true;
  setMessage(message, 'Création du passage et synchronisation du parcours…');
  try {
    const result = await api('/api/admin/manual-passage', {
      method: 'POST',
      body: JSON.stringify({
        email: data.get('email'),
        fullName: data.get('fullName'),
        company: data.get('company'),
        title: data.get('title'),
        format: data.get('format'),
        amountTotal: Math.round((Number.isFinite(amountEuros) ? amountEuros : 0) * 100),
        currency: 'eur',
        paymentStatus: amountEuros > 0 ? 'paid' : 'no_payment_required',
        appointmentAt,
        filmingAt,
        preparationUrl: data.get('preparationUrl'),
        sourceType: data.get('sourceType'),
        filmingConfirmed: data.get('filmingConfirmed') === 'on',
        sendEmail: data.get('sendEmail') === 'on',
      }),
    });

    let calendar = null;
    let calendarWarning = '';
    if (createCalendar) {
      try {
        calendar = await api('/api/admin/preparation-calendar', {
          method: 'POST',
          body: JSON.stringify({ orderId: result.orderId, appointmentAt, durationMinutes: 30 }),
        });
      } catch (error) {
        calendarWarning = calendarErrorLabel(error.message);
      }
    }

    const supplierNote = result.supplierStatus === 'pending' && filmingAt
      ? ' La confirmation de date a été transmise au fournisseur.'
      : '';
    const calendarNote = calendar
      ? ' Google Agenda et Meet sont synchronisés.'
      : calendarWarning
        ? ` ${calendarWarning}`
        : '';
    setMessage(message, `Passage créé.${supplierNote}${calendarNote}`, Boolean(calendarWarning));
    form.reset();
    form.elements.title.value = 'Passage Neptune Media';
    form.elements.sendEmail.checked = true;
    const calendarCheck = $('[name="createCalendar"]', form);
    if (calendarCheck) calendarCheck.checked = true;
    const source = $('[name="sourceType"]', form);
    if (source) source.value = 'direct';
    await refreshStudio();
    setTimeout(() => $('#newDialog')?.close(), calendarWarning ? 1700 : 800);
  } catch (error) {
    setMessage(message, errorLabel(error.message), true);
  } finally {
    button.disabled = false;
  }
}

async function syncPassageCalendarThenSave(form) {
  const data = new FormData(form);
  const orderId = String(data.get('orderId') || '');
  const appointmentAt = localToIso(data.get('appointmentAt'));
  const message = $('[data-passage-message]', form);
  const buttons = [...document.querySelectorAll('button[type="submit"],button[form="passageEditorFormV80"]')];
  buttons.forEach((button) => { button.disabled = true; });
  setMessage(message, appointmentAt ? 'Synchronisation Google Agenda + Meet…' : 'Annulation du rendez-vous Google Agenda…');

  try {
    const calendar = await api('/api/admin/preparation-calendar', {
      method: 'POST',
      body: JSON.stringify({
        orderId,
        appointmentAt,
        action: appointmentAt ? 'upsert' : 'cancel',
        durationMinutes: 30,
      }),
    });
    const expected = $('[name="expectedUpdatedAt"]', form);
    if (expected && calendar.updatedAt) expected.value = calendar.updatedAt;
    const preparationUrl = $('[name="preparationUrl"]', form);
    if (appointmentAt && preparationUrl && calendar.meetingUrl) preparationUrl.value = calendar.meetingUrl;
    if (!appointmentAt && preparationUrl && isGoogleAppointmentUrl(preparationUrl.value)) preparationUrl.value = '';
    form.dataset.calendarBypassV85 = 'true';
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    setTimeout(() => showToast(appointmentAt ? 'Google Agenda et l’espace client sont synchronisés.' : 'Rendez-vous Google annulé et espace client mis à jour.'), 450);
  } catch (error) {
    const warning = calendarErrorLabel(error.message);
    setMessage(message, `${warning} Les informations Neptune vont quand même être enregistrées.`, true);
    form.dataset.calendarBypassV85 = 'true';
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    setTimeout(() => showToast(warning, true), 650);
  } finally {
    buttons.forEach((button) => { button.disabled = false; });
  }
}

async function refreshStudio() {
  adminStatePromise = null;
  $('#refresh')?.click();
  await new Promise((resolve) => setTimeout(resolve, 180));
}

function loadAdminState() {
  if (!adminStatePromise) adminStatePromise = api('/api/admin/clients');
  return adminStatePromise;
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

function localToIso(value) {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function isGoogleAppointmentUrl(value) {
  try {
    const host = new URL(String(value || '')).hostname;
    return /(^|\.)meet\.google\.com$|(^|\.)calendar\.google\.com$/iu.test(host);
  } catch {
    return false;
  }
}

function calendarErrorLabel(code) {
  return ({
    calendar_access_missing: 'Google Agenda n’est pas encore autorisé : relancez une fois le relais Apps Script.',
    calendar_permission_required: 'Google Agenda doit être réautorisé dans Apps Script avant de pouvoir créer la visio.',
    calendar_sync_failed: 'Google Agenda n’a pas pu être synchronisé.',
    appointment_in_past: 'Le rendez-vous de préparation doit être placé dans le futur.',
  })[code] || 'La synchronisation Google Agenda n’a pas été confirmée.';
}

function errorLabel(code) {
  return ({
    unauthorized: 'Reconnectez-vous au Studio.',
    csrf_failed: 'La session de sécurité a expiré. Rechargez la page.',
    invalid_order: 'Les informations du passage sont incomplètes.',
    payment_not_confirmed: 'Le statut de paiement ne permet pas de créer ce passage.',
    supplier_confirmation_failed: 'Le passage est créé, mais la demande fournisseur doit être vérifiée.',
  })[code] || 'Une erreur est survenue. Vérifiez les informations puis réessayez.';
}

function setMessage(node, text, error = false) {
  if (!node) return;
  node.textContent = text;
  node.className = `message ${error ? 'error' : 'success'}`;
}

function showToast(text, error = false) {
  const toast = $('#toast');
  if (!toast) return;
  toast.textContent = text;
  toast.className = `toast${error ? ' error' : ''}`;
  toast.hidden = false;
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => { toast.hidden = true; }, 4800);
}
