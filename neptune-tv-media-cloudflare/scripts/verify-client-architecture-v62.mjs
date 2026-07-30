import fs from 'node:fs/promises';

const [entry, runtime, styles] = await Promise.all([
  fs.readFile(new URL('../src/entry-v11.js', import.meta.url), 'utf8'),
  fs.readFile(new URL('../public/assets/client-architecture-v62.js', import.meta.url), 'utf8'),
  fs.readFile(new URL('../public/assets/client-architecture-v62.css', import.meta.url), 'utf8'),
]);

const checks = [
  ['active entry injects client architecture CSS', entry.includes('CLIENT_ARCHITECTURE_CSS') && entry.includes('/assets/client-architecture-v62.css')],
  ['active entry injects client architecture JS', entry.includes('CLIENT_ARCHITECTURE_JS') && entry.includes('/assets/client-architecture-v62.js')],
  ['release reports three primary client screens', entry.includes('three-primary-screens-home-content-publications-v62')],
  ['navigation exposes Accueil, Contenus and Publications', ['Accueil', 'Contenus', 'Publications'].every((label) => runtime.includes(`'${label}'`))],
  ['dashboard video panel is replaced by the dedicated content route', runtime.includes("content.dataset.clientRoute = '/espace-client/videos/'")],
  ['dashboard publication panel is replaced by the dedicated calendar route', runtime.includes("publications.dataset.clientRoute = '/espace-client/calendrier/'")],
  ['dashboard appointment opens the contextual primary action', runtime.includes('data-client-action="appointment"') && runtime.includes("document.querySelector('#prepareLink')?.click()")],
  ['account remains contextual instead of becoming a fourth main screen', runtime.includes("navLink('/espace-client/#account', 'Compte', false)") && runtime.includes('openAccountPanel')],
  ['calendar short library is removed from the visible information architecture', styles.includes('#libraryView') && styles.includes('.view-switch') && styles.includes('display: none !important')],
  ['video planning opens the selected short in Publications', runtime.includes('/espace-client/calendrier/?file=') && runtime.includes('[data-reuse-file]')],
  ['single passage selector is removed when redundant', runtime.includes('is-single-passage') && styles.includes('.passage-selector.is-single-passage')],
  ['redundant prepare-post action is suppressed', runtime.includes("label.includes('préparer le post')") && styles.includes('.is-redundant-action')],
  ['client navigation remains responsive', styles.includes('@media (max-width: 980px)') && styles.includes('overflow-x: auto')],
];

const failed = checks.filter(([, passed]) => !passed);
for (const [label, passed] of checks) console.log(`${passed ? '✓' : '✗'} ${label}`);
if (failed.length) {
  console.error(`Client architecture verification failed: ${failed.length} check(s).`);
  process.exit(1);
}
console.log('Client architecture v62 verified.');
