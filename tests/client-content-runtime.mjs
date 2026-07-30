import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const baseUrl = process.env.DASHBOARD_BASE_URL || 'http://127.0.0.1:4173';
const outputDir = path.resolve('test-results/client-content-runtime');
const errors = [];
let authenticated = false;

const files = [
  {
    id: 'file-long',
    driveFileId: 'drive-long',
    fileType: 'final',
    name: 'Emission_complete.mp4',
    sizeLabel: '1,2 Go',
    createdAt: '2026-07-30T08:00:00.000Z',
  },
  ...Array.from({ length: 6 }, (_, index) => ({
    id: `file-short-${index + 1}`,
    driveFileId: `drive-short-${index + 1}`,
    fileType: 'short',
    name: `Short_${index + 1}.mp4`,
    sizeLabel: `${40 + index} Mo`,
    createdAt: `2026-07-${String(30 - index).padStart(2, '0')}T08:00:00.000Z`,
  })),
];

const mockState = {
  client: { id: 'client-runtime', fullName: 'Léa Neptune', email: 'lea@example.com' },
  orders: [{
    id: 'order-runtime',
    title: 'Hors Norme — Passage 01',
    format: 'Hors Norme',
    status: 'delivered',
    createdAt: '2026-07-20T08:00:00.000Z',
    updatedAt: '2026-07-30T08:00:00.000Z',
    files,
  }],
};

await fs.rm(outputDir, { recursive: true, force: true });
await fs.mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({ headless: true, args: ['--disable-dev-shm-usage'] });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
const page = await context.newPage();
const pageErrors = [];
page.on('pageerror', (error) => pageErrors.push(error.message));
page.on('console', (message) => {
  if (message.type() === 'error' && !message.text().includes('Failed to load resource')) pageErrors.push(message.text());
});

await page.route('**/api/client/**', async (route) => {
  const pathname = new URL(route.request().url()).pathname;
  if (pathname === '/api/client/session') {
    await route.fulfill({
      status: authenticated ? 200 : 401,
      contentType: 'application/json',
      body: authenticated ? JSON.stringify(mockState) : '{"error":"unauthorized"}',
    });
    return;
  }
  await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
});
await page.route('**/api/public/connexio-availability', async (route) => {
  await route.fulfill({ status: 200, contentType: 'application/json', body: '{"available":false,"event":null}' });
});
await page.route('https://drive.google.com/**', async (route) => {
  await route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>Drive preview</title>' });
});

const response = await page.goto(`${baseUrl}/espace-client/?content_runtime_test=${Date.now()}`, {
  waitUntil: 'domcontentloaded',
  timeout: 60_000,
});
if (!response || response.status() >= 400) throw new Error(`HTTP ${response?.status() || 0}`);
await page.waitForSelector('#auth:not([hidden])', { timeout: 10_000 });

await page.addScriptTag({ url: `${baseUrl}/assets/media-dialog-safety-v50.js?v=1`, type: 'module' });
await page.addScriptTag({ url: `${baseUrl}/espace-client/content-snapshot-v48.js?v=3`, type: 'module' });
await page.waitForTimeout(150);
if (await page.locator('#clientContentSnapshot').count()) errors.push('Le résumé contenu apparaît avant authentification.');

authenticated = true;
await page.evaluate(() => {
  document.querySelector('#publicHeader').hidden = true;
  document.querySelector('#auth').hidden = true;
  document.querySelector('#dashboard').hidden = false;
});

await page.waitForSelector('#clientContentSnapshot', { timeout: 10_000 });
const snapshot = await page.evaluate(() => ({
  tiles: document.querySelectorAll('#clientContentSnapshot [data-snapshot-file]').length,
  shortTiles: document.querySelectorAll('#clientContentSnapshot .snapshot-media--short').length,
  hasMore: /Voir les 6 shorts/u.test(document.querySelector('#clientContentSnapshot')?.innerText || ''),
  horizontalOverflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth,
}));
if (snapshot.tiles !== 5) errors.push(`${snapshot.tiles} aperçus affichés au lieu de 5.`);
if (snapshot.shortTiles !== 4) errors.push(`${snapshot.shortTiles} shorts affichés au lieu de 4.`);
if (!snapshot.hasMore) errors.push('Le lien vers les six shorts est absent.');
if (snapshot.horizontalOverflow > 3) errors.push(`Débordement horizontal de ${snapshot.horizontalOverflow}px.`);

await page.locator('#clientContentSnapshot .snapshot-media--short').first().click();
await page.waitForFunction(() => document.querySelector('[data-snapshot-preview]')?.open === true);
await page.keyboard.press('Escape');
await page.waitForFunction(() => document.querySelector('[data-snapshot-preview]')?.open === false);
const stopped = await page.evaluate(() => {
  const frame = document.querySelector('[data-snapshot-preview] iframe');
  return !frame || frame.getAttribute('src') === 'about:blank';
});
if (!stopped) errors.push('Le lecteur Drive continue après fermeture par Échap.');

await page.screenshot({ path: path.join(outputDir, 'authenticated-snapshot.png'), fullPage: true });
await fs.writeFile(path.join(outputDir, 'report.json'), JSON.stringify({ snapshot, stopped, pageErrors, errors }, null, 2));

if (pageErrors.length) errors.push(`Erreurs navigateur : ${JSON.stringify(pageErrors)}`);
await context.close();
await browser.close();

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log('Résumé vidéo client validé après transition d’authentification.');
