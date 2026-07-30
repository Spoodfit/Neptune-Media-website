import { readFile } from 'node:fs/promises';

const [html, css, runtime] = await Promise.all([
  readFile(new URL('../public/studio/clients.html', import.meta.url), 'utf8'),
  readFile(new URL('../public/studio/studio-clients-polish-v63.css', import.meta.url), 'utf8'),
  readFile(new URL('../public/studio/studio-clients-polish-v63.js', import.meta.url), 'utf8'),
]);

const checks = [
  ['final polish stylesheet is loaded after responsive stability', html.indexOf('responsive-stability-v60.css') < html.indexOf('studio-clients-polish-v63.css')],
  ['final polish runtime is loaded after the clients runtimes', html.indexOf('clients-feedback-v31.js') < html.indexOf('studio-clients-polish-v63.js')],
  ['Studio clients body opts into v63', html.includes('clients-app studio-clients-v63')],
  ['sidebar has a stable accessible id', html.includes('id="studioSidebar"')],
  ['account card opens useful settings instead of linking to itself', html.includes('href="/studio/advanced.html#settings" aria-label="Ouvrir les réglages du Studio"')],
  ['summary labels match their actual counters', ['clients', 'parcours actifs', 'urgences'].every((label) => html.includes(`<span>${label}</span>`))],
  ['desktop sidebar account participates in flex layout', css.includes('.studio-account {') && css.includes('position: static;')],
  ['sidebar navigation owns its vertical scroll', css.includes('.studio-nav {') && css.includes('overflow-y: auto;')],
  ['navigation hover does not shift the whole menu', css.includes('.studio-nav-link:hover') && css.includes('transform: none;')],
  ['pipeline uses readable horizontal columns', css.includes('grid-auto-columns: minmax(272px, 1fr)') && css.includes('scroll-snap-type: x proximity')],
  ['mobile Studio navigation is a real drawer', css.includes('transform: translateX(-104%)') && css.includes('.is-studio-menu-open .studio-sidebar')],
  ['mobile menu has an overlay and body scroll lock', css.includes('.studio-menu-backdrop') && css.includes('overflow: hidden;')],
  ['dialogs have restrained entrance motion', css.includes('@keyframes studio-v63-dialog')],
  ['reduced-motion preference is honored', css.includes('@media (prefers-reduced-motion: reduce)')],
  ['runtime is guarded against duplicate execution', runtime.includes('__neptuneStudioClientsPolishV63')],
  ['runtime installs accessible mobile menu state', runtime.includes("aria-expanded") && runtime.includes('is-studio-menu-open')],
  ['runtime closes the menu with Escape', runtime.includes("event.key === 'Escape'")],
  ['runtime exposes refresh progress', runtime.includes('is-refreshing') && runtime.includes('aria-busy')],
  ['runtime reveals pipeline columns after rendering', runtime.includes('MutationObserver') && runtime.includes('is-visible')],
];

const failures = checks.filter(([, passed]) => !passed);
for (const [label, passed] of checks) console.log(`${passed ? '✓' : '✗'} ${label}`);
if (failures.length) {
  console.error(`Studio clients v63 verification failed: ${failures.length} check(s).`);
  process.exit(1);
}
console.log('Studio clients visual and interaction contract v63 verified.');
