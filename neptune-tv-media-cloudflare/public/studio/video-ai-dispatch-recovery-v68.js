(() => {
  const originalRenderReview = renderReview;
  const originalErrorText = errorText;
  const actions = document.querySelector('.review-actions');
  const progressPanel = document.querySelector('#jobProgressPanel');

  const retryButton = document.createElement('button');
  retryButton.id = 'retryVideoJob';
  retryButton.className = 'secondary-button';
  retryButton.type = 'button';
  retryButton.textContent = 'Relancer sans réimporter';
  retryButton.hidden = true;
  actions?.prepend(retryButton);

  const recoveryHint = document.createElement('p');
  recoveryHint.id = 'jobRecoveryHint';
  recoveryHint.className = 'job-recovery-hint';
  recoveryHint.hidden = true;
  progressPanel?.append(recoveryHint);

  errorText = function enhancedVideoAiErrorText(code) {
    const messages = {
      video_processor_dispatch_failed: 'Le moteur cloud n’a pas démarré. La vidéo est déjà importée : relancez le traitement sans la renvoyer.',
      video_processor_startup_timeout: 'Le moteur cloud a dépassé son délai de démarrage. Relancez le traitement sans réimporter la vidéo.',
      video_processor_health_failed: 'Le moteur cloud a démarré mais son contrôle de disponibilité a échoué.',
      video_container_dispatch_failed: 'Le moteur cloud n’a pas accepté le traitement. La vidéo reste disponible pour une relance.',
      video_source_missing: 'La source importée n’est plus disponible. Une nouvelle importation est nécessaire.',
    };
    return messages[code] || originalErrorText(code);
  };

  renderReview = function renderReviewWithRecovery() {
    originalRenderReview();
    syncRecoveryUi();
  };

  retryButton.addEventListener('click', async () => {
    if (!currentJob?.id || currentJob.status !== 'failed') return;
    retryButton.disabled = true;
    retryButton.textContent = 'Redémarrage du moteur…';
    recoveryHint.hidden = false;
    recoveryHint.textContent = 'La source déjà importée est conservée. Neptune redémarre uniquement le traitement serveur.';
    try {
      await api(`/api/admin/video-ai/jobs/${encodeURIComponent(currentJob.id)}/retry`, {
        method: 'POST',
        body: '{}',
      });
      toast('Traitement relancé. Aucun nouvel import nécessaire.');
      await openJob(currentJob.id, { preserveScroll: true });
      await loadBootstrap();
    } catch (error) {
      toast(errorText(error.message), true);
      recoveryHint.textContent = errorText(error.message);
    } finally {
      retryButton.disabled = false;
      retryButton.textContent = 'Relancer sans réimporter';
      syncRecoveryUi();
    }
  });

  function syncRecoveryUi() {
    const failed = currentJob?.status === 'failed';
    const sourceAvailable = Boolean(currentJob?.sourceKey);
    retryButton.hidden = !failed || !sourceAvailable;
    recoveryHint.hidden = !failed;
    if (!failed) return;

    const code = String(currentJob.errorCode || 'video_ai_operation_failed');
    const diagnosis = classifyDispatchDetail(String(currentJob.errorDetail || ''));
    recoveryHint.textContent = `${errorText(code)}${diagnosis ? ` ${diagnosis}` : ''} Référence : ${code}.`;
  }

  function classifyDispatchDetail(detail) {
    if (!detail) return '';
    if (/timeout|timed out|port.*ready|wait.*port/iu.test(detail)) {
      return 'Le démarrage à froid du Container a dépassé l’ancien délai de disponibilité.';
    }
    if (/502|503|504|unavailable|connection refused/iu.test(detail)) {
      return 'Le service vidéo n’était pas encore joignable au moment de l’envoi.';
    }
    if (/image|entrypoint|exited|exit code|start/iu.test(detail)) {
      return 'Le processus du Container s’est arrêté pendant son démarrage.';
    }
    return 'Le détail technique est conservé dans le dossier de production pour diagnostic.';
  }

  queueMicrotask(syncRecoveryUi);
})();
