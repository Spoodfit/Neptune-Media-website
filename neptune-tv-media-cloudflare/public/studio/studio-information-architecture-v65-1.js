(() => {
  const KEY = '__neptuneStudioCanonicalShellV105';
  if (window[KEY]) return;
  window[KEY] = true;

  const cleanPath = location.pathname.replace(/\/+$/u, '') || '/';
  const page = cleanPath === '/studio/clients' || cleanPath === '/studio/clients.html'
    ? 'clients'
    : cleanPath === '/studio/video-ai' || cleanPath === '/studio/video-ai.html'
      ? 'production'
      : cleanPath === '/studio/webtv' || cleanPath === '/studio/webtv.html'
        ? 'webtv'
        : cleanPath === '/studio/advanced' || cleanPath === '/studio/advanced.html'
          ? 'advanced'
          : '';
  if (!page) return;

  const revealLegacyFallback = () => {
    document.documentElement.removeAttribute('data-neptune-studio-shell-boot');
  };

  const start = () => {
    try {
      let ui = findUi(page);
      if (!ui.sidebar || !ui.topbar) {
        revealLegacyFallback();
        return;
      }

      document.body.classList.add('studio-information-architecture-v65', 'studio-shell-v105', `studio-page-${page}`);
      ui.shell?.classList.add('neptune-studio-shell');
      ui.main?.classList.add('neptune-studio-main');
      ui.topbar.classList.add('neptune-studio-topbar');

      const legacyAdvanced = page === 'advanced' ? extractAdvancedControls(ui.nav, ui.sidebar) : null;
      const activeRoute = primaryRoute(page);
      const canonical = installCanonicalSidebar(ui.sidebar, activeRoute);
      ui = { ...ui, ...canonical };

      normalizeTopbar(ui, page);
      const advanced = page === 'advanced' ? prepareAdvanced(ui, legacyAdvanced) : null;
      bindPrimary(ui.nav, page, advanced);
      installMobileDrawer(ui);
      bindLogout(ui.account);
      improvePageCopy(page);

      let ready = false;
      const markReady = () => {
        if (ready) return;
        ready = true;
        document.documentElement.dataset.neptuneStudioShellReady = 'v105';
      };
      if (page === 'advanced') settleAdvancedSession(markReady);
      else markReady();
    } catch (error) {
      revealLegacyFallback();
      console.error('[Neptune Studio] canonical shell boot failed', error);
    }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();

  async function settleAdvancedSession(markReady) {
    const app = document.getElementById('app');
    const auth = document.getElementById('auth');
    if (!app || !auth) { markReady(); return; }

    let authenticated = false;
    try {
      const response = await fetch('/api/auth/status', {
        method: 'GET',
        headers: { Accept: 'application/json' },
        credentials: 'same-origin',
        cache: 'no-store',
      });
      const payload = await response.json().catch(() => ({}));
      authenticated = response.ok && payload.authenticated !== false && Boolean(payload.user);
    } catch {}

    if (!authenticated) {
      markReady();
      return;
    }

    if (!app.hidden) {
      auth.hidden = true;
      markReady();
      return;
    }

    let settled = false;
    let timeout = 0;
    const finish = () => {
      if (settled || app.hidden) return false;
      settled = true;
      auth.hidden = true;
      observer.disconnect();
      clearTimeout(timeout);
      markReady();
      return true;
    };
    const observer = new MutationObserver(finish);
    observer.observe(app, { attributes: true, attributeFilter: ['hidden'] });
    timeout = window.setTimeout(() => {
      if (finish()) return;
      observer.disconnect();
      markReady();
    }, 15000);
  }

  function findUi(kind) {
    if (kind === 'clients') {
      return {
        shell: document.querySelector('.studio-shell'),
        sidebar: document.querySelector('.studio-sidebar'),
        nav: document.querySelector('.studio-nav'),
        main: document.querySelector('.clients-workspace'),
        topbar: document.querySelector('.clients-topbar'),
      };
    }
    if (kind === 'production') {
      const sidebar = document.querySelector('.video-ai-sidebar');
      return {
        shell: document.querySelector('.video-ai-shell'),
        sidebar,
        nav: sidebar?.querySelector('nav'),
        main: document.querySelector('.video-ai-main'),
        topbar: document.querySelector('.video-ai-topbar'),
      };
    }
    if (kind === 'webtv') {
      return {
        shell: document.querySelector('.studio-shell'),
        sidebar: document.querySelector('.studio-sidebar'),
        nav: document.querySelector('.studio-nav'),
        main: document.querySelector('.workspace'),
        topbar: document.querySelector('.topbar'),
      };
    }
    return {
      shell: document.querySelector('#app.shell'),
      sidebar: document.querySelector('#app .sidebar'),
      nav: document.querySelector('#nav'),
      main: document.querySelector('#app .main'),
      topbar: document.querySelector('#app .topbar'),
    };
  }

  function primaryRoute(kind) {
    if (kind === 'clients') return 'clients';
    if (kind === 'production') return 'production';
    if (kind === 'webtv') return 'diffusion';
    if (kind === 'advanced') return groupForTab(requestedTab());
    return '';
  }

  function extractAdvancedControls(nav, sidebar) {
    if (!nav) return null;
    const holder = document.createElement('div');
    holder.id = 'studioLegacyTabControlsV105';
    holder.hidden = true;
    holder.setAttribute('aria-hidden', 'true');
    const controls = new Map();
    for (const button of nav.querySelectorAll('[data-tab]')) {
      controls.set(button.dataset.tab, button);
      holder.append(button);
    }
    for (const selector of ['#accountName', '#accountRole', '#logout']) {
      const node = sidebar?.querySelector(selector);
      if (node) holder.append(node);
    }
    document.body.append(holder);
    return { controls, holder };
  }

  function installCanonicalSidebar(sidebar, activeRoute) {
    sidebar.className = 'neptune-studio-sidebar';
    sidebar.id = 'neptuneStudioSidebar';
    sidebar.innerHTML = `
      <a class="neptune-studio-brand" href="/studio/clients" aria-label="Neptune Media Studio">
        <img src="/assets/logo-neptune.svg" alt="">
        <div><b>Neptune</b><small>Media · Studio</small></div>
      </a>
      <div class="neptune-studio-status"><i></i><span>Studio synchronisé</span></div>
      <nav class="neptune-studio-nav" aria-label="Navigation principale du Studio">
        ${link('clients', '/studio/clients', '◎', 'Parcours clients')}
        ${link('production', '/studio/advanced.html#production', '▦', 'Production')}
        ${link('diffusion', '/studio/webtv.html', '▶', 'Diffusion')}
        ${link('finances', '/studio/advanced.html#finances', '€', 'Finances')}
        ${link('settings', '/studio/advanced.html#programs', '⚙', 'Réglages')}
      </nav>
      <button class="neptune-studio-account" id="neptuneStudioLogout" type="button" aria-label="Se déconnecter du Studio">
        <span class="studio-avatar">NM</span>
        <span class="neptune-studio-account-copy"><b>Compte Studio</b><small>Se déconnecter</small></span>
        <i aria-hidden="true">↪</i>
      </button>`;

    const nav = sidebar.querySelector('.neptune-studio-nav');
    const account = sidebar.querySelector('.neptune-studio-account');
    const brand = sidebar.querySelector('.neptune-studio-brand');
    const status = sidebar.querySelector('.neptune-studio-status');
    setPrimaryActive(nav, activeRoute);
    return { sidebar, nav, account, brand, status };
  }

  function link(route, href, icon, label) {
    return `<a class="neptune-studio-nav-link" data-studio-route="${route}" href="${href}"><span class="neptune-studio-nav-icon" aria-hidden="true">${icon}</span><strong>${label}</strong></a>`;
  }

  function setPrimaryActive(nav, route) {
    if (!nav) return;
    for (const item of nav.querySelectorAll('[data-studio-route]')) {
      const active = Boolean(route) && item.dataset.studioRoute === route;
      item.classList.toggle('active', active);
      if (active) item.setAttribute('aria-current', 'page');
      else item.removeAttribute('aria-current');
    }
  }

  function normalizeTopbar(ui, kind) {
    document.body.classList.remove('studio-sidebar-collapsed', 'is-studio-menu-open');
    try { localStorage.removeItem('neptune_studio_sidebar_collapsed'); } catch {}
    document.getElementById('studioSidebarToggle')?.remove();
    document.getElementById('studioMenuToggle')?.remove();
    document.querySelector('.studio-menu-backdrop')?.remove();
    document.querySelector('.studio-context-nav-v65')?.remove();

    const eyebrow = ui.topbar?.querySelector('.eyebrow');
    if (eyebrow) eyebrow.textContent = 'NEPTUNE MEDIA STUDIO';
    if (kind === 'advanced') ui.topbar?.querySelector('a[href="/studio/clients"]')?.remove();
  }

  function bindPrimary(nav, kind, advanced) {
    nav?.addEventListener('click', (event) => {
      const item = event.target.closest('[data-studio-route]');
      if (!item || kind !== 'advanced') return;
      const route=item.dataset.studioRoute;
      if (route === 'production' || route === 'finances' || route === 'settings') {
        event.preventDefault();
        advanced?.activate(route === 'settings' ? 'programs' : route);
      }
    });
  }

  function prepareAdvanced(ui, legacy) {
    const controls = legacy?.controls || new Map();
    const groups = {
      production: [['production', 'Production']],
      diffusion: [['webtv', 'Web TV'], ['episodes', 'Programme'], ['ads', 'Publicités'], ['insights', 'Audience']],
      finances: [['finances', 'Finances']],
      settings: [['programs', 'Catalogue Media'], ['users', 'Équipe'], ['audit', 'Journal'], ['settings', 'Général']],
    };
    const allowed = new Set([...groups.diffusion, ...groups.finances, ...groups.settings].map(([id]) => id));
    const context = document.createElement('nav');
    context.className = 'studio-context-nav-v65';
    context.setAttribute('aria-label', 'Navigation de la section');
    ui.topbar.after(context);
    let activeTab = normalizeRequestedTab(requestedTab());
    let activating = false;

    const render = () => {
      const group = groupForTab(activeTab);
      setPrimaryActive(ui.nav, group);
      if(group==='production'){
        context.hidden=true;
        context.innerHTML='';
        return;
      }
      context.hidden=false;
      context.innerHTML = groups[group].map(([id, label]) => {
        const original = controls.get(id);
        const unavailable = id !== 'webtv' && (!original || original.hidden);
        return `<button type="button" data-context-tab="${id}" class="${id === activeTab ? 'active' : ''}" ${unavailable ? 'hidden' : ''}>${label}</button>`;
      }).join('');
      for (const button of context.querySelectorAll('[data-context-tab]')) {
        button.addEventListener('click', () => activate(button.dataset.contextTab));
      }
    };

    const activate = (tab) => {
      if (tab === 'dashboard') { location.href = '/studio/clients'; return; }
      if (tab === 'webtv') { location.href = '/studio/webtv.html'; return; }
      if (tab === 'ai') { location.href = '/studio/video-ai.html'; return; }
      if (tab === 'production') {
        activeTab='production';
        if(location.hash!=='#production')history.replaceState({},'',`${location.pathname}${location.search}#production`);
        render();
        window.dispatchEvent(new CustomEvent('neptune:production-v120'));
        return;
      }
      const resolved = normalizeRequestedTab(tab);
      const original = controls.get(resolved);
      if (!original || original.hidden || activating) return;
      activating = true;
      activeTab = resolved;
      if(location.hash!==`#${resolved}`)history.replaceState({},'',`${location.pathname}${location.search}#${resolved}`);
      original.click();
      render();
      queueMicrotask(() => { activating = false; });
    };

    for (const [id, original] of controls) {
      original.addEventListener('click', () => {
        if (!allowed.has(id)) return;
        activeTab = id;
        render();
      });
    }

    const sync = () => {
      const requested = requestedTab();
      if (requested === 'dashboard') { location.replace('/studio/clients'); return; }
      activeTab = normalizeRequestedTab(requested);
      render();
      if (!document.getElementById('app')?.hidden) setTimeout(() => activate(activeTab), 0);
    };

    const app = document.getElementById('app');
    if (app) new MutationObserver(sync).observe(app, { attributes: true, attributeFilter: ['hidden'] });
    window.addEventListener('hashchange', sync);
    render();
    sync();
    return { activate };
  }

  function requestedTab() { return decodeURIComponent(location.hash.slice(1)).trim() || 'episodes'; }
  function normalizeRequestedTab(tab) {
    if (['production', 'episodes', 'programs', 'ads', 'insights', 'finances', 'users', 'audit', 'settings'].includes(tab)) return tab;
    return 'episodes';
  }
  function groupForTab(tab) {
    if(tab==='production')return 'production';
    if(tab==='finances')return 'finances';
    if(['programs','users','audit','settings'].includes(tab))return 'settings';
    return 'diffusion';
  }

  function bindLogout(account) {
    if (!account) return;
    account.addEventListener('click', async () => {
      if (account.disabled) return;
      account.disabled = true;
      const copy = account.querySelector('small');
      if (copy) copy.textContent = 'Déconnexion…';
      try {
        await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin', headers: { Accept: 'application/json' } });
      } catch {}
      try { sessionStorage.removeItem('neptune_csrf'); } catch {}
      location.replace('/studio/');
    });
  }

  function installMobileDrawer(ui) {
    const toggle = document.createElement('button');
    toggle.id = 'neptuneStudioMenuToggle';
    toggle.className = 'neptune-studio-menu-toggle';
    toggle.type = 'button';
    toggle.setAttribute('aria-label', 'Ouvrir le menu du Studio');
    toggle.setAttribute('aria-controls', ui.sidebar.id);
    toggle.setAttribute('aria-expanded', 'false');
    toggle.innerHTML = '<span aria-hidden="true"></span>';
    ui.topbar.prepend(toggle);

    const backdrop = document.createElement('button');
    backdrop.className = 'neptune-studio-menu-backdrop-v65';
    backdrop.type = 'button';
    backdrop.tabIndex = -1;
    backdrop.setAttribute('aria-label', 'Fermer le menu du Studio');
    backdrop.setAttribute('aria-hidden', 'true');
    document.body.append(backdrop);

    const close = ({ focus = false } = {}) => {
      document.body.classList.remove('studio-menu-open-v65');
      toggle.setAttribute('aria-expanded', 'false');
      backdrop.setAttribute('aria-hidden', 'true');
      if (focus) toggle.focus({ preventScroll: true });
    };
    const open = () => {
      document.body.classList.add('studio-menu-open-v65');
      toggle.setAttribute('aria-expanded', 'true');
      backdrop.setAttribute('aria-hidden', 'false');
      requestAnimationFrame(() => ui.nav.querySelector('a')?.focus({ preventScroll: true }));
    };

    toggle.addEventListener('click', () => document.body.classList.contains('studio-menu-open-v65') ? close() : open());
    backdrop.addEventListener('click', () => close({ focus: true }));
    ui.nav.addEventListener('click', () => { if (matchMedia('(max-width: 860px)').matches) close(); });
    document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && document.body.classList.contains('studio-menu-open-v65')) close({ focus: true }); });
    matchMedia('(min-width: 861px)').addEventListener?.('change', (event) => { if (event.matches) close(); });
  }

  function improvePageCopy(kind) {
    if (kind === 'clients') {
      const search = document.getElementById('search');
      if (search) search.placeholder = 'Rechercher un client ou une entreprise';
    }
    if (kind === 'advanced') document.title = 'Neptune Media · Studio';
    if (kind === 'webtv') document.title = 'Diffusion · Neptune Media Studio';
  }
})();
