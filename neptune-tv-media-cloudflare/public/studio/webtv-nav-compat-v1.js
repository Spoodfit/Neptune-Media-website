(() => {
  const clean = () => {
    document.querySelector('[data-studio-route="production"]')?.remove();
    if (/^\/studio\/webtv(?:\.html)?\/?$/u.test(location.pathname)) {
      document.querySelectorAll('.studio-context-nav-v65').forEach((nav) => nav.remove());
    }
  };
  clean();
  queueMicrotask(clean);
  requestAnimationFrame(clean);
  setTimeout(clean, 120);
  setTimeout(clean, 500);
})();
