(() => {
  const KEY = '__neptuneJtStudioShortcutV183';
  if (window[KEY]) return;
  window[KEY] = true;

  const install = () => {
    if (document.querySelector('[data-neptune-jt-studio-shortcut]')) return true;
    const status = document.querySelector('.neptune-studio-status');
    if (!status) return false;
    const link = document.createElement('a');
    link.href = '/studio/neptune-jt';
    link.dataset.neptuneJtStudioShortcut = 'v183';
    link.className = 'neptune-jt-studio-shortcut';
    link.innerHTML = '<span aria-hidden="true">JT</span><div><strong>Neptune JT</strong><small>Éditions & participants</small></div><i aria-hidden="true">›</i>';
    status.after(link);
    installStyles();
    return true;
  };

  const installStyles = () => {
    if (document.getElementById('neptuneJtStudioShortcutStyle')) return;
    const style = document.createElement('style');
    style.id = 'neptuneJtStudioShortcutStyle';
    style.textContent = `.neptune-jt-studio-shortcut{display:grid;grid-template-columns:34px 1fr auto;gap:10px;align-items:center;margin:0 8px 12px;padding:11px 10px;border-radius:13px;text-decoration:none;color:#fff;background:linear-gradient(105deg,rgba(30,97,254,.22),rgba(138,54,245,.18),rgba(232,43,222,.12));border:1px solid rgba(130,150,255,.18);transition:.18s ease}.neptune-jt-studio-shortcut:hover{transform:translateY(-1px);border-color:rgba(130,150,255,.34)}.neptune-jt-studio-shortcut>span{display:grid;place-items:center;width:34px;height:34px;border-radius:10px;background:linear-gradient(135deg,#1e61fe,#8a36f5,#e82bde);font-size:11px;font-weight:900}.neptune-jt-studio-shortcut strong,.neptune-jt-studio-shortcut small{display:block}.neptune-jt-studio-shortcut strong{font-size:12px}.neptune-jt-studio-shortcut small{margin-top:2px;color:#aebbd0;font-size:10px}.neptune-jt-studio-shortcut>i{color:#8f9db1;font-style:normal;font-size:18px}`;
    document.head.append(style);
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => waitForShell(), { once: true });
  else waitForShell();

  function waitForShell() {
    if (install()) return;
    let attempts = 0;
    const timer = setInterval(() => {
      attempts += 1;
      if (install() || attempts > 80) clearInterval(timer);
    }, 100);
  }
})();
