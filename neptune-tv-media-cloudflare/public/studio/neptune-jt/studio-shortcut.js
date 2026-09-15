(() => {
  const KEY = '__neptuneJtCatalogIntegrationV188';
  if (window[KEY]) return;
  window[KEY] = true;

  const ACTION_ATTR = 'data-neptune-jt-catalog-action';
  let timer = 0;

  const catalogActive = () => {
    const hash = String(location.hash || '').toLowerCase();
    return hash === '#programs' || Boolean(document.querySelector('#studioCatalogCommercialCockpitV145'));
  };

  const install = () => {
    if (!catalogActive()) return;
    installStyles();
    installConceptListAction();
    installConceptFormAction();
  };

  const installConceptListAction = () => {
    const rows = [...document.querySelectorAll('[data-v147-edit="concept"]')];
    for (const row of rows) {
      if (!isNeptuneJt(row.textContent || '')) continue;
      if (row.nextElementSibling?.hasAttribute?.(ACTION_ATTR)) continue;
      const link = document.createElement('a');
      link.href = '/studio/neptune-jt';
      link.setAttribute(ACTION_ATTR, 'list');
      link.className = 'neptune-jt-catalog-action';
      link.innerHTML = '<span><strong>Neptune JT</strong><small>Éditions, participants et seuil 4/6</small></span><b>Gérer →</b>';
      row.insertAdjacentElement('afterend', link);
    }
  };

  const installConceptFormAction = () => {
    const form = document.querySelector('form[data-v147-form="concept"]');
    if (!form || form.querySelector(`[${ACTION_ATTR}]`)) return;
    const id = form.querySelector('input[name="id"]')?.value || '';
    const name = form.querySelector('input[name="name"]')?.value || '';
    if (id !== 'format-neptune-jt' && !isNeptuneJt(name)) return;
    const footer = form.querySelector('footer');
    if (!footer) return;
    const link = document.createElement('a');
    link.href = '/studio/neptune-jt';
    link.setAttribute(ACTION_ATTR, 'form');
    link.className = 'neptune-jt-catalog-inline';
    link.textContent = 'Gérer les éditions et participants';
    footer.insertBefore(link, footer.lastElementChild || null);
  };

  const isNeptuneJt = (value) => String(value || '').trim().toLowerCase().includes('neptune jt');

  const installStyles = () => {
    if (document.getElementById('neptuneJtCatalogIntegrationStyle')) return;
    const style = document.createElement('style');
    style.id = 'neptuneJtCatalogIntegrationStyle';
    style.textContent = `
      .neptune-jt-catalog-action{display:flex;align-items:center;justify-content:space-between;gap:16px;margin:-4px 0 10px 18px;padding:10px 12px;border:1px solid rgba(38,132,255,.2);border-radius:12px;background:rgba(38,132,255,.055);text-decoration:none;color:inherit}
      .neptune-jt-catalog-action:hover{border-color:rgba(38,132,255,.42);background:rgba(38,132,255,.09)}
      .neptune-jt-catalog-action span,.neptune-jt-catalog-action strong,.neptune-jt-catalog-action small{display:block}
      .neptune-jt-catalog-action strong{font-size:12px;color:#16213e}.neptune-jt-catalog-action small{margin-top:2px;font-size:10px;color:#667085}.neptune-jt-catalog-action b{font-size:11px;color:#2684ff;white-space:nowrap}
      .neptune-jt-catalog-inline{margin-left:auto;margin-right:8px;color:#2684ff;font-size:12px;font-weight:800;text-decoration:none}.neptune-jt-catalog-inline:hover{text-decoration:underline}
    `;
    document.head.append(style);
  };

  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(install, 40);
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', schedule, { once: true });
  else schedule();
  window.addEventListener('hashchange', schedule);
  new MutationObserver(schedule).observe(document.documentElement, { subtree: true, childList: true });
})();
