import base from './entry-v32.js';
import { StudioStore } from './store-v27.js';
import { sendEmail } from './email-service.js';
import { adminAuth } from './portal-http-utils.js';
import { isSameOrigin, json } from './security.js';
import { STUDIO_OPERATIONS_RELEASE } from './portal-studio-operations-v95.js';
import { WebTvEncoder, WEBTV_RELEASE, handleWebTvRequest, maintainWebTv } from './webtv-control-v1.js';

export { StudioStore, WebTvEncoder };

const STUDIO_JS=['/studio/studio-operations-compat-v95.js?v=1','/studio/studio-operations-v95.js?v=1'];
const STUDIO_CSS='/studio/studio-operations-v95.css?v=1';
const CLIENT_JS=['/espace-client/media-catalog-v95.js?v=1'];
const CLIENT_CSS='/espace-client/media-catalog-v95.css?v=1';
const ADMIN_PREFIX='/api/admin/studio-operations-v95/';
const PUBLIC_CATALOG='/api/public/media-catalog-v95';
const ROUTES=new Map([
  ['client-account','/portal/studio-operations-v95/client-account'],
  ['configuration','/portal/studio-operations-v95/configuration'],
  ['supplier/save','/portal/studio-operations-v95/supplier/save'],
  ['format/save','/portal/studio-operations-v95/format/save'],
  ['supplier-payment/context','/portal/studio-operations-v95/supplier-payment/context'],
  ['supplier-payment/action','/portal/studio-operations-v95/supplier-payment/action'],
]);

export default {
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    const webtv=await handleWebTvRequest(request,env,ctx,(probe)=>base.fetch(probe,env,ctx));
    if(webtv)return webtv;
    const studio=env.STUDIO.get(env.STUDIO.idFromName('neptune-media-main'));
    if(request.method==='POST'&&url.pathname.startsWith(ADMIN_PREFIX)){
      if(!isSameOrigin(request))return secureApi(json({error:'origin_forbidden'},403));
      const key=url.pathname.slice(ADMIN_PREFIX.length);
      if(!ROUTES.has(key))return secureApi(json({error:'not_found'},404));
      const payload=await request.json().catch(()=>({}));
      if(key==='supplier-payment/action'&&payload.action==='request_invoice'){
        return secureApi(await requestSupplierInvoice(request,env,studio,payload));
      }
      const response=await callStore(studio,ROUTES.get(key),{...adminAuth(request),payload});
      return secureApi(response);
    }
    if(request.method==='GET'&&url.pathname===PUBLIC_CATALOG){
      const response=await studio.fetch('https://store/portal/studio-operations-v95/public-catalog',{method:'GET'});
      return securePublic(response);
    }
    let response=await base.fetch(request,env,ctx);
    if(request.method==='GET'&&url.pathname==='/api/public/release'&&response.ok)response=await augmentRelease(response);
    if(request.method==='GET'&&response.ok&&(response.headers.get('Content-Type')||'').includes('text/html')){
      if(isStudioClientsPath(url.pathname))response=await injectAssets(response,STUDIO_CSS,STUDIO_JS,'X-Neptune-Studio-Operations',STUDIO_OPERATIONS_RELEASE);
      else if(isClientSpacePath(url.pathname))response=await injectAssets(response,CLIENT_CSS,CLIENT_JS,'X-Neptune-Media-Catalog',STUDIO_OPERATIONS_RELEASE);
    }
    return response;
  },
  async scheduled(controller,env,ctx){
    if(controller?.cron==='* * * * *')return maintainWebTv(env);
    if(typeof base.scheduled==='function')return base.scheduled(controller,env,ctx);
  },
};

async function requestSupplierInvoice(request,env,studio,payload){
  const auth=adminAuth(request);
  const prepareResponse=await callStore(studio,'/portal/studio-operations-v95/supplier-payment/action',{...auth,payload:{...payload,action:'request_invoice_prepare'}});
  const prepared=await prepareResponse.json().catch(()=>({}));
  if(!prepareResponse.ok||prepared.suppressed)return json(prepared,prepareResponse.status);
  const payment=prepared.payment||{};
  const recipient=String(prepared.recipient||'').trim();
  if(!recipient)return json({error:'supplier_email_missing'},409);
  const subject=`Demande de facture · ${payment.orderFormat||payment.orderTitle||'Neptune Media'} · ${payment.clientCompany||payment.clientName||'Client'}`;
  const amounts=`${money(payment.netCents)} HT · TVA ${money(payment.vatCents)} · ${money(payment.grossCents)} TTC`;
  const greeting=payment.supplierName?`Bonjour ${escapeHtml(payment.supplierName)},`:'Bonjour,';
  const testNote=prepared.testRerouted?'<p style="padding:10px 12px;background:#fff4d8;border-radius:10px"><strong>TEST NEPTUNE :</strong> cet e-mail a été rerouté et n’a pas été envoyé au fournisseur réel.</p>':'';
  const html=`<div style="font-family:Arial,sans-serif;max-width:640px;margin:auto;padding:34px;color:#11152b"><p style="letter-spacing:.16em;color:#6d55e8;font-weight:800">NEPTUNE MEDIA</p><h1 style="font-size:28px;line-height:1.08">Facture du passage à nous transmettre</h1>${testNote}<p>${greeting}</p><p>Merci de nous transmettre la facture correspondant au passage Neptune Media ci-dessous afin que notre équipe puisse effectuer le virement.</p><div style="margin:20px 0;padding:18px;border-radius:16px;background:#f5f3ff"><p style="margin:0 0 7px"><strong>Client :</strong> ${escapeHtml(payment.clientCompany||payment.clientName||payment.clientEmail||'')}</p><p style="margin:0 0 7px"><strong>Format :</strong> ${escapeHtml(payment.orderFormat||payment.orderTitle||'Neptune Media')}</p><p style="margin:0"><strong>Montant attendu :</strong> ${escapeHtml(amounts)}</p></div><p>Vous pouvez simplement répondre à cet e-mail avec la facture en pièce jointe ou avec votre lien de facture.</p><hr style="border:0;border-top:1px solid #e7e8ef;margin:30px 0"><p style="font-size:13px;color:#73798d">Neptune Media · contact@neptunebusiness.com</p></div>`;
  const text=`${prepared.testRerouted?'TEST NEPTUNE - e-mail rerouté.\n\n':''}${stripHtml(html)}`;
  const day=new Date().toISOString().slice(0,10);
  const sent=await sendEmail(env,{to:recipient,subject,html,text,idempotencyKey:`supplier-invoice-v95:${payment.id}:${day}`});
  if(!sent.ok)return json({error:sent.error||'supplier_invoice_email_failed',providerStatus:sent.providerStatus||0},502);
  const commitResponse=await callStore(studio,'/portal/studio-operations-v95/supplier-payment/action',{...auth,payload:{action:'request_invoice_commit',paymentId:payment.id,emailId:sent.id}});
  const committed=await commitResponse.json().catch(()=>({}));
  if(!commitResponse.ok)return json({error:committed.error||'supplier_invoice_commit_failed',emailSent:true},commitResponse.status);
  return json({...committed,emailSent:true,recipient,testRerouted:Boolean(prepared.testRerouted)});
}

function callStore(studio,path,body){return studio.fetch(`https://store${path}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body||{})});}

async function injectAssets(response,css,scripts,headerName,release){
  let body=await response.text();
  const cssPath=css.split('?')[0].replace(/[.*+?^${}()|[\]\\]/gu,'\\$&');
  body=body.replace(new RegExp(`<link\\b[^>]*href=["'][^"']*${cssPath}[^"']*["'][^>]*>\\s*`,'giu'),'');
  for(const js of scripts){
    const jsPath=js.split('?')[0].replace(/[.*+?^${}()|[\]\\]/gu,'\\$&');
    body=body.replace(new RegExp(`<script\\b[^>]*src=["'][^"']*${jsPath}[^"']*["'][^>]*>\\s*<\\/script>\\s*`,'giu'),'');
  }
  body=body.replace('</head>',`<link rel="stylesheet" href="${css}"></head>`);
  body=body.replace('</body>',`${scripts.map(js=>`<script type="module" src="${js}"></script>`).join('')}</body>`);
  const headers=new Headers(response.headers);headers.delete('Content-Length');headers.set('Cache-Control','private, no-store, max-age=0');headers.set(headerName,release);
  return new Response(body,{status:response.status,statusText:response.statusText,headers});
}

async function augmentRelease(response){
  const current=await response.json().catch(()=>({}));
  return new Response(JSON.stringify({...current,studioOperations:STUDIO_OPERATIONS_RELEASE,studioClientAccount:'dedicated-account-passages-new-passage-v95',studioSupplierFinance:'invoice-before-transfer-multi-supplier-v95',studioMediaConfiguration:'suppliers-formats-catalog-v95',clientMediaCatalog:'studio-managed-formats-v95',webTvControlRoom:WEBTV_RELEASE,webTvBroadcastEngine:'cloudflare-container-ffmpeg-youtube-rtmps'}),{status:response.status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});
}

function secureApi(response){const headers=new Headers(response.headers);headers.set('Cache-Control','no-store');headers.set('X-Content-Type-Options','nosniff');headers.set('X-Neptune-Studio-Operations',STUDIO_OPERATIONS_RELEASE);return new Response(response.body,{status:response.status,statusText:response.statusText,headers});}
function securePublic(response){const headers=new Headers(response.headers);headers.set('Cache-Control','public, max-age=60, s-maxage=60');headers.set('X-Content-Type-Options','nosniff');headers.set('X-Neptune-Media-Catalog',STUDIO_OPERATIONS_RELEASE);return new Response(response.body,{status:response.status,statusText:response.statusText,headers});}
function isStudioClientsPath(path){return path==='/studio/clients'||path==='/studio/clients/'||path==='/studio/clients.html';}
function isClientSpacePath(path){return path==='/espace-client'||path==='/espace-client/'||path==='/espace-client/index.html';}
function money(cents){try{return new Intl.NumberFormat('fr-FR',{style:'currency',currency:'EUR'}).format(Number(cents||0)/100);}catch{return `${(Number(cents||0)/100).toFixed(2)} €`;}}
function escapeHtml(value){return String(value||'').replace(/[&<>"']/gu,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[ch]);}
function stripHtml(value){return String(value||'').replace(/<[^>]+>/gu,' ').replace(/&amp;/gu,'&').replace(/&lt;/gu,'<').replace(/&gt;/gu,'>').replace(/&#39;/gu,"'").replace(/&quot;/gu,'"').replace(/\s+/gu,' ').trim();}
