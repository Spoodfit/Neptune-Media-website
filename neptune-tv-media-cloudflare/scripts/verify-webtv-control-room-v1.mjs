import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const readRoot = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');
const [entry, control, encoder, html, ui, ia, rootRaw, localRaw, rootPackageRaw, localPackageRaw] = await Promise.all([
  read('src/entry-v33.js'),
  read('src/webtv-control-v1.js'),
  read('containers/webtv/encoder.mjs'),
  read('public/studio/webtv.html'),
  read('public/studio/webtv-v1.js'),
  read('public/studio/studio-information-architecture-v65-1.js'),
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

expect(root.main === 'neptune-tv-media-cloudflare/src/entry-v33.js', 'le Worker racine doit conserver entry-v33 et Studio Operations v95');
expect(local.main === 'src/entry-v33.js', 'le Worker local doit conserver entry-v33 et Studio Operations v95');
expect(entry.includes("from './entry-v32.js'"), 'entry-v33 ne prolonge plus entry-v32');
expect(entry.includes('STUDIO_OPERATIONS_RELEASE'), 'Studio Operations v95 a été perdu');
expect(entry.includes("from './webtv-control-v1.js'"), 'la Web TV n’est pas branchée sur entry-v33');
expect(entry.includes('WebTvEncoder') && entry.includes('maintainWebTv'), 'le moteur Web TV n’est pas exporté ou surveillé');
expect(entry.includes("controller?.cron==='* * * * *'"), 'le watchdog Web TV minute n’est pas isolé du cron métier historique');

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
  "YOUTUBE_RTMPS_URL",
  "YOUTUBE_STREAM_KEY",
  "getContainer(env.WEBTV_ENCODER, ENCODER_INSTANCE_NAME)",
  "sleepAfter = '5m'",
  'async onActivityExpired()',
  'this.renewActivityTimeout()',
  "await container.stop()",
  "'/api/admin/webtv/state'",
  "'/api/admin/webtv/encoder'",
  "url.protocol === 'rtmps:'",
  "url.hostname !== base.hostname",
]) expect(control.includes(marker), `contrat Web TV absent : ${marker}`);
expect(!control.includes('.getByName('), 'la Web TV utilise une ancienne API Container getByName au lieu de getContainer');

for (const marker of ['ffmpeg', 'ffprobe', "'-f', 'flv'", 'rtmps://[youtube]', 'youtube_output_invalid', 'streamTarget(cfg)']) {
  expect(encoder.includes(marker), `moteur FFmpeg incomplet : ${marker}`);
}
expect(!encoder.includes('VOTRE_CLE_YOUTUBE'), 'une clé YouTube factice ou dangereuse est présente dans le moteur');

for (const marker of ['Diffusion', 'Web TV active', 'Ordre de passage', 'Programme de secours', 'Redémarrer l’encodeur', 'YouTube · RTMPS']) {
  expect(html.includes(marker), `interface Diffusion incomplète : ${marker}`);
}
expect(!html.includes('YOUTUBE_STREAM_KEY') && !html.includes('streamKey'), 'la clé de flux ne doit jamais être saisie ou exposée dans le HTML Studio');
for (const marker of ['/api/admin/webtv/state', '/api/admin/webtv/encoder', "openLibrary('fallback')", 'data-enabled=', 'data-type=']) {
  expect(ui.includes(marker), `commande Studio Web TV absente : ${marker}`);
}
expect(ia.includes("'/studio/webtv.html'"), 'la navigation Diffusion ne pointe pas vers la régie Web TV');
expect(ia.includes("['webtv', 'Web TV']"), 'le sous-menu Diffusion ne contient pas Web TV');
expect(ia.includes("cleanPath === '/studio/webtv'"), 'la régie n’utilise pas le shell Studio canonique');

if (failures.length) {
  console.error(failures.map((failure) => `- ${failure}`).join('\n'));
  process.exit(1);
}
console.log('Web TV v1 validée : Studio Diffusion complet, secrets serveur, Container FFmpeg singleton, RTMPS, watchdog minute, arrêt réel et reprise automatique.');
