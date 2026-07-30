const CASCADE_STYLESHEETS = [
  '/assets/neptune-adaptive-interfaces-v58-1.css?v=3',
  '/assets/neptune-dashboard-completeness-v59.css?v=2',
];

const ready = document.readyState === 'loading'
  ? new Promise((resolve) => document.addEventListener('DOMContentLoaded', resolve, { once: true }))
  : Promise.resolve();

ready.then(() => {
  if (!document.querySelector('.dashboard-v37')) return;
  if (document.querySelector('link[data-neptune-adaptive-cascade-v58-1]')) return;

  for (const href of CASCADE_STYLESHEETS) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.dataset.neptuneAdaptiveCascadeV581 = 'true';
    document.head.append(link);
  }
});