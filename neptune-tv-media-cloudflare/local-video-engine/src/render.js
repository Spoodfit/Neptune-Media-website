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
  if (!segment) return '';
  return String(segment.text || '').trim().split(/\s+/u).slice(0, 14).join(' ');
}

function drawCaption(context, text, preset) {
  const styles = {
    'neptune-light': { fill: '#ffffff', accent: '#f2a4ff', box: 'rgba(3,11,28,.24)', stroke: 'rgba(0,0,0,.82)' },
    'neptune-boxed': { fill: '#ffffff', accent: '#61e8ff', box: 'rgba(2,8,24,.84)', stroke: 'rgba(0,0,0,.9)' },
    'neptune-premium': { fill: '#ffffff', accent: '#e7b7ff', box: 'rgba(3,11,28,.52)', stroke: 'rgba(0,0,0,.75)' },
    'neptune-contrast': { fill: '#ffffff', accent: '#77ebff', box: 'rgba(1,7,20,.72)', stroke: 'rgba(0,0,0,.9)' },
  };
  const style = styles[preset] || styles['neptune-contrast'];
  const words = text.split(/\s+/u).filter(Boolean);
  const lines = wrapWords(context, words, 810, 72);
  const lineHeight = 92;
  const paddingX = 34;
  const paddingY = 24;
  const top = HEIGHT * 0.73 - (lines.length * lineHeight) / 2;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.font = '900 72px Inter, Arial, sans-serif';
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const y = top + index * lineHeight;
    const width = context.measureText(line).width;
    roundedRect(context, WIDTH / 2 - width / 2 - paddingX, y - lineHeight / 2 + 3, width + paddingX * 2, lineHeight - 6, 22);
    context.fillStyle = style.box;
    context.fill();
    context.lineWidth = 10;
    context.strokeStyle = style.stroke;
    context.strokeText(line, WIDTH / 2, y);
    context.fillStyle = index === lines.length - 1 && lines.length > 1 ? style.accent : style.fill;
    context.fillText(line, WIDTH / 2, y);
  }
}

function wrapWords(context, words, maxWidth, fontSize) {
  context.font = `900 ${fontSize}px Inter, Arial, sans-serif`;
  const lines = [];
  let current = '';
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (context.measureText(next).width > maxWidth && current) {
      lines.push(current);
      current = word;
    } else current = next;
  }
  if (current) lines.push(current);
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
