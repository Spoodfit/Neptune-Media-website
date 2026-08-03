const DEFAULT_ENDPOINT = 'http://127.0.0.1:4318';
const ENDPOINT_KEY = 'neptune_video_engine_endpoint';
const TOKEN_KEY = 'neptune_video_engine_token';
const JOBS_KEY = 'neptune_video_engine_jobs_v1';
const REQUIRED_ENGINE_VERSION = 'neptune-video-engine-20260803-v75';
const previewTimers = new Map();
const previewUrls = new Map();

const bridge = {
  endpoint: () => localStorage.getItem(ENDPOINT_KEY) || DEFAULT_ENDPOINT,
  token: () => localStorage.getItem(TOKEN_KEY) || '',
  headers(extra = {}) {
    const token = this.token();
    return { ...extra, ...(token ? { 'X-Neptune-Engine-Token': token } : {}) };
  },
  request(url, options = {}) {
    try {
      return new Request(url, { ...options, targetAddressSpace: 'loopback' });
    } catch {
      return new Request(url, options);
    }
  },
  async probe(timeoutMs = 8000) {
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
  submit(file, metadata, onProgress) {
    return new Promise((resolve, reject) => {
      const body = new FormData();
      body.append('metadata', JSON.stringify(metadata));
      body.append('file', file, file.name);
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${this.endpoint()}/v1/jobs`, true);
      const token = this.token();
      if (token) xhr.setRequestHeader('X-Neptune-Engine-Token', token);
      xhr.setRequestHeader('Accept', 'application/json');
      xhr.timeout = 45 * 60 * 1000;
      xhr.upload.onprogress = (event) => {
        if (!event.lengthComputable || event.total <= 0) return;
        const fraction = event.loaded / event.total;
        renderTransferProgress(fraction, event.loaded, event.total);
        onProgress?.(fraction, event.loaded, event.total);
      };
      xhr.onerror = () => reject(new Error('engine_upload_network_failed'));
      xhr.ontimeout = () => reject(new Error('engine_upload_timeout'));
      xhr.onload = () => {
        let data = {};
        try { data = JSON.parse(xhr.responseText || '{}'); } catch {}
        if (xhr.status < 200 || xhr.status >= 300) {
          reject(new Error(data.detail || `engine_submit_${xhr.status}`));
          return;
        }
        renderTransferProgress(1, file.size, file.size);
        onProgress?.(1, file.size, file.size);
        resolve(data);
      };
      xhr.send(body);
    });
  },
  async job(jobId) {
    const request = this.request(`${this.endpoint()}/v1/jobs/${encodeURIComponent(jobId)}`, {
      headers: this.headers({ Accept: 'application/json' }),
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    });
    const response = await fetch(request);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.detail || `engine_job_${response.status}`);
    return data.job;
  },
  async clip(jobId, clipId) {
    const request = this.request(`${this.endpoint()}/v1/jobs/${encodeURIComponent(jobId)}/clips/${encodeURIComponent(clipId)}`, {
      headers: this.headers(),
      cache: 'no-store',
    });
    const response = await fetch(request);
    if (!response.ok) throw new Error(`engine_clip_${response.status}`);
    return response.blob();
  },
  async preview(jobId) {
    const request = this.request(`${this.endpoint()}/v1/jobs/${encodeURIComponent(jobId)}/preview`, {
      headers: this.headers(),
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    });
    const response = await fetch(request);
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`engine_preview_${response.status}`);
    return response.blob();
  },
  configure({ endpoint, token }) {
    if (endpoint) localStorage.setItem(ENDPOINT_KEY, String(endpoint).trim().replace(/\/$/u, ''));
    const normalizedToken = String(token || '').trim();
    if (normalizedToken) localStorage.setItem(TOKEN_KEY, normalizedToken);
  },
  remember(cloudJobId, engineJobId) {
    const jobs = this.pending();
    jobs[cloudJobId] = { engineJobId, savedAt: new Date().toISOString() };
    localStorage.setItem(JOBS_KEY, JSON.stringify(jobs));
    this.startPreview(engineJobId);
  },
  forget(cloudJobId) {
    const jobs = this.pending();
    const engineJobId = jobs[cloudJobId]?.engineJobId || cloudJobId;
    delete jobs[cloudJobId];
    localStorage.setItem(JOBS_KEY, JSON.stringify(jobs));
    stopPreview(engineJobId);
  },
  pending() {
    try { return JSON.parse(localStorage.getItem(JOBS_KEY) || '{}') || {}; }
    catch { return {}; }
  },
  startPreview(jobId) {
    if (!jobId || previewTimers.has(jobId)) return;
    ensurePreviewSurface();
    const update = async () => {
      try {
        const [blob, job] = await Promise.all([this.preview(jobId), this.job(jobId)]);
        if (blob) renderPreviewBlob(jobId, blob, friendlyStage(job.stage));
        if (['completed', 'failed'].includes(job.status)) stopPreview(jobId, job.status === 'completed');
      } catch (error) {
        if (!String(error?.message || '').includes('404')) console.debug('engine_preview_waiting', error);
      }
    };
    update();
    previewTimers.set(jobId, setInterval(update, 4500));
  },
};

globalThis.NeptuneVideoEngineBridge = bridge;

const $ = (selector) => document.querySelector(selector);

function timeoutSignal(milliseconds) {
  if (typeof AbortSignal?.timeout === 'function') return AbortSignal.timeout(milliseconds);
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort(new DOMException('signal timed out', 'TimeoutError'));
  }, milliseconds);
  controller.signal.addEventListener('abort', () => clearTimeout(timer), { once: true });
  return controller.signal;
}

function ensurePreviewSurface() {
  if ($('#engineLivePreview')) return;
  const progress = $('#uploadProgress');
  if (!progress) return;
  const figure = document.createElement('figure');
  figure.id = 'engineLivePreview';
  figure.className = 'engine-live-preview';
  figure.hidden = true;
  figure.innerHTML = '<div class="engine-live-preview__frame"><img id="engineLivePreviewImage" alt="Aperçu réel du contenu en cours de création"></div><figcaption><strong>Votre contenu prend forme</strong><span id="engineLivePreviewCaption">La première image apparaîtra dès que Neptune ouvre la vidéo.</span></figcaption>';
  progress.insertAdjacentElement('afterend', figure);
}

function renderTransferProgress(fraction, loaded, total) {
  const progress = Math.max(1, Math.min(5, 1 + Math.round(fraction * 4)));
  const bar = $('#uploadProgressBar');
  const percent = $('#uploadPercent');
  const stage = $('#uploadStage');
  if (bar) bar.value = progress;
  if (percent) percent.textContent = `${progress} %`;
  if (stage) stage.textContent = `Copie vers la machine Neptune · ${formatBytes(loaded)} sur ${formatBytes(total)}`;
}

function renderPreviewBlob(jobId, blob, caption) {
  ensurePreviewSurface();
  const figure = $('#engineLivePreview');
  const image = $('#engineLivePreviewImage');
  const text = $('#engineLivePreviewCaption');
  if (!figure || !image) return;
  const previous = previewUrls.get(jobId);
  if (previous) URL.revokeObjectURL(previous);
  const url = URL.createObjectURL(blob);
  previewUrls.set(jobId, url);
  image.src = url;
  figure.hidden = false;
  if (text) text.textContent = caption || 'Aperçu réel actualisé par Neptune.';
}

function stopPreview(jobId, keepVisible = false) {
  const timer = previewTimers.get(jobId);
  if (timer) clearInterval(timer);
  previewTimers.delete(jobId);
  if (!keepVisible) {
    const url = previewUrls.get(jobId);
    if (url) URL.revokeObjectURL(url);
    previewUrls.delete(jobId);
  }
}

function friendlyStage(stage) {
  const value = String(stage || '').toLowerCase();
  if (value.includes('transcription')) return 'Neptune comprend l’interview et prépare les sous-titres.';
  if (value.includes('repérage')) return 'Neptune repère les intervenants et prépare le cadrage vertical.';
  if (value.includes('sélection')) return 'Neptune choisit les moments les plus forts.';
  if (value.includes('création')) return 'Neptune monte et finalise les shorts.';
  if (value.includes('prêt')) return 'Les shorts sont prêts à être validés.';
  return 'Neptune ouvre et prépare la vidéo.';
}

function formatBytes(value) {
  const bytes = Number(value || 0);
  if (bytes < 1024 * 1024) return `${Math.max(0, bytes / 1024).toFixed(1)} Ko`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} Mo`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} Go`;
}

async function requestLoopbackPermission() {
  if (!navigator.permissions?.query) return;
  for (const name of ['loopback-network', 'local-network']) {
    try {
      const permission = await navigator.permissions.query({ name });
      if (permission.state === 'denied') throw new Error('local_network_permission_denied');
      return;
    } catch (error) {
      if (error?.message === 'local_network_permission_denied') throw error;
    }
  }
}

async function refreshConnection({ interactive = false } = {}) {
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
    const install = $('#engineInstallButton');
    const currentVersion = String(health.version || 'version inconnue');
    const updateRequired = currentVersion !== REQUIRED_ENGINE_VERSION;
    globalThis.NeptuneVideoEngineHealth = health;
    document.documentElement.dataset.neptuneEngine = 'connected';
    document.documentElement.dataset.neptuneEngineVersion = updateRequired ? 'outdated' : 'current';
    if (updateRequired) {
      status.dataset.state = 'warning';
      status.textContent = 'Mise à jour du moteur requise';
      detail.textContent = `Version actuelle : ${currentVersion}. Installez la v75 pour activer le recadrage de l’intervenant, les jump-cuts, les sous-titres verticaux sécurisés et la sélection multipasse.`;
      if (install) install.textContent = 'Mettre à jour le moteur';
    } else {
      status.dataset.state = 'connected';
      status.textContent = 'Moteur Neptune v75 connecté';
      detail.textContent = health.openAiConfigured
        ? 'Montage intelligent actif · sélection par phrases, cadrage YuNet sécurisé, sous-titres mot à mot et hooks exacts.'
        : 'Montage intelligent actif · intervenant suivi, silences resserrés, sous-titres verticaux et sélection locale/Ollama.';
      if (install) install.textContent = 'Réinstaller / mettre à jour';
    }
    if (connect) connect.textContent = 'Reconnecter';
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

function bindConnectionPanel() {
  ensurePreviewSurface();
  const endpoint = $('#engineEndpoint');
  const token = $('#engineToken');
  const button = $('#engineConnectButton');
  if (endpoint) endpoint.value = bridge.endpoint();
  if (token) token.value = bridge.token();
  button?.addEventListener('click', async () => {
    const previousLabel = button.textContent || 'Connecter';
    button.disabled = true;
    button.textContent = 'Connexion…';
    bridge.configure({ endpoint: endpoint?.value || DEFAULT_ENDPOINT, token: token?.value || '' });
    try {
      await refreshConnection({ interactive: true });
    } finally {
      button.disabled = false;
      button.textContent = document.documentElement.dataset.neptuneEngine === 'connected' ? 'Reconnecter' : previousLabel;
    }
  });
  $('#engineForgetButton')?.addEventListener('click', async () => {
    localStorage.removeItem(TOKEN_KEY);
    if (token) token.value = '';
    await refreshConnection();
  });
  for (const link of Object.values(bridge.pending())) bridge.startPreview(link.engineJobId);
  refreshConnection();
  setInterval(refreshConnection, 30000);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bindConnectionPanel, { once: true });
else bindConnectionPanel();
