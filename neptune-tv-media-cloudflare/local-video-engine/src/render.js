import {
  ALL_FORMATS,
  AudioSampleSink,
  AudioSampleSource,
  BlobSource,
  BufferTarget,
  Input,
  Mp4OutputFormat,
  Output,
  VideoSample,
  VideoSampleSink,
  VideoSampleSource,
  WebMOutputFormat,
  getFirstEncodableAudioCodec,
  getFirstEncodableVideoCodec,
} from 'mediabunny';

const WIDTH = 1080;
const HEIGHT = 1920;
const CAPTION_WINDOW_WORDS = 7;

export async function renderCandidate(file, candidate, onProgress = () => {}) {
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  const [videoTrack, audioTrack] = await Promise.all([input.getPrimaryVideoTrack(), input.getPrimaryAudioTrack()]);
  if (!videoTrack || !audioTrack) throw new Error('video_tracks_missing');
  const profile = await detectProfile();
  const target = new BufferTarget();
  const output = new Output({
    format: profile.container === 'mp4' ? new Mp4OutputFormat() : new WebMOutputFormat(),
    target,
  });
  const videoSource = new VideoSampleSource({
    codec: profile.videoCodec,
    bitrate: profile.container === 'mp4' ? 5_000_000 : 4_000_000,
    keyFrameInterval: 2,
    hardwareAcceleration: 'no-preference',
  });
  const audioSource = new AudioSampleSource({ codec: profile.audioCodec, bitrate: 128_000 });
  output.addVideoTrack(videoSource);
  output.addAudioTrack(audioSource, { languageCode: 'fra' });
  await output.start();

  const [sourceWidth, sourceHeight] = await Promise.all([videoTrack.getDisplayWidth(), videoTrack.getDisplayHeight()]);
  const sourceCanvas = new OffscreenCanvas(sourceWidth, sourceHeight);
  const sourceContext = sourceCanvas.getContext('2d', { alpha: false });
  const outputCanvas = new OffscreenCanvas(WIDTH, HEIGHT);
  const outputContext = outputCanvas.getContext('2d', { alpha: false });
  if (!sourceContext || !outputContext) throw new Error('canvas_unavailable');

  const start = Number(candidate.startSeconds || 0);
  const end = Number(candidate.endSeconds || 0);
  const duration = Math.max(0.1, end - start);
  const videoSink = new VideoSampleSink(videoTrack);
  const audioSink = new AudioSampleSink(audioTrack);
  const tracker = createFaceTracker(sourceWidth, sourceHeight);
  let videoProgress = 0;
  let audioProgress = 0;

  const report = () => onProgress({
    stage: `Montage local · ${candidate.title || 'short'}`,
    progress: 0.58 + Math.min(0.38, ((videoProgress + audioProgress) / 2) * 0.38),
    detail: `${Math.round(((videoProgress + audioProgress) / 2) * 100)} % du rendu`,
  });

  try {
    await Promise.all([
      (async () => {
        let index = 0;
        for await (const sample of videoSink.samples(start, end)) {
          const sourceTimestamp = sample.timestamp;
          sourceContext.fillStyle = '#000';
          sourceContext.fillRect(0, 0, sourceWidth, sourceHeight);
          sample.draw(sourceContext, 0, 0, sourceWidth, sourceHeight);
          const crop = await tracker.cropFor(sourceCanvas, sourceTimestamp, index);
          drawVerticalFrame(outputContext, sourceCanvas, crop, candidate, sourceTimestamp);
          const rendered = new VideoSample(outputCanvas, {
            timestamp: Math.max(0, sourceTimestamp - start),
            duration: sample.duration,
          });
          await videoSource.add(rendered, { keyFrame: index === 0 });
          rendered.close();
          sample.close();
          index += 1;
          videoProgress = Math.min(1, (sourceTimestamp - start) / duration);
          if (index % 12 === 0) report();
        }
        videoSource.close();
        videoProgress = 1;
        report();
      })(),
      (async () => {
        for await (const sample of audioSink.samples(start, end)) {
          const sourceTimestamp = sample.timestamp;
          sample.setTimestamp(Math.max(0, sourceTimestamp - start));
          await audioSource.add(sample);
          sample.close();
          audioProgress = Math.min(1, (sourceTimestamp - start) / duration);
        }
        audioSource.close();
        audioProgress = 1;
        report();
      })(),
    ]);
    await output.finalize();
  } catch (error) {
    if (output.state === 'started') await output.cancel().catch(() => {});
    throw error;
  }

  if (!target.buffer) throw new Error('local_render_empty');
  const blob = new Blob([target.buffer], { type: profile.mimeType });
  return { blob, mimeType: profile.mimeType, extension: profile.extension, width: WIDTH, height: HEIGHT };
}

async function detectProfile() {
  const [avc, aac] = await Promise.all([
    getFirstEncodableVideoCodec(['avc'], { width: WIDTH, height: HEIGHT }),
    getFirstEncodableAudioCodec(['aac']),
  ]);
  if (avc && aac) return { container: 'mp4', videoCodec: avc, audioCodec: aac, mimeType: 'video/mp4', extension: 'mp4' };
  const [vp8, opus] = await Promise.all([
    getFirstEncodableVideoCodec(['vp8', 'vp9'], { width: WIDTH, height: HEIGHT }),
    getFirstEncodableAudioCodec(['opus']),
  ]);
  if (vp8 && opus) return { container: 'webm', videoCodec: vp8, audioCodec: opus, mimeType: 'video/webm', extension: 'webm' };
  throw new Error('local_encoder_unavailable');
}

function drawVerticalFrame(context, sourceCanvas, crop, candidate, sourceTimestamp) {
  context.fillStyle = '#020916';
  context.fillRect(0, 0, WIDTH, HEIGHT);
  context.drawImage(sourceCanvas, crop.x, crop.y, crop.width, crop.height, 0, 0, WIDTH, HEIGHT);
  const caption = activeCaption(candidate.transcriptSegments || [], sourceTimestamp);
  if (caption) drawCaption(context, caption, candidate.captionPreset || 'neptune-contrast');
}

function activeCaption(segments, timestamp) {
  const segment = segments.find((item) => timestamp >= Number(item.start || 0) - 0.08 && timestamp <= Number(item.end || 0) + 0.12);
  if (!segment) return null;
  const words = String(segment.text || '').trim().split(/\s+/u).filter(Boolean);
  if (!words.length) return null;
  const start = Number(segment.start || 0);
  const duration = Math.max(0.25, Number(segment.end || start + 0.25) - start);
  const relative = Math.max(0, Math.min(0.999, (timestamp - start) / duration));
  const activeGlobalIndex = Math.min(words.length - 1, Math.floor(relative * words.length));
  const windowStart = Math.floor(activeGlobalIndex / CAPTION_WINDOW_WORDS) * CAPTION_WINDOW_WORDS;
  const windowWords = words.slice(windowStart, windowStart + CAPTION_WINDOW_WORDS);
  return {
    words: windowWords,
    activeIndex: Math.max(0, Math.min(windowWords.length - 1, activeGlobalIndex - windowStart)),
  };
}

function drawCaption(context, caption, preset) {
  const styles = {
    'neptune-light': { fill: '#ffffff', accent: '#f2a4ff', box: 'rgba(3,11,28,.24)', stroke: 'rgba(0,0,0,.82)' },
    'neptune-boxed': { fill: '#ffffff', accent: '#61e8ff', box: 'rgba(2,8,24,.84)', stroke: 'rgba(0,0,0,.9)' },
    'neptune-premium': { fill: '#ffffff', accent: '#e7b7ff', box: 'rgba(3,11,28,.52)', stroke: 'rgba(0,0,0,.75)' },
    'neptune-contrast': { fill: '#ffffff', accent: '#77ebff', box: 'rgba(1,7,20,.72)', stroke: 'rgba(0,0,0,.9)' },
  };
  const style = styles[preset] || styles['neptune-contrast'];
  const fontSize = caption.words.length <= 4 ? 82 : 72;
  const lines = wrapWordObjects(context, caption.words, caption.activeIndex, 820, fontSize);
  const lineHeight = fontSize + 24;
  const paddingX = 34;
  const top = HEIGHT * 0.74 - (lines.length * lineHeight) / 2;
  context.textAlign = 'left';
  context.textBaseline = 'middle';
  context.font = `900 ${fontSize}px Inter, Arial, sans-serif`;

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    const y = top + lineIndex * lineHeight;
    const lineWidth = line.reduce((sum, word, index) => sum + context.measureText(word.text).width + (index ? context.measureText(' ').width : 0), 0);
    const x = WIDTH / 2 - lineWidth / 2;
    roundedRect(context, x - paddingX, y - lineHeight / 2 + 4, lineWidth + paddingX * 2, lineHeight - 8, 22);
    context.fillStyle = style.box;
    context.fill();

    let cursor = x;
    for (let wordIndex = 0; wordIndex < line.length; wordIndex += 1) {
      const word = line[wordIndex];
      if (wordIndex) cursor += context.measureText(' ').width;
      context.lineWidth = 10;
      context.strokeStyle = style.stroke;
      context.strokeText(word.text, cursor, y);
      context.fillStyle = word.active ? style.accent : style.fill;
      context.fillText(word.text, cursor, y);
      cursor += context.measureText(word.text).width;
    }
  }
}

function wrapWordObjects(context, words, activeIndex, maxWidth, fontSize) {
  context.font = `900 ${fontSize}px Inter, Arial, sans-serif`;
  const lines = [];
  let current = [];
  let currentWidth = 0;
  const spaceWidth = context.measureText(' ').width;
  for (let index = 0; index < words.length; index += 1) {
    const text = words[index];
    const width = context.measureText(text).width;
    const nextWidth = currentWidth + (current.length ? spaceWidth : 0) + width;
    if (nextWidth > maxWidth && current.length) {
      lines.push(current);
      current = [];
      currentWidth = 0;
    }
    current.push({ text, active: index === activeIndex });
    currentWidth += (current.length > 1 ? spaceWidth : 0) + width;
  }
  if (current.length) lines.push(current);
  return lines.slice(0, 3);
}

function roundedRect(context, x, y, width, height, radius) {
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
}

function createFaceTracker(sourceWidth, sourceHeight) {
  const Detector = globalThis.FaceDetector;
  const detector = Detector ? new Detector({ fastMode: true, maxDetectedFaces: 3 }) : null;
  let centerX = sourceWidth / 2;
  let lastDetection = -Infinity;
  return {
    async cropFor(canvas, timestamp, frameIndex) {
      if (detector && (timestamp - lastDetection > 0.8 || frameIndex === 0)) {
        lastDetection = timestamp;
        try {
          const faces = await detector.detect(canvas);
          if (faces.length) {
            const largest = faces.sort((a, b) => b.boundingBox.width * b.boundingBox.height - a.boundingBox.width * a.boundingBox.height)[0];
            const detected = largest.boundingBox.x + largest.boundingBox.width / 2;
            centerX = centerX * 0.72 + detected * 0.28;
          }
        } catch { /* center crop remains deterministic */ }
      }
      const targetRatio = WIDTH / HEIGHT;
      let cropWidth = sourceHeight * targetRatio;
      let cropHeight = sourceHeight;
      if (cropWidth > sourceWidth) {
        cropWidth = sourceWidth;
        cropHeight = sourceWidth / targetRatio;
      }
      const x = Math.max(0, Math.min(sourceWidth - cropWidth, centerX - cropWidth / 2));
      const y = Math.max(0, (sourceHeight - cropHeight) / 2);
      return { x, y, width: cropWidth, height: cropHeight };
    },
  };
}
