const RELEASE = 'neptune-studio-reservation-flow-20260810-v87';
const $ = (selector, root = document) => root.querySelector(selector);
let enhanceTimer = 0;

start();

function start() {
  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', boot, { once: true })
    : boot();
}

function boot() {
  document.body.dataset.reservationFlowRelease = RELEASE;
  enhanceReservationFlow();
  new MutationObserver(scheduleEnhance).observe(document.body, { childList: true, subtree: true });
}

function scheduleEnhance() {
  clearTimeout(enhanceTimer);
  enhanceTimer = setTimeout(enhanceReservationFlow, 90);
}

function enhanceReservationFlow() {
  const dialog = $('#newDialog');
  const form = $('#newOrder');
  if (!dialog || !form) return;

  dialog.dataset.reservationFlowV87 = 'true';
  form.dataset.reservationFlowV87 = 'true';
  ensureSectionTitles(form);
  ensurePlanningGate(form);
  ensureStickyFooter(form);
  bindDialogViewport(dialog, form);
  bindPaymentLogic(form);
  syncPaymentLogic(form);
}

function ensureSectionTitles(form) {
  const fields = $('.fields', form);
  if (!fields) return;
  insertSection(fields, 'dossier', $('[name="sourceType"]', fields)?.closest('label') || $('[name="email"]', fields)?.closest('label'), 'Dossier', 'Identité, origine et format du passage.');
  insertSection(fields, 'payment', $('[name="amountEuros"]', fields)?.closest('label'), 'Paiement', 'Indiquez uniquement ce qui reste réellement à traiter.');
  insertSection(fields, 'planning', $('[name="appointmentAt"]', fields)?.closest('label'), 'Planification', 'Préparation, Google Meet et date de passage.');
}

function insertSection(fields, id, target, title, helper) {
  if (!target || $(`[data-reservation-section="${id}"]`, fields)) return;
  const node = document.createElement('div');
  node.className = 'reservation-flow-v87__section-title';
  node.dataset.reservationSection = id;
  node.innerHTML = `<strong>${escapeHtml(title)}</strong><small>${escapeHtml(helper)}</small>`;
  target.before(node);
}

function ensurePlanningGate(form) {
  const fields = $('.fields', form);
  const target = $('[name="appointmentAt"]', fields)?.closest('label');
  if (!fields || !target || $('[data-reservation-planning-gate]', fields)) return;
  const gate = document.createElement('div');
  gate.className = 'reservation-flow-v87__planning-gate';
  gate.dataset.reservationPlanningGate = 'true';
  target.before(gate);
}

function ensureStickyFooter(form) {
  const submit = $('button[type="submit"]', form);
  const message = $('#formMessage', form);
  if (!submit) return;
  let footer = $('.reservation-flow-v87__footer', form);
  if (!footer) {
    footer = document.createElement('div');
    footer.className = 'reservation-flow-v87__footer';
    submit.before(footer);
    footer.append(submit);
    if (message) footer.append(message);
  }
  const note = $('.crm-v86__autopilot-note', form);
  if (note && note.parentElement !== footer) footer.prepend(note);
  if (message && message.parentElement !== footer) footer.append(message);
}

function bindDialogViewport(dialog, form) {
  if (dialog.dataset.viewportBoundV87 === 'true') return;
  dialog.dataset.viewportBoundV87 = 'true';

  const resetScroll = () => {
    if (!dialog.open) return;
    syncPaymentLogic(form);
    requestAnimationFrame(() => {
      form.scrollTop = 0;
      const search = $('[data-client-search]', form);
      if (search && matchMedia('(min-width: 721px)').matches) search.focus({ preventScroll: true });
    });
  };

  dialog.addEventListener('toggle', resetScroll);
  new MutationObserver(() => {
    if (dialog.open) resetScroll();
  }).observe(dialog, { attributes: true, attributeFilter: ['open'] });

  form.addEventListener('reset', () => setTimeout(() => syncPaymentLogic(form), 0));
  form.addEventListener('focusin', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement) || !target.matches('input,select,textarea,button')) return;
    setTimeout(() => target.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' }), 180);
  });
}

function bindPaymentLogic(form) {
  if (form.dataset.paymentLogicBoundV87 === 'true') return;
  form.dataset.paymentLogicBoundV87 = 'true';

  form.addEventListener('change', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) return;
    if (target.name === 'paymentMode') target.dataset.userChanged = 'true';
    if (target.name === 'sourceType' || target.name === 'amountEuros') autoPaymentForIncludedPassage(form);
    if (['paymentMode', 'sourceType', 'amountEuros'].includes(target.name)) syncPaymentLogic(form);
  });

  form.addEventListener('input', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    if (target.name === 'amountEuros') syncPaymentLogic(form);
  });
}

function autoPaymentForIncludedPassage(form) {
  const source = $('[name="sourceType"]', form);
  const payment = $('[name="paymentMode"]', form);
  const amount = $('[name="amountEuros"]', form);
  if (!source || !payment || !amount || payment.dataset.userChanged === 'true') return;
  const amountValue = Number(amount.value || 0);
  if (['partner', 'member'].includes(source.value) && amountValue <= 0) {
    payment.value = 'no_payment_required';
  } else if (source.value === 'direct' && amountValue > 0) {
    payment.value = 'payment_pending';
  }
}

function syncPaymentLogic(form) {
  const payment = $('[name="paymentMode"]', form);
  const gate = $('[data-reservation-planning-gate]', form);
  if (!payment || !gate) return;
  const pending = payment.value === 'payment_pending';
  const planningNames = ['appointmentAt', 'filmingAt', 'preparationUrl', 'filmingConfirmed', 'createCalendar'];

  for (const name of planningNames) {
    const input = $(`[name="${name}"]`, form);
    if (!input) continue;
    input.disabled = pending;
    const owner = input.closest('label') || input.closest('.manual-scheduling-options-v85');
    if (owner) owner.dataset.reservationPlanningLocked = pending ? 'true' : 'false';
  }

  const options = $('.manual-scheduling-options-v85', form);
  if (options) options.dataset.reservationPlanningLocked = pending ? 'true' : 'false';
  gate.dataset.locked = pending ? 'true' : 'false';
  gate.textContent = pending
    ? 'Paiement d’abord : Neptune envoie le lien de paiement et n’enregistre aucune fausse date. Dès que le passage est payé, la préparation et le créneau peuvent être fixés dans le dossier. Pour un partenaire ou un adhérent dont le passage est inclus, choisissez « Sans paiement requis ».'
    : 'Planification immédiate : les dates saisies sont enregistrées dans le dossier. Si Google Agenda est activé, le rendez-vous de préparation et le lien Meet sont synchronisés avec l’espace client.';
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/gu, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);
}
