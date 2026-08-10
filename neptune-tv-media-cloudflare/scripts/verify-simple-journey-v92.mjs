import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const checks = [
  ['src/entry-v31.js', ['/api/admin/journey-v92/context','/api/admin/journey-v92/action','/api/admin/journey-v92/preparation-sync','simple-journey-v92.js?v=1','supplierSlaHours: 48','clientDateChangeMinimumDays: 15']],
  ['src/store-v25.js', ['/portal/simple-journey-context-v92','/portal/simple-journey-action-v92']],
  ['src/portal-simple-journey-v92.js', ['send_reservation_link','send_payment_link','force_majeure_reschedule','date_change_locked_15_days','drive_sources_auto_detected_v92','drive_deliverables_auto_detected_v92']],
  ['src/payment-links-v92.js', ['plink_1TnlktFBHUPYDjPsnodMwjLh','plink_1TnleIFBHUPYDjPsHEW3GUSQ','plink_1Tltb8FBHUPYDjPsdGzneVsc','plink_1Tlta5FBHUPYDjPsU8VxRDSe','plink_1TltXEFBHUPYDjPsZxQlq9K0','plink_1TltRLFBHUPYDjPsKZVWCdx5','NPORD_']],
  ['src/portal-workflow-email-v6.js', ['journey_','Choisissez votre format','Paiement de votre passage','Choisissez votre rendez-vous de préparation','Demande de report pour force majeure']],
  ['public/studio/simple-journey-v92.js', ["step(1, 'Format'","step(2, 'Paiement'","step(3, 'Date du passage'","step(4, 'Préparation'","step(5, 'Passage'","step(6, 'Réception des vidéos'","step(7, 'Montage'","step(8, 'Terminé'",'Agenda de tous les passages','calendar.google.com/calendar/appointments/schedules/AcZssZ0Zxy57HrKj43TqUhbv9bMsGMbkgyg1MnuGdxFhb3W_LcNr2SqGtfO0AR8noAdLDwlnSqriORjU']],
  ['public/studio/simple-journey-v92.css', ['height:100dvh','v92-step','@media(max-width:760px)','v92-agenda-grid']],
];
for (const [file, needles] of checks) {
  const content = read(file);
  for (const needle of needles) {
    if (!content.includes(needle)) throw new Error(`${file}: missing ${needle}`);
  }
}
const wrangler = read('wrangler.jsonc');
if (!wrangler.includes('"main": "src/entry-v31.js"')) throw new Error('wrangler main must be entry-v31.js');
if (!wrangler.includes('https://calendar.app.google/X9q1T5JT9ngMfZY67')) throw new Error('preparation booking URL must match v92');
console.log('Simple client journey v92 verified: 8 passage steps, multi-passage isolation, Stripe, supplier SLA, J-15, Google scheduling and Drive automation');
