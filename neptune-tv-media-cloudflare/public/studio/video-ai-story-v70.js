(() => {
  const progressPanel = document.querySelector('#jobProgressPanel');
  if (!progressPanel || typeof renderReview !== 'function') return;

  const story = document.createElement('section');
  story.id = 'videoProductionStory';
  story.className = 'video-story';
  story.hidden = true;
  story.innerHTML = `
    <header class="video-story__head">
      <div><h3>Neptune crée vos contenus</h3><p id="storySummary">Votre vidéo est prise en charge automatiquement.</p></div>
      <span id="storyState" class="video-story__state">En cours</span>
    </header>
    <div class="video-story__body">
      <div class="video-story__preview">
        <img id="storyPreview" alt="Aperçu réel du contenu en préparation" hidden>
        <div id="storyPreviewEmpty" class="video-story__preview-copy"><i></i><b>Vos shorts prennent forme</b><span>La première image apparaîtra dès que Neptune aura repéré un passage à transformer.</span></div>
        <div id="storyPreviewLabel" class="video-story__preview-label">Préparation de la vidéo</div>
      </div>
      <div class="video-story__content">
        <section class="video-story__now">
          <small>En ce moment</small>
          <h4 id="storyNowTitle">Préparation de votre vidéo</h4>
          <p id="storyNowDetail">Neptune organise la vidéo avant de repérer les meilleurs moments.</p>
          <div id="storyRecovery" class="video-story__recovery" hidden>Le démarrage a pris trop de temps. Neptune relance automatiquement la production sans vous demander de renvoyer la vidéo.</div>
        </section>
        <div id="storySteps" class="video-story__steps"></div>
        <section class="video-story__outputs">
          <div class="video-story__outputs-head"><strong>Ce que Neptune prépare</strong><span id="storyOutputCount">Aucun contenu finalisé pour le moment</span></div>
          <div id="storyCards" class="video-story__cards"></div>
        </section>
        <div class="video-story__footer"><span id="storyTime">Estimation disponible après l’analyse</span><strong id="storySignal">Production surveillée automatiquement</strong></div>
        <details><summary>Détails techniques</summary><p id="storyTechnical">État du moteur en cours de synchronisation.</p></details>
      </div>
    </div>`;
  progressPanel.insertAdjacentElement('afterend', story);

  const originalRenderReview = renderReview;
  renderReview = function renderReviewWithSimpleStory() {
    originalRenderReview();
    syncStory();
  };

  const clock = window.setInterval(syncStoryClock, 1000);
  window.addEventListener('pagehide', () => window.clearInterval(clock), { once: true });
  queueWarmup();
  queueMicrotask(syncStory);

  function queueWarmup() {
    if (typeof api !== 'function' || sessionStorage.getItem('neptune-video-warmup-v70')) return;
    sessionStorage.setItem('neptune-video-warmup-v70', String(Date.now()));
    api('/api/admin/video-ai/warmup', { method: 'POST', body: '{}' }).catch(() => {
      sessionStorage.removeItem('neptune-video-warmup-v70');
    });
  }

  function syncStory() {
    const job = currentJob;
    const active = job && ACTIVE_STATUSES.has(job.status);
    story.hidden = !active;
    progressPanel.hidden = active || progressPanel.hidden;
    if (!active) return;

    const phase = phaseFor(job.stage);
    const recovering = Boolean(job.automaticRecovery) || ['restarting', 'startup_failed'].includes(job.stage);
    story.classList.toggle('is-recovering', recovering);
    document.querySelector('#storyState').textContent = recovering ? 'Relance automatique' : 'En cours';
    document.querySelector('#storySummary').textContent = recovering
      ? 'La vidéo est déjà importée. Neptune redémarre seulement la production.'
      : 'Vous pouvez quitter cet écran : la production continue sans vous.';

    const copy = humanCopy(job, phase);
    document.querySelector('#storyNowTitle').textContent = copy.title;
    document.querySelector('#storyNowDetail').textContent = copy.detail;
    document.querySelector('#storyRecovery').hidden = !recovering;
    renderSteps(phase.index);
    renderOutputCards(job, phase.index);
    renderPreview(job, phase);
    renderFooter(job, phase);
    renderTechnical(job);
  }

  function syncStoryClock() {
    if (story.hidden || !currentJob) return;
    renderFooter(currentJob, phaseFor(currentJob.stage));
  }

  function phaseFor(stage) {
    const value = String(stage || 'queued');
    if (['queued', 'starting', 'restarting', 'startup_failed'].includes(value)) return { index: 0, id: 'prepare' };
    if (['download', 'probe', 'transcription'].includes(value)) return { index: 1, id: 'understand' };
    if (['visual_analysis', 'selection'].includes(value)) return { index: 2, id: 'select' };
    if (['rendering', 'finalization'].includes(value)) return { index: 3, id: 'create' };
    return { index: 3, id: 'create' };
  }

  function humanCopy(job, phase) {
    const clip = job.liveCurrentClip || {};
    const rendered = Number(job.liveRenderedCount || 0);
    const total = Number(job.liveCandidateCount || clip.total || 0);
    if (phase.id === 'prepare') return {
      title: job.stage === 'restarting' ? 'Redémarrage de la production' : 'Préparation de votre vidéo',
      detail: job.stage === 'restarting'
        ? 'Neptune reprend automatiquement avec la vidéo déjà envoyée.'
        : 'Neptune prépare la vidéo pour commencer l’analyse. Cette étape ne doit pas dépasser quelques minutes.',
    };
    if (job.stage === 'download') return { title: 'Ouverture de la vidéo', detail: 'Neptune récupère la source sécurisée et vérifie qu’elle est complète.' };
    if (job.stage === 'probe') return { title: 'Lecture de la vidéo', detail: 'Neptune vérifie l’image, le son et la durée avant de commencer.' };
    if (job.stage === 'transcription') return { title: 'Compréhension de l’interview', detail: 'Neptune écoute la vidéo et repère les idées, les phrases fortes et les réponses utiles.' };
    if (job.stage === 'visual_analysis') return { title: 'Repérage des meilleurs moments', detail: 'Neptune compare le fond, le rythme et la qualité visuelle de chaque passage.' };
    if (job.stage === 'selection') return { title: 'Choix des passages à fort potentiel', detail: 'Les moments les plus clairs et les plus performants sont classés en TOFU, MOFU et BOFU.' };
    if (job.stage === 'rendering') return {
      title: total ? `Création du short ${Math.max(1, Number(clip.index || rendered + 1))} sur ${total}` : 'Création des shorts',
      detail: clip.title ? `Neptune transforme « ${clip.title} » en format vertical avec cadrage et sous-titres.` : 'Neptune crée les formats verticaux, ajoute les sous-titres et prépare les versions finales.',
    };
    return { title: 'Dernières finitions', detail: 'Neptune vérifie les fichiers avant de les afficher pour validation.' };
  }

  function renderSteps(activeIndex) {
    const steps = [
      ['Vidéo prise en charge', 'Source sécurisée'],
      ['Interview comprise', 'Idées et phrases fortes'],
      ['Meilleurs moments choisis', 'TOFU, MOFU et BOFU'],
      ['Shorts créés', 'Cadrage et sous-titres'],
    ];
    document.querySelector('#storySteps').innerHTML = steps.map((step, index) => `
      <div class="video-story__step ${index < activeIndex ? 'is-done' : ''} ${index === activeIndex ? 'is-active' : ''}">
        <b>${index < activeIndex ? '✓' : index + 1}</b><strong>${step[0]}</strong><span>${step[1]}</span>
      </div>`).join('');
  }

  function renderOutputCards(job, phaseIndex) {
    const rendered = Number(job.liveRenderedCount || 0);
    const total = Number(job.liveCandidateCount || job.liveCurrentClip?.total || 0);
    const cards = [
      ['Accroche forte', 'Le début qui donne envie de regarder'],
      ['Sous-titres lisibles', 'Pensés pour être compris sans le son'],
      ['Format vertical', 'Prêt pour LinkedIn, Instagram et Shorts'],
    ];
    document.querySelector('#storyCards').innerHTML = cards.map((card, index) => `
      <div class="video-story__card ${phaseIndex >= 3 && index <= Math.min(2, rendered) ? 'is-active' : ''}">
        <i></i><b>${card[0]}</b><span>${card[1]}</span>
      </div>`).join('');
    document.querySelector('#storyOutputCount').textContent = total
      ? `${rendered} sur ${total} short${total > 1 ? 's' : ''} finalisé${rendered > 1 ? 's' : ''}`
      : 'Les propositions apparaîtront après la sélection';
  }

  function renderPreview(job, phase) {
    const image = document.querySelector('#storyPreview');
    const empty = document.querySelector('#storyPreviewEmpty');
    const preview = String(job.livePreviewDataUrl || '');
    if (preview.startsWith('data:image/jpeg;base64,')) {
      if (image.src !== preview) image.src = preview;
      image.hidden = false;
      empty.hidden = true;
    } else {
      image.hidden = true;
      empty.hidden = false;
    }
    const label = phase.id === 'create'
      ? String(job.livePreviewLabel || job.liveCurrentClip?.title || 'Aperçu du short en cours')
      : phase.id === 'select'
        ? 'Passage actuellement analysé'
        : 'Aperçu de la vidéo source';
    document.querySelector('#storyPreviewLabel').textContent = label;
  }

  function renderFooter(job, phase) {
    const metrics = job.liveMetrics || {};
    const remaining = Number(metrics.remainingSeconds || 0);
    const started = Date.parse(job.liveStartedAt || job.startedAt || job.updatedAt || job.createdAt || '');
    const elapsed = Number.isFinite(started) ? Math.max(0, Math.round((Date.now() - started) / 1000)) : Number(job.liveElapsedSeconds || 0);
    document.querySelector('#storyTime').textContent = remaining > 0
      ? `Temps restant estimé : ${formatDuration(remaining)}`
      : `Temps écoulé : ${formatDuration(elapsed)}`;

    const heartbeat = Date.parse(job.liveHeartbeatAt || job.liveUpdatedAt || '');
    const age = Number.isFinite(heartbeat) ? Math.max(0, Math.round((Date.now() - heartbeat) / 1000)) : Infinity;
    document.querySelector('#storySignal').textContent = age < 15
      ? 'Neptune travaille normalement'
      : job.stage === 'restarting' || job.automaticRecovery
        ? 'Relance automatique en cours'
        : phase.id === 'prepare'
          ? 'Préparation surveillée automatiquement'
          : 'Vérification automatique du traitement';
  }

  function renderTechnical(job) {
    const heartbeat = job.liveHeartbeatAt || job.liveUpdatedAt || 'aucun signal reçu';
    document.querySelector('#storyTechnical').textContent = `Étape : ${job.stage || 'inconnue'} · progression interne : ${Number(job.progress || 0)} % · dernier signal : ${heartbeat}.`;
  }

  function formatDuration(seconds) {
    const value = Math.max(0, Math.round(Number(seconds || 0)));
    const hours = Math.floor(value / 3600);
    const minutes = Math.floor((value % 3600) / 60);
    if (hours) return `${hours} h ${String(minutes).padStart(2, '0')} min`;
    if (minutes) return `${minutes} min`;
    return `${Math.max(1, value)} s`;
  }
})();
