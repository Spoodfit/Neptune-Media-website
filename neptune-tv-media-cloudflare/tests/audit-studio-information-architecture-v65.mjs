import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const baseURL = process.env.STUDIO_BASE_URL || 'http://127.0.0.1:8787';
const outputDir = process.env.OUTPUT_DIR || 'test-results/studio-information-architecture-v65';
await mkdir(outputDir, { recursive: true });

const portal = {
  clients: [
    { id: 'client-1', email: 'lea@example.com', fullName: 'Léa Martin', company: 'Capital Conseil' },
    { id: 'client-2', email: 'marc@example.com', fullName: 'Marc Durand', company: 'Atelier Horizon' },
  ],
  orders: [
    order('order-1', 'lea@example.com', 'Léa Martin', 'Capital Conseil', 'Hors Norme', 'appointment_confirmed'),
    order('order-2', 'marc@example.com', 'Marc Durand', 'Atelier Horizon', 'Concept Libre', 'videos_pending'),
  ],
  supplierPayments: [],
  refundRequests: [],
  deletionRequests: [],
  finance: { revenueCents: 420000, payingClients: 2, supplierDueCents: 72000, estimatedMarginCents: 348000 },
};

const adminState = {
  user: { id: 'admin-1', email: 'contact@neptunebusiness.com', fullName: 'Neptune Media', role: 'admin' },
  programs: [{ id: 'program-1', name: 'Hors Norme', slug: 'hors-norme', description: 'Interview signature', displayOrder: 10, active: true }],
  episodes: [{ id: 'episode-1', title: 'Les secrets des clubs d’affaires', programId: 'program-1', displayOrder: 10, status: 'published', durationSeconds: 3200 }],
  ads: [],
  users: [{ id: 'admin-1', email: 'contact@neptunebusiness.com', fullName: 'Neptune Media', role: 'admin', active: true }],
  audit: [],
  settings: {},
  stats: {
    views: 1240,
    watchSeconds: 54000,
    uniqueViewers: 730,
    bookingClicks: 42,
    byEpisode: { 'episode-1': { views: 1240, watchSeconds: 54000, bookingClicks: 42 } },
    conversions: { count: 4, revenueCents: 420000 },
  },
};

const screens = [
  { id: 'clients', path: '/studio/clients', active: 'Parcours clients' },
  { id: 'production', path: '/studio/video-ai.html', active: 'Production vidéo' },
  { id: 'diffusion', path: '/studio/advanced.html#episodes', active: 'Diffusion' },
];
const viewports = [
  { id: 'desktop', width: 1440, height: 900 },
  { id: 'mobile', width: 390, height: 844 },
];
const expectedPrimary = ['Parcours clients', 'Production vidéo', 'Diffusion', 'Réglages'];

const browser = await chromium.launch({ headless: true });
const reports = [];
try {
  for (const viewport of viewports) {
    for (const screen of screens) {
      const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
      const page = await context.newPage();
      const browserErrors = [];
      page.on('pageerror', (error) => browserErrors.push(`pageerror:${error.message}`));
      page.on('console', (message) => {
        if (message.type() === 'error') browserErrors.push(`console:${message.text()}`);
      });
      await page.route('**/api/**', routeApi);
      await page.goto(`${baseURL}${screen.path}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForFunction(() => document.body.classList.contains('studio-information-architecture-v65'));
      if (screen.id === 'diffusion') await page.waitForSelector('#app:not([hidden])');
      await page.waitForTimeout(900);

      const metrics = await page.evaluate(() => {
        const visible = (element) => {
          if (!element || element.hidden) return false;
          const style = getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0' && rect.width > 0 && rect.height > 0;
        };
        const box = (selector) => {
          const element = document.querySelector(selector);
          if (!element) return null;
          const rect = element.getBoundingClientRect();
          return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height };
        };
        const allLinks = [...document.querySelectorAll('.neptune-studio-nav-link')];
        const links = allLinks.filter(visible);
        return {
          attachedPrimaryTexts: allLinks.map((link) => link.textContent.trim().replace(/\s+/gu, ' ')),
          primaryTexts: links.map((link) => link.textContent.trim().replace(/\s+/gu, ' ')),
          activeTexts: links.filter((link) => link.classList.contains('active')).map((link) => link.textContent.trim().replace(/\s+/gu, ' ')),
          sidebar: box('.neptune-studio-sidebar'),
          topbar: box('.neptune-studio-topbar'),
          nav: box('.neptune-studio-nav'),
          sidebarDisplay: getComputedStyle(document.querySelector('.neptune-studio-sidebar')).display,
          navDisplay: getComputedStyle(document.querySelector('.neptune-studio-nav')).display,
          navFontSize: Number.parseFloat(getComputedStyle(links[0]?.querySelector('strong')).fontSize || '0'),
          horizontalOverflow: document.documentElement.scrollWidth - innerWidth,
          oldSidebarTerms: [...document.querySelectorAll('.neptune-studio-sidebar *')]
            .filter(visible)
            .map((node) => node.textContent.trim())
            .filter((text) => ['Audience', 'Finances', 'Calendrier', 'Zone avancée', 'Administration avancée'].includes(text)),
          contextTexts: [...document.querySelectorAll('.studio-context-nav-v65 button')].filter(visible).map((button) => button.textContent.trim()),
        };
      });

      const screenshotName = `${screen.id}-${viewport.id}-${viewport.width}x${viewport.height}.png`;
      await page.screenshot({ path: path.join(outputDir, screenshotName), fullPage: true });
      reports.push({ screen, viewport, metrics, browserErrors });
      await writeFile(path.join(outputDir, 'report-progress.json'), JSON.stringify({ reports }, null, 2));

      assert(metrics.attachedPrimaryTexts.length === 4, `${screen.id}/${viewport.id}: liens attachés incorrects ${JSON.stringify(metrics.attachedPrimaryTexts)} · ${browserErrors.join(' | ')}`);
      if (viewport.width > 860) {
        assert(JSON.stringify(metrics.primaryTexts) === JSON.stringify(expectedPrimary), `${screen.id}/${viewport.id}: navigation principale invisible ou incorrecte ${JSON.stringify(metrics)} · ${browserErrors.join(' | ')}`);
      }
      assert(metrics.activeTexts.length === 1 && metrics.activeTexts[0] === screen.active, `${screen.id}/${viewport.id}: destination active incorrecte ${JSON.stringify(metrics.activeTexts)}`);
      assert(metrics.oldSidebarTerms.length === 0, `${screen.id}/${viewport.id}: anciens termes visibles ${metrics.oldSidebarTerms.join(', ')}`);
      if (viewport.width > 860) assert(metrics.navFontSize >= 12, `${screen.id}/${viewport.id}: texte de navigation trop petit (${metrics.navFontSize}px)`);
      assert(metrics.horizontalOverflow <= 2, `${screen.id}/${viewport.id}: débordement horizontal global de ${metrics.horizontalOverflow}px`);

      if (viewport.width > 860) {
        assert(metrics.sidebar && metrics.sidebar.width >= 228 && metrics.sidebar.width <= 244, `${screen.id}: largeur du menu ${metrics.sidebar?.width}px`);
        assert(metrics.sidebar && metrics.topbar && metrics.sidebar.right <= metrics.topbar.right, `${screen.id}: géométrie du shell incohérente`);
      } else {
        const toggle = page.locator('#neptuneStudioMenuToggle');
        await expectVisible(toggle, `${screen.id}: bouton mobile absent`);
        await toggle.click();
        await page.waitForFunction(() => document.body.classList.contains('studio-menu-open-v65'));
        await page.waitForTimeout(300);
        const drawer = await page.evaluate(() => {
          const rect = document.querySelector('.neptune-studio-sidebar').getBoundingClientRect();
          const visibleLinks = [...document.querySelectorAll('.neptune-studio-nav-link')].filter((element) => {
            const style = getComputedStyle(element);
            const box = element.getBoundingClientRect();
            return style.display !== 'none' && style.visibility !== 'hidden' && box.width > 0 && box.height > 0;
          }).map((element) => element.textContent.trim().replace(/\s+/gu, ' '));
          return { left: rect.left, width: rect.width, visibleLinks };
        });
        assert(drawer.left >= -1, `${screen.id}: tiroir mobile fermé après clic`);
        assert(drawer.width <= 305, `${screen.id}: tiroir mobile trop large (${drawer.width}px)`);
        assert(JSON.stringify(drawer.visibleLinks) === JSON.stringify(expectedPrimary), `${screen.id}/mobile: navigation du tiroir incorrecte ${JSON.stringify(drawer.visibleLinks)}`);
      }

      if (screen.id === 'diffusion') {
        assert(JSON.stringify(metrics.contextTexts) === JSON.stringify(['Programme', 'Formats', 'Publicités', 'Audience']), `diffusion/${viewport.id}: sous-navigation Diffusion incorrecte ${JSON.stringify(metrics.contextTexts)}`);
        await page.locator('[data-studio-route="settings"]').click();
        await page.waitForFunction(() => document.querySelector('#title')?.textContent.trim() === 'Réglages');
        const settingsTabs = await page.locator('.studio-context-nav-v65 button:visible').allTextContents();
        assert(JSON.stringify(settingsTabs.map((value) => value.trim())) === JSON.stringify(['Finances', 'Équipe', 'Journal', 'Réglages']), `settings/${viewport.id}: sous-navigation Réglages incorrecte`);
      }

      await context.close();
    }
  }
} finally {
  await browser.close();
}

await writeFile(path.join(outputDir, 'report.json'), JSON.stringify({ ok: true, reports }, null, 2));
console.log('Studio information architecture v65 visual audit passed on clients, production and diffusion/settings, desktop and mobile.');

async function routeApi(route) {
  const url = new URL(route.request().url());
  let body = { ok: true };
  if (url.pathname === '/api/auth/status') body = { authenticated: true, csrfToken: 'test-csrf', user: adminState.user };
  else if (url.pathname === '/api/admin/state') body = adminState;
  else if (url.pathname === '/api/admin/clients') body = portal;
  else if (url.pathname === '/api/admin/control-room') body = { actions: [], summary: {} };
  else if (url.pathname.startsWith('/api/admin/client-feedback')) body = { feedback: [] };
  else if (url.pathname.includes('video-ai')) body = { ok: true, jobs: [], clips: [], orders: portal.orders, clients: portal.clients, runtime: { mode: 'local' } };
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
}

function order(id, email, fullName, company, format, status) {
  const now = new Date();
  return {
    id,
    email,
    fullName,
    company,
    title: 'Passage Neptune Media',
    format,
    status,
    nextAction: 'Valider la prochaine étape',
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    appointmentAt: new Date(now.getTime() + 2 * 86400000).toISOString(),
    filmingAt: new Date(now.getTime() + 7 * 86400000).toISOString(),
    files: [],
    schedules: [],
    workflow: {
      currentLabel: status === 'videos_pending' ? 'Sources attendues' : 'Préparation réservée',
      nextAction: 'Vérifier le dossier',
      preparationStatus: status === 'videos_pending' ? 'completed' : 'pending',
      supplierStatus: status === 'videos_pending' ? 'confirmed' : 'pending',
      broadcastStatus: 'pending',
    },
  };
}

async function expectVisible(locator, message) {
  assert(await locator.isVisible(), message);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
