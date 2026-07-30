import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const baseURL = process.env.LOCAL_BASE_URL || 'http://127.0.0.1:4173';
const outputDir = process.env.OUTPUT_DIR || 'test-results/studio-clients-v63';
await mkdir(outputDir, { recursive: true });

const fixtures = {
  clients: [
    { id: 'client-1', email: 'lea@example.com', fullName: 'Léa Martin', company: 'Capital Conseil' },
    { id: 'client-2', email: 'marc@example.com', fullName: 'Marc Durand', company: 'Atelier Horizon' },
    { id: 'client-3', email: 'sarah@example.com', fullName: 'Sarah Petit', company: 'Maison Nova' },
  ],
  orders: [
    order('order-1', 'lea@example.com', 'Léa Martin', 'Capital Conseil', 'Hors Norme', 'appointment_confirmed'),
    order('order-2', 'marc@example.com', 'Marc Durand', 'Atelier Horizon', 'Concept Libre', 'preparation_complete'),
    order('order-3', 'sarah@example.com', 'Sarah Petit', 'Maison Nova', 'Hors Norme', 'videos_pending'),
    order('order-4', 'lea@example.com', 'Léa Martin', 'Capital Conseil', 'Hors Norme', 'editing'),
    order('order-5', 'marc@example.com', 'Marc Durand', 'Atelier Horizon', 'Concept Libre', 'delivered'),
  ],
  supplierPayments: [],
  refundRequests: [],
  deletionRequests: [],
  finance: {},
};

const viewports = [
  { name: 'wide', width: 1860, height: 780 },
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'laptop', width: 1366, height: 768 },
  { name: 'tablet', width: 1024, height: 768 },
  { name: 'mobile', width: 390, height: 844 },
];

const browser = await chromium.launch({ headless: true });
const results = [];

try {
  for (const viewport of viewports) {
    const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, reducedMotion: 'no-preference' });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(`pageerror:${error.message}`));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(`console:${message.text()}`);
    });

    await page.route('**/api/auth/status', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ authenticated: true, csrfToken: 'test-csrf' }) }));
    await page.route('**/api/admin/clients', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fixtures) }));
    await page.route('**/api/admin/client-feedback**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ feedback: [] }) }));
    await page.route('**/api/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));

    await page.goto(`${baseURL}/studio/clients.html`, { waitUntil: 'networkidle' });
    await page.waitForSelector('.column.is-visible');
    await page.waitForTimeout(150);

    const metrics = await page.evaluate(() => {
      const rect = (selector) => document.querySelector(selector)?.getBoundingClientRect() || null;
      const sidebar = rect('.studio-sidebar');
      const nav = rect('.studio-nav');
      const account = rect('.studio-account');
      const main = rect('.clients-main');
      const topbar = rect('.clients-topbar');
      const controls = rect('.controls');
      const columns = [...document.querySelectorAll('.column')].map((element) => element.getBoundingClientRect());
      const cards = [...document.querySelectorAll('.client-card')].map((element) => element.getBoundingClientRect());
      return {
        bodyWidth: document.documentElement.scrollWidth,
        viewportWidth: window.innerWidth,
        sidebar,
        nav,
        account,
        main,
        topbar,
        controls,
        columns: columns.map(({ width, height, left, right }) => ({ width, height, left, right })),
        cards: cards.map(({ width, height }) => ({ width, height })),
        menuToggleDisplay: getComputedStyle(document.querySelector('#studioMenuToggle')).display,
        activeNavigationCount: document.querySelectorAll('.studio-nav-link.active,[aria-current="page"].studio-nav-link').length,
        reducedMotionRulePresent: [...document.styleSheets].some((sheet) => {
          try { return [...sheet.cssRules].some((rule) => rule.cssText.includes('prefers-reduced-motion')); } catch { return false; }
        }),
      };
    });

    assert(metrics.bodyWidth <= metrics.viewportWidth + 1, `${viewport.name}: document horizontal overflow ${metrics.bodyWidth}/${metrics.viewportWidth}`);
    assert(metrics.main && metrics.main.left >= 0 && metrics.main.right <= metrics.viewportWidth + 1, `${viewport.name}: main content leaves viewport`);
    assert(metrics.topbar && metrics.topbar.height >= 60, `${viewport.name}: topbar too small`);
    assert(metrics.controls && metrics.controls.width > 250, `${viewport.name}: controls collapsed`);
    assert(metrics.columns.length === 6, `${viewport.name}: expected six workflow columns`);
    assert(metrics.columns.every((column) => column.width >= 250), `${viewport.name}: workflow column below 250px`);
    assert(metrics.cards.every((card) => card.width >= 220), `${viewport.name}: client card below 220px`);
    assert(metrics.activeNavigationCount >= 1, `${viewport.name}: no active navigation state`);
    assert(metrics.reducedMotionRulePresent, `${viewport.name}: reduced motion rule missing`);

    if (viewport.width > 900) {
      assert(metrics.sidebar && metrics.sidebar.left >= 0 && metrics.sidebar.width >= 200, `${viewport.name}: desktop sidebar invalid`);
      assert(metrics.nav && metrics.account && metrics.nav.bottom <= metrics.account.top + 1, `${viewport.name}: navigation overlaps account card`);
      assert(metrics.menuToggleDisplay === 'none', `${viewport.name}: mobile menu toggle visible on desktop`);
    } else {
      assert(metrics.menuToggleDisplay === 'grid', `${viewport.name}: mobile menu toggle hidden`);
      const toggle = page.locator('#studioMenuToggle');
      await toggle.click();
      await page.waitForTimeout(80);
      assert(await toggle.getAttribute('aria-expanded') === 'true', `${viewport.name}: menu did not open`);
      assert(await page.locator('body').evaluate((body) => body.classList.contains('is-studio-menu-open')), `${viewport.name}: open menu class missing`);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(80);
      assert(await toggle.getAttribute('aria-expanded') === 'false', `${viewport.name}: Escape did not close menu`);
    }

    const refresh = page.locator('#refresh');
    await refresh.click();
    assert(await refresh.getAttribute('aria-busy') === 'true', `${viewport.name}: refresh progress not exposed`);

    const before = await page.locator('.studio-nav-link.active').first().boundingBox();
    await page.locator('.studio-nav-link.active').first().hover();
    const after = await page.locator('.studio-nav-link.active').first().boundingBox();
    if (before && after) assert(Math.abs(before.x - after.x) < 1, `${viewport.name}: menu item shifts horizontally on hover`);

    await page.screenshot({ path: path.join(outputDir, `${viewport.name}-${viewport.width}x${viewport.height}.png`), fullPage: true });
    results.push({ viewport, metrics, errors });
    await context.close();
  }
} finally {
  await browser.close();
}

const blockingErrors = results.flatMap((result) => result.errors.filter((error) => !error.includes('favicon')));
assert(blockingErrors.length === 0, `Browser errors: ${blockingErrors.join(' | ')}`);
await writeFile(path.join(outputDir, 'report.json'), JSON.stringify({ ok: true, results }, null, 2));
console.log(`Studio clients v63 visual audit passed for ${viewports.length} viewports.`);

function order(id, email, fullName, company, format, status) {
  const now = new Date();
  const filmingAt = new Date(now.getTime() + 5 * 86400000).toISOString();
  return {
    id,
    email,
    fullName,
    company,
    title: 'Passage Neptune Media',
    format,
    status,
    nextAction: status === 'videos_pending' ? 'Vérifier la réception des vidéos' : 'Valider la prochaine étape',
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    filmingAt,
    files: [],
    schedules: [],
    steps: [
      { label: 'Réservation', state: 'done', completedAt: now.toISOString() },
      { label: 'Préparation', state: 'current' },
      { label: 'Passage studio', state: 'upcoming' },
      { label: 'Livraison', state: 'upcoming' },
    ],
  };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
