const $ = (selector, root = document) => root.querySelector(selector);
const CANONICAL_STUDIO_PATH = '/studio/clients';
const ALLOWED_NEXT = new Set([
  '/studio/clients',
  '/studio/clients/',
  '/studio/clients.html',
  '/studio/advanced.html',
]);

const query = new URLSearchParams(location.search);
const resetToken = query.get('reset') || '';
const requestedNext = query.get('next') || CANONICAL_STUDIO_PATH;
const destination = resolveDestination(requestedNext);

boot();

async function boot() {
  configureResetMode();
  bind();
  if (resetToken) {
    setMessage('Choisissez votre nouveau mot de passe.');
    return;
  }

  try {
    const auth = await api('/api/auth/status');
    if (auth?.user || auth?.authenticated || auth?.csrfToken) {
      if (auth.csrfToken) sessionStorage.setItem('neptune_csrf', auth.csrfToken);
      location.replace(destination);
      return;
    }
  } catch (error) {
    if (!['unauthorized', 'http_401'].includes(error.message)) {
      setMessage('Le contrôle de session a échoué. Vous pouvez vous connecter normalement.', 'error');
      return;
    }
  }
  setMessage('Saisissez vos identifiants pour ouvrir le Studio.');
}

function bind() {
  $('#login')?.addEventListener('submit', login);
  $('#requestReset')?.addEventListener('click', requestReset);
}

function configureResetMode() {
  if (!resetToken) return;
  $('#confirmField').hidden = false;
  $('#passwordField span').textContent = 'Nouveau mot de passe';
  $('#loginSubmit').textContent = 'Enregistrer et ouvrir le Studio';
  $('#requestReset').hidden = true;
  $('#authHint').textContent = 'Choisissez au moins 12 caractères. Ce lien ne fonctionne qu’une fois.';
}

async function login(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const button = $('#loginSubmit');
  button.disabled = true;
  setMessage(resetToken ? 'Enregistrement sécurisé…' : 'Connexion sécurisée…');

  try {
    if (resetToken) {
      if (form.get('password') !== form.get('confirmPassword')) throw new Error('passwords_do_not_match');
      await api('/api/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ token: resetToken, password: form.get('password') }),
      });
    }

    const result = await api('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: form.get('email'), password: form.get('password') }),
    });
    if (result.csrfToken) sessionStorage.setItem('neptune_csrf', result.csrfToken);
    location.replace(destination);
  } catch (error) {
    setMessage(humanError(error.message), 'error');
    button.disabled = false;
  }
}

async function requestReset() {
  const button = $('#requestReset');
  button.disabled = true;
  setMessage('Envoi du lien sécurisé…');
  try {
    const email = String($('#login [name=email]')?.value || 'contact@neptunebusiness.com').trim().toLowerCase();
    await api('/api/auth/request-reset', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
    setMessage('Lien envoyé. Il expire dans 20 minutes.', 'success');
  } catch (error) {
    setMessage(humanError(error.message), 'error');
  } finally {
    button.disabled = false;
  }
}

async function api(url, options = {}) {
  const headers = { Accept: 'application/json', ...(options.headers || {}) };
  if (options.body) headers['Content-Type'] = 'application/json';
  const response = await fetch(url, { ...options, headers, credentials: 'same-origin' });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `http_${response.status}`);
  return data;
}

function resolveDestination(value) {
  try {
    const url = new URL(value, location.origin);
    if (url.origin !== location.origin) return CANONICAL_STUDIO_PATH;
    if (ALLOWED_NEXT.has(url.pathname) || url.pathname.startsWith('/studio/advanced.html')) return `${url.pathname}${url.hash}`;
  } catch {}
  return CANONICAL_STUDIO_PATH;
}

function setMessage(text, type = '') {
  const target = $('#authMsg');
  if (!target) return;
  target.textContent = text;
  target.className = `message${type ? ` ${type}` : ''}`;
}

function humanError(code) {
  return ({
    passwords_do_not_match: 'Les mots de passe ne correspondent pas.',
    invalid_credentials: 'Identifiants incorrects.',
    too_many_attempts: 'Trop de tentatives. Réessayez plus tard.',
    unauthorized: 'Votre session a expiré.',
    reset_token_invalid: 'Ce lien de réinitialisation est invalide ou expiré.',
    internal_error: 'Le Studio a rencontré une erreur interne.',
  })[code] || 'Une erreur est survenue. Réessayez.';
}
