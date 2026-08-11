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
const shell = read('public/studio/studio-shell-v100.js');
const shellCss = read('public/studio/studio-shell-v100.css');
const embeddedCss = read('public/studio/studio-embedded-v100.css');
const login = read('public/studio/studio-login-v48.js');
const worker = read('src/entry-v36.js');
const legacyWorker = read('src/entry-v9.js');
const packageJson = read('package.json');

expect(exists('public/studio/app.html'), 'Le shell Studio canonique app.html doit exister.');
expect(exists('public/studio/studio-shell-v100.js'), 'Le routeur du shell Studio v100 doit exister.');
expect(exists('public/studio/studio-shell-v100.css'), 'Le style du shell Studio v100 doit exister.');
expect(exists('public/studio/studio-embedded-v100.css'), 'Le style d’isolation des workspaces doit exister.');
expect((app.match(/class="ns100-sidebar"/gu) || []).length === 1, 'Le shell doit posséder exactement une sidebar principale.');
expect(app.includes('data-shell-route="clients"'), 'Le shell doit exposer Parcours clients.');
expect(app.includes('data-shell-route="production"'), 'Le shell doit exposer Production vidéo.');
expect(app.includes('data-shell-route="diffusion"'), 'Le shell doit exposer Diffusion.');
expect(app.includes('data-shell-route="settings/catalogue"'), 'Réglages doit ouvrir le Catalogue Media dans le shell.');
expect(app.includes('/studio/studio-shell-v100.css?v=2'), 'app.html doit charger la correction CSS du shell sans servir l’ancienne version en cache.');
expect(app.includes('/studio/studio-shell-v100.js?v=1'), 'app.html doit charger le moteur du shell v100.');
expect(shellCss.includes('grid-template-columns:236px minmax(0,1fr)'), 'Le shell doit réserver une colonne persistante unique au menu Studio.');
expect(shellCss.includes('.ns100-shell[hidden],.ns100-auth-state[hidden],.ns100-backdrop[hidden],.ns100-loading[hidden]{display:none!important}'), 'Les états hidden du shell, de l’authentification et des loaders doivent rester réellement invisibles malgré leurs règles display.');

expect(shell.includes("'settings/catalogue':{group:'settings'"), 'Catalogue Media doit être une route native de Réglages.');
expect(shell.includes("/studio/advanced.html?${EMBED}#programs"), 'Catalogue Media doit réutiliser le moteur catalogue dans un workspace isolé.');
expect(shell.includes("/studio/clients.html?${EMBED}"), 'Parcours clients doit être chargé en mode interne isolé.');
expect(shell.includes("/studio/webtv.html?${EMBED}"), 'Diffusion doit être chargée en mode interne isolé.');
expect(shell.includes("/studio/video-ai.html?${EMBED}"), 'Production doit être chargée en mode interne isolé.');
expect(shell.includes("fetch('/api/auth/status'"), 'Le shell doit vérifier la session avant de révéler le Studio.');
expect(shell.includes("fetch('/api/auth/logout'"), 'Le shell doit centraliser la déconnexion.');
expect(shell.includes("link.href='/studio/studio-embedded-v100.css?v=1'"), 'Le shell doit charger l’isolation via une ressource same-origin, pas via un style inline.');
expect(shell.includes('interceptChildNavigation'), 'Le shell doit intercepter les anciens liens internes au lieu d’empiler des interfaces.');
expect(embeddedCss.includes('.studio-sidebar,.video-ai-sidebar,#app>.sidebar'), 'Le mode interne doit neutraliser les sidebars historiques.');
expect(embeddedCss.includes('.studio-context-nav-v65{display:none!important}'), 'Les anciennes sous-navigations ne doivent pas se superposer au menu du shell.');

expect(entry.includes('/studio/studio-login-v48.js?v=2'), 'La racine Studio doit charger la passerelle de connexion mise à jour.');
expect(!entry.includes('id="app"'), 'La page de connexion ne doit pas réintroduire un ancien dashboard.');
expect(login.includes("const CANONICAL_STUDIO_PATH = '/studio/app.html#clients'"), 'La connexion doit cibler le shell Studio unique.');
expect(login.includes("'/studio/app.html'"), 'La passerelle doit autoriser le shell comme destination sécurisée.');
expect(login.includes('location.replace(destination)'), 'Une session valide doit remplacer la passerelle par le shell canonique.');

expect(worker.includes("const STUDIO_SHELL_RELEASE='neptune-studio-shell-20260811-v100'"), 'Le Worker doit déclarer la release du shell v100.');
expect(worker.includes("url.searchParams.get('studio_embed')!=='v100'"), 'Les anciennes pages ne doivent être accessibles directement qu’en mode interne explicite.');
expect(worker.includes('legacyStudioRedirect(url)'), 'Les anciennes routes Studio doivent être normalisées vers le shell.');
expect(worker.includes("headers.set('X-Frame-Options','DENY')"), 'Le shell principal doit être protégé contre l’intégration externe.');
expect(!worker.includes('media-catalog-nav-v98.js'), 'L’ancienne surcouche de navigation Catalogue Media ne doit plus être injectée.');
expect(worker.includes('inject(response,ADMIN_CSS,[ADMIN_JS,ADMIN_UX_JS])'), 'Le catalogue doit conserver uniquement son moteur métier et son UX, sans deuxième navigation.');
expect(worker.includes('studioShell:STUDIO_SHELL_RELEASE'), 'Le diagnostic public doit exposer la release du shell Studio.');
expect(legacyWorker.includes("const STUDIO_CANONICAL_PATH = '/studio/app.html#clients'"), 'Le diagnostic historique doit pointer vers le même chemin canonique.');

expect(!packageJson.includes('public/studio/control-v37.js'), 'Le check Node ne doit pas référencer le moteur Studio retiré.');

if (failures.length) {
  console.error(failures.map((failure) => `- ${failure}`).join('\n'));
  process.exit(1);
}

console.log('Studio unifié v100 validé : shell persistant unique, workspaces isolés, états hidden fiables, Catalogue Media dans Réglages et anciennes routes neutralisées.');
