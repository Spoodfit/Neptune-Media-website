const ROUTES={
  clients:'/studio/clients',
  production:'/studio/video-ai.html',
  diffusion:'/studio/webtv.html',
  'diffusion/programme':'/studio/advanced.html#episodes',
  'diffusion/publicites':'/studio/advanced.html#ads',
  'diffusion/audience':'/studio/advanced.html#insights',
  'settings/catalogue':'/studio/advanced.html#programs',
  'settings/finances':'/studio/advanced.html#finances',
  'settings/equipe':'/studio/advanced.html#users',
  'settings/journal':'/studio/advanced.html#audit',
  'settings/general':'/studio/advanced.html#settings',
};
const LEGACY={
  dashboard:'clients',ai:'production',webtv:'diffusion',episodes:'diffusion/programme',ads:'diffusion/publicites',insights:'diffusion/audience',programs:'settings/catalogue',finances:'settings/finances',users:'settings/equipe',audit:'settings/journal',settings:'settings/general',
};

const raw=decodeURIComponent(location.hash.slice(1)).trim().replace(/^\/+|\/+$/gu,'');
let route=ROUTES[raw]?raw:(LEGACY[raw]||'');
if(!route&&new URLSearchParams(location.search).get('entry')==='advanced')route='settings/catalogue';
if(!route)route='clients';
location.replace(ROUTES[route]);
