import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const baseURL = process.env.STUDIO_BASE_URL || 'http://127.0.0.1:8787';
const outputDir = process.env.OUTPUT_DIR || 'test-results/studio-information-architecture-v105';
await mkdir(outputDir, { recursive: true });

const portal = {
  clients: [
    { id: 'client-1', email: 'lea@example.com', fullName: 'Léa Martin', company: 'Capital Conseil', active: true },
    { id: 'client-2', email: 'marc@example.com', fullName: 'Marc Durand', company: 'Atelier Horizon', active: true },
  ],
  orders: [
    order('order-1', 'client-1', 'lea@example.com', 'Léa Martin', 'Capital Conseil', 'Hors Norme', 'appointment_confirmed'),
    order('order-2', 'client-2', 'marc@example.com', 'Marc Durand', 'Atelier Horizon', 'Concept Libre', 'videos_pending'),
  ],
  supplierPayments: [], refundRequests: [], deletionRequests: [],
  finance: { revenueCents: 420000, payingClients: 2, supplierDueCents: 72000, estimatedMarginCents: 348000 },
};

const adminState = {
  user: { id: 'admin-1', email: 'contact@neptunebusiness.com', fullName: 'Neptune Media', role: 'admin' },
  programs: [{ id: 'program-1', name: 'Hors Norme', slug: 'hors-norme', description: 'Interview signature', displayOrder: 10, active: true }],
  episodes: [{ id: 'episode-1', title: 'Les secrets des clubs d’affaires', programId: 'program-1', displayOrder: 10, status: 'published', durationSeconds: 3200, mediaUrl: '/media/test-episode.mp4' }],
  ads: [{ id: 'ad-1', title: 'Partenaire Neptune', durationSeconds: 30, mediaUrl: '/media/test-ad.mp4' }],
  users: [{ id: 'admin-1', email: 'contact@neptunebusiness.com', fullName: 'Neptune Media', role: 'admin', active: true }],
  audit: [], settings: {},
  stats: { views: 1240, watchSeconds: 54000, uniqueViewers: 730, bookingClicks: 42, byEpisode: {}, conversions: { count: 4, revenueCents: 420000 } },
};

const webTvState = {
  enabled: false,
  mode: 'loop',
  output: { provider: 'youtube', protocol: 'rtmps', configured: true },
  playlist: [],
  fallback: { title: 'Neptune Media — La suite arrive dans un instant', mediaUrl: '' },
  encoder: { status: 'not_connected', lastHeartbeatAt: null, lastError: null, currentItem: null },
};

const catalogContext = { ok: true, formats: [], suppliers: [], cities: [], families: [], configurationVisuals: [], offers: [] };
const publishedCatalog = { ok: true, formats: [], cities: [], offers: [], suppliers: [], pricing: {} };

const screens = [
  { id: 'clients', path: '/studio/clients', active: 'Parcours clients', context: [] },
  { id: 'production-legacy', path: '/studio/video-ai.html', active: null, context: [] },
  { id: 'webtv', path: '/studio/webtv.html', active: 'Diffusion', context: ['Antenne', 'Programme', 'Publicités', 'Audience'] },
  { id: 'programme', path: '/studio/advanced.html#episodes', active: 'Diffusion', context: ['Web TV', 'Programme', 'Publicités', 'Audience'] },
  { id: 'catalogue', path: '/studio/advanced.html#programs', active: 'Réglages', context: ['Catalogue Media', 'Finances', 'Équipe', 'Journal', 'Général'] },
];
const viewports = [
  { id: 'desktop', width: 1440, height: 900 },
  { id: 'mobile', width: 390, height: 844 },
];
const expectedPrimary = ['Parcours clients', 'Diffusion', 'Réglages'];
const readinessTimeout = 30000;

const browser = await chromium.launch({ headless: true });
const reports = [];
try {
  for (const viewport of viewports) {
    for (const screen of screens) {
      const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, serviceWorkers: 'block' });
      await context.addInitScript(({ catalog, published, adminUser }) => {
        const nativeFetch = window.fetch.bind(window);
        const jsonResponse = (body) => Promise.resolve(new Response(JSON.stringify(body), {
          status: 200,
          headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
        }));
        window.fetch = (input, init = {}) => {
          const raw = typeof input === 'string' || input instanceof URL ? String(input) : input?.url;
          let url;
          try { url = new URL(raw, location.href); } catch { return nativeFetch(input, init); }
          if (url.pathname === '/api/admin/media-catalog-v98/context') return jsonResponse(catalog);
          if (url.pathname === '/api/reservation/catalog-v96') return jsonResponse(published);
          if (url.pathname === '/api/auth/status') return jsonResponse({ authenticated: true, csrfToken: 'test-csrf', user: adminUser });
          if (url.pathname === '/api/auth/logout') return jsonResponse({ ok: true });
          return nativeFetch(input, init);
        };
      }, { catalog: catalogContext, published: publishedCatalog, adminUser: adminState.user });
      await context.route('**/*', async (route) => {
        const url = new URL(route.request().url());
        if (url.pathname.startsWith('/api/')) return routeApi(route);
        return route.continue();
      });
      const page = await context.newPage();
      const browserErrors = [];
      page.on('pageerror', (error) => browserErrors.push(`pageerror:${error.message}`));
      page.on('console', (message) => { if (message.type() === 'error') browserErrors.push(`console:${message.text()}`); });

      const response = await page.goto(`${baseURL}${screen.path}`, { waitUntil: 'commit', timeout: readinessTimeout });
      assert(response?.ok(), `${screen.id}/${viewport.id}: page HTTP invalide ${response?.status()}`);
      await page.waitForSelector('body', { state: 'attached', timeout: readinessTimeout });
      await page.waitForFunction(() => document.body.classList.contains('studio-shell-v105') && document.documentElement.dataset.neptuneStudioShellReady === 'v105', null, { timeout: readinessTimeout });
      if (screen.id === 'programme' || screen.id === 'catalogue') {
        await page.waitForSelector('#app:not([hidden])', { timeout: readinessTimeout });
        await page.waitForSelector('#content', { state: 'visible', timeout: readinessTimeout });
      }
      if (screen.id === 'catalogue') await page.waitForSelector('.c98-page', { timeout: readinessTimeout });
      if (screen.id === 'production-legacy') await page.waitForSelector('.video-ai-main', { timeout: readinessTimeout });
      if (screen.id === 'webtv') {
        await page.waitForSelector('#save', { timeout: readinessTimeout });
        await page.waitForSelector('[data-webtv-section-button="antenna"]', { timeout: readinessTimeout });
        await page.waitForSelector('#importVideo', { state: 'attached', timeout: readinessTimeout });
      }
      await page.waitForTimeout(500);

      const metrics = await page.evaluate(() => {
        const visible = (element) => {
          if (!element || element.hidden) return false;
          const style = getComputedStyle(element); const rect = element.getBoundingClientRect();
          return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0' && rect.width > 0 && rect.height > 0;
        };
        const label = (link) => link.querySelector('strong')?.textContent.trim() || '';
        const box = (selector) => {
          const element = document.querySelector(selector); if (!element) return null;
          const rect = element.getBoundingClientRect();
          return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height };
        };
        const allLinks = [...document.querySelectorAll('.neptune-studio-nav-link')];
        const links = allLinks.filter(visible);
        const htmlOverflowX = getComputedStyle(document.documentElement).overflowX;
        const bodyOverflowX = getComputedStyle(document.body).overflowX;
        return {
          topLevel: window.top === window,
          pathname: location.pathname,
          attachedPrimaryTexts: allLinks.map(label),
          attachedActiveTexts: allLinks.filter((link) => link.classList.contains('active')).map(label),
          primaryTexts: links.map(label),
          primarySidebarCount: document.querySelectorAll('.neptune-studio-sidebar').length,
          logoutCount: document.querySelectorAll('#neptuneStudioLogout').length,
          productionNavCount: allLinks.filter((link) => label(link) === 'Production vidéo' || link.dataset.studioRoute === 'production').length,
          sidebar: box('.neptune-studio-sidebar'),
          navFontSize: Number.parseFloat(getComputedStyle(links[0]?.querySelector('strong')).fontSize || '0'),
          horizontalOverflow: document.documentElement.scrollWidth - innerWidth,
          horizontalOverflowClipped: ['hidden', 'clip'].includes(htmlOverflowX) || ['hidden', 'clip'].includes(bodyOverflowX),
          overflowPolicy: { html: htmlOverflowX, body: bodyOverflowX },
          contextTexts: [...document.querySelectorAll('.studio-context-nav-v65 button')].filter(visible).map((button) => button.textContent.trim()),
        };
      });

      const screenshotName = `${screen.id}-${viewport.id}-${viewport.width}x${viewport.height}.png`;
      await page.screenshot({ path: path.join(outputDir, screenshotName), fullPage: true });
      reports.push({ screen, viewport, metrics, browserErrors });
      await writeFile(path.join(outputDir, 'report-progress.json'), JSON.stringify({ reports }, null, 2));

      assert(metrics.topLevel, `${screen.id}/${viewport.id}: l’écran métier est encore embarqué dans une iframe`);
      assert(metrics.primarySidebarCount === 1, `${screen.id}/${viewport.id}: ${metrics.primarySidebarCount} sidebars canoniques détectées`);
      assert(metrics.logoutCount === 1, `${screen.id}/${viewport.id}: le bloc unique de déconnexion est absent ou dupliqué (${metrics.logoutCount})`);
      assert(metrics.productionNavCount === 0, `${screen.id}/${viewport.id}: Production vidéo réapparaît dans la navigation principale`);
      assert(JSON.stringify(metrics.attachedPrimaryTexts) === JSON.stringify(expectedPrimary), `${screen.id}/${viewport.id}: navigation attachée incorrecte ${JSON.stringify(metrics.attachedPrimaryTexts)} · ${browserErrors.join(' | ')}`);
      if (screen.active) assert(metrics.attachedActiveTexts.length === 1 && metrics.attachedActiveTexts[0] === screen.active, `${screen.id}/${viewport.id}: destination active incorrecte ${JSON.stringify(metrics.attachedActiveTexts)}`);
      else assert(metrics.attachedActiveTexts.length === 0, `${screen.id}/${viewport.id}: une destination principale ne doit pas être active sur cette route interne ${JSON.stringify(metrics.attachedActiveTexts)}`);
      assert(metrics.horizontalOverflow <= 2 || metrics.horizontalOverflowClipped, `${screen.id}/${viewport.id}: débordement horizontal global de ${metrics.horizontalOverflow}px sans politique de clipping ${JSON.stringify(metrics.overflowPolicy)}`);
      assert(JSON.stringify(metrics.contextTexts) === JSON.stringify(screen.context), `${screen.id}/${viewport.id}: sous-navigation incorrecte ${JSON.stringify(metrics.contextTexts)}`);

      if (viewport.width > 860) {
        assert(JSON.stringify(metrics.primaryTexts) === JSON.stringify(expectedPrimary), `${screen.id}/${viewport.id}: navigation principale invisible ou incorrecte`);
        assert(metrics.navFontSize >= 12, `${screen.id}/${viewport.id}: texte de navigation trop petit (${metrics.navFontSize}px)`);
        assert(metrics.sidebar && metrics.sidebar.width >= 228 && metrics.sidebar.width <= 244, `${screen.id}: largeur du menu ${metrics.sidebar?.width}px`);
      } else {
        const toggle = page.locator('#neptuneStudioMenuToggle');
        assert(await toggle.isVisible(), `${screen.id}: bouton mobile absent`);
        await toggle.click();
        await page.waitForFunction(() => document.body.classList.contains('studio-menu-open-v65'), null, { timeout: readinessTimeout });
        await page.waitForTimeout(250);
        const drawer = await page.evaluate(() => {
          const rect = document.querySelector('.neptune-studio-sidebar').getBoundingClientRect();
          const visibleLinks = [...document.querySelectorAll('.neptune-studio-nav-link')].filter((element) => {
            const style = getComputedStyle(element); const box = element.getBoundingClientRect();
            return style.display !== 'none' && style.visibility !== 'hidden' && box.width > 0 && box.height > 0;
          }).map((element) => element.querySelector('strong')?.textContent.trim() || '');
          return { left: rect.left, width: rect.width, visibleLinks };
        });
        assert(drawer.left >= -1, `${screen.id}: tiroir mobile fermé après clic`);
        assert(drawer.width <= 305, `${screen.id}: tiroir mobile trop large (${drawer.width}px)`);
        assert(JSON.stringify(drawer.visibleLinks) === JSON.stringify(expectedPrimary), `${screen.id}/mobile: navigation du tiroir incorrecte ${JSON.stringify(drawer.visibleLinks)}`);
        await page.keyboard.press('Escape');
        await page.waitForFunction(() => !document.body.classList.contains('studio-menu-open-v65'), null, { timeout: readinessTimeout });
      }

      if (screen.id === 'production-legacy') assert(await page.locator('.video-ai-main').isVisible(), `production/${viewport.id}: workspace interne absent`);
      if (screen.id === 'catalogue') assert(await page.locator('#content').isVisible(), `catalogue/${viewport.id}: contenu Réglages absent`);
      if (screen.id === 'webtv') {
        const sectionLabels = await page.locator('[data-webtv-section-button]').allTextContents();
        assert(sectionLabels.length === 3 && sectionLabels.some((label) => label.includes('Antenne')) && sectionLabels.some((label) => label.includes('Programme')) && sectionLabels.some((label) => label.includes('Configuration')), `webtv/${viewport.id}: sections de régie incorrectes ${JSON.stringify(sectionLabels)}`);
        assert(await page.locator('#save').isVisible(), `webtv/${viewport.id}: action globale antenne absente`);
      }

      await context.close();
    }
  }
} finally {
  await browser.close();
}

await writeFile(path.join(outputDir, 'report.json'), JSON.stringify({ ok: true, reports }, null, 2));
console.log('Studio visual audit v105 passed: sidebar canonique unique, trois destinations, un seul bloc de déconnexion, desktop/mobile cohérents.');

async function routeApi(route) {
  const url = new URL(route.request().url());
  let body = { ok: true };
  if (url.pathname === '/api/auth/status') body = { authenticated: true, csrfToken: 'test-csrf', user: adminState.user };
  else if (url.pathname === '/api/v1/media/studio/state') body = adminState;
  else if (url.pathname === '/api/admin/webtv/state') body = webTvState;
  else if (url.pathname === '/api/admin/webtv/media') body = { ok: true, items: [] };
  else if (url.pathname === '/api/admin/state') body = adminState;
  else if (url.pathname === '/api/admin/clients') body = portal;
  else if (url.pathname === '/api/admin/control-room') body = { actions: [], summary: {} };
  else if (url.pathname === '/api/admin/media-catalog-v98/context') body = catalogContext;
  else if (url.pathname === '/api/reservation/catalog-v96') body = publishedCatalog;
  else if (url.pathname.startsWith('/api/admin/client-feedback')) body = { feedback: [] };
  else if (url.pathname.includes('video-ai')) body = { ok: true, jobs: [], clips: [], orders: portal.orders, clients: portal.clients, runtime: { mode: 'local' } };
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
}

function order(id, clientId, email, fullName, company, format, status) {
  const now = new Date();
  return {
    id, clientId, email, fullName, company, title: 'Passage Neptune Media', format, status,
    nextAction: 'Valider la prochaine étape', createdAt: now.toISOString(), updatedAt: now.toISOString(),
    appointmentAt: new Date(now.getTime() + 2 * 86400000).toISOString(), filmingAt: new Date(now.getTime() + 7 * 86400000).toISOString(), files: [], schedules: [],
    workflow: { currentLabel: status === 'videos_pending' ? 'Sources attendues' : 'Préparation réservée', nextAction: 'Vérifier le dossier', preparationStatus: status === 'videos_pending' ? 'completed' : 'pending', supplierStatus: status === 'videos_pending' ? 'confirmed' : 'pending', broadcastStatus: 'pending' },
  };
}
function assert(condition, message) { if (!condition) throw new Error(message); }
