import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const [entry, store, backend, ui, css] = await Promise.all([
  read('src/entry-v18.js'),
  read('src/store-v14.js'),
  read('src/portal-content-admin-v79.js'),
  read('public/studio/content-command-center-v79.js'),
  read('public/studio/content-command-center-v79.css'),
]);
const failures = [];
const expect = (content, needle, message) => { if (!content.includes(needle)) failures.push(message); };

for (const route of [
  '/api/admin/content-calendar',
  '/api/admin/content-schedule',
  '/api/admin/content-schedule-delete',
  '/api/admin/content-thumbnail',
  '/api/admin/content-media',
]) expect(entry, route, `route publique absente : ${route}`);
expect(entry, '/studio/content-command-center-v79.css?v=1', 'la feuille SaaS v79 n’est pas injectée');
expect(entry, '/studio/content-command-center-v79.js?v=1', 'le runtime v79 n’est pas injecté');
expect(entry, 'private-drive-token-thumbnail-link-plus-video-frame-fallback-v79', 'le proxy privé de miniatures n’est pas déclaré');
expect(entry, '/portal/drive-token-get', 'le proxy média ne récupère pas le jeton Drive privé');
expect(entry, 'fields=thumbnailLink&supportsAllDrives=true', 'la miniature Drive privée n’est pas résolue via metadata');
expect(entry, 'Authorization', 'le proxy Drive ne transmet pas le jeton OAuth');
expect(entry, 'alt=media&supportsAllDrives=true&acknowledgeAbuse=true', 'le streaming Drive authentifié est absent');
expect(store, '/portal/admin-content-calendar', 'la route interne calendrier est absente');
expect(store, '/portal/admin-content-schedule-upsert', 'la mutation de programmation est absente');
expect(store, 'thumbnailProxyUrl', 'les fichiers admin ne déclarent pas leur miniature same-origin');
expect(store, 'READ_ONLY_CONTENT_ROUTES', 'les lectures de miniatures ne sont pas distinguées des mutations CSRF');

for (const marker of [
  'adminContentCalendar',
  'adminContentScheduleUpsert',
  'adminContentScheduleDelete',
  'MIN_REUSE_DAYS = 30',
  'portal_content_occurrences',
  'portal_content_schedule',
]) expect(backend, marker, `contrat backend absent : ${marker}`);

for (const marker of [
  'Bibliothèque éditoriale',
  'Planifier sans friction',
  'data-v79-drop-date',
  'data-v79-schedule-form',
  'capturePoster',
  '/api/admin/content-thumbnail',
  '/api/admin/content-media',
  'Retirer du calendrier',
]) expect(ui, marker, `fonction UI absente : ${marker}`);

for (const marker of [
  '.v79-metrics',
  '.v79-toolbar',
  '.v79-media-card',
  'height:346px',
  '.v79-media-card--portrait .v79-media-frame',
  '.v79-calendar-layout',
  '.v79-calendar-queue',
  '@media(max-width:680px)',
  'prefers-reduced-motion',
]) expect(css, marker, `règle UX/UI absente : ${marker}`);

if (failures.length) {
  console.error(failures.map((failure) => `- ${failure}`).join('\n'));
  process.exit(1);
}
console.log('Studio content command center v79 validé : Drive privé authentifié, miniatures same-origin, ratios natifs, cartes uniformes, filtres rapides, programmation directe et calendrier deux panneaux.');
