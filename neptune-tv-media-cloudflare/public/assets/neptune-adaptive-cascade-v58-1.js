const PRECISION_STYLESHEET = '/assets/neptune-adaptive-interfaces-v58-1.css?v=2';

const ready = document.readyState === 'loading'
  ? new Promise((resolve) => document.addEventListener('DOMContentLoaded', resolve, { once: true }))
  : Promise.resolve();

ready.then(() => {
  if (!document.querySelector('.dashboard-v37')) return;
  if (document.querySelector('link[data-neptune-adaptive-cascade-v58-1]')) return;

  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = PRECISION_STYLESHEET;
  link.dataset.neptuneAdaptiveCascadeV581 = 'true';
  document.head.append(link);
});
