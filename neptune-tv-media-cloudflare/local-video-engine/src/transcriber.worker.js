/// <reference lib="webworker" />
import { env, pipeline } from '@huggingface/transformers';

const MODEL_ID = 'onnx-community/whisper-base_timestamped';
let pipelinePromise = null;
let activeDevice = null;

env.allowLocalModels = false;
env.allowRemoteModels = true;
env.useBrowserCache = true;

async function hasWebGpu() {
  if (!self.navigator?.gpu) return false;
  try { return Boolean(await self.navigator.gpu.requestAdapter()); } catch { return false; }
}

async function getPipeline(device) {
  if (pipelinePromise && activeDevice === device) return pipelinePromise;
  activeDevice = device;
  pipelinePromise = pipeline('automatic-speech-recognition', MODEL_ID, {
    device,
    dtype: device === 'webgpu'
      ? { encoder_model: 'fp32', decoder_model_merged: 'q4' }
      : { encoder_model: 'fp32', decoder_model_merged: 'q4' },
    progress_callback(progress) {
      self.postMessage({ type: 'model-progress', progress });
    },
  });
  return pipelinePromise;
}

async function transcribe(audio, requestedDevice) {
  const device = requestedDevice === 'wasm' ? 'wasm' : (await hasWebGpu() ? 'webgpu' : 'wasm');
  try {
    const transcriber = await getPipeline(device);
    self.postMessage({ type: 'status', stage: device === 'webgpu' ? 'Transcription locale accélérée' : 'Transcription locale compatible' });
    return await transcriber(audio, {
      language: 'fr',
      task: 'transcribe',
      return_timestamps: 'word',
      chunk_length_s: 25,
      stride_length_s: 4,
    });
  } catch (error) {
    if (device !== 'webgpu') throw error;
    pipelinePromise = null;
    activeDevice = null;
    self.postMessage({ type: 'status', stage: 'Reprise automatique sur le processeur' });
    const transcriber = await getPipeline('wasm');
    return transcriber(audio, {
      language: 'fr', task: 'transcribe', return_timestamps: 'word', chunk_length_s: 25, stride_length_s: 4,
    });
  }
}

self.addEventListener('message', async (event) => {
  const message = event.data || {};
  if (message.type !== 'transcribe') return;
  try {
    const result = await transcribe(message.audio, message.device);
    self.postMessage({ type: 'complete', requestId: message.requestId, result });
  } catch (error) {
    self.postMessage({ type: 'error', requestId: message.requestId, message: error instanceof Error ? error.message : String(error) });
  }
});
