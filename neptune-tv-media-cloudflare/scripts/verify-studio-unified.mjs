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
const clients = read('public/studio/clients.html');
const advanced = read('public/studio/advanced.html');
const login = read('public/studio/studio-login-v48.js');
const worker = read('src/entry-v9.js');
const packageJson = read('package.json');

expect(entry.includes('/studio/studio-login-v48.css?v=1'), 'La racine Studio doit charger le CSS de connexion isolé.');
expect(entry.includes('/studio/studio-login-v48.js?v=1'), 'La racine Studio doit charger la passerelle de connexion canonique.');
expect(!entry.includes('Contrôle automatique'), 'L’ancien titre Contrôle automatique ne doit plus être servi.');
expect(!entry.includes('id="app"'), 'L’ancien dashboard ne doit plus être présent dans la page de connexion.');
expect(!entry.includes('/studio/control-v37.js'), 'L’ancien moteur control-v37 ne doit plus être chargé.');
expect(!entry.includes('/studio/control-v36.css'), 'Les anciens styles du dashboard ne doivent plus être chargés.');
expect(!exists('public/studio/control-v37.js'), 'Le fichier control-v37.js doit être supprimé.');
expect(!exists('public/studio/control-v36.css'), 'Le fichier control-v36.css doit être supprimé.');

expect(clients.includes('<h1>Parcours clients</h1>'), 'Le workspace canonique doit être intitulé Parcours clients.');
expect(clients.includes('aria-current="page"'), 'Le parcours clients doit être l’entrée de navigation active.');
expect(!clients.includes('href="/studio/"'), 'Le workspace ne doit contenir aucun lien vers l’ancienne racine.');
expect(!clients.includes('>Vue d’ensemble<'), 'L’ancienne vue d’ensemble ne doit plus apparaître dans le workspace.');
expect(!clients.includes('>Surveillance clients<'), 'L’ancien doublon Surveillance clients doit être supprimé.');
expect(!advanced.includes('href="/studio/"'), 'L’administration avancée doit revenir vers le workspace canonique.');

expect(login.includes("const CANONICAL_STUDIO_PATH = '/studio/clients'"), 'La connexion doit cibler /studio/clients.');
expect(login.includes('location.replace(destination)'), 'Une session valide doit remplacer la page par le workspace canonique.');
expect(login.includes("'/api/auth/status'"), 'La passerelle doit vérifier la session avant affichage.');
expect(worker.includes("studioCanonicalPath: STUDIO_CANONICAL_PATH"), 'Le diagnostic public doit déclarer le chemin Studio canonique.');
expect(worker.includes("legacyStudioDashboard: 'removed'"), 'Le diagnostic public doit confirmer la suppression du dashboard hérité.');
expect(worker.includes("'/studio/control.html'"), 'Les anciennes routes directes doivent être redirigées.');
expect(!packageJson.includes('public/studio/control-v37.js'), 'Le check Node ne doit plus référencer le moteur supprimé.');

if (failures.length) {
  console.error(failures.map((failure) => `- ${failure}`).join('\n'));
  process.exit(1);
}

console.log('Studio unifié validé : connexion isolée, workspace canonique unique et anciennes routes neutralisées.');
