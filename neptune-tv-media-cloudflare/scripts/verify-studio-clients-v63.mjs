import { readFile } from 'node:fs/promises';

const [html, css, runtime, canonical] = await Promise.all([
  readFile(new URL('../public/studio/clients.html', import.meta.url), 'utf8'),
  readFile(new URL('../public/studio/studio-clients-polish-v63.css', import.meta.url), 'utf8'),
  readFile(new URL('../public/studio/studio-clients-polish-v63.js', import.meta.url), 'utf8'),
  readFile(new URL('../public/studio/studio-information-architecture-v65-1.js', import.meta.url), 'utf8'),
]);

const checks = [
  ['final polish stylesheet is loaded after responsive stability', html.indexOf('responsive-stability-v60.css') < html.indexOf('studio-clients-polish-v63.css')],
  ['final polish runtime is loaded after the clients runtimes', html.indexOf('clients-feedback-v31.js') < html.indexOf('studio-clients-polish-v63.js')],
  ['Studio clients body opts into v63 content runtime', html.includes('clients-app studio-clients-v63')],
  ['legacy sidebar keeps the stable mount id used by v105', html.includes('id="studioSidebar"')],
  ['canonical shell replaces legacy account action with a single logout block', canonical.includes('id="neptuneStudioLogout"') && canonical.includes('<small>Se déconnecter</small>')],
  ['canonical shell exposes exactly the three primary destinations', canonical.includes("link('clients', '/studio/clients'") && canonical.includes("link('diffusion', '/studio/webtv.html'") && canonical.includes("link('settings', '/studio/advanced.html#programs'") && !canonical.includes("link('production'")],
  ['summary labels match their actual counters', ['clients', 'parcours actifs', 'urgences'].every((label) => html.includes(`<span>${label}</span>`))],
  ['desktop legacy account participates in flex layout before v105 replacement', css.includes('.studio-account {') && css.includes('position: static;')],
  ['legacy sidebar navigation owns its vertical scroll before v105 replacement', css.includes('.studio-nav {') && css.includes('overflow-y: auto;')],
  ['navigation hover does not shift the whole menu', css.includes('.studio-nav-link:hover') && css.includes('transform: none;')],
  ['pipeline uses readable horizontal columns', css.includes('grid-auto-columns: minmax(272px, 1fr)') && css.includes('scroll-snap-type: x proximity')],
  ['legacy mobile navigation remains a valid pre-v105 fallback', css.includes('transform: translateX(-104%)') && css.includes('.is-studio-menu-open .studio-sidebar')],
  ['mobile fallback has an overlay and body scroll lock', css.includes('.studio-menu-backdrop') && css.includes('overflow: hidden;')],
  ['dialogs have restrained entrance motion', css.includes('@keyframes studio-v63-dialog')],
  ['reduced-motion preference is honored', css.includes('@media (prefers-reduced-motion: reduce)')],
  ['content runtime is guarded against duplicate execution', runtime.includes('__neptuneStudioClientsPolishV63')],
  ['content runtime exposes refresh progress', runtime.includes('is-refreshing') && runtime.includes('aria-busy')],
  ['content runtime reveals pipeline columns after rendering', runtime.includes('MutationObserver') && runtime.includes('is-visible')],
  ['canonical runtime installs accessible mobile menu state', canonical.includes("toggle.setAttribute('aria-expanded', 'false')") && canonical.includes("document.body.classList.add('studio-menu-open-v65')")],
  ['canonical runtime closes its mobile drawer with Escape', canonical.includes("event.key === 'Escape'")],
];

const failures = checks.filter(([, passed]) => !passed);
for (const [label, passed] of checks) console.log(`${passed ? '✓' : '✗'} ${label}`);
if (failures.length) {
  console.error(`Studio clients v63/v105 verification failed: ${failures.length} check(s).`);
  process.exit(1);
}
console.log('Studio clients content contract preserved under the v105 canonical shell.');
