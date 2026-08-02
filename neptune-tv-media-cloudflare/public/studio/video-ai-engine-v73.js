const DEFAULT_ENDPOINT = 'http://127.0.0.1:4318';
const ENDPOINT_KEY = 'neptune_video_engine_endpoint';
const TOKEN_KEY = 'neptune_video_engine_token';
const JOBS_KEY = 'neptune_video_engine_jobs_v1';
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
  async health() {
    const request = this.request(`${this.endpoint()}/health`, {
      headers: this.headers({ Accept: 'application/json' }),
      cache: 'no-store',
      signal: AbortSignal.timeout(3500),
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
    if (endpoint) localStorage.setItem(ENDPOINT_KEY, String(endpoint).replace(/\/$/u, ''));
    if (token) localStorage.setItem(TOKEN_KEY, String(token).trim());
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

async function refreshConnection() {
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
    status.dataset.state = 'offline';
    status.textContent = 'Moteur permanent non connecté';
    detail.textContent = error?.message === 'local_network_permission_denied'
      ? 'Chrome ou Edge bloque l’accès local. Autorisez « Réseau local » dans les permissions du site puis reconnectez.'
      : 'Le Studio utilisera le moteur navigateur de secours. Installez ou reconnectez le moteur pour fermer l’onglet après l’import.';
    document.documentElement.dataset.neptuneEngine = 'offline';
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
    bridge.configure({ endpoint: endpoint?.value || DEFAULT_ENDPOINT, token: token?.value || '' });
    await refreshConnection();
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
