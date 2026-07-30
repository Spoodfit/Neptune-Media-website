const SELECTOR_ID = 'passageSelector';

const ready = document.readyState === 'loading'
  ? new Promise((resolve) => document.addEventListener('DOMContentLoaded', resolve, { once: true }))
  : Promise.resolve();

ready.then(initVideoLibraryBalance);

function initVideoLibraryBalance() {
  const grid = document.querySelector('#contentGrid');
  if (!grid) return;

  const observer = new MutationObserver(() => balancePassageSelector());
  observer.observe(grid.parentElement || grid, { childList: true, subtree: true });
  balancePassageSelector();
}

function balancePassageSelector() {
  const selector = document.getElementById(SELECTOR_ID);
  if (!selector) return;

  const count = selector.querySelectorAll(':scope > button').length;
  const redundant = count <= 1;
  selector.hidden = redundant;
  selector.setAttribute('aria-hidden', String(redundant));
  selector.closest('.content-section')?.classList.toggle('has-single-passage', redundant);
}
