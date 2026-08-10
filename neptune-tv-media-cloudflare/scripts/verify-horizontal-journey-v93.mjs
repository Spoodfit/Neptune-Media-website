import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const html = read('public/studio/clients.html');
const js = read('public/studio/horizontal-journey-v93.js');
const css = read('public/studio/horizontal-journey-v93.css');
const v92 = read('public/studio/simple-journey-v92.js');

const checks = [];
const expect = (name, condition) => checks.push({ name, ok: Boolean(condition) });

expect('Studio loads horizontal journey after legacy client scripts', html.includes('/studio/horizontal-journey-v93.js?v=1'));
expect('v93 activates only on the v92 passage detail', js.includes("#clientDetail.v92-detail") && js.includes('cards.length !== 8'));
expect('v93 creates one horizontal tablist for the eight steps', js.includes('role="tablist"') && js.includes('data-v93-step'));
expect('v93 shows only the selected detailed step', js.includes('card.hidden = !selected') && css.includes('.v93-step-panel>.v92-step[hidden]'));
expect('desktop shows the eight stages in one horizontal row', css.includes('grid-template-columns:repeat(8,minmax(0,1fr))'));
expect('tablet and mobile use horizontal overflow instead of vertical stacking', css.includes('grid-auto-flow:column') && css.includes('overflow-x:auto') && css.includes('scroll-snap-type:x proximity'));
expect('mobile actions remain full-width and readable', css.includes('grid-template-columns:1fr!important') && css.includes('width:100%!important'));
expect('active/warning/done states remain visually distinct', css.includes('.v93-tab.is-current') && css.includes('.v93-tab.is-warning') && css.includes('.v93-tab.is-done'));
expect('keyboard navigation is supported', js.includes("event.key === 'ArrowRight'") && js.includes("event.key === 'ArrowLeft'") && js.includes("event.key === 'Home'") && js.includes("event.key === 'End'"));
expect('tabpanel is linked to its selected tab', js.includes("setAttribute('aria-labelledby'") && js.includes('v93-step-tab-'));
expect('reduced motion is respected', js.includes('prefers-reduced-motion: reduce') && css.includes('@media(prefers-reduced-motion:reduce)'));
expect('v92 button delegation is protected from duplicate registration', js.includes("listener?.name === 'onAction'") && js.includes('__neptuneHorizontalV93Patched'));
expect('client availability submitted in step 3 is surfaced in passage information', js.includes('enrichPassageInformation') && js.includes('Disponibilités client :'));
expect('v92 still defines all eight business steps', ['Format','Paiement','Date du passage','Préparation','Passage','Réception des vidéos','Montage','Terminé'].every((label) => v92.includes(`'${label}'`)));

const failed = checks.filter((check) => !check.ok);
for (const check of checks) console.log(`${check.ok ? '✓' : '✗'} ${check.name}`);
if (failed.length) {
  console.error(`Horizontal journey v93 verification failed: ${failed.length} check(s).`);
  process.exit(1);
}
console.log(`Horizontal client journey v93 verified: ${checks.length} checks.`);
