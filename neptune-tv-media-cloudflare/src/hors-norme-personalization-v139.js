import {clientToken} from './portal-http-utils.js';
import {isSameOrigin,json} from './security.js';

export const HORS_NORME_PERSONALIZATION_RELEASE='neptune-hors-norme-personalization-20260824-v139.1';
const PREFIX='private/client-personalization/hors-norme/';
const PHASE_IDS=['ouverture','silence','scene','erreurs','croyances','chemin','freins','verites','avant_apres','message_final','cloture'];
const ALLOWED_QUESTIONS={
  ouverture:[
    'Quel problème vous a tellement marqué que vous avez fini par vous dire : “je ne peux pas laisser les gens seuls avec ça” ?',
    'Qui avez-vous vu galérer trop longtemps avant de comprendre qu’il avait besoin d’aide ?',
    'Quelle situation vous révolte encore aujourd’hui dans votre métier ?'
  ],
  silence:[
    'Qu’est-ce que votre client vit en silence, mais qu’il n’avouera presque jamais au premier rendez-vous ?',
    'Quelle phrase se répète-t-il pour se rassurer alors qu’au fond il sait que ça bloque ?',
    'À quel moment son problème commence à lui prendre plus que de l’argent : de l’énergie, de la confiance ou de la paix mentale ?'
  ],
  scene:[
    'Racontez une scène précise où vous avez vu quelqu’un comprendre trop tard qu’il s’était trompé de problème.',
    'Quel moment client vous revient encore parce qu’il résume tout ce que votre métier cherche à éviter ?',
    'Décrivez la scène : qui est là, qu’est-ce qui se passe, et qu’est-ce qu’on comprend à ce moment-là ?'
  ],
  erreurs:[
    'Quelle erreur votre client répète en pensant se protéger, alors qu’elle l’enfonce ?',
    'Quel réflexe paraît raisonnable sur le moment, mais coûte très cher à long terme ?',
    'Qu’est-ce qu’il continue de faire parce qu’il croit gagner du temps, alors qu’il en perd ?'
  ],
  croyances:[
    'Quelle croyance donne l’impression d’être prudent, alors qu’elle bloque tout ?',
    'Quelle phrase votre client se raconte pour ne pas prendre la décision qu’il sait nécessaire ?',
    'Quelle vérité dérangeante ferait gagner des mois à ceux qui vous écoutent ?'
  ],
  chemin:[
    'Si quelqu’un se reconnaît, quel est le premier pas intelligent, pas spectaculaire, juste intelligent ?',
    'Par où faut-il commencer quand on est fatigué de tourner autour du même problème ?',
    'Quelle étape paraît simple, mais change tout parce qu’elle remet de l’ordre dans la tête ?'
  ],
  freins:[
    'Quand il dit “je n’ai pas le budget”, quelle peur est souvent cachée derrière ?',
    'Quand il dit “je vais attendre”, qu’est-ce qu’il espère éviter de regarder en face ?',
    'Quelle objection mérite d’être respectée, mais ne doit pas devenir une prison ?'
  ],
  verites:[
    'Quelle phrase aimeriez-vous que votre client se répète demain matin ?',
    'Quelle vérité simple ferait mal à entendre, mais du bien à accepter ?',
    'Si vous deviez réveiller quelqu’un en une phrase, vous lui diriez quoi ?'
  ],
  avant_apres:[
    'À quoi ressemblait la personne avant de comprendre ce qui bloquait vraiment ?',
    'Quel déclic a changé sa façon de voir le problème ?',
    'Qu’est-ce qui a changé dans sa posture, sa confiance ou ses décisions après ?'
  ],
  message_final:[
    'Qu’avez-vous envie de dire à quelqu’un qui se reconnaît, mais qui n’a encore rien osé changer ?',
    'Quelle phrase aurait pu l’aider plus tôt s’il l’avait entendue au bon moment ?',
    'Qu’est-ce qu’il doit arrêter de porter seul à partir d’aujourd’hui ?'
  ],
  cloture:[
    'Quelle idée doit rester quand l’écran s’éteint ?',
    'Quel premier pas peut-il faire dans les prochaines 24 heures sans tout bouleverser ?',
    'Si cette conversation devait enlever un poids à quelqu’un, lequel ?'
  ]
};

export async function handleHorsNormePersonalizationV139(request,env,ctx,baseFetch){
  const url=new URL(request.url);
  if(url.pathname==='/api/client/hors-norme-personalization'){
    if(request.method==='GET')return clientRead(request,env,baseFetch);
    if(request.method==='PUT')return clientWrite(request,env,baseFetch);
    return json({error:'method_not_allowed'},405);
  }
  if(url.pathname==='/api/admin/hors-norme-personalization'&&request.method==='GET'){
    return adminRead(request,env,baseFetch);
  }
  return null;
}

async function clientRead(request,env,baseFetch){
  const context=await clientContext(request,baseFetch);
  if(context.error)return context.error;
  const record=await readRecord(env,context.order.id);
  return json({
    release:HORS_NORME_PERSONALIZATION_RELEASE,
    order:publicOrder(context.order),
    personalization:record||emptyRecord(context.order),
  });
}

async function clientWrite(request,env,baseFetch){
  if(!isSameOrigin(request))return json({error:'origin_forbidden'},403);
  if(!clientToken(request))return json({error:'unauthorized'},401);
  const context=await clientContext(request,baseFetch);
  if(context.error)return context.error;
  const payload=await request.json().catch(()=>null);
  if(!payload||typeof payload!=='object')return json({error:'invalid_payload'},400);
  if(payload.orderId&&String(payload.orderId)!==String(context.order.id))return json({error:'order_forbidden'},403);
  const normalized=normalizePayload(payload,context.order);
  if(normalized.error)return json({error:normalized.error},400);
  const previous=await readRecord(env,context.order.id);
  const now=new Date().toISOString();
  const record={
    release:HORS_NORME_PERSONALIZATION_RELEASE,
    schemaVersion:1,
    orderId:String(context.order.id),
    clientEmail:String(context.order.email||'').toLowerCase(),
    clientName:String(context.order.fullName||''),
    company:String(context.order.company||''),
    format:String(context.order.format||''),
    status:normalized.status,
    phases:normalized.phases,
    completedPhases:normalized.phases.filter(phase=>phase.question&&phase.pourquoi.length>=12).length,
    createdAt:previous?.createdAt||now,
    updatedAt:now,
    submittedAt:normalized.status==='submitted'?(previous?.submittedAt||now):null,
  };
  await env.MEDIA.put(keyFor(context.order.id),JSON.stringify(record),{
    httpMetadata:{contentType:'application/json; charset=utf-8'},
    customMetadata:{kind:'hors-norme-personalization',orderId:String(context.order.id),status:record.status,release:HORS_NORME_PERSONALIZATION_RELEASE},
  });
  return json({ok:true,release:HORS_NORME_PERSONALIZATION_RELEASE,personalization:record});
}

async function adminRead(request,env,baseFetch){
  const auth=await callBase(baseFetch,request,'/api/auth/status');
  const authData=await auth.json().catch(()=>({}));
  if(!auth.ok||authData.authenticated===false)return json({error:'unauthorized'},401);
  const role=String(authData.user?.role||'');
  if(!['admin','editor'].includes(role))return json({error:'forbidden'},403);
  const url=new URL(request.url);
  const orderId=String(url.searchParams.get('orderId')||'').trim();
  if(!orderId||orderId.length>160)return json({error:'order_id_required'},400);
  const record=await readRecord(env,orderId);
  return json({release:HORS_NORME_PERSONALIZATION_RELEASE,personalization:record||null});
}

async function clientContext(request,baseFetch){
  if(!clientToken(request))return {error:json({error:'unauthorized'},401)};
  const response=await callBase(baseFetch,request,'/api/client/session');
  const data=await response.json().catch(()=>({}));
  if(!response.ok||!data.authenticated)return {error:json({error:'unauthorized'},401)};
  const orders=Array.isArray(data.orders)?data.orders:[];
  const order=orders.find(item=>item?.id&&/hors\s*norme/iu.test(String(item.format||''))&&String(item.status||'')!=='completed')
    || orders.find(item=>item?.id&&/hors\s*norme/iu.test(String(item.format||'')))
    || null;
  if(!order)return {error:json({error:'hors_norme_order_not_found'},404)};
  return {order};
}

async function callBase(baseFetch,request,pathname){
  const source=new URL(request.url);
  const target=new URL(pathname,source.origin);
  const headers=new Headers();
  for(const name of ['Cookie','Accept','User-Agent']){
    const value=request.headers.get(name);
    if(value)headers.set(name,value);
  }
  return baseFetch(new Request(target.toString(),{method:'GET',headers}));
}

function normalizePayload(payload,order){
  const status=payload.status==='submitted'?'submitted':'draft';
  if(!Array.isArray(payload.phases))return {error:'phases_required'};
  const byId=new Map(payload.phases.map(phase=>[String(phase?.id||''),phase]));
  const phases=PHASE_IDS.map(id=>{
    const raw=byId.get(id)||{};
    return {
      id,
      title:clean(raw.title,100),
      objective:clean(raw.objective,260),
      question:clean(raw.question,700),
      pourquoi:clean(raw.pourquoi,1600),
    };
  });
  const invalidQuestion=phases.find(phase=>phase.question&&!ALLOWED_QUESTIONS[phase.id].includes(phase.question));
  if(invalidQuestion)return {error:`invalid_question:${invalidQuestion.id}`};
  if(status==='submitted'){
    const invalid=phases.find(phase=>!phase.question||phase.pourquoi.length<12);
    if(invalid)return {error:`phase_incomplete:${invalid.id}`};
  }
  const total=JSON.stringify(phases).length;
  if(total>30000)return {error:'payload_too_large'};
  if(!/hors\s*norme/iu.test(String(order.format||'')))return {error:'invalid_format'};
  return {status,phases};
}

function clean(value,max){return String(value??'').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/gu,'').trim().slice(0,max);}
function keyFor(orderId){return `${PREFIX}${encodeURIComponent(String(orderId))}.json`;}
async function readRecord(env,orderId){
  const object=await env.MEDIA.get(keyFor(orderId));
  if(!object)return null;
  try{return JSON.parse(await object.text());}catch{return null;}
}
function publicOrder(order){return {id:String(order.id),format:String(order.format||''),title:String(order.title||''),filmingAt:order.filmingAt||null,status:String(order.status||'')};}
function emptyRecord(order){return {release:HORS_NORME_PERSONALIZATION_RELEASE,schemaVersion:1,orderId:String(order.id),status:'draft',phases:PHASE_IDS.map(id=>({id,title:'',objective:'',question:'',pourquoi:''})),completedPhases:0,createdAt:null,updatedAt:null,submittedAt:null};}
