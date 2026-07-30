import { ALL_FORMATS, AudioBufferSink, BlobSource, Input } from 'mediabunny';

const TARGET_SAMPLE_RATE = 16_000;
const MAX_CHUNK_SECONDS = 420;

function resample(buffer) {
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, index) => buffer.getChannelData(index));
  const ratio = buffer.sampleRate / TARGET_SAMPLE_RATE;
  const length = Math.max(1, Math.floor(buffer.length / ratio));
  const output = new Float32Array(length);
  for (let index = 0; index < length; index += 1) {
    const position = index * ratio;
    const left = Math.floor(position);
    const right = Math.min(buffer.length - 1, left + 1);
    const fraction = position - left;
    let leftValue = 0;
    let rightValue = 0;
    for (const channel of channels) {
      leftValue += channel[left] || 0;
      rightValue += channel[right] || 0;
    }
    leftValue /= Math.max(1, channels.length);
    rightValue /= Math.max(1, channels.length);
    output[index] = leftValue + (rightValue - leftValue) * fraction;
  }
  return output;
}

function concatenate(parts, length) {
  const output = new Float32Array(length);
  let cursor = 0;
  for (const part of parts) {
    output.set(part, cursor);
    cursor += part.length;
  }
  return output;
}

export async function inspectMedia(file) {
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  const [videoTrack, audioTrack, duration] = await Promise.all([
    input.getPrimaryVideoTrack(),
    input.getPrimaryAudioTrack(),
    input.computeDuration(),
  ]);
  if (!videoTrack || !audioTrack || !Number.isFinite(duration) || duration <= 0) {
    throw new Error('invalid_video_source');
  }
  const [width, height] = await Promise.all([videoTrack.getDisplayWidth(), videoTrack.getDisplayHeight()]);
  return { durationSeconds: duration, width, height };
}

export async function extractAudioChunks(file, onProgress = () => {}) {
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  const audioTrack = await input.getPrimaryAudioTrack();
  if (!audioTrack) throw new Error('audio_track_missing');
  const duration = await input.computeDuration();
  const sink = new AudioBufferSink(audioTrack);
  const maximumSamples = MAX_CHUNK_SECONDS * TARGET_SAMPLE_RATE;
  const chunks = [];
  let parts = [];
  let length = 0;
  let offsetSeconds = 0;
  let processed = 0;

  const flush = () => {
    if (!length) return;
    chunks.push({ audio: concatenate(parts, length), offsetSeconds });
    offsetSeconds += length / TARGET_SAMPLE_RATE;
    parts = [];
    length = 0;
  };

  for await (const wrapped of sink.buffers()) {
    let audio = resample(wrapped.buffer);
    let cursor = 0;
    while (cursor < audio.length) {
      const available = maximumSamples - length;
      const take = Math.min(available, audio.length - cursor);
      const slice = audio.subarray(cursor, cursor + take);
      parts.push(slice.slice());
      length += take;
      cursor += take;
      if (length >= maximumSamples) flush();
    }
    processed = Math.max(processed, wrapped.timestamp + wrapped.duration);
    onProgress({ stage: 'Extraction audio locale', progress: Math.min(0.22, (processed / Math.max(duration, 0.001)) * 0.22), detail: `${Math.round(processed)} s analysées` });
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  flush();
  if (!chunks.length) throw new Error('audio_extraction_failed');
  return { durationSeconds: duration, chunks };
}
