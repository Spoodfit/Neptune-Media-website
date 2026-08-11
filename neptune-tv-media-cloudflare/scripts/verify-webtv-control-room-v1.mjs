import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const readRoot = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');
const [activeEntry, webtvEntry, control, encoder, html, ui, ia, navCompat, rootRaw, localRaw, rootPackageRaw, localPackageRaw] = await Promise.all([
  read('src/entry-v34.js'),
  read('src/entry-v33.js'),
  read('src/webtv-control-v1.js'),
  read('containers/webtv/encoder.mjs'),
  read('public/studio/webtv.html'),
  read('public/studio/webtv-v1.js'),
  read('public/studio/studio-information-architecture-v65-1.js'),
  read('public/studio/webtv-nav-compat-v1.js'),
  readRoot('wrangler.jsonc'),
  read('wrangler.jsonc'),
  readRoot('package.json'),
  read('package.json'),
]);
const root = JSON.parse(rootRaw);
const local = JSON.parse(localRaw);
const rootPackage = JSON.parse(rootPackageRaw);
const localPackage = JSON.parse(localPackageRaw);
const failures = [];
const expect = (condition, message) => { if (!condition) failures.push(message); };

expect(root.main === 'neptune-tv-media-cloudflare/src/entry-v34.js', 'le Worker racine doit cibler entry-v34 sans contourner la Web TV v33');
expect(local.main === 'src/entry-v34.js', 'le Worker local doit cibler entry-v34 sans contourner la Web TV v33');
expect(activeEntry.includes("from './entry-v33.js'"), 'entry-v34 ne prolonge plus entry-v33');
expect(activeEntry.includes("export { WebTvEncoder } from './entry-v33.js'"), 'entry-v34 ne réexporte pas WebTvEncoder');
expect(activeEntry.includes("typeof base.scheduled==='function'"), 'entry-v34 ne délègue plus les crons à entry-v33');
expect(webtvEntry.includes("from './entry-v32.js'"), 'entry-v33 ne prolonge plus entry-v32');
expect(webtvEntry.includes('STUDIO_OPERATIONS_RELEASE'), 'Studio Operations v95 a été perdu');
expect(webtvEntry.includes("from './webtv-control-v1.js'"), 'la Web TV n’est pas branchée sur entry-v33');
expect(webtvEntry.includes('WebTvEncoder') && webtvEntry.includes('maintainWebTv'), 'le moteur Web TV n’est pas exporté ou surveillé');
expect(webtvEntry.includes("controller?.cron==='* * * * *'"), 'le watchdog Web TV minute n’est pas isolé du cron métier historique');

for (const [name, config] of [['root', root], ['local', local]]) {
  const webtv = Array.isArray(config.containers) ? config.containers.filter((item) => item.class_name === 'WebTvEncoder') : [];
  expect(webtv.length === 1, `${name}: un unique Container WebTvEncoder doit être déclaré`);
  expect(webtv[0]?.max_instances === 1, `${name}: WebTvEncoder doit être limité à une instance`);
  expect(webtv[0]?.instance_type === 'standard-2', `${name}: le profil initial doit être standard-2`);
  expect(!config.containers?.some((item) => /VideoProcessor/iu.test(item.class_name || '')), `${name}: le moteur de montage vidéo ne doit pas revenir dans Containers`);
  expect(config.durable_objects?.bindings?.some((item) => item.name === 'WEBTV_ENCODER' && item.class_name === 'WebTvEncoder'), `${name}: binding WEBTV_ENCODER absent`);
  expect(config.migrations?.some((item) => item.tag === 'v6' && item.new_sqlite_classes?.includes('WebTvEncoder')), `${name}: migration v6 WebTvEncoder absente`);
  expect(config.triggers?.crons?.includes('* * * * *'), `${name}: watchdog minute absent`);
  expect(config.triggers?.crons?.includes('*/5 * * * *'), `${name}: cron historique 5 minutes supprimé par erreur`);
}
for (const [name, pkg] of [['root', rootPackage], ['local', localPackage]]) {
  expect(Boolean(pkg.dependencies?.['@cloudflare/containers']), `${name}: dépendance @cloudflare/containers absente`);
}

for (const marker of [
  "import { Container, getContainer } from '@cloudflare/containers'",
  'YOUTUBE_RTMPS_URL',
  'YOUTUBE_STREAM_KEY',
  'getContainer(env.WEBTV_ENCODER, ENCODER_INSTANCE_NAME)',
  "sleepAfter = '5m'",
  'async onActivityExpired()',
  'this.renewActivityTimeout()',
  'await container.stop()',
  "'/api/admin/webtv/state'",
  "'/api/admin/webtv/encoder'",
  "url.pathname = '/api/auth/status'",
  "url.protocol === 'rtmps:'",
  'isPrivateHost(url.hostname)',
]) expect(control.includes(marker), `contrat Web TV absent : ${marker}`);
expect(!control.includes('/api/v1/media/studio/state'), 'la Web TV dépend d’une ancienne route Studio inexistante');
expect(!control.includes('.getByName('), 'la Web TV utilise une ancienne API Container getByName au lieu de getContainer');

for (const marker of ['ffmpeg', 'ffprobe', "'-f', 'flv'", 'rtmps://[youtube]', 'youtube_output_invalid', 'streamTarget(cfg)']) {
  expect(encoder.includes(marker), `moteur FFmpeg incomplet : ${marker}`);
}
expect(!encoder.includes('VOTRE_CLE_YOUTUBE'), 'une clé YouTube factice ou dangereuse est présente dans le moteur');

for (const marker of ['Diffusion', 'Web TV active', 'Ordre de passage', 'Programme de secours', 'Redémarrer l’encodeur', 'YouTube · RTMPS', 'Mettre à jour l’antenne', 'programSyncNotice']) {
  expect(html.includes(marker), `interface Diffusion incomplète : ${marker}`);
}
expect(!html.includes('YOUTUBE_STREAM_KEY') && !html.includes('streamKey'), 'la clé de flux ne doit jamais être saisie ou exposée dans le HTML Studio');
for (const marker of ['/api/auth/status', '/api/admin/state', '/api/admin/webtv/state', '/api/admin/webtv/encoder', "openLibrary('fallback')", 'data-enabled=', 'data-type=', 'thumbnailMarkup(', 'data-on-air-badge', 'markDirty()', 'Appliquer à l’antenne', "url.protocol!=='https:'"]) {
  expect(ui.includes(marker), `commande Studio Web TV absente : ${marker}`);
}
expect(ia.includes("'/studio/webtv.html'"), 'la navigation Diffusion ne pointe pas vers la régie Web TV');
expect(ia.includes("cleanPath === '/studio/webtv'"), 'la régie n’utilise pas le shell Studio canonique');
expect(navCompat.includes("querySelectorAll('.studio-context-nav-v65')") && navCompat.includes('.remove()'), 'les onglets Diffusion historiques ne sont pas neutralisés sur la régie Web TV');

if (failures.length) {
  console.error(failures.map((failure) => `- ${failure}`).join('\n'));
  process.exit(1);
}
console.log('Web TV v1 préservée derrière entry-v34 : régie unifiée, miniatures, programme en cours identifiable, application dédiée à l’antenne, authentification canonique, secrets serveur, Container FFmpeg singleton, RTMPS et watchdog minute.');
