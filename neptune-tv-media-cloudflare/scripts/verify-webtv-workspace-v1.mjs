import { readFile } from 'node:fs/promises';

const read=(path)=>readFile(new URL(`../${path}`,import.meta.url),'utf8');
const [html,workspace,css,navCompat]=await Promise.all([
  read('public/studio/webtv.html'),
  read('public/studio/webtv-workspace-v1.js'),
  read('public/studio/webtv-workspace-v1.css'),
  read('public/studio/webtv-nav-compat-v1.js'),
]);

const failures=[];
const expect=(condition,message)=>{if(!condition)failures.push(message);};

expect(html.includes('/studio/webtv-workspace-v1.css?v=1'),'la feuille UX WebTV n’est pas chargée');
expect(html.includes('/studio/webtv-workspace-v1.js?v=1'),'le workspace UX WebTV n’est pas chargé');
for(const marker of ["['antenna','Antenne','Direct et état']","['program','Programme','Grille de diffusion']","['settings','Configuration','YouTube et sécurité']",'data-webtv-section-panel','sessionStorage.setItem','history.replaceState','MutationObserver']){
  expect(workspace.includes(marker),`workspace WebTV incomplet : ${marker}`);
}
expect(workspace.includes("hero?.remove()")&&workspace.includes("layout?.remove()"),'les anciens blocs verticaux ne sont pas neutralisés après réorganisation');
expect(workspace.includes('antennaGrid.append(monitor)')&&workspace.includes('programSection.body.append(program)')&&workspace.includes("sideStack.classList.add('webtv-settings-grid')"),'les contenus métier ne sont pas répartis entre les trois sections');
expect(css.includes('.webtv-section[hidden]{display:none!important}'),'les panneaux inactifs risquent de rester visibles');
expect(css.includes('grid-template-columns:minmax(520px,760px) minmax(260px,320px)'),'le tableau Antenne n’est pas compact sur desktop');
expect(css.includes('width:min(100%,640px)')&&css.includes('max-height:360px'),'le retour live risque à nouveau d’occuper tout l’écran');
expect(css.includes('position:fixed!important')&&css.includes('margin-left:236px!important'),'la sidebar desktop n’est pas stabilisée pendant le scroll');
expect(css.includes('.webtv-settings-grid')&&css.includes('grid-template-columns:repeat(3,minmax(0,1fr))'),'la configuration n’est pas structurée en grille dédiée');
expect(css.includes('button.has-live::after')&&css.includes('button.needs-apply::after'),'les onglets ne remontent pas l’état live ou les changements à appliquer');
expect(navCompat.includes("document.querySelectorAll('.studio-context-nav-v65')"),'l’ancien sous-menu Diffusion dupliqué n’est pas neutralisé');

if(failures.length){
  console.error(failures.map(failure=>`- ${failure}`).join('\n'));
  process.exit(1);
}
console.log('WebTV workspace v1 validé : Antenne / Programme / Configuration séparés, live compact, sidebar fixe, états visibles et ancien sous-menu neutralisé.');
