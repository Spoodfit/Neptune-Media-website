const RELEASE = 'neptune-video-generation-20260803-v75.1';
const ENGINE_VERSION = 'neptune-video-engine-20260803-v75';

const bridge = globalThis.NeptuneVideoEngineBridge;

if (bridge && !bridge.__freshGenerationV751) {
  const originalSubmit = bridge.submit.bind(bridge);

  bridge.submit = (file, metadata = {}, onProgress) => {
    const source = metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? metadata : {};
    const cloudJobId = String(source.cloudJobId || source.jobId || source.orderId || '').trim();
    const nonce = createNonce();
    const base = slug(cloudJobId || file?.name || 'video');
    const jobId = `${base.slice(0, 56)}-v75-${nonce}`.slice(0, 100);

    return originalSubmit(file, {
      ...source,
      cloudJobId,
      previousEngineJobId: String(source.engineJobId || source.previousEngineJobId || '').trim(),
      jobId,
      generationNonce: nonce,
      engineVersion: ENGINE_VERSION,
      forceRegenerate: true,
    }, onProgress);
  };

  bridge.__freshGenerationV751 = true;
  bridge.generationRelease = RELEASE;
}

function createNonce() {
  const time = Date.now().toString(36);
  const random = new Uint32Array(2);
  globalThis.crypto?.getRandomValues?.(random);
  const entropy = Array.from(random, (value) => value.toString(36)).join('').slice(0, 12)
    || Math.random().toString(36).slice(2, 14);
  return `${time}-${entropy}`;
}

function slug(value) {
  return String(value || 'video')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/gu, '')
    .replace(/[^A-Za-z0-9_-]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .slice(0, 64)
    || 'video';
}
