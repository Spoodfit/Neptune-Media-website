const runtime = document.querySelector('#runtimeState');
const form = document.querySelector('#uploadForm');
const startButton = document.querySelector('#startUpload');
const message = document.querySelector('#uploadMessage');
const progress = document.querySelector('#uploadProgressBar');
let wakeLock = null;

const missing = [];
if (!globalThis.crossOriginIsolated) missing.push('isolation sécurisée');
if (!globalThis.indexedDB) missing.push('stockage local');
if (!globalThis.Worker) missing.push('Web Workers');
if (!globalThis.OffscreenCanvas) missing.push('canvas hors écran');
if (!globalThis.VideoEncoder || !globalThis.AudioEncoder) missing.push('encodeurs WebCodecs');
if (!globalThis.crypto?.subtle) missing.push('empreinte locale');

if (missing.length) {
  document.body.dataset.localEngineCompatible = 'false';
  runtime?.classList.add('error');
  if (runtime) runtime.innerHTML = `<i></i> Navigateur incompatible`;
  if (startButton) startButton.disabled = true;
  if (message) {
    message.className = 'form-message error';
    message.textContent = `Fonctions manquantes : ${missing.join(', ')}. Utilisez la dernière version de Chrome ou Edge sur ordinateur.`;
  }
  form?.addEventListener('submit', (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);
  new MutationObserver(() => {
    if (startButton && !startButton.disabled) startButton.disabled = true;
  }).observe(startButton || document.documentElement, { attributes: true, attributeFilter: ['disabled'] });
} else {
  document.body.dataset.localEngineCompatible = 'true';
  const memory = Number(navigator.deviceMemory || 0);
  const cores = Number(navigator.hardwareConcurrency || 0);
  if (runtime) runtime.title = `Moteur local compatible${memory ? ` · ${memory} Go mémoire déclarée` : ''}${cores ? ` · ${cores} threads` : ''}`;
  if (memory && memory < 4 && message) {
    message.className = 'form-message';
    message.textContent = 'Cet ordinateur dispose de peu de mémoire déclarée. Fermez les applications lourdes avant une longue vidéo.';
  }
}

form?.addEventListener('submit', () => {
  requestWakeLock().catch(() => {});
}, true);

progress?.addEventListener('change', releaseIfComplete);
new MutationObserver(releaseIfComplete).observe(progress || document.documentElement, { attributes: true, attributeFilter: ['value'] });
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && processingAppearsActive()) requestWakeLock().catch(() => {});
});
window.addEventListener('beforeunload', () => releaseWakeLock());

async function requestWakeLock() {
  if (!navigator.wakeLock?.request || wakeLock) return;
  try {
    wakeLock = await navigator.wakeLock.request('screen');
    wakeLock.addEventListener('release', () => { wakeLock = null; });
  } catch {
    wakeLock = null;
  }
}

function processingAppearsActive() {
  const panel = document.querySelector('#uploadProgress');
  const value = Number(progress?.value || 0);
  return panel && !panel.hidden && value > 0 && value < 100;
}

function releaseIfComplete() {
  if (Number(progress?.value || 0) >= 100) releaseWakeLock();
}

function releaseWakeLock() {
  if (!wakeLock) return;
  wakeLock.release().catch(() => {});
  wakeLock = null;
}
