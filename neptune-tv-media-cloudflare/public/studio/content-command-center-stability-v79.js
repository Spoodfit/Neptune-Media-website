(() => {
  if (window.__neptuneContentCommandCenterStabilityV79) return;
  const NativeMutationObserver = window.MutationObserver;
  if (typeof NativeMutationObserver !== 'function') return;

  window.__neptuneContentCommandCenterStabilityV79 = true;
  window.MutationObserver = class NeptuneCommandCenterMutationObserver extends NativeMutationObserver {
    constructor(callback) {
      super((records, observer) => {
        const meaningful = records.filter((record) => {
          const target = record.target?.nodeType === Node.ELEMENT_NODE
            ? record.target
            : record.target?.parentElement;
          if (!target) return false;
          if (target.closest?.('.v79-detail-body,.v79-dialog,#v79PreviewDialog,#v79ScheduleDialog,#v79ImportDialog')) return false;
          return target.id === 'clientDetail' || Boolean(target.closest?.('#clientDetail'));
        });
        if (meaningful.length) callback(meaningful, observer);
      });
    }
  };

  document.addEventListener('click', (event) => {
    if (!event.target.closest('[data-v79-calendar],[data-v79-content-tab],[data-detail-tab]')) return;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const scroller = document.querySelector('#clientDialog .drawer-card');
      if (scroller) scroller.scrollTop = 0;
    }));
  }, true);
})();
