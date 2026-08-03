import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';

const root = new URL('../', import.meta.url);
const patchSource = await readFile(new URL('public/studio/video-ai-generation-v75.js', root), 'utf8');
const html = await readFile(new URL('public/studio/video-ai.html', root), 'utf8');

const submissions = [];
const bridge = {
  submit(file, metadata, onProgress) {
    submissions.push({ file, metadata, onProgress });
    return Promise.resolve({ jobId: metadata.jobId, metadata });
  },
};

const context = {
  console,
  Date,
  Math,
  Uint32Array,
  crypto: webcrypto,
  NeptuneVideoEngineBridge: bridge,
};
context.globalThis = context;
vm.runInNewContext(patchSource, context, { filename: 'video-ai-generation-v75.js' });

const file = { name: 'Interview Neptune.mp4' };
const first = await bridge.submit(file, { jobId: 'cloud-job-123', orderId: 'order-7' });
const second = await bridge.submit(file, { jobId: 'cloud-job-123', orderId: 'order-7' });

assert.equal(submissions.length, 2);
assert.equal(first.metadata.cloudJobId, 'cloud-job-123');
assert.equal(second.metadata.cloudJobId, 'cloud-job-123');
assert.equal(first.metadata.forceRegenerate, true);
assert.equal(first.metadata.engineVersion, 'neptune-video-engine-20260803-v75');
assert.ok(first.metadata.generationNonce);
assert.ok(second.metadata.generationNonce);
assert.notEqual(first.jobId, second.jobId, 'deux reproductions ne doivent jamais partager le même jobId');
assert.match(first.jobId, /^cloud-job-123-v75-/u);
assert.ok(first.jobId.length <= 100);
assert.equal(bridge.__freshGenerationV751, true);
assert.equal(bridge.generationRelease, 'neptune-video-generation-20260803-v75.1');

const bridgeIndex = html.indexOf('/studio/video-ai-engine-v73.js?v=75');
const patchIndex = html.indexOf('/studio/video-ai-generation-v75.js?v=1');
const orchestratorIndex = html.indexOf('/studio/local-engine/neptune-video-local-engine-v1.js?v=73');
assert.ok(bridgeIndex >= 0 && patchIndex > bridgeIndex && orchestratorIndex > patchIndex,
  'le garde de nouvelle génération doit être chargé entre le bridge et l’orchestrateur');

console.log('Neptune Video Engine v75.1 validé : chaque reproduction crée un job local distinct et ne peut plus recycler les 8 anciens shorts.');
