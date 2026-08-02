import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const TRANSCRIPTION_RECOVERY_RELEASE = 'neptune-local-transcription-recovery-20260731-v1';
const PERMANENT_ENGINE_RELEASE = 'neptune-video-engine-bridge-20260802-v73';

const permanentEngineRuntime = String.raw`
async function processFileWithPreferredEngine(file, jobId) {
  const bridge = globalThis.NeptuneVideoEngineBridge;
  if (!bridge) return processFileLocally(file, jobId);
  let health = null;
  try { health = await bridge.health(); } catch {}
  if (!health?.ok) {
    setFormMessage('Le moteur permanent n’est pas connecté. Neptune utilise le moteur navigateur de secours.', 'success');
    return processFileLocally(file, jobId);
  }
  try {
    return await processFileWithPermanentEngine(file, jobId, bridge);
  } catch (error) {
    console.warn('permanent_video_engine_failed_using_browser_fallback', error);
    setFormMessage('Le moteur permanent a rencontré un problème. Reprise immédiate dans le navigateur.', 'success');
    return processFileLocally(file, jobId);
  }
}

async function processFileWithPermanentEngine(file, cloudJobId, bridge) {
  const orderId = $('#orderSelect').value;
  const order = state.orders.find((item) => item.id === orderId) || {};
  setUploadProgress(2, 'Envoi sécurisé vers le moteur Neptune local…');
  const submitted = await bridge.submit(file, {
    jobId: cloudJobId,
    orderId,
    objective: buildObjective(),
    company: order.company || '',
    clientName: order.fullName || order.clientName || '',
    orderTitle: order.title || order.format || 'Passage Neptune Media',
  });
  const engineJobId = submitted.jobId || cloudJobId;
  bridge.remember(cloudJobId, engineJobId);
  setUploadProgress(5, 'Vidéo reçue. La production continue sur la machine Neptune.');
  setFormMessage('Import terminé. Vous pouvez fermer cet onglet : le moteur Neptune continue seul.', 'success');
  await reportProgress(cloudJobId, 'permanent_engine_queued', 5);

  while (true) {
    const engineJob = await bridge.job(engineJobId);
    const progress = Math.max(5, Math.min(99, Number(engineJob.progress || 5)));
    setUploadProgress(progress, friendlyPermanentStage(engineJob.stage));
    await reportProgress(cloudJobId, 'permanent_engine_processing', progress).catch(() => {});
    if (engineJob.status === 'completed') {
      await syncPermanentEngineResult(cloudJobId, engineJob, bridge);
      return;
    }
    if (engineJob.status === 'failed') {
      throw new Error(engineJob.error_code || engineJob.error_detail || 'permanent_engine_failed');
    }
    await permanentEngineSleep(2500);
  }
}

async function syncPermanentEngineResult(cloudJobId, engineJob, bridge) {
  const result = engineJob.result || {};
  const candidates = Array.isArray(result.candidates) ? result.candidates : [];
  if (!candidates.length) throw new Error('no_candidate_above_minimum_score');
  const completed = [];
  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index];
    setUploadProgress(96 + Math.round(((index + 1) / candidates.length) * 3), 'Récupération du short ' + (index + 1) + '/' + candidates.length + '…');
    const blob = await bridge.clip(engineJob.id, candidate.id);
    const stored = await saveClip(cloudJobId, candidate, blob);
    completed.push({ ...candidate, outputSizeBytes: stored.sizeBytes, outputMimeType: stored.mimeType });
  }
  await api('/api/admin/video-ai/local/jobs/' + encodeURIComponent(cloudJobId) + '/complete', {
    method: 'POST',
    body: JSON.stringify({
      transcript: result.transcript || '',
      transcriptVtt: result.transcriptVtt || '',
      durationSeconds: Number(result.durationSeconds || result.media?.durationSeconds || 0),
      width: Number(result.width || result.media?.width || 0),
      height: Number(result.height || result.media?.height || 0),
      visualProfile: result.visualProfile || {},
      candidates: completed,
      generationStatus: result.generationStatus || 'local-agent',
      aiModel: result.aiModel || 'neptune-video-engine',
      promptVersion: result.promptVersion || 'neptune-video-engine-20260802-v73',
    }),
  });
  bridge.forget(cloudJobId);
  setUploadProgress(100, 'Shorts prêts à valider.');
}

async function resumePermanentEngineJobs() {
  const bridge = globalThis.NeptuneVideoEngineBridge;
  if (!bridge) return;
  let health = null;
  try { health = await bridge.health(); } catch {}
  if (!health?.ok) return;
  const pending = bridge.pending();
  for (const [cloudJobId, link] of Object.entries(pending)) {
    try {
      const engineJob = await bridge.job(link.engineJobId || cloudJobId);
      if (engineJob.status === 'completed') {
        await syncPermanentEngineResult(cloudJobId, engineJob, bridge);
        await loadBootstrap();
      } else if (engineJob.status === 'failed') {
        await api('/api/admin/video-ai/local/jobs/' + encodeURIComponent(cloudJobId) + '/fail', {
          method: 'POST',
          body: JSON.stringify({
            stage: 'permanent_engine',
            progress: Number(engineJob.progress || 0),
            errorCode: engineJob.error_code || 'permanent_engine_failed',
            errorDetail: engineJob.error_detail || '',
          }),
        }).catch(() => {});
        bridge.forget(cloudJobId);
      } else {
        await reportProgress(cloudJobId, 'permanent_engine_processing', Number(engineJob.progress || 5)).catch(() => {});
      }
    } catch (error) {
      console.warn('permanent_engine_resume_deferred', cloudJobId, error);
    }
  }
}

function friendlyPermanentStage(stage) {
  const value = String(stage || '').toLowerCase();
  if (value.includes('reprise')) return 'Reprise de la production…';
  if (value.includes('ouverture') || value.includes('reçue')) return 'Ouverture de la vidéo…';
  if (value.includes('transcription')) return 'Compréhension de l’interview…';
  if (value.includes('repérage')) return 'Repérage des intervenants…';
  if (value.includes('sélection')) return 'Choix des meilleurs moments…';
  if (value.includes('création')) return stage;
  if (value.includes('prêt')) return 'Shorts prêts à valider.';
  return stage || 'Production Neptune en cours…';
}

function permanentEngineSleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
`;

function openAiSemanticAssistPlugin() {
  return {
    name: 'neptune-openai-semantic-assist-and-permanent-engine',
    enforce: 'pre',
    transform(code, id) {
      if (!id.endsWith('/main.js')) return null;
      const originalCondition = 'if (candidates.length < 3 && state.policy?.workersAiAssistAvailable) {';
      const semanticCondition = "if (state.policy?.openAiAnalysisAvailable || (candidates.length < 3 && state.policy?.workersAiAssistAvailable)) {";
      const originalProgress = "setUploadProgress(54, 'Secours Workers AI gratuit…');";
      const semanticProgress = "setUploadProgress(54, state.policy?.openAiAnalysisAvailable ? 'Analyse éditoriale OpenAI…' : 'Secours Workers AI gratuit…');";
      const originalMerge = 'candidates = mergeAssistedCandidates(candidates, assisted.candidates, media.durationSeconds);';
      const semanticMerge = "candidates = assisted.assistMode === 'openai-structured-analysis'\n        ? mergeAssistedCandidates([], assisted.candidates, media.durationSeconds)\n        : mergeAssistedCandidates(candidates, assisted.candidates, media.durationSeconds);";
      const releaseMarker = `globalThis.__NEPTUNE_LOCAL_TRANSCRIPTION_RECOVERY__ = '${TRANSCRIPTION_RECOVERY_RELEASE}';\nglobalThis.__NEPTUNE_PERMANENT_VIDEO_ENGINE__ = '${PERMANENT_ENGINE_RELEASE}';\n`;
      const transformed = (releaseMarker + code)
        .replace(originalCondition, semanticCondition)
        .replace(originalProgress, semanticProgress)
        .replace(originalMerge, semanticMerge)
        .replace("console.warn('workers_ai_free_assist_unavailable', error);", "console.warn('semantic_ai_assist_unavailable', error);")
        .replace('await loadBootstrap();\n    const requested', 'await loadBootstrap();\n    await resumePermanentEngineJobs();\n    const requested')
        .replace('await processFileLocally(selectedFile, jobId);', 'await processFileWithPreferredEngine(selectedFile, jobId);')
        .replace('function transcribeChunk(audio, onProgress) {', permanentEngineRuntime + '\nfunction transcribeChunk(audio, onProgress) {');
      if (transformed === code
        || !transformed.includes('openAiAnalysisAvailable')
        || !transformed.includes("assistMode === 'openai-structured-analysis'")
        || !transformed.includes(TRANSCRIPTION_RECOVERY_RELEASE)
        || !transformed.includes(PERMANENT_ENGINE_RELEASE)
        || !transformed.includes('processFileWithPreferredEngine')
        || !transformed.includes('resumePermanentEngineJobs')) {
        throw new Error('Unable to activate Neptune semantic assist and permanent video engine bridge.');
      }
      return { code: transformed, map: null };
    },
  };
}

export default defineConfig({
  root: resolve(here, 'src'),
  base: '/studio/local-engine/',
  plugins: [openAiSemanticAssistPlugin()],
  build: {
    outDir: resolve(here, '../public/studio/local-engine'),
    emptyOutDir: true,
    sourcemap: false,
    target: 'es2022',
    minify: 'esbuild',
    rollupOptions: {
      input: resolve(here, 'src/main.js'),
      output: {
        entryFileNames: 'neptune-video-local-engine-v1.js',
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
  worker: {
    format: 'es',
  },
});
