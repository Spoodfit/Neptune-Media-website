import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const baseUrl = process.env.DASHBOARD_BASE_URL || 'http://127.0.0.1:4173';
const outputDir = path.resolve('test-results/client-command-center-v117');
const catalog = {
  ok: true,
  cities: [{
    id: 'toulouse',
    slug: 'toulouse',
    name: 'Toulouse',
    country: 'France',
    formats: [
      {
        id: 'hors-norme',
        slug: 'hors-norme',
        name: 'Hors Norme',
        concept: 'Interview incarnée',
        description: 'Une conversation éditoriale qui transforme votre expertise en contenus à forte valeur.',
        durationLabel: '1 h 30',
        image: '/assets/catalog-v98/hors-norme.svg',
        offers: [{ id: 'offer-hn', name: 'Offre standard', clientPriceCents: 79000, currency: 'eur' }],
      },
      {
        id: 'connexio',
        slug: 'connexio',
        name: 'Connexio',
        concept: 'Émission conversationnelle',
        description: 'Un format vivant pour créer de la proximité et plusieurs angles éditoriaux.',
        durationLabel: '2 h',
        image: '/assets/catalog-v98/connexio.svg',
        offers: [{ id: 'offer-co', name: 'Offre standard', clientPriceCents: 99000, currency: 'eur' }],
      },
    ],
  }],
};

const baseClient = {
  id: 'client-lea',
  fullName: 'Léa Neptune',
  email: 'lea@example.com',
  referralCode: 'LDLBE2HZ',
};

const scenarios = [
  {
    name: 'desktop-editing',
    viewport: { width: 1440, height: 1000 },
    state: {
      client: baseClient,
      orders: [{
        id: 'order-editing',
        title: 'Hors Norme · Léa',
        format: 'Hors Norme',
        status: 'editing',
        paymentStatus: 'paid',
        appointmentAt: '2026-08-03T07:00:00.000Z',
        filmingAt: '2026-08-06T09:00:00.000Z',
        workflow: {
          preparationStatus: 'completed',
          supplierStatus: 'confirmed',
          sourceReceivedAt: '2026-08-07T10:00:00.000Z',
          editingStartedAt: '2026-08-08T10:00:00.000Z',
          broadcastStatus: 'pending',
        },
        files: [{ id: 'file-long', name: 'Emission.mp4', fileType: 'final', downloadUrl: '/api/client/files/file-long' }],
        schedules: [],
      }],
    },
    assert(diagnostics) {
      expect(diagnostics.stageCount === 8, 'montage: le workflow doit contenir 8 étapes');
      expect(/Votre émission est en montage/iu.test(diagnostics.title), 'montage: le titre courant est incorrect');
      expect(diagnostics.currentStage === 'Montage', 'montage: l’étape Montage doit être active');
      expect(!diagnostics.hasActionPill, 'montage: aucune fausse action client ne doit être affichée');
      expect(diagnostics.showMoved, 'montage: la dernière livraison doit être déplacée sous le hero');
    },
  },
  {
    name: 'mobile-action-required',
    viewport: { width: 390, height: 844 },
    state: {
      client: baseClient,
      orders: [{
        id: 'order-prep',
        title: 'Hors Norme · Léa',
        format: 'Hors Norme',
        status: 'preparation_booking_pending',
        paymentStatus: 'paid',
        bookingUrl: 'https://calendar.app.google/example',
        workflow: { supplierStatus: '', preparationStatus: 'pending' },
        files: [],
        schedules: [],
      }],
    },
    assert(diagnostics) {
      expect(diagnostics.stageCount === 8, 'action: le workflow doit contenir 8 étapes');
      expect(diagnostics.hasActionPill, 'action: le badge Action requise doit être visible');
      expect(/Réserver ma visio/iu.test(diagnostics.primaryAction), 'action: le CTA doit demander de réserver la visio');
      expect(diagnostics.actionStage === 'Préparation', 'action: l’étape Préparation doit être marquée à faire');
      expect(diagnostics.horizontalOverflow <= 3, `mobile: débordement horizontal global de ${diagnostics.horizontalOverflow}px`);
      expect(diagnostics.flowScrollable, 'mobile: le workflow doit défiler dans son propre conteneur');
    },
  },
  {
    name: 'desktop-no-active-passage',
    viewport: { width: 1440, height: 1000 },
    state: {
      client: baseClient,
      orders: [{
        id: 'order-completed',
        title: 'Passage précédent',
        format: 'Hors Norme',
        status: 'completed',
        paymentStatus: 'paid',
        filmingAt: '2026-06-12T09:00:00.000Z',
        workflow: { deliveredAt: '2026-06-20T10:00:00.000Z', broadcastStatus: 'published' },
        files: [],
        schedules: [],
      }],
    },
    assert(diagnostics) {
      expect(diagnostics.stageCount === 0, 'catalogue: aucun workflow actif ne doit rester affiché');
      expect(/Prêt pour un nouveau passage/iu.test(diagnostics.title), 'catalogue: le hero doit proposer un nouveau passage');
      expect(diagnostics.catalogCards >= 2, 'catalogue: les formats synchronisés doivent être visibles');
      expect(diagnostics.catalogImages >= 2, 'catalogue: les visuels de formats doivent être utilisés');
      expect(diagnostics.catalogFirstHref.includes('/reserver'), 'catalogue: la réservation doit être accessible en un clic');
    },
  },
];

await fs.rm(outputDir, { recursive: true, force: true });
await fs.mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({ headless: true, args: ['--disable-dev-shm-usage'] });
const report = { generatedAt: new Date().toISOString(), scenarios: [], errors: [] };

for (const scenario of scenarios) {
  const context = await browser.newContext({
    viewport: scenario.viewport,
    deviceScaleFactor: 1,
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();
  const browserErrors = [];
  page.on('pageerror', (error) => browserErrors.push(error.message));
  page.on('console', (message) => {
    const text = message.text();
    if (message.type() === 'error' && !isBenignBrowserNoise(text)) browserErrors.push(text);
  });

  await page.route('**/api/client/**', async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    const body = pathname === '/api/client/session' ? scenario.state : {};
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.route('**/api/reservation/catalog-v96', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(catalog) });
  });
  await page.route('**/api/public/connexio-availability', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{"available":false,"event":null}' });
  });

  const response = await page.goto(`${baseUrl}/espace-client/?dashboard_test=${Date.now()}`, {
    waitUntil: 'domcontentloaded',
    timeout: 60_000,
  });
  if (!response || response.status() >= 400) throw new Error(`${scenario.name}: HTTP ${response?.status() || 0}`);
  await page.waitForSelector('#dashboard:not([hidden])', { timeout: 20_000 });

  // Le serveur de validation est statique : on charge explicitement la couche que le Worker entry-v38 injecte en production.
  await page.evaluate(async () => {
    await import('/espace-client/client-experience-v117.js?v=1');
  });
  await page.waitForSelector('.client-command-center #ccContent:not([hidden])', { timeout: 20_000 });
  if (scenario.name.includes('no-active')) await page.waitForSelector('.cc-format-card:not(.cc-format-card--skeleton)', { timeout: 10_000 });
  await page.waitForTimeout(250);

  const diagnostics = await page.evaluate(() => {
    const doc = document.documentElement;
    const stages = [...document.querySelectorAll('.cc-stage')];
    const current = stages.find((stage) => ['current', 'waiting'].includes(stage.dataset.state));
    const action = stages.find((stage) => stage.dataset.state === 'action');
    const flowScroll = document.querySelector('.cc-flow-scroll');
    return {
      title: document.querySelector('#ccTitle')?.textContent?.trim() || '',
      stageCount: stages.length,
      currentStage: current?.querySelector('.cc-stage-copy strong')?.textContent?.trim() || '',
      actionStage: action?.querySelector('.cc-stage-copy strong')?.textContent?.trim() || '',
      hasActionPill: Boolean(document.querySelector('.cc-state-pill[data-tone="action"]')),
      primaryAction: document.querySelector('.cc-primary-action')?.textContent?.trim() || '',
      showMoved: Boolean(document.querySelector('#clientSecondaryRow .show-card')),
      catalogCards: document.querySelectorAll('.cc-format-card:not(.cc-format-card--skeleton)').length,
      catalogImages: document.querySelectorAll('.cc-format-card img').length,
      catalogFirstHref: document.querySelector('.cc-format-card a[href]')?.getAttribute('href') || '',
      navLabels: [...document.querySelectorAll('.client-primary-nav-v117 a')].map((item) => item.textContent.trim()),
      horizontalOverflow: Math.max(doc.scrollWidth, document.body.scrollWidth) - innerWidth,
      flowScrollable: Boolean(flowScroll && flowScroll.scrollWidth > flowScroll.clientWidth + 2),
      legacyWorkflowVisible: [...document.querySelectorAll('#clientMinimalFlow,.client-minimal-flow')].some((element) => {
        const style = getComputedStyle(element);
        return style.display !== 'none' && !element.hidden;
      }),
    };
  });

  try {
    scenario.assert(diagnostics);
    expect(diagnostics.navLabels.join('|') === 'Accueil|Contenus|Publications|Compte', `${scenario.name}: navigation client incohérente`);
    expect(!diagnostics.legacyWorkflowVisible, `${scenario.name}: ancien workflow encore visible`);
    if (browserErrors.length) throw new Error(`erreurs navigateur ${JSON.stringify(browserErrors)}`);
  } catch (error) {
    report.errors.push(`${scenario.name}: ${error.message}`);
  }

  await page.screenshot({ path: path.join(outputDir, `${scenario.name}.png`), fullPage: true });
  report.scenarios.push({ name: scenario.name, viewport: scenario.viewport, diagnostics, browserErrors });
  await context.close();
}

await browser.close();
await fs.writeFile(path.join(outputDir, 'report.json'), JSON.stringify(report, null, 2));
await fs.writeFile(
  path.join(outputDir, 'README.md'),
  `# Client Command Center v117\n\n- Scénarios contrôlés : ${scenarios.length}\n- Erreurs : ${report.errors.length}\n\n${report.errors.map((error) => `- ${error}`).join('\n') || 'Aucune erreur détectée.'}\n`,
);

if (report.errors.length) {
  console.error(report.errors.join('\n'));
  process.exit(1);
}
console.log(`Client Command Center v117 validé sur ${scenarios.length} scénarios.`);

function expect(condition, message) {
  if (!condition) throw new Error(message);
}
function isBenignBrowserNoise(text) {
  return /Permissions policy violation:\s*compute-pressure is not allowed in this document\.?/iu.test(String(text || ''));
}
