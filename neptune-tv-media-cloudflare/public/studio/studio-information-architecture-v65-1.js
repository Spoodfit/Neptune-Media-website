(() => {
  const KEY = '__neptuneStudioInformationArchitectureV104';
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

  const start = () => {
    const ui = findUi(page);
    if (!ui.sidebar || !ui.nav || !ui.topbar) return;

    document.body.classList.add('studio-information-architecture-v65', `studio-page-${page}`);
    ui.shell?.classList.add('neptune-studio-shell');
    ui.sidebar.classList.add('neptune-studio-sidebar');
    ui.nav.classList.add('neptune-studio-nav');
    ui.brand?.classList.add('neptune-studio-brand');
    ui.status?.classList.add('neptune-studio-status');
    ui.account?.classList.add('neptune-studio-account');
    ui.main?.classList.add('neptune-studio-main');
    ui.topbar.classList.add('neptune-studio-topbar');

    normalizeChrome(ui, page);
    const advanced = page === 'advanced' ? prepareAdvanced(ui) : null;
    ui.nav.innerHTML = primaryNavigation();
    ui.nav.setAttribute('aria-label', 'Navigation principale du Studio');
    const activeRoute = page === 'advanced' ? groupForTab(requestedTab()) : page === 'webtv' ? 'diffusion' : page;
    setPrimaryActive(ui.nav, activeRoute);
    bindPrimary(ui.nav, page, advanced);
    if (page === 'webtv') installWebTvContext(ui);
    installMobileDrawer(ui);
    normalizeAccount(ui.account, page);
    improvePageCopy(page);
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();

  function findUi(kind) {
    if (kind === 'clients') {
      return {
        shell: document.querySelector('.studio-shell'),
        sidebar: document.querySelector('.studio-sidebar'),
        nav: document.querySelector('.studio-nav'),
        brand: document.querySelector('.studio-brand'),
        status: document.querySelector('.studio-status'),
        account: document.querySelector('.studio-account'),
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
        brand: document.querySelector('.video-ai-brand'),
        status: document.querySelector('.video-ai-status'),
        account: document.querySelector('.video-ai-account'),
        main: document.querySelector('.video-ai-main'),
        topbar: document.querySelector('.video-ai-topbar'),
      };
    }
    if (kind === 'webtv') {
      return {
        shell: document.querySelector('.studio-shell'),
        sidebar: document.querySelector('.studio-sidebar'),
        nav: document.querySelector('.studio-nav'),
        brand: document.querySelector('.studio-brand'),
        status: document.querySelector('.studio-status'),
        account: document.querySelector('.studio-account'),
        main: document.querySelector('.workspace'),
        topbar: document.querySelector('.topbar'),
      };
    }
    return {
      shell: document.querySelector('#app.shell'),
      sidebar: document.querySelector('#app .sidebar'),
      nav: document.querySelector('#nav'),
      brand: document.querySelector('#app .brand'),
      status: document.querySelector('#app .workspace-status'),
      account: document.querySelector('#app .sidebar-bottom'),
      main: document.querySelector('#app .main'),
      topbar: document.querySelector('#app .topbar'),
    };
  }

  function normalizeChrome(ui, kind) {
    document.body.classList.remove('studio-sidebar-collapsed', 'is-studio-menu-open');
    try { localStorage.removeItem('neptune_studio_sidebar_collapsed'); } catch {}
    document.getElementById('studioSidebarToggle')?.remove();
    document.getElementById('studioMenuToggle')?.remove();
    document.querySelector('.studio-menu-backdrop')?.remove();

    if (ui.brand) {
      ui.brand.setAttribute('href', '/studio/clients');
      ui.brand.setAttribute('aria-label', 'Neptune Media Studio');
      const title = ui.brand.querySelector('b');
      const subtitle = ui.brand.querySelector('small');
      if (title) title.textContent = 'Neptune';
      if (subtitle) subtitle.textContent = 'Media · Studio';
    }
    const status = ui.status?.querySelector('span');
    if (status) status.textContent = kind === 'production' ? 'Production locale' : kind === 'webtv' ? 'Régie connectée' : 'Studio synchronisé';
    const eyebrow = ui.topbar.querySelector('.eyebrow');
    if (eyebrow) eyebrow.textContent = 'NEPTUNE MEDIA STUDIO';
    if (kind === 'advanced') ui.topbar.querySelector('a[href="/studio/clients"]')?.remove();
  }

  function primaryNavigation() {
    return [
      link('clients', '/studio/clients', '◎', 'Parcours clients'),
      link('production', '/studio/video-ai.html', '✦', 'Production vidéo'),
      link('diffusion', '/studio/webtv.html', '▶', 'Diffusion'),
      link('settings', '/studio/advanced.html#programs', '⚙', 'Réglages'),
    ].join('');
  }

  function link(route, href, icon, label) {
    return `<a class="neptune-studio-nav-link" data-studio-route="${route}" href="${href}"><span class="neptune-studio-nav-icon" aria-hidden="true">${icon}</span><strong>${label}</strong></a>`;
  }

  function setPrimaryActive(nav, route) {
    for (const item of nav.querySelectorAll('[data-studio-route]')) {
      const active = item.dataset.studioRoute === route;
      item.classList.toggle('active', active);
      if (active) item.setAttribute('aria-current', 'page');
      else item.removeAttribute('aria-current');
    }
  }

  function bindPrimary(nav, kind, advanced) {
    nav.addEventListener('click', (event) => {
      const item = event.target.closest('[data-studio-route]');
      if (!item || kind !== 'advanced') return;
      if (item.dataset.studioRoute === 'settings') {
        event.preventDefault();
        advanced?.activate('programs');
      }
    });
  }

  function prepareAdvanced(ui) {
    const controls = new Map();
    const holder = document.createElement('div');
    holder.id = 'studioLegacyTabControlsV65';
    holder.hidden = true;
    holder.setAttribute('aria-hidden', 'true');
    for (const button of ui.nav.querySelectorAll('[data-tab]')) {
      controls.set(button.dataset.tab, button);
      holder.append(button);
    }
    document.body.append(holder);

    const groups = {
      diffusion: [['webtv', 'Antenne'], ['episodes', 'Programme'], ['ads', 'Publicités'], ['insights', 'Audience']],
      settings: [['programs', 'Catalogue Media'], ['finances', 'Finances'], ['users', 'Équipe'], ['audit', 'Journal'], ['settings', 'Général']],
    };
    const allowed = new Set([...groups.diffusion, ...groups.settings].map(([id]) => id));
    const context = document.createElement('nav');
    context.className = 'studio-context-nav-v65';
    context.setAttribute('aria-label', 'Navigation de la section');
    ui.topbar.after(context);
    let activeTab = normalizeRequestedTab(requestedTab());
    let activating = false;

    const render = () => {
      const group = groupForTab(activeTab);
      setPrimaryActive(ui.nav, group);
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
      if (tab === 'ai') { location.href = '/studio/video-ai.html'; return; }
      if (tab === 'webtv') { location.href = '/studio/webtv.html'; return; }
      const resolved = normalizeRequestedTab(tab);
      const original = controls.get(resolved);
      if (!original || original.hidden || activating) return;
      activating = true;
      activeTab = resolved;
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
      if (requested === 'ai') { location.replace('/studio/video-ai.html'); return; }
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

  function installWebTvContext(ui) {
    const context = document.createElement('nav');
    context.className = 'studio-context-nav-v65';
    context.setAttribute('aria-label', 'Navigation Diffusion');
    const tabs = [
      ['Antenne', '/studio/webtv.html', true],
      ['Programme', '/studio/advanced.html#episodes', false],
      ['Publicités', '/studio/advanced.html#ads', false],
      ['Audience', '/studio/advanced.html#insights', false],
    ];
    context.innerHTML = tabs.map(([label, href, active]) => `<button type="button" data-webtv-href="${href}" class="${active ? 'active' : ''}">${label}</button>`).join('');
    for (const button of context.querySelectorAll('[data-webtv-href]')) button.addEventListener('click', () => { location.href = button.dataset.webtvHref; });
    ui.topbar.after(context);
  }

  function requestedTab() { return decodeURIComponent(location.hash.slice(1)).trim() || 'episodes'; }
  function normalizeRequestedTab(tab) {
    if (['episodes', 'programs', 'ads', 'insights', 'finances', 'users', 'audit', 'settings'].includes(tab)) return tab;
    return 'episodes';
  }
  function groupForTab(tab) { return ['programs', 'finances', 'users', 'audit', 'settings'].includes(tab) ? 'settings' : 'diffusion'; }

  function installMobileDrawer(ui) {
    ui.sidebar.id ||= 'neptuneStudioSidebar';
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

  function normalizeAccount(account, kind) {
    if (!account) return;
    if ((kind === 'clients' || kind === 'webtv') && account instanceof HTMLAnchorElement) {
      account.href = '/studio/advanced.html#programs';
      account.setAttribute('aria-label', 'Ouvrir les réglages du Studio');
    }
    if (kind === 'production') {
      account.tabIndex = 0;
      account.setAttribute('role', 'link');
      account.setAttribute('aria-label', 'Ouvrir les réglages du Studio');
      const open = () => { location.href = '/studio/advanced.html#programs'; };
      account.addEventListener('click', open);
      account.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); open(); }
      });
    }
  }

  function improvePageCopy(kind) {
    if (kind === 'clients') {
      const search = document.getElementById('search');
      if (search) search.placeholder = 'Rechercher un client ou une entreprise';
      const improveEmpty = () => {
        for (const empty of document.querySelectorAll('.workflow-stage-empty')) {
          if (empty.dataset.studioEmptyV65 === '1') continue;
          empty.dataset.studioEmptyV65 = '1';
          empty.innerHTML = '<strong>Aucun dossier à cette étape</strong><span>Les prochains dossiers apparaîtront automatiquement.</span>';
        }
      };
      improveEmpty();
      const pipeline = document.getElementById('pipeline');
      if (pipeline) new MutationObserver(improveEmpty).observe(pipeline, { childList: true, subtree: true });
    }
    if (kind === 'production') {
      const title = document.querySelector('.video-ai-topbar h1');
      if (title) title.textContent = 'Production vidéo IA';
    }
    if (kind === 'advanced') {
      document.title = 'Neptune Media · Studio';
      const small = document.querySelector('.login-brand small');
      if (small) small.textContent = 'Studio';
    }
    if (kind === 'webtv') document.title = 'Diffusion · Neptune Media Studio';
  }
})();
