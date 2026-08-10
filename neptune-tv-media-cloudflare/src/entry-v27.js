import base from './entry-v26.js';
import { StudioStore } from './store-v22.js';

export { StudioStore };

const CRM_SCRIPT = '<script type="module" src="/studio/crm-autopilot-v86.js?v=1"></script>';
const RELEASE = 'neptune-studio-crm-autopilot-ordering-20260810-v86';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    let response = await base.fetch(request, env, ctx);
    if (request.method === 'GET' && response.ok && isStudioClientsPath(url.pathname)
      && (response.headers.get('Content-Type') || '').includes('text/html')) {
      response = await prioritizeCrmScript(response);
    }
    const headers = new Headers(response.headers);
    headers.set('X-Neptune-CRM-Ordering', RELEASE);
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  },
  async scheduled(controller, env, ctx) {
    if (typeof base.scheduled === 'function') return base.scheduled(controller, env, ctx);
  },
};

async function prioritizeCrmScript(response) {
  let body = await response.text();
  body = body.replace(/<script\b[^>]*src=["'][^"']*\/studio\/crm-autopilot-v86\.js[^"']*["'][^>]*>\s*<\/script>\s*/giu, '');
  const manual = /<script\b[^>]*src=["'][^"']*\/studio\/manual-scheduling-v85\.js[^"']*["'][^>]*>\s*<\/script>/iu;
  if (manual.test(body)) body = body.replace(manual, (match) => `${CRM_SCRIPT}${match}`);
  else body = body.replace('</body>', `${CRM_SCRIPT}</body>`);
  const headers = new Headers(response.headers);
  headers.delete('Content-Length');
  headers.set('Cache-Control', 'private, no-store, max-age=0');
  return new Response(body, { status: response.status, statusText: response.statusText, headers });
}

function isStudioClientsPath(pathname) {
  return pathname === '/studio/clients' || pathname === '/studio/clients/' || pathname === '/studio/clients.html';
}
