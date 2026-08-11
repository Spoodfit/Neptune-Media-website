import { readFile } from 'node:fs/promises';

const files = {
  entry: await read('src/entry-v36.js'),
  runtime: await read('public/studio/studio-information-architecture-v65-1.js'),
  styles: await read('public/studio/studio-information-architecture-v65.css'),
  app: await read('public/studio/app.html'),
  router: await read('public/studio/studio-app-router-v104.js'),
  clients: await read('public/studio/clients.html'),
  production: await read('public/studio/video-ai.html'),
  advanced: await read('public/studio/advanced.html'),
  webtv: await read('public/studio/webtv.html'),
};

const failures = [];
const requiredLabels = ['Parcours clients', 'Production vidéo', 'Diffusion', 'Réglages'];

check(files.entry, "const STUDIO_UI_RELEASE='neptune-studio-ui-20260811-v104-no-iframe'", 'la release Studio v104 n’est pas active');
check(files.entry, "const STUDIO_NAV_JS='/studio/studio-information-architecture-v65-1.js?v=104'", 'le runtime de navigation v104 n’est pas injecté de façon cache-bustée');
check(files.entry, 'secureStudioDocument(await injectStudioNavigation(response))', 'les pages métier ne reçoivent pas la navigation partagée top-level');
check(files.entry, "target.searchParams.delete('studio_embed')", 'les anciennes URLs iframe ne sont pas nettoyées');
forbid(files.entry, 'prepareStudioEmbeddedDocument', 'le Worker prépare encore des pages Studio embarquées');
forbid(files.entry, 'STUDIO_EMBED_CSS', 'le Worker dépend encore du CSS d’isolation iframe');
check(files.app, '/studio/studio-app-router-v104.js?v=1', 'app.html ne route pas vers les pages métier top-level');
forbid(files.app, '<iframe', 'app.html contient encore une iframe métier');
check(files.router, "production:'/studio/video-ai.html'", 'le routeur v104 ne mène pas à Production vidéo');
check(files.router, "'settings/catalogue':'/studio/advanced.html#programs'", 'le routeur v104 ne mène pas au Catalogue Media');

check(files.runtime, "const KEY = '__neptuneStudioInformationArchitectureV104'", 'le runtime partagé v104 n’est pas déclaré');
check(files.runtime, 'primaryNavigation', 'la navigation principale canonique n’est pas construite');
check(files.runtime, "link('diffusion', '/studio/webtv.html'", 'Diffusion ne mène pas à la régie Web TV');
check(files.runtime, "link('settings', '/studio/advanced.html#programs'", 'Réglages ne mène pas au Catalogue Media');
check(files.runtime, "['webtv', 'Web TV']", 'le sous-menu Diffusion ne contient pas Web TV');
check(files.runtime, "['episodes', 'Programme']", 'le sous-menu Diffusion ne contient pas Programme');
forbid(files.runtime, "['programs', 'Formats']", 'Formats reste à tort dans le sous-menu Diffusion');
check(files.runtime, "settings: [['programs', 'Catalogue Media']", 'Catalogue Media n’est pas la première sous-section de Réglages');
check(files.runtime, "['finances', 'Finances']", 'le sous-menu Réglages ne contient pas Finances');
check(files.runtime, "cleanPath === '/studio/webtv'", 'la page Web TV n’utilise pas la navigation Studio commune');
check(files.runtime, "location.replace('/studio/clients')", 'l’ancien tableau de bord avancé n’est pas renvoyé vers Parcours clients');
check(files.runtime, "location.replace('/studio/video-ai.html')", 'l’ancien Copilot autonome n’est pas renvoyé vers Production vidéo');
forbid(files.runtime, 'observeLegacyInterference', 'l’ancien observateur récursif instable subsiste dans le runtime actif');

check(files.styles, '--studio-v65-sidebar: 236px', 'la largeur commune du menu Studio est absente');
check(files.styles, '.studio-context-nav-v65', 'les onglets contextuels Diffusion/Réglages ne sont pas stylés');
check(files.styles, '.workflow-stage-tabs', 'la lisibilité du parcours client n’est pas renforcée');
check(files.styles, '.video-ai-grid', 'la lisibilité de la production vidéo n’est pas renforcée');
check(files.webtv, '<h1>Diffusion</h1>', 'la page Web TV n’est pas présentée comme l’onglet Diffusion');
check(files.webtv, 'Web TV active', 'la commande d’activation antenne est absente');

for (const label of requiredLabels) check(files.runtime, label, `la navigation canonique ne contient pas « ${label} »`);
forbid(files.clients, 'Audience</strong>', 'Audience reste une destination principale sur Parcours clients');
forbid(files.clients, 'Finances</strong>', 'Finances reste une destination principale sur Parcours clients');
forbid(files.clients, 'Calendrier</strong>', 'Calendrier reste une destination principale sur Parcours clients');
forbid(files.production, 'Réglages avancés', 'Production vidéo renvoie encore vers une zone avancée');
forbid(files.advanced, 'Administration avancée', 'le libellé Administration avancée reste visible');
forbid(files.advanced, 'Zone avancée', 'le statut Zone avancée reste visible');
forbid(files.advanced, 'Retour au parcours', 'le bouton de retour redondant reste visible');

if (failures.length) {
  console.error(failures.map((failure) => `- ${failure}`).join('\n'));
  process.exit(1);
}

console.log('Studio IA v104 validée : quatre destinations top-level, aucune iframe métier, Diffusion séparée du Catalogue Media et Réglages centrés sur le catalogue.');

async function read(path) { return readFile(new URL(`../${path}`, import.meta.url), 'utf8'); }
function check(content, needle, message) { if (!content.includes(needle)) failures.push(message); }
function forbid(content, needle, message) { if (content.includes(needle)) failures.push(message); }