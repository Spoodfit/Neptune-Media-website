(() => {
  const GLOBAL_KEY = '__neptuneStudioClientsPolishV63';
  if (window[GLOBAL_KEY]) return;
  window[GLOBAL_KEY] = true;

  const ready = (callback) => {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', callback, { once: true });
    else callback();
  };

  ready(() => {
    const body = document.body;
    const sidebar = document.querySelector('.studio-sidebar');
    const topbar = document.querySelector('.clients-topbar');
    const pipeline = document.querySelector('#pipeline');
    if (!body?.classList.contains('clients-app') || !sidebar || !topbar || !pipeline) return;

    body.classList.add('studio-clients-v63');
    sidebar.id ||= 'studioSidebar';

    const toggle = installMenuToggle(topbar, sidebar);
    const backdrop = installBackdrop(body);
    const mobile = matchMedia('(max-width: 900px)');

    const closeMenu = ({ restoreFocus = false } = {}) => {
      if (!body.classList.contains('is-studio-menu-open')) return;
      body.classList.remove('is-studio-menu-open');
      toggle.setAttribute('aria-expanded', 'false');
      backdrop.setAttribute('aria-hidden', 'true');
      if (restoreFocus) toggle.focus({ preventScroll: true });
    };

    const openMenu = () => {
      body.classList.add('is-studio-menu-open');
      toggle.setAttribute('aria-expanded', 'true');
      backdrop.setAttribute('aria-hidden', 'false');
      requestAnimationFrame(() => sidebar.querySelector('.studio-nav-link')?.focus({ preventScroll: true }));
    };

    toggle.addEventListener('click', () => {
      body.classList.contains('is-studio-menu-open') ? closeMenu() : openMenu();
    });
    backdrop.addEventListener('click', () => closeMenu({ restoreFocus: true }));
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && body.classList.contains('is-studio-menu-open')) closeMenu({ restoreFocus: true });
    });
    document.addEventListener('click', (event) => {
      const navigationAction = event.target.closest('.studio-sidebar .studio-nav-link');
      if (navigationAction && mobile.matches) closeMenu();
    });
    mobile.addEventListener?.('change', (event) => {
      if (!event.matches) closeMenu();
    });

    installNavigationState();
    installRefreshFeedback();
    installDialogFocusReturn();
    installTopbarElevation(topbar);
    installPipelineMotion(pipeline);
  });

  function installMenuToggle(topbar, sidebar) {
    let toggle = topbar.querySelector('#studioMenuToggle');
    if (toggle) return toggle;
    toggle = document.createElement('button');
    toggle.id = 'studioMenuToggle';
    toggle.className = 'studio-menu-toggle';
    toggle.type = 'button';
    toggle.setAttribute('aria-label', 'Ouvrir le menu du Studio');
    toggle.setAttribute('aria-controls', sidebar.id);
    toggle.setAttribute('aria-expanded', 'false');
    toggle.innerHTML = '<span aria-hidden="true"></span>';
    topbar.prepend(toggle);
    return toggle;
  }

  function installBackdrop(body) {
    let backdrop = document.querySelector('.studio-menu-backdrop');
    if (backdrop) return backdrop;
    backdrop = document.createElement('button');
    backdrop.className = 'studio-menu-backdrop';
    backdrop.type = 'button';
    backdrop.tabIndex = -1;
    backdrop.setAttribute('aria-label', 'Fermer le menu du Studio');
    backdrop.setAttribute('aria-hidden', 'true');
    body.append(backdrop);
    return backdrop;
  }

  function installNavigationState() {
    const navigation = document.querySelector('.studio-nav');
    if (!navigation) return;
    const links = [...navigation.querySelectorAll('.studio-nav-link')];

    const activate = (target) => {
      for (const item of links) {
        const active = item === target;
        item.classList.toggle('active', active);
        if (active) item.setAttribute('aria-current', item.tagName === 'A' ? 'page' : 'true');
        else item.removeAttribute('aria-current');
      }
    };

    for (const item of links) {
      item.addEventListener('click', () => activate(item));
    }

    const contextButtons = [...document.querySelectorAll('.view-links [data-open-section]')];
    for (const button of contextButtons) {
      button.addEventListener('click', () => {
        for (const peer of contextButtons) peer.classList.toggle('is-active', peer === button);
        window.setTimeout(() => button.classList.remove('is-active'), 900);
      });
    }
  }

  function installRefreshFeedback() {
    const refresh = document.querySelector('#refresh');
    if (!refresh) return;
    refresh.addEventListener('click', () => {
      refresh.classList.add('is-refreshing');
      refresh.setAttribute('aria-busy', 'true');
      refresh.setAttribute('aria-label', 'Vérification en cours');
      window.setTimeout(() => {
        refresh.classList.remove('is-refreshing');
        refresh.removeAttribute('aria-busy');
        refresh.setAttribute('aria-label', 'Vérifier maintenant');
      }, 900);
    });
  }

  function installDialogFocusReturn() {
    const dialogs = [...document.querySelectorAll('dialog')];
    for (const dialog of dialogs) {
      let opener = null;
      const observer = new MutationObserver(() => {
        if (dialog.open && document.activeElement !== dialog) {
          opener ||= document.activeElement instanceof HTMLElement ? document.activeElement : null;
        }
      });
      observer.observe(dialog, { attributes: true, attributeFilter: ['open'] });
      dialog.addEventListener('close', () => {
        if (opener?.isConnected) opener.focus({ preventScroll: true });
        opener = null;
      });
    }
  }

  function installTopbarElevation(topbar) {
    const update = () => topbar.classList.toggle('is-scrolled', window.scrollY > 8);
    update();
    window.addEventListener('scroll', update, { passive: true });
  }

  function installPipelineMotion(pipeline) {
    let scheduled = false;
    const reveal = () => {
      scheduled = false;
      [...pipeline.querySelectorAll('.column')].forEach((column, index) => {
        column.style.transitionDelay = `${Math.min(index * 35, 175)}ms`;
        requestAnimationFrame(() => column.classList.add('is-visible'));
      });
    };
    const schedule = () => {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(reveal);
    };
    new MutationObserver(schedule).observe(pipeline, { childList: true });
    schedule();
  }
})();
