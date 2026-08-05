const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

let state = { clients: [], orders: [] };
let scheduled = 0;
let loading = false;

start();

function start() {
  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', boot, { once: true })
    : boot();
}

function boot() {
  document.body.classList.add('studio-client-operations-v76');
  installAccountManager();
  cleanObsoleteVideoWorkspace();
  enhanceCurrentScreen();
  new MutationObserver(scheduleEnhance).observe(document.body, { childList: true, subtree: true });
  window.addEventListener('hashchange', scheduleEnhance);
  window.addEventListener('focus', () => loadState(false));
  $('#refresh')?.addEventListener('click', () => setTimeout(() => loadState(false), 220));
  loadState(false);
}

function scheduleEnhance() {
  if (scheduled) return;
  scheduled = requestAnimationFrame(() => {
    scheduled = 0;
    cleanObsoleteVideoWorkspace();
    installAccountButton();
    enhanceCurrentScreen();
  });
}

function cleanObsoleteVideoWorkspace() {
  const obsolete = [
    'a[href="/studio/video-ai"]',
    'a[href="/studio/video-ai/"]',
    'a[href="/studio/video-ai.html"]',
    'a[href*="neptune-video-clean"]',
    '[data-studio-route="production"]',
    '.client-content-video-link',
  ];
  $$(obsolete.join(',')).forEach((element) => element.remove());
  $$('.studio-nav,.neptune-studio-nav').forEach((nav) => {
    nav.setAttribute('aria-label', 'Navigation principale du Studio');
    nav.classList.add('studio-nav-three-items-v76');
  });
}

function installAccountManager() {
  if (!$('#studioClientAccountsDialog')) {
    const dialog = document.createElement('dialog');
    dialog.id = 'studioClientAccountsDialog';
    dialog.className = 'studio-client-accounts-dialog';
    dialog.innerHTML = `
      <section class="studio-client-accounts-card">
        <header>
          <div><p class="eyebrow">COMPTES CLIENTS</p><h2>Gérer les accès clients</h2><p>Modifier, archiver, réactiver ou supprimer un compte sans toucher aux dossiers Google Drive.</p></div>
          <button type="button" class="studio-client-close" data-close-client-accounts aria-label="Fermer">×</button>
        </header>
        <div class="studio-client-accounts-tools">
          <label><span aria-hidden="true">⌕</span><input type="search" placeholder="Rechercher un nom, une entreprise ou un e-mail" aria-label="Rechercher un compte client"></label>
          <div data-client-account-stats></div>
        </div>
        <div class="studio-client-account-list" data-client-account-list aria-live="polite"></div>
      </section>`;
    document.body.append(dialog);
    $('[data-close-client-accounts]', dialog).addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) dialog.close();
    });
    $('.studio-client-accounts-tools input', dialog).addEventListener('input', renderClientAccounts);
  }

  if (!$('#studioClientEditDialog')) {
    const dialog = document.createElement('dialog');
    dialog.id = 'studioClientEditDialog';
    dialog.className = 'studio-client-action-dialog';
    dialog.innerHTML = `
      <form class="studio-client-action-card" data-client-edit-form>
        <header><div><p class="eyebrow">INFORMATIONS CLIENT</p><h2>Modifier le compte</h2></div><button type="button" data-close-client-edit aria-label="Fermer">×</button></header>
        <input type="hidden" name="clientId">
        <label><span>Nom complet</span><input name="fullName" autocomplete="name"></label>
        <label><span>Entreprise</span><input name="company"></label>
        <label><span>E-mail de connexion</span><input name="email" type="email" required></label>
        <p class="studio-client-action-note">Changer l’e-mail déconnecte les sessions existantes. Un nouvel accès pourra ensuite être envoyé depuis le dossier client.</p>
        <div class="studio-client-action-footer"><button type="button" class="secondary" data-close-client-edit>Annuler</button><button type="submit" class="button">Enregistrer</button></div>
        <p class="message" data-client-edit-message></p>
      </form>`;
    document.body.append(dialog);
    $$('[data-close-client-edit]', dialog).forEach((button) => button.addEventListener('click', () => dialog.close()));
    $('[data-client-edit-form]', dialog).addEventListener('submit', submitClientEdit);
  }

  if (!$('#studioClientDeleteDialog')) {
    const dialog = document.createElement('dialog');
    dialog.id = 'studioClientDeleteDialog';
    dialog.className = 'studio-client-action-dialog studio-client-delete-dialog';
    dialog.innerHTML = `
      <form class="studio-client-action-card" data-client-delete-form>
        <header><div><p class="eyebrow">SUPPRESSION DÉFINITIVE</p><h2>Supprimer le compte client</h2></div><button type="button" data-close-client-delete aria-label="Fermer">×</button></header>
        <input type="hidden" name="clientId">
        <div class="studio-client-delete-warning"><strong>Cette action supprime le compte, ses commandes, son calendrier et ses références de contenus.</strong><span>Les fichiers et dossiers Google Drive restent intacts.</span></div>
        <label><span>Pour confirmer, saisissez exactement : <b data-client-delete-identity></b></span><input name="confirmation" autocomplete="off" required></label>
        <div class="studio-client-action-footer"><button type="button" class="secondary" data-close-client-delete>Annuler</button><button type="submit" class="danger">Supprimer définitivement</button></div>
        <p class="message" data-client-delete-message></p>
      </form>`;
    document.body.append(dialog);
    $$('[data-close-client-delete]', dialog).forEach((button) => button.addEventListener('click', () => dialog.close()));
    $('[data-client-delete-form]', dialog).addEventListener('submit', submitClientDelete);
  }

  installAccountButton();
}

function installAccountButton() {
  const actions = $('.clients-top-actions');
  if (!actions || $('#manageClientAccounts')) return;
  const button = document.createElement('button');
  button.id = 'manageClientAccounts';
  button.className = 'secondary studio-manage-clients-button';
  button.type = 'button';
  button.innerHTML = '<span aria-hidden="true">◎</span> Comptes clients';
  button.addEventListener('click', openClientAccounts);
  actions.insertBefore(button, $('#newClient', actions));
}

async function loadState(showLoading = true) {
  if (loading) return;
  loading = true;
  const list = $('[data-client-account-list]');
  if (showLoading && list) list.innerHTML = '<p class="studio-client-empty">Chargement des comptes…</p>';
  try {
    state = await api('/api/admin/clients');
    renderClientAccounts();
    enhanceCurrentScreen();
  } catch (error) {
    if (list) list.innerHTML = `<p class="studio-client-empty is-error">${escapeHtml(errorLabel(error.message))}</p>`;
  } finally {
    loading = false;
  }
}

async function openClientAccounts() {
  const dialog = $('#studioClientAccountsDialog');
  if (!dialog) return;
  dialog.showModal();
  await loadState(true);
  requestAnimationFrame(() => $('.studio-client-accounts-tools input', dialog)?.focus());
}

function renderClientAccounts() {
  const dialog = $('#studioClientAccountsDialog');
  const list = $('[data-client-account-list]', dialog);
  const stats = $('[data-client-account-stats]', dialog);
  if (!dialog || !list || !stats) return;
  const query = normalize($('.studio-client-accounts-tools input', dialog)?.value || '');
  const clients = (state.clients || []).filter((client) => {
    if (!query) return true;
    return normalize([client.fullName, client.company, client.email].join(' ')).includes(query);
  });
  const active = (state.clients || []).filter((client) => client.active !== false).length;
  const archived = (state.clients || []).length - active;
  stats.innerHTML = `<span><b>${active}</b> actifs</span><span><b>${archived}</b> archivés</span>`;
  if (!clients.length) {
    list.innerHTML = '<p class="studio-client-empty">Aucun compte ne correspond à cette recherche.</p>';
    return;
  }
  list.innerHTML = clients.map(clientRow).join('');
  $$('[data-client-edit]', list).forEach((button) => button.addEventListener('click', () => openClientEdit(button.dataset.clientEdit)));
  $$('[data-client-toggle]', list).forEach((button) => button.addEventListener('click', () => toggleClient(button.dataset.clientToggle, button.dataset.clientAction, button)));
  $$('[data-client-delete]', list).forEach((button) => button.addEventListener('click', () => openClientDelete(button.dataset.clientDelete)));
}

function clientRow(client) {
  const identity = client.fullName || client.company || client.email;
  const initials = initialsFor(identity);
  const active = client.active !== false;
  return `
    <article class="studio-client-account-row ${active ? '' : 'is-archived'}">
      <div class="studio-client-account-avatar">${escapeHtml(initials)}</div>
      <div class="studio-client-account-identity">
        <div><strong>${escapeHtml(identity)}</strong><span class="${active ? 'is-active' : 'is-archived'}">${active ? 'Actif' : 'Archivé'}</span></div>
        <p>${escapeHtml(client.company && client.company !== identity ? client.company : client.email)}</p>
        <small>${Number(client.orderCount || 0)} passage${Number(client.orderCount || 0) > 1 ? 's' : ''} · Dernier accès ${escapeHtml(dateLabel(client.lastAccessAt))}</small>
      </div>
      <div class="studio-client-account-actions">
        <button type="button" data-client-edit="${escapeHtml(client.id)}">Modifier</button>
        <button type="button" data-client-toggle="${escapeHtml(client.id)}" data-client-action="${active ? 'archive' : 'activate'}">${active ? 'Archiver' : 'Réactiver'}</button>
        <button type="button" class="danger" data-client-delete="${escapeHtml(client.id)}">Supprimer</button>
      </div>
    </article>`;
}

function openClientEdit(clientId) {
  const client = (state.clients || []).find((item) => item.id === clientId);
  const dialog = $('#studioClientEditDialog');
  const form = $('[data-client-edit-form]', dialog);
  if (!client || !dialog || !form) return;
  form.reset();
  form.elements.clientId.value = client.id;
  form.elements.fullName.value = client.fullName || '';
  form.elements.company.value = client.company || '';
  form.elements.email.value = client.email || '';
  $('[data-client-edit-message]', form).textContent = '';
  dialog.showModal();
}

async function submitClientEdit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = $('button[type="submit"]', form);
  const message = $('[data-client-edit-message]', form);
  button.disabled = true;
  message.textContent = 'Enregistrement…';
  try {
    await api('/api/admin/client-manage', {
      method: 'POST',
      body: JSON.stringify({
        action: 'update',
        clientId: form.elements.clientId.value,
        fullName: form.elements.fullName.value,
        company: form.elements.company.value,
        email: form.elements.email.value,
      }),
    });
    message.className = 'message success';
    message.textContent = 'Compte mis à jour.';
    await refreshAfterMutation();
    setTimeout(() => $('#studioClientEditDialog')?.close(), 450);
  } catch (error) {
    message.className = 'message error';
    message.textContent = errorLabel(error.message);
  } finally {
    button.disabled = false;
  }
}

async function toggleClient(clientId, action, button) {
  button.disabled = true;
  const original = button.textContent;
  button.textContent = action === 'archive' ? 'Archivage…' : 'Activation…';
  try {
    await api('/api/admin/client-manage', {
      method: 'POST',
      body: JSON.stringify({ action, clientId }),
    });
    await refreshAfterMutation();
  } catch (error) {
    showInlineToast(errorLabel(error.message), true);
    button.disabled = false;
    button.textContent = original;
  }
}

function openClientDelete(clientId) {
  const client = (state.clients || []).find((item) => item.id === clientId);
  const dialog = $('#studioClientDeleteDialog');
  const form = $('[data-client-delete-form]', dialog);
  if (!client || !dialog || !form) return;
  const identity = clientIdentity(client);
  form.reset();
  form.elements.clientId.value = client.id;
  $('[data-client-delete-identity]', form).textContent = identity;
  form.dataset.expectedIdentity = identity;
  $('[data-client-delete-message]', form).textContent = '';
  dialog.showModal();
  requestAnimationFrame(() => form.elements.confirmation.focus());
}

async function submitClientDelete(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = $('button[type="submit"]', form);
  const message = $('[data-client-delete-message]', form);
  const confirmation = String(form.elements.confirmation.value || '').trim();
  if (confirmation !== form.dataset.expectedIdentity) {
    message.className = 'message error';
    message.textContent = 'La confirmation ne correspond pas exactement.';
    return;
  }
  button.disabled = true;
  message.className = 'message';
  message.textContent = 'Suppression du compte et nettoyage des données…';
  try {
    const result = await api('/api/admin/client-manage', {
      method: 'POST',
      body: JSON.stringify({ action: 'delete', clientId: form.elements.clientId.value, confirmation }),
    });
    message.className = 'message success';
    message.textContent = `Compte supprimé. ${Number(result.deleted?.files || 0)} référence(s) de contenu retirée(s). Les fichiers Drive sont conservés.`;
    $('#clientDialog')?.close();
    await refreshAfterMutation();
    setTimeout(() => $('#studioClientDeleteDialog')?.close(), 700);
  } catch (error) {
    message.className = 'message error';
    message.textContent = errorLabel(error.message);
  } finally {
    button.disabled = false;
  }
}

async function refreshAfterMutation() {
  await loadState(false);
  $('#refresh')?.click();
  renderClientAccounts();
  enhanceCurrentScreen();
}

function enhanceCurrentScreen() {
  addCurrentClientManagementButton();
  enhanceCalendar();
}

function addCurrentClientManagementButton() {
  const root = $('#clientDetail');
  const title = $('.detail-title', root);
  if (!root || !title || $('[data-manage-current-client]', title)) return;
  const orderId = decodeURIComponent(location.hash.slice(1));
  const order = (state.orders || []).find((item) => item.id === orderId);
  if (!order) return;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'studio-current-client-manage';
  button.dataset.manageCurrentClient = order.clientId;
  button.textContent = 'Gérer le compte';
  button.addEventListener('click', async () => {
    await openClientAccounts();
    const search = $('.studio-client-accounts-tools input');
    if (search) {
      search.value = order.email || order.fullName || '';
      renderClientAccounts();
    }
  });
  const close = $('.close', title);
  close ? close.before(button) : title.append(button);
}

function enhanceCalendar() {
  const root = $('#clientDetail');
  const activeTab = $('.tabs button.active', root)?.dataset.detailTab;
  const body = $('#detailBody', root);
  if (!body) return;
  body.classList.toggle('studio-calendar-body-v76', activeTab === 'calendar');
  if (activeTab !== 'calendar') return;
  const calendar = $('.calendar', body);
  const panel = calendar?.closest('.panel');
  if (!calendar || !panel || $('.studio-calendar-summary-v76', panel)) return;
  const orderId = decodeURIComponent(location.hash.slice(1));
  const order = (state.orders || []).find((item) => item.id === orderId);
  const schedules = order?.schedules || [];
  const upcoming = schedules
    .map((item) => new Date(item.publishAt))
    .filter((date) => !Number.isNaN(date.getTime()) && date.getTime() >= Date.now())
    .sort((a, b) => a - b)[0];
  const summary = document.createElement('div');
  summary.className = 'studio-calendar-summary-v76';
  summary.innerHTML = `<span><b>${schedules.length}</b> publication${schedules.length > 1 ? 's' : ''} planifiée${schedules.length > 1 ? 's' : ''}</span><span><b>${escapeHtml(upcoming ? dateLabel(upcoming) : '—')}</b> prochaine diffusion</span><p>Le calendrier reste compact : ouvrez la vue client complète pour déplacer les contenus et modifier les textes.</p>`;
  calendar.before(summary);
}

function clientIdentity(client) {
  return String(client.fullName || client.company || client.email || '').trim();
}

function initialsFor(value) {
  const parts = String(value || 'Client').trim().split(/\s+/u).filter(Boolean);
  return (parts.length > 1 ? `${parts[0][0]}${parts[1][0]}` : parts[0]?.slice(0, 2) || 'CL').toUpperCase();
}

function dateLabel(value) {
  if (!value) return 'jamais';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return 'jamais';
  return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
}

function normalize(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/gu, '').toLowerCase().trim();
}

async function api(url, options = {}) {
  const headers = { Accept: 'application/json', ...(options.headers || {}) };
  if (options.body) headers['Content-Type'] = 'application/json';
  headers['X-CSRF-Token'] = sessionStorage.getItem('neptune_csrf') || '';
  const response = await fetch(url, { ...options, headers, credentials: 'same-origin' });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `http_${response.status}`);
  return data;
}

function errorLabel(code) {
  return ({
    unauthorized: 'Reconnectez-vous au Studio.',
    csrf_failed: 'La session de sécurité a expiré. Rechargez la page.',
    client_not_found: 'Ce compte client n’existe plus.',
    invalid_client_email: 'L’adresse e-mail est invalide.',
    client_email_already_used: 'Cette adresse e-mail appartient déjà à un autre compte.',
    client_delete_confirmation_failed: 'La confirmation de suppression est incorrecte.',
    admin_required: 'Seul un administrateur peut supprimer définitivement un compte.',
    client_management_failed: 'La gestion du compte a échoué. Réessayez.',
  })[code] || 'Une erreur est survenue. Réessayez.';
}

function showInlineToast(text, error = false) {
  const toast = $('#toast');
  if (!toast) return;
  toast.textContent = text;
  toast.className = `toast${error ? ' error' : ''}`;
  toast.hidden = false;
  clearTimeout(showInlineToast.timer);
  showInlineToast.timer = setTimeout(() => { toast.hidden = true; }, 3800);
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/gu, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}
