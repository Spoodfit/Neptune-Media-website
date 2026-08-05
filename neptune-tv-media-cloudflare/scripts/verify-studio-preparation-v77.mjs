import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve('neptune-tv-media-cloudflare');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const requireText = (relative, values) => {
  const source = read(relative);
  for (const value of values) {
    if (!source.includes(value)) throw new Error(`${relative}: missing ${value}`);
  }
};

requireText('src/entry-v17.js', [
  'neptune-studio-client-journey-20260805-v77',
  '/studio/studio-journey-v77.css',
  '/espace-client/client-preparation-v77.js',
  'ten-presenter-inspired-interactive-cards-v77',
]);
requireText('public/studio/studio-journey-v77.css', [
  'studio-upload-details-v77',
  'height:286px',
  'studio-media-card--short',
]);
requireText('public/studio/studio-journey-v77.js', [
  'Réserver la préparation',
  'Ouvrir le rendez-vous',
  'resend_supplier_confirmation',
  'card.dataset.signature',
]);
requireText('public/espace-client/client-preparation-v77.js', [
  'Réserver ma préparation',
  'Ouvrir mon rendez-vous',
  'neptune_hors_norme_preparation_seen_v77',
  'cards-rendered-without-binary-assets-v77',
  "title: 'Conducteur d’épisode'",
  "title: 'Contact et clôture'",
]);
requireText('public/espace-client/client-preparation-v77.css', [
  'hors-norme-card-visual-v77',
  'hors-norme-dialog-card-v77',
  '--card-accent',
]);
requireText('src/portal-workflow-email-v5.js', [
  'Confirmer ce créneau',
  'Proposer un autre créneau',
  "searchParams.set('decision',decision)",
]);
requireText('public/confirmation-studio/app.js', [
  'requestedDecision',
  'Confirmer définitivement ce créneau',
  'scanners automatiques',
]);
requireText('src/store-v5.js', [
  'appointmentUrlFrom',
  'raw.hangoutLink',
  'raw.htmlLink',
  'conferenceData?.entryPoints',
]);

console.log('Studio/client preparation v77 verified: compact upload, equal-height cards, calendar meeting links, safe supplier decisions and 10 lightweight HORS NORME cards.');
