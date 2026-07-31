/// <reference lib="webworker" />
import { env, pipeline } from '@huggingface/transformers';

const WEBGPU_PROFILE = {
  key: 'webgpu-base-fp16-q4',
  modelId: 'onnx-community/whisper-base_timestamped',
  device: 'webgpu',
  dtype: { encoder_model: 'fp16', decoder_model_merged: 'q4' },
  stage: 'Transcription locale accélérée',
};

const CPU_PROFILE = {
  key: 'wasm-tiny-q8',
  modelId: 'onnx-community/whisper-tiny_timestamped',
  device: 'wasm',
  dtype: 'q8',
  stage: 'Transcription locale optimisée sur le processeur',
};

let pipelinePromise = null;
let activeProfileKey = '';
let activeRequestId = '';
let webGpuDisabledForSession = false;

env.allowLocalModels = false;
env.allowRemoteModels = true;
env.useBrowserCache = true;

async function hasWebGpu() {
  if (webGpuDisabledForSession || !self.navigator?.gpu) return false;
  try {
    return Boolean(await self.navigator.gpu.requestAdapter());
  } catch {
    return false;
  }
}

function resetPipeline() {
  pipelinePromise = null;
  activeProfileKey = '';
}

async function getPipeline(profile) {
  if (pipelinePromise && activeProfileKey === profile.key) return pipelinePromise;

  resetPipeline();
  activeProfileKey = profile.key;
  pipelinePromise = pipeline('automatic-speech-recognition', profile.modelId, {
    device: profile.device,
    dtype: profile.dtype,
    progress_callback(progress) {
      const raw = Number(progress?.progress || 0);
      const normalized = Number.isFinite(raw)
        ? Math.max(0, Math.min(1, raw > 1 ? raw / 100 : raw))
        : 0;
      self.postMessage({
        type: 'model-progress',
        requestId: activeRequestId,
        progress: {
          ...(progress || {}),
          progress: normalized,
          profile: profile.key,
          modelId: profile.modelId,
        },
      });
    },
  }).catch((error) => {
    resetPipeline();
    throw error;
  });

  return pipelinePromise;
}

async function runTranscription(audio, profile, requestId) {
  const transcriber = await getPipeline(profile);
  self.postMessage({
    type: 'status',
    requestId,
    stage: profile.stage,
    profile: profile.key,
    modelId: profile.modelId,
  });
  return transcriber(audio, {
    language: 'fr',
    task: 'transcribe',
    return_timestamps: 'word',
    chunk_length_s: 25,
    stride_length_s: 4,
  });
}

async function transcribe(audio, requestedDevice, requestId) {
  activeRequestId = requestId;
  const forceCpu = requestedDevice === 'wasm';
  const canUseWebGpu = !forceCpu && await hasWebGpu();

  if (canUseWebGpu) {
    try {
      return await runTranscription(audio, WEBGPU_PROFILE, requestId);
    } catch (error) {
      webGpuDisabledForSession = true;
      resetPipeline();
      self.postMessage({
        type: 'status',
        requestId,
        stage: 'Reprise optimisée sur le processeur',
        profile: CPU_PROFILE.key,
        recoveredFrom: 'webgpu',
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return runTranscription(audio, CPU_PROFILE, requestId);
}

function normalizeWorkerError(error) {
  const message = error instanceof Error ? error.message : String(error || '');
  if (/memory|allocation|out of memory|wasm memory|bad_alloc/iu.test(message)) {
    return 'local_engine_memory_limit';
  }
  return 'local_transcription_failed';
}

self.addEventListener('message', async (event) => {
  const message = event.data || {};
  if (message.type !== 'transcribe') return;

  try {
    const result = await transcribe(message.audio, message.device, message.requestId);
    self.postMessage({
      type: 'complete',
      requestId: message.requestId,
      result,
      profile: activeProfileKey,
    });
  } catch (error) {
    resetPipeline();
    self.postMessage({
      type: 'error',
      requestId: message.requestId,
      message: normalizeWorkerError(error),
      detail: error instanceof Error ? error.message : String(error),
    });
  } finally {
    if (activeRequestId === message.requestId) activeRequestId = '';
  }
});
