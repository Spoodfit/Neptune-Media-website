(() => {
  const progressPanel = document.querySelector('#jobProgressPanel');
  if (!progressPanel || typeof renderReview !== 'function') return;

  const stageOrder = ['starting', 'download', 'transcription', 'visual_analysis', 'selection', 'rendering', 'finalization', 'review_ready'];
  const stageGroups = [
    { id: 'starting', label: 'Démarrage', stages: ['queued', 'starting'] },
    { id: 'download', label: 'Source', stages: ['download', 'probe'] },
    { id: 'transcription', label: 'Transcription', stages: ['transcription'] },
    { id: 'selection', label: 'Analyse IA', stages: ['visual_analysis', 'selection'] },
    { id: 'rendering', label: 'Montage', stages: ['rendering'] },
    { id: 'finalization', label: 'Finalisation', stages: ['finalization', 'review', 'review_ready', 'approved', 'delivered'] },
  ];

  const monitor = document.createElement('section');
  monitor.id = 'videoLiveMonitor';
  monitor.className = 'video-live-monitor';
  monitor.hidden = true;
  monitor.innerHTML = `
    <header class="video-live-monitor__header">
      <div class="video-live-monitor__identity">
        <span class="video-live-monitor__pulse" aria-hidden="true"></span>
        <div><strong>Suivi en direct du moteur</strong><small id="videoLiveSignal">Connexion au Container…</small></div>
      </div>
      <div class="video-live-monitor__clock"><span>Temps écoulé</span><b id="videoLiveElapsed">00:00</b></div>
    </header>
    <div class="video-live-monitor__body">
      <div class="video-live-monitor__main">
        <div class="video-live-monitor__activity">
          <div><h3 id="videoLiveActivity">Préparation du moteur vidéo</h3><p id="videoLiveDetail">Le Container démarre et prépare la vidéo.</p></div>
          <span id="videoLiveBadge" class="video-live-monitor__badge">Démarrage</span>
        </div>
        <div class="video-live-monitor__subprogress"><progress id="videoLiveSubprogress" max="100" value="0"></progress></div>
        <div id="videoLiveMetrics" class="video-live-monitor__metrics"></div>
        <div id="videoLiveTimeline" class="video-live-monitor__timeline"></div>
        <div class="video-live-monitor__events">
          <div class="video-live-monitor__events-head"><span>Journal d’activité</span><span id="videoLiveHeartbeat">En attente du premier signal</span></div>
          <div id="videoLiveEvents" class="video-live-monitor__event-list"></div>
        </div>
        <p id="videoLiveWarning" class="video-live-monitor__warning" hidden></p>
      </div>
      <aside class="video-live-monitor__preview" aria-label="Aperçu du montage en cours">
        <img id="videoLivePreview" alt="Aperçu vertical du montage en cours" hidden>
        <div id="videoLivePreviewPlaceholder" class="video-live-monitor__preview-placeholder"><i></i><strong>Aperçu en préparation</strong><span>Une image réelle apparaîtra dès que la vidéo sera décodée, puis après chaque rendu FFmpeg.</span></div>
        <div id="videoLivePreviewLabel" class="video-live-monitor__preview-label">Le moteur prépare la source.</div>
      </aside>
    </div>`;
  progressPanel.insertAdjacentElement('afterend', monitor);

  const originalRenderReview = renderReview;
  renderReview = function renderReviewWithLiveMonitor() {
    originalRenderReview();
    syncLiveMonitor();
  };

  const originalStartPolling = startPolling;
  startPolling = function startLivePolling() {
    stopPolling();
    pollTimer = window.setInterval(async () => {
      try {
        await openJob(currentJob.id, { preserveScroll: true });
        await loadBootstrap();
      } catch (error) {
        console.error('video_ai_live_poll_failed', error);
      }
    }, 4000);
  };
  void originalStartPolling;

  const clockTimer = window.setInterval(updateClockOnly, 1000);
  window.addEventListener('pagehide', () => window.clearInterval(clockTimer), { once: true });

  function syncLiveMonitor() {
    const job = currentJob;
    const active = job && ACTIVE_STATUSES.has(job.status);
    monitor.hidden = !active;
    if (!active) return;

    const telemetryAvailable = Boolean(job.liveTelemetryAvailable);
    const heartbeatAt = dateValue(job.liveHeartbeatAt || job.liveUpdatedAt);
    const heartbeatAge = heartbeatAt ? Math.max(0, (Date.now() - heartbeatAt.getTime()) / 1000) : Infinity;
    const stale = telemetryAvailable && heartbeatAge > 25;
    const offline = telemetryAvailable && heartbeatAge > 65;
    monitor.classList.toggle('is-stale', stale && !offline);
    monitor.classList.toggle('is-offline', offline);

    const activity = job.liveActivity || fallbackActivity(job);
    const detail = job.liveDetail || fallbackDetail(job);
    document.querySelector('#videoLiveActivity').textContent = activity;
    document.querySelector('#videoLiveDetail').textContent = detail;
    document.querySelector('#videoLiveBadge').textContent = statusBadge(job, telemetryAvailable, stale, offline);
    document.querySelector('#videoLiveSignal').textContent = signalLabel(job, telemetryAvailable, stale, offline);
    document.querySelector('#videoLiveHeartbeat').textContent = heartbeatAt ? `Dernier signal ${relativeAge(heartbeatAge)}` : 'Container en cours de démarrage';

    const stageProgress = deriveStageProgress(job);
    document.querySelector('#videoLiveSubprogress').value = Math.round(stageProgress * 100);
    renderMetrics(job);
    renderTimeline(job.stage);
    renderEvents(job);
    renderPreview(job);
    renderWarning(job, telemetryAvailable, heartbeatAge);
    updateClockOnly();
  }

  function updateClockOnly() {
    if (monitor.hidden || !currentJob) return;
    const started = dateValue(currentJob.liveStartedAt || currentJob.startedAt || currentJob.updatedAt || currentJob.createdAt);
    const elapsed = started ? Math.max(0, Math.round((Date.now() - started.getTime()) / 1000)) : Number(currentJob.liveElapsedSeconds || 0);
    document.querySelector('#videoLiveElapsed').textContent = formatClock(elapsed);
  }

  function renderMetrics(job) {
    const metrics = job.liveMetrics || {};
    const items = [];
    if (Number(metrics.totalBytes) > 0) {
      items.push([`${formatBytes(metrics.downloadedBytes)} / ${formatBytes(metrics.totalBytes)}`, 'Source reçue']);
      items.push([formatRate(metrics.bytesPerSecond), 'Débit actuel']);
      items.push([formatRemaining(metrics.remainingSeconds), 'Temps estimé']);
    } else if (Number(metrics.totalChunks) > 0) {
      items.push([`${Number(metrics.transcribedChunks || 0)} / ${Number(metrics.totalChunks)}`, 'Blocs transcrits']);
      items.push([formatClock(metrics.transcribedSeconds || 0), 'Audio traité']);
      items.push([formatPercent((metrics.transcribedChunks || 0) / Math.max(1, metrics.totalChunks)), 'Transcription']);
    } else if (Number(metrics.totalVisualSamples) > 0) {
      items.push([`${Number(metrics.visualSamples || 0)} / ${Number(metrics.totalVisualSamples)}`, 'Images analysées']);
      items.push([String(Number(metrics.faceCount || 0)), 'Visages moyens']);
      items.push([`${Number(currentJob.progress || 0)} %`, 'Progression globale']);
    } else if (job.liveCurrentClip) {
      items.push([`${job.liveCurrentClip.index} / ${job.liveCurrentClip.total}`, 'Short en cours']);
      items.push([formatClock(metrics.renderedClipSeconds || 0), 'Clip encodé']);
      items.push([formatPercent((metrics.renderedClipSeconds || 0) / Math.max(.1, metrics.currentClipDurationSeconds || 1)), 'Encodage FFmpeg']);
    } else {
      items.push([`${Number(job.progress || 0)} %`, 'Progression globale']);
      items.push([String(job.liveRenderedCount || 0), 'Shorts rendus']);
      items.push([String(job.liveCandidateCount || 0), 'Passages retenus']);
    }
    document.querySelector('#videoLiveMetrics').innerHTML = items.slice(0, 3).map(([value, label]) => `<div class="video-live-monitor__metric"><b>${escapeHtml(value)}</b><span>${escapeHtml(label)}</span></div>`).join('');
  }

  function renderTimeline(stage) {
    const currentIndex = Math.max(0, stageOrder.indexOf(normalizeStage(stage)));
    document.querySelector('#videoLiveTimeline').innerHTML = stageGroups.map((group) => {
      const indices = group.stages.map(item => stageOrder.indexOf(normalizeStage(item))).filter(index => index >= 0);
      const groupIndex = indices.length ? Math.min(...indices) : 0;
      const active = group.stages.includes(stage) || group.stages.includes(normalizeStage(stage));
      const done = !active && currentIndex > Math.max(...indices, groupIndex);
      return `<div class="video-live-monitor__step${active ? ' active' : done ? ' done' : ''}">${escapeHtml(group.label)}</div>`;
    }).join('');
  }

  function renderEvents(job) {
    const events = Array.isArray(job.liveEvents) ? job.liveEvents.slice(-6).reverse() : [];
    if (!events.length) {
      document.querySelector('#videoLiveEvents').innerHTML = '<div class="video-live-monitor__event"><time>—</time><span>Le moteur initialise son journal d’activité.</span></div>';
      return;
    }
    document.querySelector('#videoLiveEvents').innerHTML = events.map(event => {
      const at = dateValue(event.at);
      return `<div class="video-live-monitor__event"><time>${at ? at.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—'}</time><span>${escapeHtml(event.label || event.detail || event.stage || 'Activité du moteur')}</span></div>`;
    }).join('');
  }

  function renderPreview(job) {
    const image = document.querySelector('#videoLivePreview');
    const placeholder = document.querySelector('#videoLivePreviewPlaceholder');
    const label = document.querySelector('#videoLivePreviewLabel');
    const source = String(job.livePreviewDataUrl || '');
    if (source.startsWith('data:image/jpeg;base64,')) {
      if (image.src !== source) image.src = source;
      image.hidden = false;
      placeholder.hidden = true;
      label.textContent = job.livePreviewLabel || 'Aperçu réel du traitement en cours';
    } else {
      image.hidden = true;
      placeholder.hidden = false;
      const stage = normalizeStage(job.stage);
      label.textContent = stage === 'starting' || stage === 'queued'
        ? 'Le Container démarre. Aucun rendu n’existe encore.'
        : 'L’aperçu apparaîtra après le décodage de la source.';
    }
  }

  function renderWarning(job, telemetryAvailable, heartbeatAge) {
    const warning = document.querySelector('#videoLiveWarning');
    if (!telemetryAvailable) {
      warning.hidden = false;
      warning.textContent = job.liveTelemetryReason === 'container_warming_up'
        ? 'Le Container démarre à froid. Le pourcentage peut rester stable pendant cette phase, mais Neptune vérifie sa disponibilité toutes les quatre secondes.'
        : 'Le signal détaillé du Container n’est pas encore disponible. Le suivi automatique reste actif.';
      return;
    }
    if (heartbeatAge > 65) {
      warning.hidden = false;
      warning.textContent = 'Aucun signal récent du moteur. Neptune poursuit les vérifications automatiques ; une relance ne sera proposée que si le job passe réellement en échec.';
      return;
    }
    if (heartbeatAge > 25) {
      warning.hidden = false;
      warning.textContent = 'Cette opération est longue, mais le job n’est pas déclaré en échec. Le dernier état connu reste affiché.';
      return;
    }
    warning.hidden = true;
    warning.textContent = '';
  }

  function deriveStageProgress(job) {
    const explicit = Number(job.liveStageProgress || 0);
    if (explicit > 0) return Math.min(1, explicit);
    const metrics = job.liveMetrics || {};
    if (Number(metrics.totalBytes) > 0) return Math.min(1, Number(metrics.downloadedBytes || 0) / Number(metrics.totalBytes));
    if (Number(metrics.totalChunks) > 0) return Math.min(1, Number(metrics.transcribedChunks || 0) / Number(metrics.totalChunks));
    if (Number(metrics.totalVisualSamples) > 0) return Math.min(1, Number(metrics.visualSamples || 0) / Number(metrics.totalVisualSamples));
    if (job.liveCurrentClip) return Math.min(1, Number(metrics.renderedClipSeconds || 0) / Math.max(.1, Number(metrics.currentClipDurationSeconds || 1)));
    return Math.min(1, Math.max(0, Number(job.progress || 0) / 100));
  }

  function fallbackActivity(job) {
    const labels = {
      queued: 'Mise en file de production',
      starting: 'Démarrage du moteur vidéo',
      download: 'Téléchargement sécurisé de la source',
      probe: 'Lecture des caractéristiques vidéo',
      transcription: 'Transcription audio',
      visual_analysis: 'Analyse visuelle',
      selection: 'Sélection éditoriale',
      rendering: 'Montage vertical et sous-titres',
      finalization: 'Finalisation des contenus',
    };
    return labels[job.stage] || STAGE_LABELS[job.stage] || 'Traitement en arrière-plan';
  }

  function fallbackDetail(job) {
    if (job.liveTelemetryReason === 'container_warming_up') return 'Le Container Python, FFmpeg et OpenCV est en cours de démarrage.';
    return 'Neptune continue le traitement et actualise cet écran automatiquement.';
  }

  function statusBadge(job, available, stale, offline) {
    if (offline) return 'Signal lent';
    if (stale) return 'Étape longue';
    if (!available) return 'Démarrage';
    if (job.stage === 'rendering') return 'Montage actif';
    return 'Moteur actif';
  }

  function signalLabel(job, available, stale, offline) {
    if (offline) return 'Dernier signal ancien · surveillance automatique active';
    if (stale) return 'Le moteur exécute une opération longue';
    if (!available) return 'Démarrage du Container et attente du premier signal';
    return `${job.liveProcessorState === 'processing' ? 'Moteur actif' : 'Moteur connecté'} · actualisation toutes les 4 secondes`;
  }

  function normalizeStage(stage) {
    const aliases = { queued: 'starting', probe: 'download', review: 'finalization', approved: 'finalization', delivered: 'finalization' };
    return aliases[stage] || stage || 'starting';
  }

  function dateValue(value) {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function relativeAge(seconds) {
    if (!Number.isFinite(seconds)) return 'indisponible';
    if (seconds < 4) return 'à l’instant';
    if (seconds < 60) return `il y a ${Math.round(seconds)} s`;
    return `il y a ${Math.round(seconds / 60)} min`;
  }

  function formatClock(seconds) {
    const value = Math.max(0, Math.round(Number(seconds || 0)));
    const hours = Math.floor(value / 3600);
    const minutes = Math.floor((value % 3600) / 60);
    const secs = value % 60;
    return hours ? `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}` : `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  function formatBytes(bytes) {
    let value = Number(bytes || 0);
    const units = ['o', 'Ko', 'Mo', 'Go', 'To'];
    let index = 0;
    while (value >= 1024 && index < units.length - 1) { value /= 1024; index += 1; }
    return `${value >= 10 || index === 0 ? value.toFixed(index ? 1 : 0) : value.toFixed(2)} ${units[index]}`;
  }

  function formatRate(bytesPerSecond) {
    return Number(bytesPerSecond) > 0 ? `${formatBytes(bytesPerSecond)}/s` : 'Calcul…';
  }

  function formatRemaining(seconds) {
    if (!Number(seconds)) return 'Calcul…';
    return Number(seconds) < 60 ? `${Math.round(seconds)} s` : `${Math.ceil(seconds / 60)} min`;
  }

  function formatPercent(ratio) {
    return `${Math.max(0, Math.min(100, Math.round(Number(ratio || 0) * 100)))} %`;
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/gu, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
  }

  queueMicrotask(syncLiveMonitor);
})();
