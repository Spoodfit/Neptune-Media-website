(() => {
  if (window.__neptuneVideoStoryV71) return;
  window.__neptuneVideoStoryV71 = true;

  const install = () => {
    const story = document.querySelector('#videoProductionStory');
    if (!story || typeof renderReview !== 'function') return false;
    const previousRenderReview = renderReview;
    renderReview = function renderReviewWithOrchestratorV71() {
      previousRenderReview();
      queueMicrotask(syncOrchestratorState);
    };
    const timer = window.setInterval(syncOrchestratorState, 750);
    window.addEventListener('pagehide', () => window.clearInterval(timer), { once: true });
    syncOrchestratorState();
    return true;
  };

  if (!install()) {
    const observer = new MutationObserver(() => {
      if (install()) observer.disconnect();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    window.setTimeout(() => observer.disconnect(), 15000);
  }

  function syncOrchestratorState() {
    if (typeof currentJob !== 'object' || !currentJob) return;
    const job = currentJob;
    const attempts = Math.max(0, Number(job.attempts || 0));
    const maximum = Math.max(1, Number(job.maximumRecoveryAttempts || 5));
    const retrying = job.errorCode === 'video_processor_retrying'
      && ['queued', 'processing'].includes(String(job.status || ''))
      && attempts < maximum;
    const failed = job.status === 'failed' || job.stage === 'startup_failed';

    const story = document.querySelector('#videoProductionStory');
    if (!story) return;
    story.classList.toggle('is-recovering', retrying);

    const state = document.querySelector('#storyState');
    const summary = document.querySelector('#storySummary');
    const recovery = document.querySelector('#storyRecovery');
    const title = document.querySelector('#storyNowTitle');
    const detail = document.querySelector('#storyNowDetail');
    const signal = document.querySelector('#storySignal');
    const time = document.querySelector('#storyTime');
    const technical = document.querySelector('#storyTechnical');

    if (state) state.textContent = failed ? 'Action requise' : retrying ? `Tentative ${Math.max(1, attempts)}/${maximum}` : 'En cours';
    if (summary) {
      summary.textContent = failed
        ? 'Le moteur a refusé le traitement. La vidéo reste disponible et peut être relancée sans nouvel import.'
        : retrying
          ? 'Neptune retente le démarrage avec la vidéo déjà importée.'
          : 'Vous pouvez quitter cet écran : la production continue sans vous.';
    }
    if (recovery) {
      recovery.hidden = !retrying;
      recovery.textContent = `Le moteur n’a pas encore accepté la production. Tentative ${Math.max(1, attempts)} sur ${maximum}. Après la dernière tentative, Neptune arrête la boucle et affiche l’erreur exacte.`;
    }
    if (retrying) {
      if (title) title.textContent = `Nouvelle tentative de démarrage (${Math.max(1, attempts)}/${maximum})`;
      if (detail) detail.textContent = 'La source est déjà sécurisée. Neptune redémarre uniquement le moteur de production.';
    }
    if (failed) {
      if (title) title.textContent = 'Le moteur vidéo doit être relancé';
      if (detail) detail.textContent = 'Aucun nouvel import n’est nécessaire. Utilisez « Relancer sans réimporter » après lecture du diagnostic.';
    }

    const heartbeat = Date.parse(job.liveHeartbeatAt || job.liveUpdatedAt || '');
    const heartbeatAge = Number.isFinite(heartbeat) ? Math.max(0, Math.round((Date.now() - heartbeat) / 1000)) : Infinity;
    if (signal) {
      signal.textContent = heartbeatAge < 35
        ? 'Neptune travaille normalement'
        : failed
          ? 'Traitement arrêté — diagnostic disponible'
          : retrying
            ? `Démarrage contrôlé · tentative ${Math.max(1, attempts)}/${maximum}`
            : `Moteur ${humanContainerState(job.containerState)}`;
    }

    const attemptStarted = Date.parse(job.liveStartedAt || job.attemptStartedAt || job.updatedAt || '');
    if (time && Number.isFinite(attemptStarted)) {
      time.textContent = `Tentative en cours : ${formatDuration(Math.max(0, Math.round((Date.now() - attemptStarted) / 1000)))}`;
    }

    if (technical) {
      const error = String(job.errorDetail || '').trim();
      technical.textContent = [
        `Étape : ${job.stage || 'inconnue'}`,
        `progression : ${Number(job.progress || 0)} %`,
        `moteur : ${job.containerState || 'inconnu'}`,
        `tentatives : ${attempts}/${maximum}`,
        `dernier signal : ${job.liveHeartbeatAt || job.liveUpdatedAt || 'aucun'}`,
        job.errorCode ? `code : ${job.errorCode}` : '',
        error ? `diagnostic : ${error}` : '',
      ].filter(Boolean).join(' · ');
    }
  }

  function humanContainerState(value) {
    const state = String(value || 'inconnu');
    if (state === 'healthy') return 'disponible';
    if (state === 'running') return 'en démarrage';
    if (state === 'stopped') return 'à l’arrêt';
    if (state === 'stopped_with_code') return 'arrêté sur erreur';
    return 'indisponible';
  }

  function formatDuration(seconds) {
    const value = Math.max(0, Math.round(Number(seconds || 0)));
    const hours = Math.floor(value / 3600);
    const minutes = Math.floor((value % 3600) / 60);
    const remaining = value % 60;
    if (hours) return `${hours} h ${String(minutes).padStart(2, '0')} min`;
    if (minutes) return `${minutes} min ${String(remaining).padStart(2, '0')} s`;
    return `${value} s`;
  }
})();
