import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const base = 'https://tv.neptunebusiness.com';
const output = path.resolve('test-results/viewport-fit-v55');
const failures = [];
const reports = [];
await fs.rm(output, { recursive: true, force: true });
await fs.mkdir(output, { recursive: true });

const browser = await chromium.launch({ headless: true, args: ['--disable-dev-shm-usage'] });

async function auditPage(page, label, selectors) {
  const result = await page.evaluate(async (expected) => {
    const scrolling = document.scrollingElement;
    const before = window.scrollY;
    window.scrollTo(0, 100000);
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const moved = window.scrollY;
    window.scrollTo(0, before);
    const items = expected.map((selector) => {
      const element = document.querySelector(selector);
      if (!element) return { selector, missing: true };
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return {
        selector,
        missing: false,
        top: Math.round(rect.top * 10) / 10,
        bottom: Math.round(rect.bottom * 10) / 10,
        height: Math.round(rect.height * 10) / 10,
        display: style.display,
        visibility: style.visibility,
      };
    });
    return {
      width: innerWidth,
      height: innerHeight,
      moved,
      scrollHeight: scrolling?.scrollHeight || 0,
      clientHeight: scrolling?.clientHeight || 0,
      bodyOverflowY: getComputedStyle(document.body).overflowY,
      items,
    };
  }, selectors);

  reports.push({ label, ...result });
  if (result.moved > 1) failures.push(`${label}: document encore défilable de ${result.moved}px.`);
  for (const item of result.items) {
    if (item.missing) {
      failures.push(`${label}: élément absent ${item.selector}.`);
      continue;
    }
    if (item.display === 'none' || item.visibility === 'hidden') failures.push(`${label}: élément essentiel masqué ${item.selector}.`);
    if (item.top < -2 || item.bottom > result.height + 2) failures.push(`${label}: ${item.selector} sort du viewport (${item.top} → ${item.bottom}, hauteur ${result.height}).`);
    if (item.height < 20) failures.push(`${label}: ${item.selector} est comprimé à ${item.height}px.`);
  }
  return result;
}

for (const viewport of [
  { name: 'desktop-1440x900', width: 1440, height: 900 },
  { name: 'laptop-1366x768', width: 1366, height: 768 },
]) {
  const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto(`${base}/espace-client/?viewport_audit=${viewport.name}`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.locator('#email').fill('contact@neptunebusiness.com');
  await page.locator('#sendCode').click();
  await page.waitForSelector('#dashboard:not([hidden])', { timeout: 30_000 });
  await page.waitForSelector('.referral-panel.referral-challenge', { timeout: 15_000 }).catch(() => {});
  await page.waitForTimeout(700);
  const dashboard = await auditPage(page, `${viewport.name}-dashboard`, ['.dashboard-heading', '.overview-grid', '.metric-grid', '.referral-panel', '.support-card']);
  const overview = dashboard.items.find((item) => item.selector === '.overview-grid');
  const minimumCoreHeight = viewport.height <= 820 ? 210 : 225;
  if (!overview?.missing && overview.height < minimumCoreHeight) {
    failures.push(`${viewport.name}-dashboard: zone projet/livraison trop petite (${overview.height}px, minimum ${minimumCoreHeight}px).`);
  }
  const referral = dashboard.items.find((item) => item.selector === '.referral-panel');
  if (!referral?.missing && referral.height > 60) failures.push(`${viewport.name}-dashboard: recommandation non compacte (${referral.height}px).`);
  await page.screenshot({ path: path.join(output, `${viewport.name}-dashboard.png`), fullPage: true });

  await page.goto(`${base}/espace-client/videos/?viewport_audit=${viewport.name}`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForSelector('#contentGrid .media-dashboard-section', { timeout: 30_000 });
  await page.waitForTimeout(700);
  await auditPage(page, `${viewport.name}-videos`, ['.library-intro', '.content-section', '.media-dashboard-section']);
  await page.screenshot({ path: path.join(output, `${viewport.name}-videos.png`), fullPage: true });

  await page.goto(`${base}/espace-client/calendrier/?viewport_audit=${viewport.name}`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForSelector('#calendarGrid .calendar-day', { timeout: 30_000 });
  await page.waitForTimeout(700);
  await auditPage(page, `${viewport.name}-calendar`, ['.calendar-intro', '.reuse-guide', '.calendar-section', '#calendarGrid']);
  await page.screenshot({ path: path.join(output, `${viewport.name}-calendar.png`), fullPage: true });

  if (errors.length) failures.push(`${viewport.name}: erreurs navigateur ${errors.join(' | ')}`);
  await context.close();
}

const studioContext = await browser.newContext({ viewport: { width: 1366, height: 768 }, reducedMotion: 'reduce' });
const studio = await studioContext.newPage();
await studio.route('**/*.js*', async (route) => route.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
await studio.goto('http://127.0.0.1:4173/studio/clients.html', { waitUntil: 'domcontentloaded', timeout: 30_000 });
await studio.addStyleTag({ path: 'neptune-tv-media-cloudflare/public/assets/neptune-viewport-fit-v55.css' });
await studio.evaluate(() => {
  const pipeline = document.querySelector('#pipeline');
  pipeline.innerHTML = Array.from({ length: 6 }, (_, columnIndex) => `
    <section class="column">
      <header class="column-head"><strong>Étape ${columnIndex + 1}</strong><span>${columnIndex + 2}</span></header>
      ${Array.from({ length: 5 }, (_, cardIndex) => `<article class="client-card"><strong>Client ${columnIndex + 1}.${cardIndex + 1}</strong><p>Action synthétique à vérifier.</p></article>`).join('')}
    </section>
  `).join('');
});
await auditPage(studio, 'studio-laptop-1366x768', ['.clients-topbar', '.clients-hero', '.controls', '.pipeline']);
const columnState = await studio.evaluate(() => [...document.querySelectorAll('.column')].map((column) => {
  const rect = column.getBoundingClientRect();
  return { top: rect.top, bottom: rect.bottom, height: rect.height, overflowY: getComputedStyle(column).overflowY };
}));
if (!columnState.length || columnState.some((column) => column.bottom > 770 || column.height < 180)) {
  failures.push(`studio: colonnes mal contraintes ${JSON.stringify(columnState)}`);
}
await studio.screenshot({ path: path.join(output, 'studio-laptop-1366x768.png'), fullPage: true });
await studioContext.close();

await browser.close();
await fs.writeFile(path.join(output, 'report.json'), JSON.stringify({ reports, failures }, null, 2));
if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('Viewport-fit v55/v56 validated on client dashboard, videos, calendar and Studio.');
