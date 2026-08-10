const RELEASE = 'neptune-client-meeting-20260810-v85';
let timer = 0;

start();

function start() {
  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', boot, { once: true })
    : boot();
}

function boot() {
  document.body.dataset.clientMeetingRelease = RELEASE;
  decorate();
  new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['href'] });
}

function schedule() {
  clearTimeout(timer);
  timer = setTimeout(decorate, 60);
}

function decorate() {
  const action = document.querySelector('#clientPreparationActionV77 a');
  if (action && isMeet(action.href)) {
    action.innerHTML = 'Rejoindre la réunion <i aria-hidden="true">→</i>';
    action.setAttribute('aria-label', 'Rejoindre la réunion de préparation Google Meet');
  }
  const primary = document.querySelector('#prepareLink');
  if (primary && isMeet(primary.href)) {
    primary.textContent = 'Rejoindre la réunion';
    primary.setAttribute('aria-label', 'Rejoindre la réunion de préparation Google Meet');
  }
}

function isMeet(value) {
  try { return new URL(String(value || '')).hostname === 'meet.google.com'; }
  catch { return false; }
}
