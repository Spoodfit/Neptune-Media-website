from pathlib import Path

BRIDGE = Path('neptune-tv-media-cloudflare/public/studio/video-ai-engine-v73.js')
text = BRIDGE.read_text(encoding='utf-8')

old = """  async health() {
    const request = this.request(`${this.endpoint()}/health`, {
      headers: this.headers({ Accept: 'application/json' }),
      cache: 'no-store',
      signal: AbortSignal.timeout(3500),
    });
    const response = await fetch(request);
    if (!response.ok) throw new Error(`engine_health_${response.status}`);
    return response.json();
  },
"""
new = """  async probe(timeoutMs = 8000) {
    const request = this.request(`${this.endpoint()}/health`, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      signal: timeoutSignal(timeoutMs),
    });
    const response = await fetch(request);
    if (![200, 401].includes(response.status)) throw new Error(`engine_probe_${response.status}`);
    return {
      status: response.status,
      data: response.status === 200 ? await response.json().catch(() => ({})) : null,
    };
  },
  async health(timeoutMs = 10000) {
    const request = this.request(`${this.endpoint()}/health`, {
      headers: this.headers({ Accept: 'application/json' }),
      cache: 'no-store',
      signal: timeoutSignal(timeoutMs),
    });
    const response = await fetch(request);
    if (!response.ok) throw new Error(`engine_health_${response.status}`);
    return response.json();
  },
"""
if old not in text:
    raise SystemExit('health anchor not found')
text = text.replace(old, new, 1)

old = """    const normalizedToken = String(token || '').trim();
    if (normalizedToken) localStorage.setItem(TOKEN_KEY, normalizedToken);
    else localStorage.removeItem(TOKEN_KEY);
"""
new = """    const normalizedToken = String(token || '').trim();
    if (normalizedToken) localStorage.setItem(TOKEN_KEY, normalizedToken);
"""
if old not in text:
    raise SystemExit('configure token anchor not found')
text = text.replace(old, new, 1)

anchor = """const $ = (selector) => document.querySelector(selector);

"""
helper = """const $ = (selector) => document.querySelector(selector);

function timeoutSignal(milliseconds) {
  if (typeof AbortSignal?.timeout === 'function') return AbortSignal.timeout(milliseconds);
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort(new DOMException('signal timed out', 'TimeoutError'));
  }, milliseconds);
  controller.signal.addEventListener('abort', () => clearTimeout(timer), { once: true });
  return controller.signal;
}

"""
if anchor not in text:
    raise SystemExit('timeout helper anchor not found')
text = text.replace(anchor, helper, 1)

old = """async function refreshConnection() {
  const status = $('#engineConnectionStatus');
  const detail = $('#engineConnectionDetail');
  const connect = $('#engineConnectButton');
  if (!status || !detail) return;
  status.dataset.state = 'checking';
  status.textContent = 'Vérification…';
  detail.textContent = 'Recherche du moteur Neptune sur cet ordinateur.';
  try {
    await requestLoopbackPermission();
    const health = await bridge.health();
    status.dataset.state = 'connected';
    status.textContent = 'Moteur Neptune connecté';
    detail.textContent = health.openAiConfigured
      ? 'Production autonome active · Whisper, OpenAI, FFmpeg et reprise automatique.'
      : 'Production autonome active · Whisper, FFmpeg et sélection locale/Ollama.';
    if (connect) connect.textContent = 'Reconnecter';
    document.documentElement.dataset.neptuneEngine = 'connected';
  } catch (error) {
    const message = String(error?.message || error || 'engine_connection_failed');
    status.dataset.state = 'offline';
    status.textContent = 'Connexion au moteur impossible';
    if (message === 'local_network_permission_denied') {
      detail.textContent = 'Chrome ou Edge bloque l’accès au réseau local. Autorisez « Réseau local » pour ce site, puis cliquez à nouveau sur Connecter.';
    } else if (message === 'engine_health_401') {
      detail.textContent = 'Le code de connexion est incorrect. Recopiez entièrement le contenu du fichier pairing.txt.';
    } else if (message === 'engine_health_403') {
      detail.textContent = 'Le moteur refuse cette origine. Relancez l’installateur Neptune pour actualiser sa configuration.';
    } else if (message.includes('Timeout') || message.includes('timeout')) {
      detail.textContent = 'Le moteur ne répond pas. Vérifiez que Docker Desktop est ouvert et que Neptune Video Engine est démarré.';
    } else if (message.includes('Failed to fetch') || message.includes('NetworkError') || message === 'engine_connection_failed') {
      detail.textContent = 'Le navigateur n’atteint pas le moteur local. Vérifiez Docker Desktop et autorisez l’accès « Réseau local » dans les permissions du site.';
    } else {
      detail.textContent = `Connexion refusée : ${message}. Vérifiez Docker Desktop, l’adresse et le code de connexion.`;
    }
    document.documentElement.dataset.neptuneEngine = 'offline';
    console.warn('neptune_engine_connection_failed', { message, endpoint: bridge.endpoint() });
  }
}
"""
new = """async function refreshConnection({ interactive = false } = {}) {
  const status = $('#engineConnectionStatus');
  const detail = $('#engineConnectionDetail');
  const connect = $('#engineConnectButton');
  if (!status || !detail) return;
  status.dataset.state = 'checking';
  status.textContent = interactive ? 'Autorisation du moteur…' : 'Vérification…';
  detail.textContent = interactive
    ? 'Chrome peut demander l’autorisation d’accéder au réseau local. Validez-la pour continuer.'
    : 'Recherche du moteur Neptune sur cet ordinateur.';
  try {
    await requestLoopbackPermission();
    const probe = await bridge.probe(interactive ? 30000 : 7000);
    if (probe.status === 401 && !bridge.token()) throw new Error('engine_token_missing');
    const health = probe.status === 200 && probe.data?.ok
      ? probe.data
      : await bridge.health(interactive ? 12000 : 8000);
    status.dataset.state = 'connected';
    status.textContent = 'Moteur Neptune connecté';
    detail.textContent = health.openAiConfigured
      ? 'Production autonome active · Whisper, OpenAI, FFmpeg et reprise automatique.'
      : 'Production autonome active · Whisper, FFmpeg et sélection locale/Ollama.';
    if (connect) connect.textContent = 'Reconnecter';
    document.documentElement.dataset.neptuneEngine = 'connected';
  } catch (error) {
    const message = String(error?.message || error || 'engine_connection_failed');
    const timedOut = error?.name === 'TimeoutError' || message.includes('signal timed out') || message.includes('Timeout') || message.includes('timeout');
    status.dataset.state = 'offline';
    status.textContent = message === 'engine_token_missing'
      ? 'Moteur détecté · code requis'
      : 'Connexion au moteur impossible';
    if (message === 'engine_token_missing') {
      detail.textContent = 'Le moteur répond correctement. Collez le code complet du fichier pairing.txt, puis cliquez sur Connecter.';
    } else if (message === 'local_network_permission_denied') {
      detail.textContent = 'Chrome ou Edge bloque l’accès au réseau local. Autorisez « Réseau local » pour ce site, puis cliquez à nouveau sur Connecter.';
    } else if (message === 'engine_health_401') {
      detail.textContent = 'Le code de connexion est incorrect. Recopiez entièrement le contenu du fichier pairing.txt.';
    } else if (message === 'engine_health_403') {
      detail.textContent = 'Le moteur refuse cette origine. Relancez l’installateur Neptune pour actualiser sa configuration.';
    } else if (timedOut) {
      detail.textContent = interactive
        ? 'L’autorisation réseau locale n’a pas été confirmée à temps. Autorisez « Réseau local » dans les permissions du site, puis recliquez sur Connecter.'
        : 'Accès local non confirmé. Cliquez sur Connecter pour ouvrir la demande d’autorisation du navigateur.';
    } else if (message.includes('Failed to fetch') || message.includes('NetworkError') || message === 'engine_connection_failed') {
      detail.textContent = 'Le navigateur n’atteint pas le moteur local. Autorisez « Réseau local » dans les permissions du site, puis cliquez sur Connecter.';
    } else {
      detail.textContent = `Connexion refusée : ${message}. Vérifiez l’adresse et le code de connexion.`;
    }
    document.documentElement.dataset.neptuneEngine = 'offline';
    console.warn('neptune_engine_connection_failed', { message, endpoint: bridge.endpoint(), interactive });
  }
}
"""
if old not in text:
    raise SystemExit('refresh connection anchor not found')
text = text.replace(old, new, 1)

old = """      await refreshConnection();
    } finally {
"""
new = """      await refreshConnection({ interactive: true });
    } finally {
"""
if old not in text:
    raise SystemExit('interactive button anchor not found')
text = text.replace(old, new, 1)

BRIDGE.write_text(text, encoding='utf-8')
print('Applied Neptune browser handshake v73.2 fix.')
