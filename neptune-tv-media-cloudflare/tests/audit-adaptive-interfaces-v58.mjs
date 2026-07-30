import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const liveBase = 'https://tv.neptunebusiness.com';
const localBase = 'http://127.0.0.1:4173';
const adaptiveCss = 'neptune-tv-media-cloudflare/public/assets/neptune-adaptive-interfaces-v58.css';
const adaptivePrecisionCss = 'neptune-tv-media-cloudflare/public/assets/neptune-adaptive-interfaces-v58-1.css';
const output = path.resolve('test-results/adaptive-interfaces-v58');
const failures = [];
const reports = [];

await fs.rm(output, { recursive: true, force: true });
await fs.mkdir(output, { recursive: true });

const browser = await chromium.launch({ headless: true, args: ['--disable-dev-shm-usage'] });

function fail(message) {
  failures.push(message);
}

function intersects(a, b, tolerance = 2) {
  return a.left < b.right - tolerance && a.right > b.left + tolerance && a.top < b.bottom - tolerance && a.bottom > b.top + tolerance;
}

async function measure(page, label, selectors) {
  const result = await page.evaluate((expected) => {
    const scrolling = document.scrollingElement;
    return {
      viewport: { width: innerWidth, height: innerHeight },
      scroll: {
        width: scrolling?.scrollWidth || 0,
        height: scrolling?.scrollHeight || 0,
        clientWidth: scrolling?.clientWidth || 0,
        clientHeight: scrolling?.clientHeight || 0,
      },
      items: expected.map((selector) => {
        const element = document.querySelector(selector);
        if (!element) return { selector, missing: true };
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return {
          selector,
          missing: false,
          left: Math.round(rect.left * 10) / 10,
          right: Math.round(rect.right * 10) / 10,
          top: Math.round(rect.top * 10) / 10,
          bottom: Math.round(rect.bottom * 10) / 10,
          width: Math.round(rect.width * 10) / 10,
          height: Math.round(rect.height * 10) / 10,
          display: style.display,
          visibility: style.visibility,
          opacity: Number(style.opacity || 1),
          overflowX: style.overflowX,
          overflowY: style.overflowY,
        };
      }),
    };
  }, selectors);
  reports.push({ label, ...result });
  if (result.scroll.width > result.scroll.clientWidth + 3) fail(`${label}: débordement horizontal du document (${result.scroll.width}/${result.scroll.clientWidth}).`);
  for (const item of result.items) {
    if (item.missing) fail(`${label}: élément absent ${item.selector}.`);
    else if (item.display === 'none' || item.visibility === 'hidden' || item.opacity < .1) fail(`${label}: élément essentiel masqué ${item.selector}.`);
  }
  return result;
}

async function auditClient(viewport) {
  const context = await browser.newContext({ viewport, reducedMotion: 'reduce' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto(`${liveBase}/espace-client/?adaptive_audit=${viewport.width}x${viewport.height}`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForSelector('#auth:not([hidden])', { timeout: 20_000 });
  const auth = await measure(page, `auth-${viewport.width}x${viewport.height}`, ['.auth-copy', '.auth-copy h1', '.access-card']);
  const authTitle = auth.items.find((item) => item.selector === '.auth-copy h1');
  const authCard = auth.items.find((item) => item.selector === '.access-card');
  if (authCard && !authCard.missing && (authCard.top < -2 || authCard.bottom > viewport.height + 2)) fail(`auth-${viewport.width}x${viewport.height}: carte de connexion coupée.`);
  if (authTitle && authCard && !authTitle.missing && !authCard.missing && intersects(authTitle, authCard, 8)) fail(`auth-${viewport.width}x${viewport.height}: titre et carte de connexion se chevauchent.`);
  await page.screenshot({ path: path.join(output, `auth-${viewport.width}x${viewport.height}.png`), fullPage: true });

  await page.locator('#email').fill('contact@neptunebusiness.com');
  await page.locator('#sendCode').click();
  await page.waitForSelector('#dashboard:not([hidden])', { timeout: 30_000 });
  await page.waitForTimeout(900);
  const dashboard = await measure(page, `dashboard-${viewport.width}x${viewport.height}`, ['.dashboard-heading', '.overview-grid', '.production-card', '.show-card', '.metric-grid', '.dashboard-content-grid', '.referral-share-primary']);
  const overview = dashboard.items.find((item) => item.selector === '.overview-grid');
  const production = dashboard.items.find((item) => item.selector === '.production-card');
  const metrics = dashboard.items.find((item) => item.selector === '.metric-grid');
  const referralAction = dashboard.items.find((item) => item.selector === '.referral-share-primary');
  if (overview && !overview.missing && overview.height < 265) fail(`dashboard-${viewport.width}x${viewport.height}: vue projet trop comprimée (${overview.height}px).`);
  if (production && !production.missing && production.width < 480) fail(`dashboard-${viewport.width}x${viewport.height}: projet en cours trop étroit (${production.width}px).`);
  if (metrics && !metrics.missing && metrics.height < 62) fail(`dashboard-${viewport.width}x${viewport.height}: accès principaux trop comprimés (${metrics.height}px).`);
  if (referralAction && !referralAction.missing && referralAction.width < 120) fail(`dashboard-${viewport.width}x${viewport.height}: action de recommandation comprimée (${referralAction.width}px).`);
  if (dashboard.scroll.height > dashboard.scroll.clientHeight * 1.45) fail(`dashboard-${viewport.width}x${viewport.height}: page encore trop longue (${dashboard.scroll.height}px).`);
  await page.screenshot({ path: path.join(output, `dashboard-${viewport.width}x${viewport.height}.png`), fullPage: true });

  await page.goto(`${liveBase}/espace-client/calendrier/?adaptive_audit=${viewport.width}x${viewport.height}`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForSelector('#calendarGrid .calendar-day', { timeout: 30_000 });
  await page.waitForTimeout(700);
  const calendar = await measure(page, `calendar-${viewport.width}x${viewport.height}`, ['.calendar-intro', '.reuse-guide', '.calendar-section', '#calendarGrid', '.calendar-day']);
  const calendarDay = calendar.items.find((item) => item.selector === '.calendar-day');
  if (calendarDay && !calendarDay.missing && calendarDay.height < 72) fail(`calendar-${viewport.width}x${viewport.height}: journées trop comprimées (${calendarDay.height}px).`);
  if (calendar.scroll.height > calendar.scroll.clientHeight * 1.45) fail(`calendar-${viewport.width}x${viewport.height}: page encore trop longue (${calendar.scroll.height}px).`);
  await page.screenshot({ path: path.join(output, `calendar-${viewport.width}x${viewport.height}.png`), fullPage: true });

  if (errors.length) fail(`client-${viewport.width}x${viewport.height}: erreurs navigateur ${errors.join(' | ')}`);
  await context.close();
}

async function addAdaptiveStyles(page) {
  await page.addStyleTag({ path: adaptiveCss });
  await page.addStyleTag({ path: adaptivePrecisionCss });
}

async function auditStudioClients(viewport) {
  const context = await browser.newContext({ viewport, reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.route('**/*.js*', async (route) => route.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
  await page.goto(`${localBase}/studio/clients.html`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await addAdaptiveStyles(page);
  await page.evaluate(() => {
    const pipeline = document.querySelector('#pipeline');
    pipeline.innerHTML = Array.from({ length: 6 }, (_, columnIndex) => `
      <section class="column">
        <header class="column-head"><strong>Étape ${columnIndex + 1}</strong><span>${columnIndex + 2}</span></header>
        <div class="column-list">${Array.from({ length: 6 }, (_, cardIndex) => `<article class="client-card"><div class="card-top"><div><strong class="client-name">Client ${columnIndex + 1}.${cardIndex + 1}</strong><small class="client-company">Entreprise Neptune</small></div><span class="format">Hors Norme</span></div><h3>Action synthétique à vérifier</h3><p>Une décision claire, sans informations secondaires inutiles.</p></article>`).join('')}</div>
      </section>`).join('');
  });
  await page.waitForTimeout(100);
  const report = await measure(page, `studio-clients-${viewport.width}x${viewport.height}`, ['.studio-sidebar', '.clients-hero', '.controls', '.pipeline', '.column']);
  const sidebar = report.items.find((item) => item.selector === '.studio-sidebar');
  const hero = report.items.find((item) => item.selector === '.clients-hero');
  const column = report.items.find((item) => item.selector === '.column');
  if (sidebar && !sidebar.missing && (sidebar.width < 80 || sidebar.width > 250)) fail(`studio-clients-${viewport.width}x${viewport.height}: navigation latérale mal dimensionnée (${sidebar.width}px).`);
  if (hero && !hero.missing && (hero.height < 108 || hero.height > 215)) fail(`studio-clients-${viewport.width}x${viewport.height}: synthèse principale mal dimensionnée (${hero.height}px).`);
  if (column && !column.missing && column.width < 250) fail(`studio-clients-${viewport.width}x${viewport.height}: colonnes illisibles (${column.width}px).`);
  await page.screenshot({ path: path.join(output, `studio-clients-${viewport.width}x${viewport.height}.png`), fullPage: true });
  await context.close();
}

async function auditStudioAdvanced(viewport) {
  const context = await browser.newContext({ viewport, reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.route('**/*.js*', async (route) => route.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
  await page.goto(`${localBase}/studio/advanced.html`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await addAdaptiveStyles(page);
  const login = await measure(page, `studio-login-${viewport.width}x${viewport.height}`, ['.login-card']);
  const loginCard = login.items[0];
  if (loginCard && !loginCard.missing && (loginCard.top < -2 || loginCard.bottom > viewport.height + 2)) fail(`studio-login-${viewport.width}x${viewport.height}: connexion coupée.`);
  await page.screenshot({ path: path.join(output, `studio-login-${viewport.width}x${viewport.height}.png`), fullPage: true });

  await page.evaluate(() => {
    document.querySelector('#auth').hidden = true;
    document.querySelector('#app').hidden = false;
    document.querySelector('#content').innerHTML = `
      <div class="page-intro"><div><p class="eyebrow">CE QUI COMPTE MAINTENANT</p><h2>Trois décisions à traiter.</h2><p>La hiérarchie reste claire sans écraser les cartes opérationnelles.</p></div><a class="primary" href="#">Voir les clients</a></div>
      <div class="cards">${Array.from({ length: 4 }, (_, index) => `<article class="metric"><strong>${index + 2}</strong><span>INDICATEUR ${index + 1}</span></article>`).join('')}</div>
      <section class="section"><div class="section-head"><div><h2>À faire aujourd’hui</h2><p>Une action principale par sujet.</p></div></div><div class="task-grid">${Array.from({ length: 3 }, (_, index) => `<article class="task"><div class="task__top"><div><div class="task__client">Client ${index + 1}</div><h3>Décision à valider</h3></div></div><p>Résumé opérationnel lisible.</p><div class="task-actions"><button class="primary">Valider</button><button class="secondary">Dossier</button></div></article>`).join('')}</div></section>`;
  });
  await page.waitForTimeout(100);
  const app = await measure(page, `studio-advanced-${viewport.width}x${viewport.height}`, ['.sidebar', '.topbar', '.page-intro', '.cards', '.task-grid', '.sidebar-bottom']);
  const pageIntro = app.items.find((item) => item.selector === '.page-intro');
  if (pageIntro && !pageIntro.missing && (pageIntro.height < 120 || pageIntro.height > 200)) fail(`studio-advanced-${viewport.width}x${viewport.height}: introduction mal dimensionnée (${pageIntro.height}px).`);
  const navigationClearance = await page.evaluate(() => {
    const visibleButtons = [...document.querySelectorAll('.sidebar .nav-btn')].filter((item) => {
      const style = getComputedStyle(item);
      return style.display !== 'none' && style.visibility !== 'hidden' && item.getBoundingClientRect().height > 0;
    });
    const last = visibleButtons.at(-1)?.getBoundingClientRect();
    const account = document.querySelector('.sidebar-bottom')?.getBoundingClientRect();
    return last && account ? { lastBottom: last.bottom, accountTop: account.top } : null;
  });
  if (navigationClearance && navigationClearance.lastBottom > navigationClearance.accountTop - 6) fail(`studio-advanced-${viewport.width}x${viewport.height}: navigation et carte compte se chevauchent (${navigationClearance.lastBottom}/${navigationClearance.accountTop}).`);
  await page.screenshot({ path: path.join(output, `studio-advanced-${viewport.width}x${viewport.height}.png`), fullPage: true });
  await context.close();
}

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 1366, height: 768 },
]) {
  await auditClient(viewport);
  await auditStudioClients(viewport);
  await auditStudioAdvanced(viewport);
}

await browser.close();
await fs.writeFile(path.join(output, 'report.json'), JSON.stringify({ reports, failures }, null, 2));

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}

console.log('Adaptive interfaces v58.1 validated: client auth/dashboard/calendar and Studio clients/advanced.');
