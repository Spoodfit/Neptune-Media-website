import { extractAudioChunks, inspectMedia } from './audio.js';
import { buildLocalCandidates, mergeAssistedCandidates, normalizeTranscriptionResults } from './analysis.js';
import { renderCandidate } from './render.js';
import { readClip, requestPersistentStorage, saveClip, storageEstimate } from './storage.js';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const ACTIVE_STATUSES = new Set(['uploading', 'queued', 'processing', 'exporting']);
const REVIEW_STATUSES = new Set(['review_ready', 'approved']);
const STATUS_LABELS = { uploading: 'Préparation locale', queued: 'En attente locale', processing: 'Traitement local', review_ready: 'À valider', approved: 'Validé', exporting: 'Envoi Drive', delivered: 'Livré', failed: 'Échec', cancelled: 'Annulé' };
const STAGE_LABELS = { local_prepare: 'Préparation locale', local_audio: 'Extraction audio locale', local_transcription: 'Transcription Whisper locale', local_selection: 'Sélection TOFU / MOFU / BOFU', local_render: 'Montage vertical local', review: 'Validation interne', approved: 'Prêt pour Drive', drive_export: 'Envoi dans Google Drive', delivered: 'Livré au client' };
const SCORE_LABELS = { hook: 'Accroche', autonomy: 'Autonomie', value: 'Valeur', retention: 'Rétention', emotion: 'Émotion', originality: 'Originalité', marketing: 'Marketing', technical: 'Technique' };

let csrfToken = sessionStorage.getItem('neptune_csrf') || '';
let state = { orders: [], jobs: [], policy: { minimumScore: 60 } };
let selectedFile = null;
let currentJob = null;
let currentClips = [];
let jobFilter = 'all';
let funnelFilter = 'all';
let processing = false;
let previewUrls = [];
let transcriber = null;

bindEvents();
initialize();

async function initialize() {
  try {
    const auth = await api('/api/auth/status', {}, false);
    csrfToken = auth.csrfToken || csrfToken;
    if (csrfToken) sessionStorage.setItem('neptune_csrf', csrfToken);
    await loadBootstrap();
    const requested = new URL(location.href).searchParams.get('job');
    if (requested) await openJob(requested);
  } catch (error) {
    if (['unauthorized', 'http_401'].includes(error.message)) { location.href = '/studio/'; return; }
    runtimeError(errorText(error.message));
  }
}

function bindEvents() {
  $('#refreshButton')?.addEventListener('click', async () => { await loadBootstrap(); if (currentJob) await openJob(currentJob.id, { preserveScroll: true }); });
  $('#videoInput')?.addEventListener('change', (event) => selectFile(event.target.files?.[0] || null));
  $('#dropZone')?.addEventListener('keydown', (event) => { if (['Enter', ' '].includes(event.key)) { event.preventDefault(); $('#videoInput').click(); } });
  for (const type of ['dragenter', 'dragover']) $('#dropZone')?.addEventListener(type, (event) => { event.preventDefault(); $('#dropZone').classList.add('dragging'); });
  for (const type of ['dragleave', 'drop']) $('#dropZone')?.addEventListener(type, (event) => { event.preventDefault(); $('#dropZone').classList.remove('dragging'); });
  $('#dropZone')?.addEventListener('drop', (event) => selectFile(event.dataTransfer?.files?.[0] || null));
  $('#uploadForm')?.addEventListener('submit', startLocalProduction);
  $('#orderSelect')?.addEventListener('change', updateStartState);
  $('#backToJobs')?.addEventListener('click', () => { currentJob = null; currentClips = []; clearPreviewUrls(); $('#reviewWorkspace').hidden = true; history.replaceState({}, '', location.pathname); window.scrollTo({ top: 0, behavior: 'smooth' }); });
  $('#approveAll')?.addEventListener('click', approveVisibleClips);
  $('#exportApproved')?.addEventListener('click', exportApprovedClips);
  $$('[data-job-filter]').forEach((button) => button.addEventListener('click', () => { jobFilter = button.dataset.jobFilter; $$('[data-job-filter]').forEach((item) => item.classList.toggle('active', item === button)); renderJobs(); }));
  $$('[data-funnel]').forEach((button) => button.addEventListener('click', () => { funnelFilter = button.dataset.funnel; $$('[data-funnel]').forEach((item) => item.classList.toggle('active', item === button)); renderClips(); }));
  $('#jobsList')?.addEventListener('click', (event) => { const card = event.target.closest('[data-job-id]'); if (card) openJob(card.dataset.jobId); });
  $('#clipsGrid')?.addEventListener('click', handleClipAction);
  $('#clipsGrid')?.addEventListener('change', handleClipChange);
  window.addEventListener('beforeunload', (event) => { if (!processing) return; event.preventDefault(); event.returnValue = ''; });
}

async function loadBootstrap() {
  $('#runtimeState').classList.remove('error');
  $('#runtimeState').innerHTML = '<i></i> Vérification locale…';
  state = await api('/api/admin/video-ai/bootstrap');
  renderOrderOptions();
  renderJobs();
  renderMetrics();
  const mode = state.policy?.engineMode === 'browser-local' ? 'Moteur local prêt' : 'Mode local indisponible';
  $('#runtimeState').innerHTML = `<i></i> ${mode}`;
}

function renderOrderOptions() {
  const select = $('#orderSelect');
  const current = select.value;
  select.innerHTML = '<option value="">Choisir le client et le passage</option>' + state.orders.map((order) => `<option value="${esc(order.id)}">${esc(order.company || order.fullName || order.email)} · ${esc(order.title || order.format || 'Passage Neptune Media')}</option>`).join('');
  if (state.orders.some((order) => order.id === current)) select.value = current;
}

function renderMetrics() {
  $('#activeJobsCount').textContent = state.jobs.filter((job) => ACTIVE_STATUSES.has(job.status)).length;
  $('#reviewJobsCount').textContent = state.jobs.filter((job) => REVIEW_STATUSES.has(job.status)).length;
  $('#readyClipsCount').textContent = state.jobs.reduce((sum, job) => sum + Number(job.clipCount || 0), 0);
}

function renderJobs() {
  const jobs = state.jobs.filter((job) => jobFilter === 'all' || (jobFilter === 'active' && ACTIVE_STATUSES.has(job.status)) || (jobFilter === 'review' && REVIEW_STATUSES.has(job.status)));
  $('#jobsList').innerHTML = jobs.length ? jobs.map(jobCard).join('') : '<p class="empty-state">Aucune vidéo dans cette vue.</p>';
}

function jobCard(job) {
  return `<article class="job-card" data-job-id="${esc(job.id)}"><div class="job-card-main"><div class="job-card-top"><span class="status-pill ${esc(job.status)}">${esc(STATUS_LABELS[job.status] || job.status)}</span><span class="local-pill">LOCAL</span></div><h3>${esc(job.sourceName)}</h3><p>${esc(job.company || job.clientName || 'Client Neptune Media')} · ${esc(job.orderTitle || 'Passage')}</p><div class="job-card-meta"><span>${formatDate(job.createdAt)}</span><span>${formatDuration(job.durationSeconds)}</span>${job.errorCode ? `<span>${esc(errorText(job.errorCode))}</span>` : ''}</div></div><div class="job-card-count"><b>${Number(job.clipCount || 0)}</b><span>SHORTS</span></div>${ACTIVE_STATUSES.has(job.status) ? `<progress class="mini-progress" max="100" value="${Number(job.progress || 0)}"></progress>` : ''}</article>`;
}

function selectFile(file) {
  if (!file) { selectedFile = null; $('#selectedFile').hidden = true; updateStartState(); return; }
  if (!String(file.type || '').startsWith('video/')) { toast('Sélectionnez un fichier vidéo MP4, MOV, WEBM ou M4V.', true); return; }
  selectedFile = file;
  $('#selectedFile').hidden = false;
  $('#selectedFile').innerHTML = `<strong>${esc(file.name)}</strong><span>${formatBytes(file.size)} · traitement sur cet ordinateur</span>`;
  updateStartState();
}

function updateStartState() { $('#startUpload').disabled = processing || !selectedFile || !$('#orderSelect').value; }

async function startLocalProduction(event) {
  event.preventDefault();
  if (processing || !selectedFile || !$('#orderSelect').value) return;
  processing = true;
  updateStartState();
  $('#uploadProgress').hidden = false;
  setFormMessage('Gardez cet onglet ouvert pendant la création. La vidéo source reste sur cet ordinateur.', 'success');
  let jobId = '';
  try {
    await requestPersistentStorage();
    const estimate = await storageEstimate();
    if (estimate.quota && estimate.quota - estimate.usage < Math.min(selectedFile.size, 750 * 1024 * 1024)) throw new Error('local_storage_insufficient');
    setUploadProgress(1, 'Calcul de l’empreinte locale…');
    const fingerprint = await fileFingerprint(selectedFile);
    const created = await api('/api/admin/video-ai/local/jobs', { method: 'POST', body: JSON.stringify({
      orderId: $('#orderSelect').value,
      sourceName: selectedFile.name,
      sourceFingerprint: fingerprint,
      mimeType: selectedFile.type || 'video/mp4',
      sizeBytes: selectedFile.size,
      objective: buildObjective(),
    }) });
    jobId = created.job?.id;
    if (!jobId) throw new Error('invalid_video_ai_job');
    await processFileLocally(selectedFile, jobId);
    setUploadProgress(100, 'Shorts créés localement. Validation prête.');
    setFormMessage('La source n’a jamais quitté cet ordinateur. Les rendus sont prêts à être validés.', 'success');
    selectedFile = null;
    $('#videoInput').value = '';
    $('#selectedFile').hidden = true;
    await loadBootstrap();
    await openJob(jobId);
  } catch (error) {
    if (jobId) await api(`/api/admin/video-ai/local/jobs/${encodeURIComponent(jobId)}/fail`, { method: 'POST', body: JSON.stringify({ stage: 'local_processing', progress: Number($('#uploadProgressBar').value || 0), errorCode: normalizeLocalError(error), errorDetail: String(error?.message || error).slice(0, 1000) }) }).catch(() => {});
    setFormMessage(errorText(normalizeLocalError(error)), 'error');
    toast(errorText(normalizeLocalError(error)), true);
  } finally {
    processing = false;
    updateStartState();
  }
}

async function processFileLocally(file, jobId) {
  const media = await inspectMedia(file);
  await reportProgress(jobId, 'local_audio', 4);
  const audio = await extractAudioChunks(file, (update) => {
    const percent = Math.round(update.progress * 100);
    setUploadProgress(percent, update.stage);
    if (percent % 5 === 0) reportProgress(jobId, 'local_audio', percent).catch(() => {});
  });

  await reportProgress(jobId, 'local_transcription', 23);
  const transcriptions = [];
  for (let index = 0; index < audio.chunks.length; index += 1) {
    const chunk = audio.chunks[index];
    const result = await transcribeChunk(chunk.audio, (stage, modelProgress) => {
      const fraction = (index + modelProgress) / audio.chunks.length;
      const percent = 23 + Math.round(fraction * 25);
      setUploadProgress(percent, stage);
    });
    transcriptions.push({ offsetSeconds: chunk.offsetSeconds, result });
    await reportProgress(jobId, 'local_transcription', 23 + Math.round(((index + 1) / audio.chunks.length) * 25));
  }
  const normalized = normalizeTranscriptionResults(transcriptions);
  if (normalized.transcript.split(/\s+/u).length < 20) throw new Error('transcription_too_short');

  setUploadProgress(49, 'Analyse visuelle locale…');
  const visualProfile = await analyzeVisualProfile(file, media);
  await reportProgress(jobId, 'local_selection', 52);
  let candidates = buildLocalCandidates(normalized.words, media.durationSeconds, visualProfile, buildObjective());
  let generationStatus = 'local';
  let aiModel = 'onnx-community/whisper-base_timestamped + neptune-local-rules-v1';

  if (candidates.length < 3 && state.policy?.workersAiAssistAvailable) {
    setUploadProgress(54, 'Secours Workers AI gratuit…');
    try {
      const assisted = await api(`/api/admin/video-ai/local/jobs/${encodeURIComponent(jobId)}/assist`, { method: 'POST', body: JSON.stringify({
        transcript: normalized.transcript,
        segments: sentenceSegmentsFromWords(normalized.words),
        durationSeconds: media.durationSeconds,
        width: media.width,
        height: media.height,
        visualProfile,
        objective: buildObjective(),
      }) });
      candidates = mergeAssistedCandidates(candidates, assisted.candidates, media.durationSeconds);
      generationStatus = assisted.assistMode || 'workers-ai-free-assist';
      aiModel = assisted.aiModel || aiModel;
    } catch (error) {
      console.warn('workers_ai_free_assist_unavailable', error);
    }
  }
  if (!candidates.length) throw new Error('no_candidate_above_minimum_score');

  await reportProgress(jobId, 'local_render', 58);
  const completed = [];
  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index];
    const rendered = await renderCandidate(file, candidate, (update) => {
      const base = 58 + (index / candidates.length) * 38;
      const local = Math.max(0, Math.min(1, (update.progress - 0.58) / 0.38));
      const percent = Math.round(base + local * (38 / candidates.length));
      setUploadProgress(percent, `${update.stage} · ${index + 1}/${candidates.length}`);
    });
    const stored = await saveClip(jobId, candidate, rendered.blob);
    completed.push({ ...candidate, outputSizeBytes: stored.sizeBytes, outputMimeType: stored.mimeType });
    await reportProgress(jobId, 'local_render', 58 + Math.round(((index + 1) / candidates.length) * 38));
  }

  await api(`/api/admin/video-ai/local/jobs/${encodeURIComponent(jobId)}/complete`, { method: 'POST', body: JSON.stringify({
    transcript: normalized.transcript,
    transcriptVtt: segmentsToVtt(sentenceSegmentsFromWords(normalized.words)),
    durationSeconds: media.durationSeconds,
    width: media.width,
    height: media.height,
    visualProfile,
    candidates: completed,
    generationStatus,
    aiModel,
    promptVersion: 'neptune-video-local-engine-20260730-v1',
  }) });
}

function transcribeChunk(audio, onProgress) {
  if (!transcriber) transcriber = new Worker(new URL('./transcriber.worker.js', import.meta.url), { type: 'module' });
  const requestId = crypto.randomUUID();
  return new Promise((resolve, reject) => {
    const handler = (event) => {
      const message = event.data || {};
      if (message.type === 'model-progress') {
        const value = Number(message.progress?.progress || 0);
        onProgress('Chargement du modèle Whisper local', Number.isFinite(value) ? value : 0.05);
        return;
      }
      if (message.requestId !== requestId) return;
      if (message.type === 'status') onProgress(String(message.stage || 'Transcription locale'), 0.35);
      if (message.type === 'complete') { transcriber.removeEventListener('message', handler); resolve(message.result); }
      if (message.type === 'error') { transcriber.removeEventListener('message', handler); reject(new Error(message.message || 'local_transcription_failed')); }
    };
    transcriber.addEventListener('message', handler);
    transcriber.postMessage({ type: 'transcribe', requestId, audio }, [audio.buffer]);
  });
}

async function analyzeVisualProfile(file, media) {
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'metadata';
  const url = URL.createObjectURL(file);
  video.src = url;
  try {
    await once(video, 'loadedmetadata');
    const canvas = new OffscreenCanvas(320, 180);
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return { luminance: 0.5, contrast: 0.5, technicalQuality: 0.75, faceCount: 1 };
    const samples = [0.12, 0.32, 0.52, 0.72, 0.88];
    const luminances = [];
    const contrasts = [];
    let faceCount = 0;
    const Detector = globalThis.FaceDetector;
    const detector = Detector ? new Detector({ fastMode: true, maxDetectedFaces: 4 }) : null;
    for (const ratio of samples) {
      video.currentTime = Math.min(Math.max(0, media.durationSeconds * ratio), Math.max(0, media.durationSeconds - 0.1));
      await once(video, 'seeked');
      context.drawImage(video, 0, 0, 320, 180);
      const data = context.getImageData(0, 0, 320, 180).data;
      let sum = 0;
      let squares = 0;
      const count = data.length / 4;
      for (let index = 0; index < data.length; index += 16) {
        const value = (0.2126 * data[index] + 0.7152 * data[index + 1] + 0.0722 * data[index + 2]) / 255;
        sum += value;
        squares += value * value;
      }
      const sampled = count / 4;
      const mean = sum / Math.max(1, sampled);
      luminances.push(mean);
      contrasts.push(Math.sqrt(Math.max(0, squares / Math.max(1, sampled) - mean * mean)));
      if (detector) { try { faceCount = Math.max(faceCount, (await detector.detect(canvas)).length); } catch { /* optional */ } }
    }
    const luminance = average(luminances);
    const contrast = average(contrasts);
    return { luminance, contrast, faceCount: faceCount || 1, technicalQuality: Math.max(0.45, Math.min(1, 0.62 + contrast * 0.8 - Math.abs(luminance - 0.5) * 0.25)) };
  } finally { URL.revokeObjectURL(url); }
}

async function openJob(jobId, options = {}) {
  const result = await api(`/api/admin/video-ai/jobs/${encodeURIComponent(jobId)}`);
  currentJob = result.job;
  currentClips = result.clips || [];
  history.replaceState({}, '', `${location.pathname}?job=${encodeURIComponent(jobId)}`);
  renderReview();
  if (!options.preserveScroll) $('#reviewWorkspace').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderReview() {
  if (!currentJob) return;
  $('#reviewWorkspace').hidden = false;
  $('#reviewTitle').textContent = currentJob.sourceName || 'Shorts générés';
  $('#reviewSubtitle').textContent = `${currentJob.company || currentJob.clientName || 'Client Neptune Media'} · ${currentJob.orderTitle || 'Passage'} · ${currentClips.length} contenu(s) retenu(s)`;
  const active = ACTIVE_STATUSES.has(currentJob.status);
  $('#jobProgressPanel').hidden = !active && !currentJob.errorCode;
  $('#jobProgressBar').value = Number(currentJob.progress || 0);
  $('#jobProgressText').textContent = `${Number(currentJob.progress || 0)} %`;
  $('#jobStageText').textContent = STAGE_LABELS[currentJob.stage] || STATUS_LABELS[currentJob.status] || currentJob.stage;
  $('#jobProgressHint').textContent = currentJob.errorCode ? errorText(currentJob.errorCode) : active ? 'Le traitement local nécessite de garder l’onglet de production ouvert.' : '';
  const counts = { TOFU: 0, MOFU: 0, BOFU: 0 };
  for (const clip of currentClips) counts[clip.funnel] = (counts[clip.funnel] || 0) + 1;
  $('#allCount').textContent = currentClips.length;
  $('#tofuCount').textContent = counts.TOFU || 0;
  $('#mofuCount').textContent = counts.MOFU || 0;
  $('#bofuCount').textContent = counts.BOFU || 0;
  $('#approveAll').disabled = !currentClips.some((clip) => clip.status === 'generated');
  $('#exportApproved').disabled = !currentClips.some((clip) => clip.status === 'approved');
  renderClips();
}

function renderClips() {
  if (!currentJob) return;
  clearPreviewUrls();
  const clips = currentClips.filter((clip) => funnelFilter === 'all' || clip.funnel === funnelFilter);
  if (!clips.length) {
    $('#clipsGrid').innerHTML = ACTIVE_STATUSES.has(currentJob.status) ? '<p class="empty-state">Le moteur local travaille dans l’onglet ayant reçu la vidéo. Réimportez la même source si cet onglet a été fermé.</p>' : '<p class="empty-state">Aucun contenu dans cette catégorie.</p>';
    return;
  }
  $('#clipsGrid').innerHTML = clips.map(clipCard).join('');
  hydrateLocalPreviews(clips).catch((error) => console.error('local_preview_failed', error));
}

function clipCard(clip) {
  const proposals = Array.isArray(clip.editorialProposals) ? clip.editorialProposals : [];
  const selected = proposals.find((item) => item.id === clip.selectedProposalId) || proposals[0] || {};
  return `<article class="clip-card ${esc(clip.status)}" data-clip-id="${esc(clip.id)}"><div class="clip-preview"><video controls preload="metadata" playsinline data-local-preview></video><div class="local-preview-missing" data-local-missing hidden>Rendu absent de ce navigateur</div><div class="clip-score"><b>${Number(clip.score || 0)}</b><span>/100</span></div><span class="funnel-pill ${esc(clip.funnel)}">${esc(clip.funnel)}</span></div><div class="clip-body"><div class="clip-head"><h3>${esc(clip.title)}</h3><small>${formatTimecode(clip.startSeconds)} → ${formatTimecode(clip.endSeconds)}</small></div><p class="clip-rationale">${esc(clip.rationale || 'Passage retenu pour sa cohérence et son potentiel éditorial.')}</p><div class="score-breakdown">${Object.entries(clip.scoreBreakdown || {}).map(([key, value]) => `<div><b>${Number(value || 0)}</b><span>${esc(SCORE_LABELS[key] || key)}</span></div>`).join('')}</div><div class="clip-editor"><input data-field="title" value="${esc(clip.title)}" aria-label="Titre interne"><select data-field="funnel" aria-label="Niveau de tunnel">${['TOFU', 'MOFU', 'BOFU'].map((value) => `<option value="${value}" ${clip.funnel === value ? 'selected' : ''}>${value}</option>`).join('')}</select><select data-field="captionPreset" aria-label="Style de sous-titres">${[['neptune-contrast', 'Contraste maximum'], ['neptune-light', 'Clair sur fond sombre'], ['neptune-boxed', 'Bloc haute lisibilité'], ['neptune-premium', 'Premium minimal']].map(([value, label]) => `<option value="${value}" ${clip.captionPreset === value ? 'selected' : ''}>${label}</option>`).join('')}</select></div><div class="proposal-tabs">${proposals.map((proposal) => `<button class="${proposal.id === selected.id ? 'active' : ''}" data-select-proposal="${esc(proposal.id)}" type="button">${esc(proposal.label || proposal.id)}</button>`).join('')}</div>${proposalPanel(selected)}<div class="clip-actions"><button data-save-clip type="button">Enregistrer</button><button data-download-clip type="button">Télécharger</button>${clip.status !== 'approved' && clip.status !== 'delivered' ? '<button class="approve" data-approve-clip type="button">Valider</button>' : ''}${clip.status !== 'rejected' && clip.status !== 'delivered' ? '<button class="reject" data-reject-clip type="button">Refuser</button>' : ''}${clip.status === 'approved' ? '<button class="export" data-export-clip type="button">Envoyer dans Drive</button>' : ''}${clip.status === 'delivered' ? `<a class="export" href="${esc(clip.driveWebViewUrl || '#')}" target="_blank" rel="noopener">Voir dans Drive</a>` : ''}</div></div></article>`;
}

function proposalPanel(proposal) {
  if (!proposal?.id) return '<div class="proposal-panel"><p>Propositions éditoriales indisponibles.</p></div>';
  return `<div class="proposal-panel" data-proposal-panel data-proposal-id="${esc(proposal.id)}"><strong>${esc(proposal.hook)}</strong><p>${esc(proposal.description)}</p><p class="cta">${esc(proposal.cta)}</p><small>${esc((proposal.hashtags || []).join(' '))}</small><div class="proposal-actions"><button data-copy-proposal type="button">Copier le post</button><button data-use-proposal type="button">Sélectionner cette proposition</button></div></div>`;
}

async function hydrateLocalPreviews(clips) {
  for (const clip of clips) {
    const card = $(`[data-clip-id="${cssEscape(clip.id)}"]`);
    if (!card) continue;
    const record = await readClip(currentJob.id, clip.id).catch(() => null);
    if (!record?.blob) { $('[data-local-missing]', card).hidden = false; continue; }
    const url = URL.createObjectURL(record.blob);
    previewUrls.push(url);
    $('[data-local-preview]', card).src = url;
  }
}

async function handleClipAction(event) {
  const card = event.target.closest('[data-clip-id]');
  if (!card) return;
  const clip = currentClips.find((item) => item.id === card.dataset.clipId);
  if (!clip) return;
  const proposalButton = event.target.closest('[data-select-proposal]');
  if (proposalButton) { clip.selectedProposalId = proposalButton.dataset.selectProposal; renderClips(); return; }
  if (event.target.closest('[data-copy-proposal]')) { const proposal = selectedProposal(clip); await copyText(proposal?.fullPost || buildPost(proposal)); return; }
  if (event.target.closest('[data-use-proposal]')) { await clipAction(clip, 'select-proposal', { selectedProposalId: clip.selectedProposalId }); toast('Proposition éditoriale sélectionnée.'); return; }
  if (event.target.closest('[data-save-clip]')) { await saveClipEditor(card, clip); return; }
  if (event.target.closest('[data-download-clip]')) { await downloadClip(clip); return; }
  if (event.target.closest('[data-approve-clip]')) { await clipAction(clip, 'approve'); toast('Contenu validé.'); return; }
  if (event.target.closest('[data-reject-clip]')) { await clipAction(clip, 'reject'); toast('Contenu refusé.'); return; }
  if (event.target.closest('[data-export-clip]')) { await exportClip(clip); }
}

function handleClipChange(event) { const card = event.target.closest('[data-clip-id]'); if (card && event.target.matches('[data-field="funnel"]')) card.querySelector('.funnel-pill').textContent = event.target.value; }

async function saveClipEditor(card, clip) {
  await clipAction(clip, 'update', { title: card.querySelector('[data-field="title"]').value.trim(), funnel: card.querySelector('[data-field="funnel"]').value, captionPreset: card.querySelector('[data-field="captionPreset"]').value, editorialProposals: clip.editorialProposals });
  toast('Réglages enregistrés. Le rendu local existant n’est pas recalculé automatiquement.');
}

async function clipAction(clip, action, extra = {}) {
  const result = await api(`/api/admin/video-ai/clips/${encodeURIComponent(clip.id)}/action`, { method: 'POST', body: JSON.stringify({ action, ...extra }) });
  currentJob = result.job;
  currentClips = result.clips || [];
  renderReview();
  await loadBootstrap();
  return result;
}

async function approveVisibleClips() {
  const visible = currentClips.filter((clip) => (funnelFilter === 'all' || clip.funnel === funnelFilter) && clip.status === 'generated');
  if (!visible.length) return;
  $('#approveAll').disabled = true;
  try { for (const clip of visible) await api(`/api/admin/video-ai/clips/${encodeURIComponent(clip.id)}/action`, { method: 'POST', body: JSON.stringify({ action: 'approve' }) }); toast(`${visible.length} contenu(s) validé(s).`); await openJob(currentJob.id, { preserveScroll: true }); await loadBootstrap(); } catch (error) { toast(errorText(error.message), true); }
}

async function downloadClip(clip) {
  const record = await readClip(currentJob.id, clip.id);
  if (!record?.blob) throw toast('Ce rendu local n’est pas présent dans ce navigateur.', true);
  const url = URL.createObjectURL(record.blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${safeName(`${clip.funnel}-${clip.score}-${clip.title}`)}.${record.mimeType === 'video/webm' ? 'webm' : 'mp4'}`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}

async function exportClip(clip) {
  const record = await readClip(currentJob.id, clip.id);
  if (!record?.blob) { toast('Ce rendu local n’est pas présent dans ce navigateur.', true); return; }
  const button = $(`[data-clip-id="${cssEscape(clip.id)}"] [data-export-clip]`);
  if (button) { button.disabled = true; button.textContent = 'Envoi…'; }
  try {
    const response = await fetch(`/api/admin/video-ai/clips/${encodeURIComponent(clip.id)}/export`, { method: 'POST', body: record.blob, headers: { Accept: 'application/json', 'Content-Type': record.mimeType, 'X-Clip-Size': String(record.sizeBytes), 'X-CSRF-Token': csrfToken }, credentials: 'same-origin' });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || `http_${response.status}`);
    toast(result.alreadyDelivered ? 'Ce contenu est déjà dans Drive.' : 'Contenu envoyé dans le dossier Drive du client.');
    await openJob(currentJob.id, { preserveScroll: true });
    await loadBootstrap();
  } catch (error) { toast(errorText(error.message), true); if (button) { button.disabled = false; button.textContent = 'Envoyer dans Drive'; } }
}

async function exportApprovedClips() {
  const clips = currentClips.filter((clip) => clip.status === 'approved');
  if (!clips.length) return;
  $('#exportApproved').disabled = true;
  let delivered = 0;
  try { for (const clip of clips) { await exportClip(clip); delivered += 1; } toast(`${delivered} contenu(s) envoyé(s) dans Drive.`); } catch (error) { toast(`${delivered} contenu(s) envoyé(s), puis une erreur : ${errorText(error.message)}`, true); }
}

async function reportProgress(jobId, stage, progress) { return api(`/api/admin/video-ai/local/jobs/${encodeURIComponent(jobId)}/progress`, { method: 'POST', body: JSON.stringify({ status: 'processing', stage, progress }) }); }
function buildObjective() { const preset = $('#objectivePreset').value; const directives = { balanced: 'Répartition équilibrée des opportunités TOFU, MOFU et BOFU selon la matière réelle.', awareness: 'Prioriser les passages TOFU capables de créer portée, surprise, identification et commentaires.', expertise: 'Prioriser les passages MOFU démontrant expertise, méthode, pédagogie et réponses aux objections.', conversion: 'Prioriser les passages BOFU apportant preuve, différenciation, bénéfice et réduction du risque de décision.' }; return [directives[preset], $('#objectiveText').value.trim()].filter(Boolean).join(' '); }
async function fileFingerprint(file) { const sampleSize = Math.min(file.size, 1024 * 1024); const first = await file.slice(0, sampleSize).arrayBuffer(); const last = file.size > sampleSize ? await file.slice(Math.max(0, file.size - sampleSize), file.size).arrayBuffer() : new ArrayBuffer(0); const metadata = new TextEncoder().encode(`${file.name}|${file.size}|${file.lastModified}|${file.type}`); const bytes = new Uint8Array(metadata.byteLength + first.byteLength + last.byteLength); bytes.set(metadata); bytes.set(new Uint8Array(first), metadata.byteLength); bytes.set(new Uint8Array(last), metadata.byteLength + first.byteLength); const digest = await crypto.subtle.digest('SHA-256', bytes); return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join(''); }
function sentenceSegmentsFromWords(words) { const result = []; let current = []; for (const word of words) { current.push(word); if (/[.!?…]$/u.test(word.text) || current.length >= 32) flush(); } flush(); return result; function flush() { if (!current.length) return; result.push({ start: current[0].start, end: current.at(-1).end, text: current.map((item) => item.text).join(' ').replace(/\s+/gu, ' ').trim() }); current = []; } }
function segmentsToVtt(segments) { return ['WEBVTT', '', ...segments.flatMap((segment, index) => [String(index + 1), `${vttTime(segment.start)} --> ${vttTime(segment.end)}`, segment.text, ''])].join('\n'); }
function vttTime(seconds) { const value = Math.max(0, Number(seconds || 0)); const hours = Math.floor(value / 3600); const minutes = Math.floor((value % 3600) / 60); const rest = value % 60; return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${rest.toFixed(3).padStart(6, '0')}`; }
function once(target, event) { return new Promise((resolve, reject) => { const timeout = setTimeout(() => reject(new Error(`media_${event}_timeout`)), 15000); target.addEventListener(event, () => { clearTimeout(timeout); resolve(); }, { once: true }); target.addEventListener('error', () => { clearTimeout(timeout); reject(new Error('media_decode_failed')); }, { once: true }); }); }
function average(values) { return values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length); }
function selectedProposal(clip) { return (clip.editorialProposals || []).find((item) => item.id === clip.selectedProposalId) || (clip.editorialProposals || [])[0]; }
function buildPost(proposal) { return proposal ? [proposal.hook, proposal.description, proposal.cta, (proposal.hashtags || []).join(' ')].filter(Boolean).join('\n\n') : ''; }
async function copyText(text) { try { await navigator.clipboard.writeText(String(text || '')); toast('Publication copiée.'); } catch { toast('La copie automatique est indisponible.', true); } }
function clearPreviewUrls() { for (const url of previewUrls) URL.revokeObjectURL(url); previewUrls = []; }
function setUploadProgress(percent, stage) { $('#uploadProgress').hidden = false; $('#uploadPercent').textContent = `${Math.max(0, Math.min(100, Math.round(percent)))} %`; $('#uploadProgressBar').value = percent; $('#uploadStage').textContent = stage; }
function setFormMessage(text, type = '') { const element = $('#uploadMessage'); element.textContent = text; element.className = `form-message${type ? ` ${type}` : ''}`; }
function runtimeError(text) { $('#runtimeState').classList.add('error'); $('#runtimeState').innerHTML = '<i></i> Indisponible'; $('#jobsList').innerHTML = `<p class="empty-state">${esc(text)}</p>`; }
function toast(text, error = false) { const element = $('#toast'); element.textContent = text; element.className = `toast${error ? ' error' : ''}`; element.hidden = false; clearTimeout(toast.timer); toast.timer = setTimeout(() => { element.hidden = true; }, 4200); }
async function api(url, options = {}, includeCsrf = true) { const headers = { Accept: 'application/json', ...(options.headers || {}) }; if (options.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json'; if (includeCsrf) headers['X-CSRF-Token'] = csrfToken; const response = await fetch(url, { ...options, headers, credentials: 'same-origin' }); const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.error || `http_${response.status}`); return data; }
function normalizeLocalError(error) { const message = String(error?.message || error || 'local_video_processing_failed'); if (/memory|allocation/iu.test(message)) return 'local_engine_memory_limit'; if (/quota|storage/iu.test(message)) return 'local_storage_insufficient'; if (/encoder/iu.test(message)) return 'local_encoder_unavailable'; if (/transcri/iu.test(message)) return 'local_transcription_failed'; return /^[a-z0-9_:-]+$/iu.test(message) ? message.split(':')[0] : 'local_video_processing_failed'; }
function errorText(code) { return ({ unauthorized: 'Reconnectez-vous au Studio.', csrf_failed: 'La session de sécurité a expiré. Actualisez la page.', invalid_video_ai_job: 'Le fichier ou le dossier client est incomplet.', order_not_found: 'Le dossier client est introuvable.', local_storage_insufficient: 'Le navigateur ne dispose pas d’assez d’espace temporaire. Libérez de l’espace disque puis réessayez.', local_engine_memory_limit: 'La mémoire disponible est insuffisante pour cette vidéo. Fermez les applications lourdes ou utilisez une vidéo plus légère.', local_encoder_unavailable: 'Chrome ou Edge ne fournit pas les encodeurs vidéo nécessaires sur cet ordinateur.', local_transcription_failed: 'La transcription locale a échoué. Vérifiez que le navigateur est à jour.', transcription_too_short: 'La vidéo ne contient pas assez de parole exploitable.', no_candidate_above_minimum_score: 'Aucun passage ne dépasse le seuil qualitatif de 60/100.', local_clip_body_missing: 'Le rendu local est absent.', local_clip_too_large: 'Le short dépasse la taille maximale d’envoi direct. Téléchargez-le puis déposez-le dans Drive.', local_clip_type_invalid: 'Le format du rendu local n’est pas accepté.', local_media_only: 'Ce rendu existe uniquement dans le navigateur qui l’a généré.', clip_not_approved: 'Validez le short avant de l’envoyer dans Drive.', drive_short_folder_missing: 'Le dossier Shorts du client n’est pas encore provisionné dans Drive.', drive_access_token_missing: 'La connexion Google Drive doit être resynchronisée.', drive_resumable_session_failed: 'Google Drive n’a pas accepté la préparation de l’envoi.', drive_video_upload_failed: 'La vidéo n’a pas pu être envoyée dans Google Drive.', local_video_processing_failed: 'Le traitement local n’a pas abouti.' })[code] || (/^http_/.test(code) ? `Erreur réseau ${code.replace('http_', '')}.` : 'Une erreur est survenue. Réessayez.'); }
function formatDate(value) { if (!value) return '—'; const date = new Date(value); return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }).format(date); }
function formatDuration(seconds) { const value = Number(seconds || 0); if (!value) return 'Durée en analyse'; return value >= 3600 ? `${Math.floor(value / 3600)} h ${Math.round((value % 3600) / 60)} min` : `${Math.max(1, Math.round(value / 60))} min`; }
function formatTimecode(seconds) { const value = Math.max(0, Math.round(Number(seconds || 0))); return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`; }
function formatBytes(bytes) { const value = Number(bytes || 0); if (value < 1024) return `${value} o`; const units = ['Ko', 'Mo', 'Go', 'To']; let size = value / 1024; let index = 0; while (size >= 1024 && index < units.length - 1) { size /= 1024; index += 1; } return `${size >= 10 ? size.toFixed(1) : size.toFixed(2)} ${units[index]}`; }
function safeName(value) { return String(value || 'short-neptune').normalize('NFD').replace(/[\u0300-\u036f]/gu, '').replace(/[^A-Za-z0-9._-]+/gu, '-').replace(/^-+|-+$/gu, '').slice(0, 120) || 'short-neptune'; }
function cssEscape(value) { return globalThis.CSS?.escape ? CSS.escape(String(value)) : String(value).replace(/[^A-Za-z0-9_-]/gu, '\\$&'); }
function esc(value) { return String(value ?? '').replace(/[&<>"']/gu, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]); }
