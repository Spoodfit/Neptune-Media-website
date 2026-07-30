const MEDIA_DIALOG_SELECTOR = '.snapshot-preview,.video-preview-dialog,.studio-media-dialog';

document.addEventListener('cancel', (event) => {
  const dialog = event.target;
  if (!(dialog instanceof HTMLDialogElement) || !dialog.matches(MEDIA_DIALOG_SELECTOR)) return;
  event.preventDefault();
  cleanupMediaDialog(dialog);
  if (dialog.open) dialog.close();
}, true);

document.addEventListener('close', (event) => {
  const dialog = event.target;
  if (!(dialog instanceof HTMLDialogElement) || !dialog.matches(MEDIA_DIALOG_SELECTOR)) return;
  cleanupMediaDialog(dialog);
}, true);

function cleanupMediaDialog(dialog) {
  dialog.querySelectorAll('video,audio').forEach((media) => {
    try { media.pause(); } catch {}
    media.removeAttribute('autoplay');
  });
  dialog.querySelectorAll('iframe').forEach((frame) => {
    frame.src = 'about:blank';
  });
}
