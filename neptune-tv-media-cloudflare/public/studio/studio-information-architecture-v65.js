(() => {
  const GLOBAL_KEY = '__neptuneStudioInformationArchitectureV65';
  if (window[GLOBAL_KEY]) return;
  window[GLOBAL_KEY] = true;

  const path = location.pathname.replace(/\/+$/u, '') || '/';
  const page = path === '/studio/clients' || path === '/studio/clients.html'
    ? 'clients'
    : path === '/studio/video-ai' || path === '/studio/video-ai.html'
      ? 'production'
      : path === '/studio/advanced' || path === '/studio/advanced.html'
        ? 'advanced'
        : '';

  if (!page) return;

  const ready = (callback) => {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', callback, { once: true });
    else callback();
  };

  ready(() => {
    const structure = findStructure(page);
    if (!structure?.sidebar || !structure.nav || !structure.topbar) return;

    document.body.classList.add('studio-information-architecture-v65', `studio-page-${page}`);
    structure.shell?.classList.add('neptune-studio-shell');
    structure.sidebar.classList.add('neptune-studio-sidebar');
    structure.nav.classList.add('neptune-studio-nav');
    structure.brand?.classList.add('neptune-studio-brand');
    structure.status?.classList.add('neptune-studio-status');
    structure.account?.classList.add('neptune-studio-account');
    structure.main?.classList.add('neptune-studio-main');
    structure.topbar.classList.add('neptune-studio-topbar');

    normalizeBrand(structure.brand);
    normalizeStatus(structure.status, page);
    normalizeTopbar(structure.topbar, page);

    const legacyTabs = page === 'advanced' ? preserveAdvancedTabControls(structure.nav) : new Map();
    structure.nav.innerHTML = primaryNavigationMarkup();
    structure.nav.setAttribute('aria-label', 'Navigation principale du Studio');

    const advancedController = page === 'advanced'
      ? installAdvancedController({ ...structure, legacyTabs })
      : null;

    setPrimaryActive(structure.nav, page === 'advanced' ? advancedRouteFromHash() : page);
    bindPrimaryNavigation(structure.nav, page, advancedController);
    installMobileNavigation(structure);
    normalizeAccount(structure.account, page);

    if (page === 'clients') enhanceClientsWorkspace();
    if (page === 'production') enhanceProductionWorkspace();
    if (page === 'advanced') normalizeAdvancedLogin();

    observeLegacyInterference(structure, page, advancedController);
  });

  function findStructure(currentPage) {
    if (currentPage === 'clients') {
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
    if (currentPage === 'production') {
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

  function primaryNavigationMarkup() {
    return [
      primaryLink('clients', '/studio/clients', '◎', 'Parcours clients'),
      primaryLink('production', '/studio/video-ai.html', '✦', 'Production vidéo'),
      primaryLink('diffusion', '/studio/advanced.html#episodes', '▶', 'Diffusion'),
      primaryLink('settings', '/studio/advanced.html#settings', '⚙', 'Réglages'),
    ].join('');
  }

  function primaryLink(route, href, icon, label) {
    return `<a class="neptune-studio-nav-link" data-studio-route="${route}" href="${href}"><span class="neptune-studio-nav-icon" aria-hidden="true">${icon}</span><strong>${label}</strong></a>`;
  }

  function normalizeBrand(brand) {
    if (!brand) return;
    const title = brand.querySelector('b');
    const subtitle = brand.querySelector('small');
    if (title) title.textContent = 'Neptune';
    if (subtitle) subtitle.textContent = 'Media · Studio';
    brand.setAttribute('href', '/studio/clients');
    brand.setAttribute('aria-label', 'Neptune Media Studio');
  }

  function normalizeStatus(status, currentPage) {
    if (!status) return;
    const label = status.querySelector('span');
    if (label) label.textContent = currentPage === 'production' ? 'Production locale' : 'Studio synchronisé';
  }

  function normalizeTopbar(topbar, currentPage) {
    const eyebrow = topbar.querySelector('.eyebrow');
    if (eyebrow) eyebrow.textContent = 'NEPTUNE MEDIA STUDIO';
    if (currentPage === 'advanced') topbar.querySelector('a[href="/studio/clients"]')?.remove();
  }

  function preserveAdvancedTabControls(nav) {
    const controls = new Map();
    const holder = document.createElement('div');
    holder.id = 'studioLegacyTabControlsV65';
    holder.hidden = true;
    holder.setAttribute('aria-hidden', 'true');

    for (const button of nav.querySelectorAll('[data-tab]')) {
      controls.set(button.dataset.tab, button);
      holder.append(button);
    }
    document.body.append(holder);
    return controls;
  }

  function bindPrimaryNavigation(nav, currentPage, advancedController) {
    nav.addEventListener('click', (event) => {
      const link = event.target.closest('[data-studio-route]');
      if (!link) return;
      const route = link.dataset.studioRoute;
      if (currentPage === 'advanced' && ['diffusion', 'settings'].includes(route)) {
        event.preventDefault();
        advancedController?.activate(route === 'settings' ? 'settings' : 'episodes');
      }
    });
  }

  function setPrimaryActive(nav, route) {
    for (const link of nav.querySelectorAll('[data-studio-route]')) {
      const active = link.dataset.studioRoute === route;
      link.classList.toggle('active', active);
      if (active) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    }
  }

  function installMobileNavigation(structure) {
    document.getElementById('studioMenuToggle')?.remove();
    document.querySelector('.studio-menu-backdrop')?.remove();
    document.body.classList.remove('is-studio-menu-open', 'studio-sidebar-collapsed');
    try { localStorage.removeItem('neptune_studio_sidebar_collapsed'); } catch {}

    let toggle = document.getElementById('neptuneStudioMenuToggle');
    if (!toggle) {
      toggle = document.createElement('button');
      toggle.id = 'neptuneStudioMenuToggle';
      toggle.className = 'neptune-studio-menu-toggle';
      toggle.type = 'button';
      toggle.setAttribute('aria-label', 'Ouvrir le menu du Studio');
      toggle.setAttribute('aria-expanded', 'false');
      toggle.setAttribute('aria-controls', structure.sidebar.id || 'neptuneStudioSidebar');
      toggle.innerHTML = '<span aria-hidden="true"></span>';
      structure.topbar.prepend(toggle);
    }
    structure.sidebar.id ||= 'neptuneStudioSidebar';

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
      requestAnimationFrame(() => structure.nav.querySelector('a')?.focus({ preventScroll: true }));
    };

    toggle.addEventListener('click', () => document.body.classList.contains('studio-menu-open-v65') ? close() : open());
    backdrop.addEventListener('click', () => close({ focus: true }));
    structure.nav.addEventListener('click', () => {
      if (matchMedia('(max-width: 860px)').matches) close();
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && document.body.classList.contains('studio-menu-open-v65')) close({ focus: true });
    });
    matchMedia('(min-width: 861px)').addEventListener?.('change', (event) => {
      if (event.matches) close();
    });
  }

  function normalizeAccount(account, currentPage) {
    if (!account) return;
    if (currentPage === 'clients' && account instanceof HTMLAnchorElement) {
      account.href = '/studio/advanced.html#settings';
      account.setAttribute('aria-label', 'Ouvrir les réglages du Studio');
    }
    if (currentPage === 'production') {
      account.tabIndex = 0;
      account.setAttribute('role', 'link');
      account.setAttribute('aria-label', 'Ouvrir les réglages du Studio');
      const go = () => { location.href = '/studio/advanced.html#settings'; };
      account.addEventListener('click', go);
      account.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          go();
        }
      });
    }
  }

  function installAdvancedController({ nav, topbar, legacyTabs }) {
    const groups = {
      diffusion: [
        ['episodes', 'Programme'],
        ['programs', 'Formats'],
        ['ads', 'Publicités'],
        ['insights', 'Audience'],
      ],
      settings: [
        ['finances', 'Finances'],
        ['users', 'Équipe'],
        ['audit', 'Journal'],
        ['settings', 'Réglages'],
      ],
    };
    const allowed = new Set([...groups.diffusion, ...groups.settings].map(([id]) => id));
    let activeTab = requestedAdvancedTab();
    let activating = false;

    const context = document.createElement('nav');
    context.className = 'studio-context-nav-v65';
    context.setAttribute('aria-label', 'Navigation de la section');
    topbar.after(context);

    const groupFor = (tab) => groups.settings.some(([id]) => id === tab) ? 'settings' : 'diffusion';
    const renderContext = () => {
      const group = groupFor(activeTab);
      setPrimaryActive(nav, group);
      document.body.dataset.studioSection = group;
      context.innerHTML = groups[group].map(([id, label]) => {
        const control = legacyTabs.get(id);
        const unavailable = !control || control.hidden;
        return `<button type="button" data-context-tab="${id}" class="${id === activeTab ? 'active' : ''}" ${unavailable ? 'hidden' : ''}>${label}</button>`;
      }).join('');
      for (const button of context.querySelectorAll('[data-context-tab]')) {
        button.addEventListener('click', () => activate(button.dataset.contextTab));
      }
    };

    const activate = (tab) => {
      if (tab === 'dashboard') {
        location.href = '/studio/clients';
        return;
      }
      if (tab === 'ai') {
        location.href = '/studio/video-ai.html';
        return;
      }
      const resolved = allowed.has(tab) ? tab : 'episodes';
      const control = legacyTabs.get(resolved);
      if (!control || control.hidden || activating) return;
      activating = true;
      activeTab = resolved;
      control.click();
      renderContext();
      queueMicrotask(() => { activating = false; });
    };

    for (const [tab, control] of legacyTabs) {
      control.addEventListener('click', () => {
        if (!allowed.has(tab)) return;
        activeTab = tab;
        renderContext();
      });
    }

    const sync = () => {
      const requested = requestedAdvancedTab();
      if (requested === 'dashboard') {
        location.replace('/studio/clients');
        return;
      }
      if (requested === 'ai') {
        location.replace('/studio/video-ai.html');
        return;
      }
      if (allowed.has(requested)) activeTab = requested;
      renderContext();
      const app = document.getElementById('app');
      if (app && !app.hidden) window.setTimeout(() => activate(activeTab), 0);
    };

    const app = document.getElementById('app');
    if (app) new MutationObserver(sync).observe(app, { attributes: true, attributeFilter: ['hidden'] });
    for (const control of legacyTabs.values()) {
      new MutationObserver(renderContext).observe(control, { attributes: true, attributeFilter: ['hidden', 'class'] });
    }
    window.addEventListener('hashchange', sync);
    renderContext();
    sync();

    return { activate, renderContext };
  }

  function requestedAdvancedTab() {
    const value = decodeURIComponent(location.hash.slice(1)).trim();
    return value || 'episodes';
  }

  function advancedRouteFromHash() {
    return ['finances', 'users', 'audit', 'settings'].includes(requestedAdvancedTab()) ? 'settings' : 'diffusion';
  }

  function enhanceClientsWorkspace() {
    const title = document.querySelector('.clients-topbar h1');
    if (title) title.textContent = 'Parcours clients';
    const search = document.getElementById('search');
    if (search) search.placeholder = 'Rechercher un client ou une entreprise';

    const improve = () => {
      for (const empty of document.querySelectorAll('.workflow-stage-empty')) {
        empty.innerHTML = '<strong>Aucun dossier à cette étape</strong><span>Les prochains dossiers apparaîtront automatiquement.</span>';
      }
    };
    improve();
    const pipeline = document.getElementById('pipeline');
    if (pipeline) new MutationObserver(improve).observe(pipeline, { childList: true, subtree: true });
  }

  function enhanceProductionWorkspace() {
    const title = document.querySelector('.video-ai-topbar h1');
    if (title) title.textContent = 'Production vidéo IA';
  }

  function normalizeAdvancedLogin() {
    document.title = 'Neptune Media · Studio';
    const brandSmall = document.querySelector('.login-brand small');
    if (brandSmall) brandSmall.textContent = 'Studio';
    const eyebrow = document.querySelector('.login .eyebrow');
    if (eyebrow) eyebrow.textContent = 'ACCÈS STUDIO';
    const heading = document.querySelector('.login-card h1');
    if (heading) heading.innerHTML = 'Un seul Studio.<br><span>Toutes les fonctions utiles.</span>';
    const intro = heading?.nextElementSibling;
    if (intro?.tagName === 'P') intro.textContent = 'Accédez à la diffusion, aux finances et aux réglages sans changer d’environnement.';
    const submit = document.getElementById('loginSubmit');
    if (submit) submit.textContent = 'Accéder au Studio';
  }

  function observeLegacyInterference(structure, currentPage, advancedController) {
    let scheduled = false;
    const normalize = () => {
      scheduled = false;
      document.body.classList.remove('studio-sidebar-collapsed', 'is-studio-menu-open');
      document.getElementById('studioSidebarToggle')?.remove();
      try { localStorage.removeItem('neptune_studio_sidebar_collapsed'); } catch {}
      for (const link of structure.nav.querySelectorAll('.neptune-studio-nav-link')) {
        link.hidden = false;
        link.removeAttribute('hidden');
      }
      if (currentPage === 'advanced') advancedController?.renderContext();
    };
    const schedule = () => {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(normalize);
    };
    new MutationObserver(schedule).observe(structure.sidebar, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['hidden', 'class', 'style'],
    });
    new MutationObserver(schedule).observe(document.body, {
      attributes: true,
      attributeFilter: ['class'],
    });
  }
})();
