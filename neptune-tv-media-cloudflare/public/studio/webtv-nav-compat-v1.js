(() => {
  const stripRetiredProductionLink = () => {
    document.querySelector('[data-studio-route="production"]')?.remove();
  };
  stripRetiredProductionLink();
  queueMicrotask(stripRetiredProductionLink);
  requestAnimationFrame(stripRetiredProductionLink);
  setTimeout(stripRetiredProductionLink, 120);
})();
