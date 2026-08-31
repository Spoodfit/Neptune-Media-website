(() => {
  const apply = () => {
    const newButton = document.getElementById('newClient');
    if (newButton) {
      newButton.title = 'Secours uniquement : utilisez cette création manuelle pour une reprise, une demande hors ligne ou une correction exceptionnelle.';
    }
    const warning = document.querySelector('#newOrder .ns166-manual-warning');
    if (warning) {
      warning.innerHTML = '<strong>À utiliser uniquement en secours.</strong> Utilisez ce formulaire pour une reprise, une demande hors ligne ou une correction exceptionnelle. Les réservations web restent gérées par leur flux dédié.';
    }
  };
  const run = () => {
    apply();
    const form = document.getElementById('newOrder');
    if (form) new MutationObserver(apply).observe(form, { childList: true, subtree: true });
    setTimeout(apply, 0);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run, { once: true });
  else run();
})();
