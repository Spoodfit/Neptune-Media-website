import { readFile } from 'node:fs/promises';

const files = {
  entry: await read('src/entry-v15.js'),
  runtime: await read('public/studio/studio-information-architecture-v65-1.js'),
  styles: await read('public/studio/studio-information-architecture-v65.css'),
  clients: await read('public/studio/clients.html'),
  production: await read('public/studio/video-ai.html'),
  advanced: await read('public/studio/advanced.html'),
};

const failures = [];
const requiredLabels = ['Parcours clients', 'Production vidéo', 'Diffusion', 'Réglages'];

check(files.entry, "studioInformationArchitecture: 'four-primary-destinations-v65'", 'le diagnostic de l’architecture Studio v65 est absent');
check(files.entry, "studioNavigationRuntime: 'stable-no-observer-loop-v65.1'", 'le runtime stable Studio v65.1 n’est pas déclaré');
check(files.entry, 'injectStudioInformationArchitecture', 'la dernière couche Studio v65 n’est pas injectée');
check(files.entry, 'retiredSidebarCssPattern', 'la feuille de menu v64 n’est pas retirée du HTML final');
check(files.entry, 'retiredSidebarJsPattern', 'le runtime de menu v64 n’est pas retiré du HTML final');
check(files.runtime, 'primaryNavigation', 'la navigation principale canonique n’est pas construite');
check(files.runtime, "['episodes', 'Programme']", 'le sous-menu Diffusion ne contient pas Programme');
check(files.runtime, "['finances', 'Finances']", 'le sous-menu Réglages ne contient pas Finances');
check(files.runtime, "location.replace('/studio/clients')", 'l’ancien tableau de bord avancé n’est pas renvoyé vers Parcours clients');
check(files.runtime, "location.replace('/studio/video-ai.html')", 'l’ancien Copilot autonome n’est pas renvoyé vers Production vidéo');
forbid(files.runtime, 'observeLegacyInterference', 'l’ancien observateur récursif instable subsiste dans le runtime actif');
check(files.styles, '--studio-v65-sidebar: 236px', 'la largeur commune du shell Studio est absente');
check(files.styles, '.studio-context-nav-v65', 'les onglets contextuels Diffusion/Réglages ne sont pas stylés');
check(files.styles, '.workflow-stage-tabs', 'la lisibilité du parcours client n’est pas renforcée');
check(files.styles, '.video-ai-grid', 'la lisibilité de la production vidéo n’est pas renforcée');

for (const label of requiredLabels) {
  check(files.clients, label, `la navigation clients ne contient pas « ${label} »`);
  check(files.production, label, `la navigation production ne contient pas « ${label} »`);
  check(files.runtime, label, `la navigation canonique ne contient pas « ${label} »`);
}

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

console.log('Studio information architecture v65.1 verified: four primary destinations, contextual tabs, stable runtime and shared readability layer.');

async function read(path) {
  return readFile(new URL(`../${path}`, import.meta.url), 'utf8');
}
function check(content, needle, message) {
  if (!content.includes(needle)) failures.push(message);
}
function forbid(content, needle, message) {
  if (content.includes(needle)) failures.push(message);
}
