const DEFAULT_ENDPOINT = 'http://127.0.0.1:4318';
const ENDPOINT_KEY = 'neptune_video_engine_endpoint';
const TOKEN_KEY = 'neptune_video_engine_token';
const JOBS_KEY = 'neptune_video_engine_jobs_v1';

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
        if (event.lengthComputable && event.total > 0) onProgress?.(event.loaded / event.total, event.loaded, event.total);
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
  },
  forget(cloudJobId) {
    const jobs = this.pending();
    delete jobs[cloudJobId];
    localStorage.setItem(JOBS_KEY, JSON.stringify(jobs));
  },
  pending() {
    try { return JSON.parse(localStorage.getItem(JOBS_KEY) || '{}') || {}; }
    catch { return {}; }
  },
};

globalThis.NeptuneVideoEngineBridge = bridge;

const $ = (selector) => document.querySelector(selector);

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
  refreshConnection();
  setInterval(refreshConnection, 30000);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bindConnectionPanel, { once: true });
else bindConnectionPanel();
