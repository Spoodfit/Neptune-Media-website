(() => {
  const nativeFetch = window.fetch.bind(window);
  const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
  let uploadActive = false;

  window.fetch = async (input, init = {}) => {
    const target = typeof input === 'string' ? input : input?.url || '';
    const method = String(init.method || (typeof input !== 'string' ? input?.method : '') || 'GET').toUpperCase();
    const multipartPart = method === 'PUT' && target.includes('/api/admin/video-ai/upload/part');
    const retryablePoll = method === 'GET' && /\/api\/admin\/video-ai\/jobs\//u.test(target);
    const maximumAttempts = multipartPart ? 5 : (retryablePoll ? 3 : 1);
    let lastError;

    for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
      try {
        const response = await nativeFetch(input, init);
        if (response.ok || attempt === maximumAttempts || (response.status >= 400 && response.status < 500 && ![408, 425, 429].includes(response.status))) {
          return response;
        }
        lastError = new Error(`http_${response.status}`);
      } catch (error) {
        lastError = error;
        if (attempt === maximumAttempts) throw error;
      }
      const delay = Math.min(8000, 500 * (2 ** (attempt - 1))) + Math.round(Math.random() * 350);
      await sleep(delay);
    }
    throw lastError || new Error('network_retry_exhausted');
  };

  document.addEventListener('submit', (event) => {
    if (event.target?.id === 'uploadForm') uploadActive = true;
  }, true);

  const message = document.querySelector('#uploadMessage');
  if (message) {
    new MutationObserver(() => {
      const text = String(message.textContent || '').toLowerCase();
      if (text.includes('sécurisée dans neptune') || message.classList.contains('error')) uploadActive = false;
    }).observe(message, { childList: true, subtree: true, characterData: true, attributes: true });
  }

  window.addEventListener('beforeunload', (event) => {
    if (!uploadActive) return;
    event.preventDefault();
    event.returnValue = '';
  });

  const adaptOpenAiPanel = () => {
    const panel = document.querySelector('.openai-integration-card');
    if (!panel) return false;
    const copy = panel.querySelector('#openAiStatusCopy');
    const hint = panel.querySelector('#openAiHint');
    const normalize = () => {
      if (copy && /reste sur cet ordinateur|vidéo source reste/iu.test(copy.textContent || '')) {
        copy.textContent = 'OpenAI analyse la transcription horodatée. La vidéo source reste dans le stockage sécurisé Neptune et n’est jamais transmise à OpenAI.';
      }
      if (hint && /moteur local/iu.test(hint.textContent || '')) {
        hint.textContent = 'En cas d’indisponibilité OpenAI, Workers AI prend le relais. Le traitement vidéo serveur reste actif.';
      }
    };
    normalize();
    new MutationObserver(normalize).observe(panel, { childList: true, subtree: true, characterData: true });
    return true;
  };

  if (!adaptOpenAiPanel()) {
    const observer = new MutationObserver(() => {
      if (adaptOpenAiPanel()) observer.disconnect();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }
})();
