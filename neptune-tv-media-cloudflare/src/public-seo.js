export function buildRobots(origin) {
  return `User-agent: *\nAllow: /\nDisallow: /studio/\nDisallow: /espace-client/\nDisallow: /api/\nSitemap: ${origin}/sitemap.xml\nSitemap: ${origin}/video-sitemap.xml\n`;
}

export function buildSitemap(origin, catalog) {
  const publishedEpisodes = visibleEpisodes(catalog);
  const publishedProgramIds = new Set(publishedEpisodes.map((item) => item.programId));
  const programs = (catalog.programs || []).filter((item) => isActiveProgram(item) && publishedProgramIds.has(item.id));
  const staticUrls = [
    { loc: `${origin}/`, changefreq: 'weekly', priority: '1.0' },
    { loc: `${origin}/direct/`, changefreq: 'daily', priority: '0.9' },
    { loc: `${origin}/emissions/`, changefreq: 'daily', priority: '0.9' },
    { loc: `${origin}/mentions-legales/`, changefreq: 'yearly', priority: '0.2' },
    { loc: `${origin}/confidentialite/`, changefreq: 'yearly', priority: '0.2' },
    { loc: `${origin}/contact/`, changefreq: 'monthly', priority: '0.5' }
  ];
  const dynamicUrls = [
    ...programs.map((item) => ({ loc: `${origin}/programmes/${item.slug}/`, changefreq: 'weekly', priority: '0.7', lastmod: item.updatedAt || item.createdAt })),
    ...publishedEpisodes.map((item) => ({ loc: `${origin}/emissions/${item.slug}/`, changefreq: 'monthly', priority: '0.8', lastmod: item.updatedAt || item.publishedAt || item.createdAt }))
  ];
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${[...staticUrls, ...dynamicUrls].map(entry).join('')}</urlset>`;
}

export function buildVideoSitemap(origin, catalog) {
  const episodes = visibleEpisodes(catalog);
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:video="http://www.google.com/schemas/sitemap-video/1.1">${episodes.map((item) => videoEntry(origin, item)).join('')}</urlset>`;
}

export function buildLlms(origin, catalog) {
  const episodes = visibleEpisodes(catalog);
  const publishedProgramIds = new Set(episodes.map((item) => item.programId));
  const programs = (catalog.programs || []).filter((item) => isActiveProgram(item) && publishedProgramIds.has(item.id));
  return `# Neptune Media\n\n> Web TV professionnelle de Neptune Business consacrée aux histoires, expertises et trajectoires d'entrepreneurs.\n\n## Accès principaux\n- Accueil: ${origin}/\n- Web TV en direct 24h/24: ${origin}/direct/\n- Catalogue des émissions: ${origin}/emissions/\n- Contact: ${origin}/contact/\n\n## Programmes\n${programs.map((item) => `- ${item.name}: ${origin}/programmes/${item.slug}/`).join('\n') || '- Aucun programme publié.'}\n\n## Émissions publiées\n${episodes.map((item) => `- ${item.title}: ${origin}/emissions/${item.slug}/`).join('\n') || '- Aucune émission publiée.'}\n\n## Informations d'usage\n- Les pages /studio/, /espace-client/ et /api/ ne sont pas des contenus publics à indexer.\n- La réservation commerciale reste gérée sur media.neptunebusiness.com.\n`;
}

function isActiveProgram(program) { return Boolean(program?.slug) && program.active !== false && Number(program.active ?? 1) !== 0; }
function visibleEpisodes(catalog) { const programIds = new Set((catalog.programs || []).filter(isActiveProgram).map((item) => item.id)); return (catalog.episodes || []).filter((item) => programIds.has(item.programId) && item.status === 'published' && item.slug && item.videoUrl && item.posterUrl); }
function entry(item) { const lastmod = validIsoDate(item.lastmod); return `<url><loc>${xml(item.loc)}</loc>${lastmod ? `<lastmod>${xml(lastmod.slice(0, 10))}</lastmod>` : ''}<changefreq>${item.changefreq}</changefreq><priority>${item.priority}</priority></url>`; }
function videoEntry(origin, item) { const publicationDate = validIsoDate(item.publishedAt || item.createdAt); return `<url><loc>${xml(`${origin}/emissions/${item.slug}/`)}</loc><video:video><video:thumbnail_loc>${xml(absolute(origin, item.posterUrl))}</video:thumbnail_loc><video:title>${xml(item.title)}</video:title><video:description>${xml(item.description || item.title)}</video:description><video:content_loc>${xml(absolute(origin, item.videoUrl))}</video:content_loc><video:duration>${Math.max(1, Math.min(28800, Math.round(Number(item.durationSeconds || 1))))}</video:duration>${publicationDate ? `<video:publication_date>${xml(publicationDate)}</video:publication_date>` : ''}<video:family_friendly>yes</video:family_friendly></video:video></url>`; }
function validIsoDate(value) { const timestamp = Date.parse(String(value || '')); return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : ''; }
function absolute(origin, value) { try { return new URL(value || '/assets/posters/default.svg', `${origin}/`).toString(); } catch { return `${origin}/assets/posters/default.svg`; } }
function xml(value) { return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[char])); }
