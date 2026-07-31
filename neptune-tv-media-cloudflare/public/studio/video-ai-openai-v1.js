const STATUS_ENDPOINT = '/api/admin/video-ai/openai/status';
const TEST_ENDPOINT = '/api/admin/video-ai/openai/test';

initializeOpenAiPanel();

async function initializeOpenAiPanel() {
  const anchor = document.querySelector('.local-privacy-banner');
  if (!anchor || document.querySelector('.openai-integration-card')) return;
  const panel = document.createElement('section');
  panel.className = 'openai-integration-card';
  panel.dataset.state = 'loading';
  panel.setAttribute('aria-label', 'Connexion OpenAI du Studio vidéo');
  panel.innerHTML = `
    <div class="openai-integration-card__main">
      <div class="openai-integration-card__icon" aria-hidden="true">AI</div>
      <div class="openai-integration-card__copy">
        <strong>Analyse éditoriale OpenAI</strong>
        <p id="openAiStatusCopy">Vérification de la connexion sécurisée…</p>
        <div class="openai-integration-card__meta" id="openAiMeta"></div>
        <p class="openai-integration-card__hint" id="openAiHint"></p>
      </div>
    </div>
    <div class="openai-integration-card__actions">
      <span class="openai-integration-card__status" id="openAiStatus">Vérification…</span>
      <button class="openai-integration-card__test" id="openAiTest" type="button" hidden>Tester la connexion</button>
    </div>`;
  anchor.insertAdjacentElement('afterend', panel);
  document.querySelector('#openAiTest')?.addEventListener('click', testConnection);
  await loadStatus();
}

async function loadStatus() {
  const panel = document.querySelector('.openai-integration-card');
  try {
    const response = await fetch(STATUS_ENDPOINT, {
      headers: { Accept: 'application/json' },
      credentials: 'same-origin',
      cache: 'no-store',
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `http_${response.status}`);
    renderStatus(data);
    window.dispatchEvent(new CustomEvent('neptune:openai-video-status', { detail: data }));
  } catch (error) {
    panel.dataset.state = 'error';
    setText('#openAiStatus', 'Indisponible');
    setText('#openAiStatusCopy', humanError(error.message));
    setText('#openAiHint', 'Le moteur local reste disponible et continue de fonctionner sans cette connexion.');
  }
}

function renderStatus(data) {
  const panel = document.querySelector('.openai-integration-card');
  const configured = data.configured === true;
  panel.dataset.state = configured ? 'configured' : 'missing';
  setText('#openAiStatus', configured ? 'Connectée' : 'À connecter');
  setText(
    '#openAiStatusCopy',
    configured
      ? 'OpenAI analyse la transcription horodatée avant le rendu. La vidéo source reste sur cet ordinateur.'
      : 'Ajoutez le secret Cloudflare OPENAI_API_KEY pour activer l’analyse sémantique avant le montage.',
  );
  const meta = document.querySelector('#openAiMeta');
  if (meta) {
    meta.innerHTML = [
      `<span>Modèle : ${escapeHtml(data.model || 'gpt-5-mini')}</span>`,
      '<span>Structured Outputs</span>',
      '<span>store: false</span>',
      '<span>Vidéo source non envoyée</span>',
    ].join('');
  }
  setText(
    '#openAiHint',
    configured
      ? 'Priorité : OpenAI, puis Workers AI, puis moteur local déterministe en cas d’indisponibilité.'
      : 'Le moteur local et Workers AI restent les solutions de repli tant que la clé n’est pas enregistrée.',
  );
  const button = document.querySelector('#openAiTest');
  if (button) button.hidden = !configured;
}

async function testConnection() {
  const button = document.querySelector('#openAiTest');
  const panel = document.querySelector('.openai-integration-card');
  button.disabled = true;
  button.textContent = 'Test en cours…';
  setText('#openAiStatus', 'Test…');
  try {
    const csrfToken = await csrf();
    const response = await fetch(TEST_ENDPOINT, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-CSRF-Token': csrfToken,
      },
      body: '{}',
      credentials: 'same-origin',
      cache: 'no-store',
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `http_${response.status}`);
    panel.dataset.state = 'configured';
    setText('#openAiStatus', 'Connectée');
    setText('#openAiHint', `Connexion confirmée en ${Number(data.latencyMs || 0)} ms · modèle ${data.model || 'configuré'}.`);
  } catch (error) {
    panel.dataset.state = 'error';
    setText('#openAiStatus', 'Erreur');
    setText('#openAiHint', `${humanError(error.message)} Le traitement local reste actif.`);
  } finally {
    button.disabled = false;
    button.textContent = 'Tester la connexion';
  }
}

async function csrf() {
  let token = sessionStorage.getItem('neptune_csrf') || '';
  if (token) return token;
  const response = await fetch('/api/auth/status', { credentials: 'same-origin', cache: 'no-store' });
  const data = await response.json().catch(() => ({}));
  token = data.csrfToken || '';
  if (token) sessionStorage.setItem('neptune_csrf', token);
  return token;
}

function setText(selector, value) {
  const element = document.querySelector(selector);
  if (element) element.textContent = String(value || '');
}

function humanError(code) {
  const messages = {
    unauthorized: 'Session Studio expirée.',
    csrf_failed: 'La session de sécurité doit être actualisée.',
    openai_not_configured: 'La clé OPENAI_API_KEY est absente.',
    invalid_api_key: 'La clé OpenAI est invalide.',
    insufficient_quota: 'Le compte OpenAI ne dispose pas de crédit disponible.',
    rate_limit_exceeded: 'La limite OpenAI est temporairement atteinte.',
    openai_timeout: 'OpenAI n’a pas répondu dans le délai prévu.',
    openai_network_error: 'La connexion à OpenAI a échoué.',
  };
  return messages[code] || `Connexion OpenAI impossible (${String(code || 'erreur inconnue')}).`;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/gu, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}
