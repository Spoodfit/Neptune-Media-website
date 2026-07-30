import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const [entry, html, css, runtime] = await Promise.all([
  readFile(new URL('src/entry-v11.js', root), 'utf8'),
  readFile(new URL('public/studio/clients.html', root), 'utf8'),
  readFile(new URL('public/studio/studio-sidebar-authority-v64.css', root), 'utf8'),
  readFile(new URL('public/studio/studio-sidebar-authority-v64.js', root), 'utf8'),
]);

const checks = [
  [entry.includes("const STUDIO_SIDEBAR_AUTHORITY_CSS = '/studio/studio-sidebar-authority-v64.css?v=1'"), 'entry CSS authority asset'],
  [entry.includes("const STUDIO_SIDEBAR_AUTHORITY_JS = '/studio/studio-sidebar-authority-v64.js?v=1'"), 'entry JS authority asset'],
  [entry.includes('const adaptiveScope =') && entry.includes('&& !studioClients'), 'Studio clients excluded from generic adaptive cascade'],
  [entry.includes('appendStudioSidebarAuthority(body)'), 'authority appended after runtime injections'],
  [html.includes('/studio/studio-sidebar-authority-v64.css?v=1'), 'static CSS fallback'],
  [html.includes('/studio/studio-sidebar-authority-v64.js?v=1'), 'static JS fallback'],
  [css.includes('.studio-sidebar-toggle') && css.includes('display: none !important'), 'legacy toggle hidden'],
  [css.includes('@media (min-width: 901px)') && css.includes('@media (max-width: 900px)'), 'desktop and drawer breakpoints'],
  [runtime.includes("localStorage.removeItem('neptune_studio_sidebar_collapsed')"), 'legacy persisted collapse removed'],
  [runtime.includes("querySelectorAll('.studio-nav-label, .studio-nav-link')"), 'all navigation items restored'],
  [runtime.includes("document.getElementById('studioSidebarToggle')?.remove()"), 'legacy toggle removed from DOM'],
];

for (const [ok, label] of checks) {
  if (!ok) throw new Error(`Studio sidebar v64 verification failed: ${label}`);
}

console.log(`Studio sidebar v64 source contract passed (${checks.length} checks).`);
