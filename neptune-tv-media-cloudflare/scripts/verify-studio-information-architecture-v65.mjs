import { readFile } from 'node:fs/promises';

const files = {
  entry: await read('src/entry-v36.js'),
  runtime: await read('public/studio/studio-information-architecture-v65-1.js'),
  shellStyles: await read('public/studio/studio-shell-v105.css'),
  app: await read('public/studio/app.html'),
  router: await read('public/studio/studio-app-router-v104.js'),
  clients: await read('public/studio/clients.html'),
  production: await read('public/studio/video-ai.html'),
  advanced: await read('public/studio/advanced.html'),
  webtv: await read('public/studio/webtv.html'),
  catalogueLoader: await read('public/studio/media-catalog-loader-v104.js'),
};

const failures = [];
const requiredLabels = ['Parcours clients', 'Diffusion', 'Réglages'];

check(files.entry, "const STUDIO_UI_RELEASE='neptune-studio-ui-20260812-v105-three-tab-canonical-shell'", 'la release Studio v105 n’est pas active');
check(files.entry, "const STUDIO_NAV_JS='/studio/studio-information-architecture-v65-1.js?v=107'", 'le runtime canonique n’est pas injecté avec le cache-busting Réglages');
check(files.entry, "const STUDIO_SHELL_CSS='/studio/studio-shell-v105.css?v=3'", 'le CSS canonique anti-flash Réglages n’est pas injecté');
check(files.entry, 'data-neptune-studio-shell-boot="v105"', 'le Worker ne marque pas le document Studio avant le premier paint');
check(files.entry, 'secureStudioDocument(await injectStudioNavigation(response))', 'les pages métier ne reçoivent pas le shell partagé top-level');
check(files.entry, "target.searchParams.delete('studio_embed')", 'les anciennes URLs iframe ne sont pas nettoyées');
forbid(files.entry, 'prepareStudioEmbeddedDocument', 'le Worker prépare encore des pages Studio embarquées');
forbid(files.entry, 'STUDIO_EMBED_CSS', 'le Worker dépend encore du CSS d’isolation iframe');
check(files.app, '/studio/studio-app-router-v104.js?v=1', 'app.html ne route pas vers les pages métier top-level');
forbid(files.app, '<iframe', 'app.html contient encore une iframe métier');
check(files.router, "diffusion:'/studio/webtv.html'", 'le routeur de compatibilité ne mène pas à Diffusion');
check(files.router, "'settings/catalogue':'/studio/advanced.html#programs'", 'le routeur de compatibilité ne mène pas au Catalogue Media');

check(files.runtime, "const KEY = '__neptuneStudioCanonicalShellV105'", 'le runtime partagé v105 n’est pas déclaré');
check(files.runtime, 'installCanonicalSidebar', 'la sidebar canonique n’est pas reconstruite sur chaque route');
check(files.runtime, "link('clients', '/studio/clients'", 'Parcours clients n’est pas la première destination canonique');
check(files.runtime, "link('diffusion', '/studio/webtv.html'", 'Diffusion ne mène pas à la régie Web TV');
check(files.runtime, "link('settings', '/studio/advanced.html#programs'", 'Réglages ne mène pas au Catalogue Media');
forbid(files.runtime, "link('production'", 'Production vidéo reste une destination principale');
check(files.runtime, 'id="neptuneStudioLogout"', 'le bloc unique de déconnexion n’est pas présent dans le composant canonique');
check(files.runtime, "fetch('/api/auth/logout'", 'le bloc de compte ne déclenche pas la déconnexion');
check(files.runtime, "['webtv', 'Web TV']", 'le sous-menu Diffusion des réglages ne contient pas Web TV');
check(files.runtime, "['episodes', 'Programme']", 'le sous-menu Diffusion des réglages ne contient pas Programme');
check(files.runtime, "settings: [['programs', 'Catalogue Media']", 'Catalogue Media n’est pas la première sous-section de Réglages');
check(files.runtime, "['finances', 'Finances']", 'le sous-menu Réglages ne contient pas Finances');
check(files.runtime, "cleanPath === '/studio/webtv'", 'la page Web TV n’utilise pas le shell Studio commun');
check(files.runtime, 'document.documentElement.dataset.neptuneStudioShellReady = \'v105\'', 'le runtime ne signale pas la fin du boot canonique');
check(files.runtime, 'settleAdvancedSession(markReady)', 'Réglages est révélé avant la résolution de session');
check(files.runtime, 'revealLegacyFallback', 'le fallback de sécurité du boot canonique est absent');
forbid(files.runtime, 'installWebTvContext', 'Diffusion réinjecte encore la rangée Antenne / Programme / Publicités / Audience');
forbid(files.runtime, "['Antenne', '/studio/webtv.html'", 'la rangée de navigation Diffusion redondante est encore construite');
forbid(files.runtime, 'observeLegacyInterference', 'un ancien observateur récursif instable subsiste dans le runtime actif');

check(files.shellStyles, 'body.studio-shell-v105 .neptune-studio-account', 'le bloc compte/déconnexion n’a pas de style canonique');
check(files.shellStyles, '[data-studio-route="production"]', 'le garde-fou CSS contre Production vidéo est absent');
check(files.shellStyles, 'data-neptune-studio-shell-boot="v105"', 'le CSS ne masque pas le shell historique pendant le boot');
check(files.shellStyles, 'data-neptune-studio-shell-ready="v105"', 'le CSS ne révèle pas explicitement le shell canonique prêt');
check(files.shellStyles, '#auth.login', 'l’écran de connexion historique n’est pas masqué pendant le bootstrap');
check(files.advanced, '<main id="auth" class="login" hidden>', 'Réglages peint encore le formulaire de connexion avant la vérification de session');
check(files.advanced, '/studio/media-catalog-loader-v104.js?v=3', 'Réglages ne charge pas le bootstrap Catalogue v108');
for (const marker of [
  'ADMIN_TIMEOUT_MS=10000',
  'PUBLIC_PREVIEW_TIMEOUT_MS=3500',
  'MANAGER_SETTLE_TIMEOUT_MS=12000',
  'waitForManagerState()',
  'installCatalogFetchGuard()',
  "headers.set('X-CSRF-Token',csrf)",
  "sessionStorage.getItem('neptune_csrf')",
  'refreshStudioCsrf',
  "document.documentElement.dataset.neptuneMediaCatalog='v108'",
]) {
  check(files.catalogueLoader, marker, `le garde-fou Catalogue est absent : ${marker}`);
}
check(files.webtv, '<h1>Diffusion</h1>', 'la page Web TV n’est pas présentée comme l’onglet Diffusion');
check(files.webtv, 'Web TV active', 'la commande d’activation antenne est absente');

for (const label of requiredLabels) check(files.runtime, label, `la navigation canonique ne contient pas « ${label} »`);
forbid(files.runtime, "strong>Production vidéo</strong>", 'Production vidéo réapparaît dans la sidebar canonique');
forbid(files.clients, 'Audience</strong>', 'Audience reste une destination principale sur Parcours clients');
forbid(files.clients, 'Finances</strong>', 'Finances reste une destination principale sur Parcours clients');
forbid(files.clients, 'Calendrier</strong>', 'Calendrier reste une destination principale sur Parcours clients');
forbid(files.advanced, 'Administration avancée', 'le libellé Administration avancée reste visible');
forbid(files.advanced, 'Zone avancée', 'le statut Zone avancée reste visible');
forbid(files.advanced, 'Retour au parcours', 'le bouton de retour redondant reste visible');

if (failures.length) {
  console.error(failures.map((failure) => `- ${failure}`).join('\n'));
  process.exit(1);
}

console.log('Studio IA v105 validée : shell sans flash, trois destinations et Catalogue v108 avec CSRF et bootstrap borné.');

async function read(path) { return readFile(new URL(`../${path}`, import.meta.url), 'utf8'); }
function check(content, needle, message) { if (!content.includes(needle)) failures.push(message); }
function forbid(content, needle, message) { if (content.includes(needle)) failures.push(message); }
