import { access, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const exists = async (path) => {
  try {
    await access(new URL(path, import.meta.url), constants.F_OK);
    return true;
  } catch {
    return false;
  }
};

const config = JSON.parse(await read('../wrangler.jsonc'));
const rootConfig = JSON.parse(await read('../../wrangler.jsonc'));
const rootPackage = JSON.parse(await read('../../package.json'));
const nestedPackage = JSON.parse(await read('../package.json'));
const entry = await read('../src/entry-v16.js');
const html = await read('../public/studio/video-ai.html');
const vite = await read('../local-video-engine/vite.config.js');
const source = await read('../local-video-engine/src/main.js');
const built = await read('../public/studio/local-engine/neptune-video-local-engine-v1.js');

const failures = [];
const expect = (condition, message) => { if (!condition) failures.push(message); };

for (const [name, current] of [['root', rootConfig], ['nested', config]]) {
  const containers = Array.isArray(current.containers) ? current.containers : [];
  expect(containers.every((item) => item.class_name === 'WebTvEncoder'), `${name}: un Container autre que WebTvEncoder est configuré`);
  expect(containers.filter((item) => item.class_name === 'WebTvEncoder').length === 1, `${name}: la Web TV doit utiliser exactement un Container déclaré`);
  expect(!current.queues, `${name}: la Queue Cloudflare vidéo est encore configurée`);
  expect(!current.durable_objects?.bindings?.some((item) => item.name === 'VIDEO_PROCESSOR'), `${name}: VIDEO_PROCESSOR est encore lié`);
}
for (const [name, current] of [['root', rootPackage], ['nested', nestedPackage]]) {
  expect(Boolean(current.dependencies?.['@cloudflare/containers']), `${name}: la dépendance Containers requise par la Web TV est absente`);
}

expect(!(await exists('../../neptune-video-engine/README.md')), 'le service racine neptune-video-engine existe encore');
expect(!(await exists('../public/studio/install-neptune-video-engine.ps1')), 'l’installateur du service permanent existe encore');
expect(!(await exists('../public/studio/video-ai-engine-v73.js')), 'le bridge localhost du service permanent existe encore');
expect(!(await exists('../public/studio/video-ai-engine-v73.css')), 'le CSS du panneau permanent existe encore');
expect(!(await exists('../public/studio/video-ai-generation-v75.js')), 'le patch de génération du service permanent existe encore');

expect(entry.includes("videoAiEngineMode: 'browser-local'"), 'le Worker ne déclare pas le moteur navigateur comme moteur primaire');
expect(entry.includes('videoAiBackgroundProcessing: false'), 'le Worker promet encore un traitement après fermeture de l’onglet');
expect(entry.includes('videoAiSafeToCloseAfterUpload: false'), 'le Worker annonce encore que l’onglet peut être fermé');
expect(!entry.includes('videoAiPermanentEngineEndpoint'), 'le Worker publie encore un endpoint du moteur permanent');
expect(!entry.includes('install-neptune-video-engine.ps1'), 'le Worker publie encore l’installateur du moteur permanent');

expect(html.includes('PRODUCTION LOCALE NAVIGATEUR'), 'le Studio n’explique pas le moteur navigateur actif');
expect(html.includes('/studio/local-engine/neptune-video-local-engine-v1.js?v=73'), 'le moteur navigateur n’est pas chargé');
expect(!html.includes('NEPTUNE VIDEO ENGINE'), 'le Studio annonce encore le service permanent supprimé');
expect(!html.includes('install-neptune-video-engine.ps1'), 'le Studio propose encore l’installateur supprimé');
expect(!html.includes('video-ai-engine-v73.js'), 'le Studio charge encore le bridge localhost supprimé');
expect(!html.includes('video-ai-generation-v75.js'), 'le Studio charge encore le patch du service permanent supprimé');
expect(html.includes('Gardez l’onglet ouvert pendant la création'), 'la contrainte réelle du moteur navigateur n’est pas expliquée');

expect(source.includes('processFileLocally'), 'la source navigateur locale ne contient plus son pipeline principal');
expect(vite.includes('neptune-openai-semantic-assist-browser-local'), 'le build navigateur local n’utilise pas le plugin canonique');
expect(vite.includes('__NEPTUNE_BROWSER_LOCAL_VIDEO__'), 'le build navigateur local n’expose pas sa release');
expect(!vite.includes('const permanentEngineRuntime'), 'l’ancien bloc runtime permanent existe encore dans la configuration Vite');
expect(!vite.includes('PERMANENT_ENGINE_RELEASE'), 'l’ancienne release permanente existe encore dans la configuration Vite');
for (const forbidden of [
  'NeptuneVideoEngineBridge',
  'processFileWithPermanentEngine',
  'resumePermanentEngineJobs',
  'neptune-video-engine-bridge-20260802-v73',
]) {
  expect(!built.includes(forbidden), `le bundle généré réintroduit le service permanent: ${forbidden}`);
}
expect(built.includes('__NEPTUNE_BROWSER_LOCAL_VIDEO__'), 'le bundle construit n’est pas la version navigateur locale canonique');

if (failures.length) {
  console.error(failures.map((failure) => `- ${failure}`).join('\n'));
  process.exit(1);
}

console.log('Production vidéo validée : moteur navigateur local unique, aucun service Neptune Video Engine permanent.');
