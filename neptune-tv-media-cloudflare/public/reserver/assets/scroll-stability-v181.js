(() => {
  'use strict';

  const RELEASE = 'neptune-reservation-scroll-stability-20260908-v181';
  const MIN_RESTORE_DISTANCE = 72;
  const USER_GESTURE_WINDOW_MS = 180;
  const stage = document.querySelector('.stage');
  const host = document.getElementById('app-content');
  if (!stage || !host) return;

  let lastStage = detectStage();
  let stableTop = stage.scrollTop;
  let stableLeft = stage.scrollLeft;
  let userGestureUntil = 0;
  let restoring = false;
  let scheduled = false;

  document.documentElement.dataset.reservationScrollStability = RELEASE;

  const markUserGesture = () => {
    userGestureUntil = performance.now() + USER_GESTURE_WINDOW_MS;
  };

  stage.addEventListener('wheel', markUserGesture, { passive: true });
  stage.addEventListener('touchstart', markUserGesture, { passive: true });
  stage.addEventListener('touchmove', markUserGesture, { passive: true });
  stage.addEventListener('pointerdown', markUserGesture, { passive: true });
  stage.addEventListener('keydown', event => {
    if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(event.key)) markUserGesture();
  }, true);

  stage.addEventListener('scroll', () => {
    if (restoring) return;

    const currentStage = detectStage();
    if (currentStage && currentStage !== lastStage) {
      lastStage = currentStage;
      stableTop = stage.scrollTop;
      stableLeft = stage.scrollLeft;
      return;
    }

    const userDriven = performance.now() <= userGestureUntil;
    const unexpectedReset = !userDriven && stableTop >= MIN_RESTORE_DISTANCE && stage.scrollTop <= 2;

    if (unexpectedReset) {
      restoreStablePosition();
      return;
    }

    stableTop = stage.scrollTop;
    stableLeft = stage.scrollLeft;
  }, { passive: true });

  new MutationObserver(scheduleCheck).observe(host, {
    childList: true,
    subtree: true,
  });

  function scheduleCheck() {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(checkAfterRender);
  }

  function checkAfterRender() {
    scheduled = false;
    const currentStage = detectStage();

    // A real navigation between tunnel steps is allowed to reset to the top.
    if (currentStage && currentStage !== lastStage) {
      lastStage = currentStage;
      stableTop = stage.scrollTop;
      stableLeft = stage.scrollLeft;
      return;
    }

    // A re-render of the same step must never steal the viewport from the user.
    if (stableTop >= MIN_RESTORE_DISTANCE && stage.scrollTop <= 2) {
      restoreStablePosition();
    }
  }

  function restoreStablePosition() {
    if (restoring) return;
    restoring = true;
    const top = stableTop;
    const left = stableLeft;

    stage.scrollTo({ top, left, behavior: 'auto' });

    requestAnimationFrame(() => {
      // A second write protects against late scroll anchoring/focus side effects.
      if (Math.abs(stage.scrollTop - top) > 2) {
        stage.scrollTo({ top, left, behavior: 'auto' });
      }
      restoring = false;
    });
  }

  function detectStage() {
    if (host.querySelector('.prep-embedded,.confirmation-hero')) return 'done';
    if (host.querySelector('#payLink,.payment-box,.payment-box-v97,.terms-box')) return 'payment';
    if (host.querySelector('.calendar-shell,#daysGrid,#continuePayment')) return 'date';
    if (host.querySelector('.configuration-grid,[data-physical]')) return 'physical';
    if (host.querySelector('.city-choice-grid-v163,[data-city]')) return 'city';
    if (host.querySelector('.concept-grid-v163,[data-concept],.sales-v165-grid,[data-v165-concept]')) return 'concept';
    if (host.querySelector('#companyForm,.company-first-panel')) return 'company';
    return '';
  }
})();
