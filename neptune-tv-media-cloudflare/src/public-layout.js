export const BOOKING_URL = 'https://media.neptunebusiness.com/';

export function layout({ origin, title, description, canonical, body, image, structuredData = [] }) {
  const shareImage = image || `${origin}/assets/posters/studio-wide.webp`;
  const shareImageAlt = `${title} — Neptune Media`;
  const schemas = structuredData.length ? `<script type="application/ld+json">${safeJson(structuredData.length === 1 ? structuredData[0] : { '@context': 'https://schema.org', '@graph': structuredData })}</script>` : '';
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#070b18"><title>${escapeHtml(title)}</title><meta name="description" content="${escapeHtml(description)}"><meta name="robots" content="index,follow,max-image-preview:large,max-video-preview:-1,max-snippet:-1"><link rel="canonical" href="${escapeHtml(canonical)}"><meta property="og:type" content="website"><meta property="og:locale" content="fr_FR"><meta property="og:site_name" content="Neptune Media"><meta property="og:title" content="${escapeHtml(title)}"><meta property="og:description" content="${escapeHtml(description)}"><meta property="og:url" content="${escapeHtml(canonical)}"><meta property="og:image" content="${escapeHtml(shareImage)}"><meta property="og:image:alt" content="${escapeHtml(shareImageAlt)}"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${escapeHtml(title)}"><meta name="twitter:description" content="${escapeHtml(description)}"><meta name="twitter:image" content="${escapeHtml(shareImage)}"><meta name="twitter:image:alt" content="${escapeHtml(shareImageAlt)}"><link rel="icon" href="/assets/logo-neptune.svg"><link rel="stylesheet" href="/style.css"><link rel="stylesheet" href="/upgrade.css?v=4"><link rel="stylesheet" href="/live.css?v=1"><link rel="stylesheet" href="/styles/accessibility.css"><link rel="stylesheet" href="/styles/ux-aida.css"><link rel="stylesheet" href="/styles/neptune-streaming.css?v=11"><link rel="stylesheet" href="/styles/visual-polish-v11.css?v=3"><link rel="stylesheet" href="/styles/final-experience-v12.css?v=1"><link rel="stylesheet" href="/styles/direct-experience-v1.css?v=2"><link rel="stylesheet" href="/styles/direct-program-v2.css?v=2"><link rel="stylesheet" href="/styles/direct-modal-fix-v3.css?v=3">${schemas}<script src="/ux-aida.js" defer></script><script src="/visual-polish-v11.js?v=3" defer></script><script src="/final-experience-v12.js?v=1" defer></script><script src="/direct-experience-v1.js?v=3" defer></script></head><body data-public-ux="streaming-v3" data-density="streaming" data-final-ux="v12"><a class="skip-link" href="#main-content">Aller au contenu principal</a>${header()}${body}${footer()}</body></html>`;
}

export function episodeCard(origin, catalog, episode) {
  const program = catalog.programs.find((item) => item.id === episode.programId);
  const metadata = episode.metadata && typeof episode.metadata === 'object' ? episode.metadata : {};
  const tags = Array.isArray(metadata.tags) ? metadata.tags.join(' ') : String(metadata.tags || '');
  const searchText = [episode.title, episode.description, program?.name, metadata.guestName, metadata.guestCompany, tags].filter(Boolean).join(' ');
  const kind = isShortEpisode(episode) ? 'short' : 'episode';
  const shortClass = kind === 'short' ? ' is-short' : '';
  const formatName = formatLabel(program?.name);
  return `<article class="seo-card${shortClass}" data-media-kind="${kind}" data-episode-slug="${escapeHtml(episode.slug)}" data-program="${escapeHtml(formatName)}" data-search="${escapeHtml(searchText)}"><a href="/emissions/${encodeURIComponent(episode.slug)}/" aria-label="Regarder ${escapeHtml(episode.title)}"><div class="seo-card-media"><img loading="lazy" decoding="async" src="${escapeHtml(absolute(origin, episode.posterUrl))}" alt="${escapeHtml(episode.title)}" onerror="this.onerror=null;this.src='/assets/posters/default.svg'"><span class="card-play" aria-hidden="true">▶</span><span class="watch-progress" aria-hidden="true" hidden><i></i></span></div><div class="seo-card-copy"><span>${escapeHtml(formatName)} · ${formatDuration(episode.durationSeconds)}</span><h2>${escapeHtml(episode.title)}</h2><strong>Regarder →</strong></div></a></article>`;
}

export function bookingUrl(medium, parameters = {}) {
  const url = new URL(BOOKING_URL);
  url.searchParams.set('utm_source', 'webtv');
  url.searchParams.set('utm_medium', medium);
  url.searchParams.set('utm_campaign', 'neptune_media');
  Object.entries(parameters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value).trim()) url.searchParams.set(key, String(value));
  });
  return url.toString();
}

export function bookingLink(episode) { return bookingUrl('episode_page', { episode: episode.slug || episode.id }); }
export function isShortEpisode(episode) {
  const metadata = episode?.metadata && typeof episode.metadata === 'object' ? episode.metadata : {};
  const declared = [metadata.format, metadata.type, metadata.orientation, ...(Array.isArray(metadata.tags) ? metadata.tags : [])].filter(Boolean).join(' ');
  const duration = Number(episode?.durationSeconds || 0);
  return metadata.short === true || metadata.vertical === true || /short|reel|vertical|portrait/i.test(String(declared)) || (!metadata.fullEpisode && duration > 0 && duration <= 90);
}
export function formatLabel(programName) { return /hors\s*norme/i.test(String(programName || '')) ? 'Hors Norme' : 'Concept Libre'; }
export function absolute(origin, value) {
  const raw = String(value || '').trim();
  const normalized = raw === '/media/posters/hors-norme.webp'
    ? '/assets/posters/hors-norme-wide.webp'
    : raw === '/media/posters/jeu-connexio.webp'
      ? '/assets/posters/default.svg'
      : raw || '/assets/posters/default.svg';
  try { return new URL(normalized, `${origin}/`).toString(); } catch { return `${origin}/assets/posters/default.svg`; }
}
export function isoDuration(seconds) { const value = Math.max(0, Math.round(Number(seconds || 0))); return `PT${Math.floor(value / 60)}M${value % 60}S`; }
export function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char])); }
export function toList(value) { if (Array.isArray(value)) return value.filter(Boolean).map(String); return String(value || '').split(/\n|\|/).map((item) => item.trim()).filter(Boolean); }
export function paragraphs(value) { return String(value).split(/\n{2,}/).map((item) => `<p>${escapeHtml(item.trim())}</p>`).join(''); }

function navigationLinks() {
  return `<a class="live-nav-link" href="/direct/"><i></i> Direct</a><a href="/emissions/">Émissions</a><a href="/#formats">Formats</a><a href="/espace-client/">Espace client</a><a class="btn btn-primary" data-funnel href="${bookingUrl('public_header')}">Voir les créneaux</a>`;
}
function header() { return `<header class="site-header"><div class="container header-inner public-header-inner"><a class="brand" href="/" aria-label="Neptune Media, accueil"><img src="/assets/logo-neptune.svg" alt="Neptune Business & Média"></a><nav class="seo-nav public-desktop-nav" aria-label="Navigation principale">${navigationLinks()}</nav><details class="public-mobile-menu"><summary aria-label="Ouvrir le menu"><span aria-hidden="true"></span><span class="sr-only">Menu</span></summary><nav class="seo-nav" aria-label="Navigation mobile">${navigationLinks()}</nav></details></div></header>`; }
function footer() { return `<footer class="footer"><div class="container"><div class="footer-grid"><div class="footer-brand"><img src="/assets/logo-neptune.svg" alt="Neptune Business & Média"><p>La Web TV des histoires d’entreprise qui méritent l’antenne.</p></div><div class="footer-col"><h3>Explorer</h3><a href="/direct/">En direct</a><a href="/emissions/">Toutes les émissions</a><a href="/#formats">Les formats</a><a data-funnel href="${bookingUrl('public_footer')}">Voir les créneaux</a></div><div class="footer-col"><h3>Informations</h3><a href="/mentions-legales/">Mentions légales</a><a href="/confidentialite/">Confidentialité</a><a href="/contact/">Contact</a></div></div><div class="footer-bottom"><span>© ${new Date().getFullYear()} Neptune Media.</span><span>Des histoires d’entreprise qui méritent l’antenne.</span></div></div></footer>`; }
function formatDuration(seconds) { const value = Math.max(0, Math.round(Number(seconds || 0))); if (value < 60) return `${value} s`; const hours = Math.floor(value / 3600); const minutes = Math.floor((value % 3600) / 60); return hours ? `${hours} h ${minutes} min` : `${minutes} min`; }
function safeJson(value) { return JSON.stringify(value).replace(/</g, '\\u003c'); }
