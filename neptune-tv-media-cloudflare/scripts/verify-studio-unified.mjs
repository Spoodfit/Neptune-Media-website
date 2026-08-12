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
expect(router.includes("'settings/catalogue':'/studio/advanced.html#programs'"), 'Catalogue Media doit rester une route top-level de Réglages.');

expect(ia.includes("const KEY = '__neptuneStudioCanonicalShellV105'"), 'La navigation partagée doit déclarer la version v105.');
expect(ia.includes('installCanonicalSidebar'), 'Le runtime doit remplacer les sidebars natives par un composant unique.');
expect(ia.includes("link('clients', '/studio/clients'"), 'Parcours clients doit être présent.');
expect(ia.includes("link('diffusion', '/studio/webtv.html'"), 'Diffusion doit être présent.');
expect(ia.includes("link('settings', '/studio/advanced.html#programs'"), 'Réglages doit ouvrir Catalogue Media.');
expect(!ia.includes("link('production'"), 'Production vidéo ne doit plus être une destination principale.');
expect(ia.includes('id="neptuneStudioLogout"'), 'La sidebar canonique doit avoir un seul bloc de déconnexion.');
expect(ia.includes("fetch('/api/auth/logout'"), 'Le bloc de compte doit réellement déconnecter.');
expect(ia.includes("settings: [['programs', 'Catalogue Media']"), 'Catalogue Media doit être la première sous-section de Réglages.');
expect(!ia.includes("['programs', 'Formats']"), 'Formats ne doit plus être présenté comme sous-section de Diffusion.');
expect(ia.includes("groupForTab(tab) { return ['programs', 'finances', 'users', 'audit', 'settings'].includes(tab) ? 'settings' : 'diffusion'; }"), 'Le catalogue doit activer Réglages et non Diffusion.');
expect(shellCss.includes('body.studio-shell-v105 .neptune-studio-account'), 'Le bloc compte/déconnexion doit avoir un rendu unique.');

expect(advanced.includes('/studio/media-catalog-loader-v104.js?v=1'), 'advanced.html doit charger le loader Catalogue.');
expect(catalogLoader.includes("const CATALOG_HASH='programs'"), 'Le loader Catalogue ne doit s’activer que sur #programs.');
expect(catalogLoader.includes('await import(CATALOG_MANAGER)') && catalogLoader.includes('await import(CATALOG_UX)'), 'Le loader doit charger le moteur et l’UX du catalogue.');

expect(entry.includes('/studio/studio-login-v48.js?v=2'), 'La racine Studio doit conserver la passerelle de connexion.');
expect(login.includes("const CANONICAL_STUDIO_PATH = '/studio/clients'"), 'La connexion doit ouvrir directement Parcours clients.');
expect(login.includes('location.replace(destination)'), 'Une session valide doit naviguer vers la page métier.');

expect(worker.includes("const STUDIO_UI_RELEASE='neptune-studio-ui-20260812-v105-three-tab-canonical-shell'"), 'Le Worker doit déclarer la release Studio v105.');
expect(worker.includes("const STUDIO_NAV_JS='/studio/studio-information-architecture-v65-1.js?v=105'"), 'Toutes les pages Studio doivent recevoir exactement le même runtime cache-busté.');
expect(worker.includes("const STUDIO_SHELL_CSS='/studio/studio-shell-v105.css?v=1'"), 'Toutes les pages Studio doivent recevoir le style canonique v105.');
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

console.log('Studio v105 validé : un seul shell, trois onglets principaux, un bloc unique de déconnexion et aucune iframe métier.');
