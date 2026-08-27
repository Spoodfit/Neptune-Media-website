import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const exists = (relative) => fs.existsSync(path.join(root, relative));
const failures = [];

function expect(condition, message) {
  if (!condition) failures.push(message);
}

const entry = read('public/studio/index.html');
const app = read('public/studio/app.html');
const router = read('public/studio/studio-app-router-v104.js');
const advanced = read('public/studio/advanced.html');
const catalogLoader = read('public/studio/media-catalog-loader-v104.js');
const ia = read('public/studio/studio-information-architecture-v65-1.js');
const shellCss = read('public/studio/studio-shell-v105.css');
const login = read('public/studio/studio-login-v48.js');
const worker = read('src/entry-v36.js');
const legacyWorker = read('src/entry-v9.js');
const packageJson = read('package.json');

expect(exists('public/studio/app.html'), 'La route de compatibilité app.html doit exister.');
expect(exists('public/studio/studio-app-router-v104.js'), 'Le routeur top-level de compatibilité doit exister.');
expect(exists('public/studio/media-catalog-loader-v104.js'), 'Le loader route-aware du Catalogue Media doit exister.');
expect(exists('public/studio/studio-shell-v105.css'), 'Le style canonique v105 doit exister.');
expect(!app.includes('<iframe'), 'app.html ne doit plus contenir d’iframe Studio.');
expect(!app.includes('studio-shell-v100.js'), 'app.html ne doit plus charger l’ancien shell iframe.');
expect(app.includes('/studio/studio-app-router-v104.js?v=1'), 'app.html doit conserver le routeur top-level de compatibilité.');
expect(router.includes("diffusion:'/studio/webtv.html'"), 'Diffusion doit rester une navigation top-level.');
expect(router.includes("'settings/catalogue':'/studio/advanced.html#programs'"), 'Catalogue Media doit rester une route top-level historique.');

expect(ia.includes("const KEY = '__neptuneStudioCanonicalShellV105'"), 'La navigation partagée doit déclarer la version v105.');
expect(ia.includes('installCanonicalSidebar'), 'Le runtime doit remplacer les sidebars natives par un composant unique.');
expect(ia.includes("link('clients', '/studio/clients'"), 'Parcours clients doit être présent.');
expect(ia.includes("link('diffusion', '/studio/webtv.html'"), 'Diffusion doit être présent.');
expect(ia.includes("link('catalog', '/studio/advanced.html#programs'"), 'Catalogue Média doit être présent.');
expect(ia.includes("link('finance', '/studio/advanced.html#finances'"), 'Finance doit être présent.');
expect(ia.includes("link('settings-main', '/studio/advanced.html#settings'"), 'Réglage doit être présent.');
expect(!ia.includes("link('production', '/studio/video-ai.html'"), 'Production vidéo ne doit pas être une entrée principale.');
expect(ia.includes("cleanPath === '/studio/video-ai'"), 'Production vidéo doit rester accessible par route dédiée.');
expect(ia.includes("if (kind === 'production') return '';"), 'Production vidéo ne doit activer aucune entrée principale.');
expect(ia.includes('id="neptuneStudioLogout"'), 'La sidebar canonique doit avoir un seul bloc de déconnexion.');
expect(ia.includes("fetch('/api/auth/logout'"), 'Le bloc de compte doit réellement déconnecter.');
expect(ia.includes("settings: [['programs', 'Catalogue Media']"), 'Catalogue Media doit rester la première sous-section technique du groupe historique Réglages.');
expect(!ia.includes("['programs', 'Formats']"), 'Formats ne doit plus être présenté comme sous-section de Diffusion.');
expect(ia.includes("groupForTab(tab) { return ['programs', 'finances', 'users', 'audit', 'settings'].includes(tab) ? 'settings' : 'diffusion'; }"), 'Le regroupement technique des contrôles advanced doit rester déterministe.');
expect(ia.includes("if (tab === 'programs') return 'catalog';"), 'Le hash Catalogue doit activer Catalogue Média.');
expect(ia.includes("if (tab === 'finances') return 'finance';"), 'Le hash Finances doit activer Finance.');
expect(ia.includes("return 'settings-main';"), 'Les écrans Équipe, Journal et Général doivent activer Réglage.');
expect(ia.includes("document.documentElement.dataset.neptuneStudioShellReady = 'v105'"), 'Le runtime doit signaler la fin du boot canonique.');
expect(ia.includes('settleAdvancedSession(markReady)'), 'Réglage doit attendre la résolution de session avant de se révéler.');
expect(ia.includes('revealLegacyFallback'), 'Le runtime doit révéler un fallback si le boot canonique échoue.');
expect(!ia.includes('installWebTvContext'), 'Diffusion ne doit plus injecter une seconde rangée de navigation.');
expect(shellCss.includes('body.studio-shell-v105 .neptune-studio-account'), 'Le bloc compte/déconnexion doit avoir un rendu unique.');
expect(shellCss.includes('data-neptune-studio-shell-boot="v105"'), 'Le CSS doit empêcher le flash du shell historique avant initialisation.');
expect(shellCss.includes('data-neptune-studio-shell-ready="v105"'), 'Le CSS doit révéler le shell canonique une fois prêt.');
expect(shellCss.includes('#auth.login'), 'Le CSS doit empêcher le flash du formulaire de connexion historique.');

expect(advanced.includes('<main id="auth" class="login" hidden>'), 'advanced.html doit masquer la connexion avant le résultat de session.');
expect(advanced.includes('/studio/media-catalog-loader-v104.js?v=3'), 'advanced.html doit charger le loader Catalogue v108.');
expect(catalogLoader.includes("const CATALOG_HASH='programs'"), 'Le loader Catalogue ne doit s’activer que sur #programs.');
expect(catalogLoader.includes('await import(CATALOG_MANAGER)') && catalogLoader.includes('await import(CATALOG_UX)'), 'Le loader doit charger le moteur et l’UX du catalogue.');
expect(catalogLoader.includes('installCatalogFetchGuard()'), 'Le loader Catalogue doit borner les appels réseau.');
expect(catalogLoader.includes('waitForManagerState()'), 'Le loader Catalogue doit attendre un état manager déterministe.');
expect(catalogLoader.includes("headers.set('X-CSRF-Token',csrf)"), 'Le Catalogue doit transmettre le CSRF Studio aux endpoints admin.');
expect(catalogLoader.includes('refreshStudioCsrf'), 'Le Catalogue doit pouvoir renouveler le CSRF après expiration.');
expect(catalogLoader.includes("document.documentElement.dataset.neptuneMediaCatalog='v108'"), 'Le bootstrap Catalogue v108 doit signaler son état prêt.');

expect(entry.includes('/studio/studio-login-v48.js?v=2'), 'La racine Studio doit conserver la passerelle de connexion.');
expect(login.includes("const CANONICAL_STUDIO_PATH = '/studio/clients'"), 'La connexion doit ouvrir directement Parcours clients.');
expect(login.includes('location.replace(destination)'), 'Une session valide doit naviguer vers la page métier.');

expect(worker.includes("const STUDIO_UI_RELEASE='neptune-studio-ui-20260812-v105-three-tab-canonical-shell'"), 'Le Worker doit conserver la release historique Studio v105.');
expect(worker.includes("const STUDIO_NAV_JS='/studio/studio-information-architecture-v65-1.js?v=107'"), 'Le Worker de base doit conserver son injection historique, remplacée ensuite par le shell zero-flash actif.');
expect(worker.includes("const STUDIO_SHELL_CSS='/studio/studio-shell-v105.css?v=3'"), 'Le Worker de base doit conserver son style historique, remplacé ensuite par le cache-busting actif.');
expect(worker.includes('data-neptune-studio-shell-boot="v105"'), 'Le Worker doit marquer les pages Studio avant leur premier paint.');
expect(worker.includes("url.searchParams.has('studio_embed')"), 'Le Worker doit nettoyer les anciennes URLs iframe encore en cache.');
expect(worker.includes("target.searchParams.delete('studio_embed')"), 'Le paramètre iframe historique doit être supprimé.');
expect(worker.includes('secureStudioDocument(await injectStudioNavigation(response))'), 'Les écrans métier doivent être servis top-level avec un shell commun.');
expect(worker.includes("headers.set('X-Frame-Options','DENY')"), 'Les pages Studio top-level doivent refuser l’intégration iframe.');
expect(!worker.includes('prepareStudioEmbeddedDocument'), 'Le Worker ne doit plus préparer de document Studio embarqué.');
expect(!worker.includes('STUDIO_EMBED_CSS'), 'Le Worker ne doit plus dépendre d’un CSS d’isolation iframe.');
expect(!worker.includes('ADMIN_CSS') && !worker.includes('ADMIN_JS') && !worker.includes('ADMIN_UX_JS'), 'Le Worker ne doit plus réécrire advanced.html une seconde fois pour le Catalogue.');
expect(worker.includes("allowSameOriginFrame(response,'X-Neptune-Studio-Preview')"), 'Seule la prévisualisation réelle du tunnel doit conserver une intégration same-origin.');
expect(worker.includes('studioUi:STUDIO_UI_RELEASE'), 'Le diagnostic public doit exposer la release Studio v105.');
expect(legacyWorker.includes("const STUDIO_CANONICAL_PATH = '/studio/clients'"), 'Les anciennes routes Studio doivent converger directement vers Parcours clients.');

expect(!packageJson.includes('public/studio/control-v37.js'), 'Le check Node ne doit pas référencer le moteur Studio retiré.');

if (failures.length) {
  console.error(failures.map((failure) => `- ${failure}`).join('\n'));
  process.exit(1);
}

console.log('Studio v138 validé : shell sans flash, cinq onglets principaux conformes, Catalogue v108 CSRF-safe et aucune iframe métier.');
