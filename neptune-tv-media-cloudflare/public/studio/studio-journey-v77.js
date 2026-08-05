const RELEASE = 'neptune-studio-journey-20260805-v77';
const PREPARATION_BOOKING = 'https://calendar.app.google/nkYDeheuV8qjSMcRA';
let state = { orders: [] };
let frame = 0;
let loading = false;

start();

function start() {
  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', boot, { once: true })
    : boot();
}

function boot() {
  document.body.dataset.studioJourneyRelease = RELEASE;
  new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'open'] });
  window.addEventListener('hashchange', schedule);
  window.addEventListener('focus', load);
  document.querySelector('#refresh')?.addEventListener('click', () => setTimeout(load, 220));
  load();
}

async function load() {
  if (loading) return;
  loading = true;
  try {
    state = await api('/api/admin/clients');
    schedule();
  } catch (error) {
    console.error('studio_journey_v77_failed', error);
  } finally {
    loading = false;
  }
}

function schedule() {
  if (frame) return;
  frame = requestAnimationFrame(() => {
    frame = 0;
    compactManualUpload();
    renderPreparationShortcut();
  });
}

function compactManualUpload() {
  const details = document.querySelector('.studio-upload-details');
  const summary = details?.querySelector(':scope > summary');
  if (!details || !summary) return;
  details.classList.add('studio-upload-details-v77');
  summary.setAttribute('aria-label', 'Ajouter un contenu manuellement');
  summary.setAttribute('title', 'Ajouter un contenu manuellement');
}

function renderPreparationShortcut() {
  const root = document.querySelector('#clientDetail');
  const title = root?.querySelector('.detail-title');
  const orderId = decodeURIComponent(location.hash.slice(1));
  const order = (state.orders || []).find((item) => item.id === orderId);
  if (!root || !title || !order) return;

  let card = root.querySelector('[data-studio-preparation-v77]');
  if (!card) {
    card = document.createElement('section');
    card.dataset.studioPreparationV77 = '';
    card.className = 'studio-preparation-v77';
    title.after(card);
  }

  const appointment = validDate(order.appointmentAt);
  const filming = validDate(order.filmingAt);
  const appointmentUrl = appointmentLink(order);
  const bookingUrl = safeUrl(order.bookingUrl) || PREPARATION_BOOKING;
  const supplierPending = order.workflow?.supplierStatus === 'pending' || order.status === 'studio_date_confirmation_pending';
  const prepComplete = order.workflow?.preparationStatus === 'completed';

  card.innerHTML = `
    <div class="studio-preparation-v77__state">
      <span>PASSAGE STUDIO</span>
      <strong>${filming ? escapeHtml(formatDateTime(filming)) : 'Confirmation du studio attendue'}</strong>
      <small>${filming ? 'Créneau verrouillé et rappels activés.' : 'Le rendez-vous de préparation peut être réservé dès maintenant.'}</small>
    </div>
    <div class="studio-preparation-v77__state">
      <span>PRÉPARATION</span>
      <strong>${prepComplete ? 'Terminée' : appointment ? escapeHtml(formatDateTime(appointment)) : 'À réserver'}</strong>
      <small>${prepComplete ? 'Aucune action requise.' : appointment ? `${order.appointmentSource === 'google_calendar' ? 'Synchronisé Google Agenda. ' : ''}${appointmentUrl ? 'Lien disponible.' : 'Lien visio en attente de synchronisation.'}` : '15 à 30 minutes, réservation en un clic.'}</small>
    </div>
    <div class="studio-preparation-v77__actions">
      ${prepComplete
        ? '<span class="is-complete">✓ Préparation terminée</span>'
        : `<a href="${escapeHtml(appointment && appointmentUrl ? appointmentUrl : bookingUrl)}" target="_blank" rel="noopener">${appointment ? appointmentUrl ? 'Ouvrir le rendez-vous' : 'Retrouver / modifier' : 'Réserver la préparation'}</a>`}
      ${supplierPending ? '<button type="button" data-resend-studio-confirmation>Relancer le studio</button>' : ''}
    </div>`;

  card.querySelector('[data-resend-studio-confirmation]')?.addEventListener('click', async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    button.textContent = 'Envoi…';
    try {
      await api('/api/admin/workflow/action', { method: 'POST', body: JSON.stringify({ orderId: order.id, action: 'resend_supplier_confirmation' }) });
      button.textContent = 'Relance envoyée';
    } catch (error) {
      button.disabled = false;
      button.textContent = 'Réessayer';
      button.title = errorLabel(error.message);
    }
  });
}

function appointmentLink(order) {
  return [order.appointmentUrl, order.workflow?.appointmentUrl, order.preparationUrl].map(safeUrl).find(Boolean) || '';
}

function safeUrl(value) {
  try {
    const url = new URL(String(value || ''), location.origin);
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : '';
  } catch {
    return '';
  }
}

function validDate(value) {
  const date = new Date(value || '');
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDateTime(value) {
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Europe/Paris' }).format(value);
}

async function api(url, options = {}) {
  const headers = { Accept: 'application/json', ...(options.headers || {}) };
  if (options.body) headers['Content-Type'] = 'application/json';
  headers['X-CSRF-Token'] = sessionStorage.getItem('neptune_csrf') || '';
  const response = await fetch(url, { ...options, headers, credentials: 'same-origin', cache: 'no-store' });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `HTTP_${response.status}`);
  return data;
}

function errorLabel(value) {
  return String(value || '').replaceAll('_', ' ') || 'Action impossible';
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/gu, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}
