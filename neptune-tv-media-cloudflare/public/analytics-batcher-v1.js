(() => {
  if (window.__neptuneAnalyticsBatcherInstalled) return;
  window.__neptuneAnalyticsBatcherInstalled = true;

  const nativeFetch = window.fetch.bind(window);
  const trackedPaths = new Map([
    ['/api/track', 'video'],
    ['/api/ad-track', 'ad'],
  ]);
  const ignoredVideoEvents = new Set(['impression', 'play', 'pause']);
  const queue = new Map();
  const FLUSH_DELAY_MS = 60_000;
  const MAX_EVENTS = 100;
  let flushTimer = 0;
  let flushing = false;

  window.fetch = function neptuneFetch(input, init = {}) {
    const requestUrl = resolveUrl(input);
    const kind = requestUrl ? trackedPaths.get(requestUrl.pathname) : '';
    const method = String(init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
    if (!kind || method !== 'POST' || requestUrl.origin !== location.origin || typeof init?.body !== 'string') {
      return nativeFetch(input, init);
    }

    try {
      const payload = JSON.parse(init.body);
      const buffered = bufferEvent(kind, payload);
      if (buffered) {
        scheduleFlush();
        if (queue.size >= MAX_EVENTS) void flush(false);
      }
      return Promise.resolve(new Response(JSON.stringify({ ok: true, buffered }), {
        status: 202,
        headers: { 'Content-Type': 'application/json' },
      }));
    } catch {
      return nativeFetch(input, init);
    }
  };

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush(true);
  });
  window.addEventListener('pagehide', () => flush(true));
  window.addEventListener('online', () => scheduleFlush(500));

  function bufferEvent(kind, payload = {}) {
    const event = String(payload.event || '').slice(0, 40);
    const episodeId = String(payload.episodeId || '').slice(0, 100);
    const adId = String(payload.adId || '').slice(0, 100);
    const sessionId = String(payload.sessionId || '').slice(0, 100);
    if (!event || !sessionId || (kind === 'video' ? !episodeId : !adId)) return false;
    if (kind === 'video' && ignoredVideoEvents.has(event)) return false;

    const key = [kind, event, sessionId, episodeId, adId].join('|');
    const current = queue.get(key);
    const next = {
      kind,
      event,
      sessionId,
      episodeId,
      adId,
      position: finite(payload.position),
      delta: finite(payload.delta),
      referrer: safeReferrer(payload.referrer || document.referrer || ''),
      device: payload.device && typeof payload.device === 'object'
        ? payload.device
        : { width: innerWidth, touch: navigator.maxTouchPoints > 0, language: navigator.language },
    };
    if (current && event === 'watch') {
      current.delta = Math.min(3600, finite(current.delta) + finite(next.delta));
      current.position = Math.max(finite(current.position), finite(next.position));
      return true;
    }
    if (!current || event === 'watch') queue.set(key, next);
    return true;
  }

  function scheduleFlush(delay = FLUSH_DELAY_MS) {
    clearTimeout(flushTimer);
    flushTimer = window.setTimeout(() => void flush(false), delay);
  }

  function flush(final) {
    clearTimeout(flushTimer);
    if (!queue.size || (flushing && !final)) return false;
    const snapshot = [...queue.values()].slice(0, MAX_EVENTS);
    for (const item of snapshot) queue.delete([item.kind, item.event, item.sessionId, item.episodeId, item.adId].join('|'));
    const body = JSON.stringify({ events: snapshot, final: Boolean(final), sentAt: new Date().toISOString() });

    if (final && navigator.sendBeacon) {
      const accepted = navigator.sendBeacon('/api/analytics/batch', new Blob([body], { type: 'application/json' }));
      if (!accepted) restore(snapshot);
      return accepted;
    }

    flushing = true;
    nativeFetch('/api/analytics/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).then((response) => {
      if (!response.ok) restore(snapshot);
    }).catch(() => restore(snapshot)).finally(() => {
      flushing = false;
      if (queue.size) scheduleFlush(5_000);
    });
    return true;
  }

  function restore(items) {
    for (const item of items) bufferEvent(item.kind, item);
    scheduleFlush(10_000);
  }

  function resolveUrl(input) {
    try {
      const value = input instanceof Request ? input.url : String(input || '');
      return new URL(value, location.href);
    } catch {
      return null;
    }
  }

  function safeReferrer(value) {
    try {
      const url = new URL(String(value || ''));
      return `${url.origin}${url.pathname}`.slice(0, 800);
    } catch {
      return '';
    }
  }

  function finite(value) {
    const number = Number(value || 0);
    return Number.isFinite(number) ? number : 0;
  }
})();
