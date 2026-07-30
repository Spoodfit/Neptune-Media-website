(() => {
  const GLOBAL_KEY = '__neptuneStudioSidebarAuthorityV64';
  if (window[GLOBAL_KEY]) return;
  window[GLOBAL_KEY] = true;

  const ready = (callback) => {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', callback, { once: true });
    else callback();
  };

  ready(() => {
    const body = document.body;
    const sidebar = document.querySelector('.studio-sidebar');
    const navigation = sidebar?.querySelector('.studio-nav');
    if (!body?.classList.contains('clients-app') || !sidebar || !navigation) return;

    let scheduled = false;
    const normalize = () => {
      scheduled = false;
      body.classList.remove('studio-sidebar-collapsed');
      try { localStorage.removeItem('neptune_studio_sidebar_collapsed'); } catch {}

      document.getElementById('studioSidebarToggle')?.remove();

      for (const element of sidebar.querySelectorAll('.studio-nav-label, .studio-nav-link')) {
        if (element.hidden) element.hidden = false;
        if (element.hasAttribute('hidden')) element.removeAttribute('hidden');
      }

      const current = navigation.querySelector('a[href="/studio/clients"]');
      if (current) {
        for (const item of navigation.querySelectorAll('.studio-nav-link')) {
          const active = item === current;
          item.classList.toggle('active', active);
          if (active) item.setAttribute('aria-current', 'page');
          else if (item.getAttribute('aria-current') === 'page') item.removeAttribute('aria-current');
        }
      }
    };

    const schedule = () => {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(normalize);
    };

    normalize();

    new MutationObserver(schedule).observe(sidebar, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['hidden', 'class', 'style'],
    });

    new MutationObserver(schedule).observe(body, {
      attributes: true,
      attributeFilter: ['class'],
    });

    window.addEventListener('resize', schedule, { passive: true });
    window.addEventListener('pageshow', schedule, { passive: true });
  });
})();
