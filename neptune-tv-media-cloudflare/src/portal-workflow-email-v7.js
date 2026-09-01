import { sendEmail } from './email-service.js';
import { sendWorkflowOutboxItem as sendLegacyWorkflowOutboxItem } from './portal-workflow-email-v6.js';

const CONTACT='contact@neptunebusiness.com';

export async function sendWorkflowOutboxItem(env,requestUrl,item={}){
  const key=String(item.messageKey||'');
  const payload=item.payload&&typeof item.payload==='object'?item.payload:{};
  if(!payload.requestedDate||(!key.startsWith('supplier_date_confirmation')&&!key.startsWith('client_payment_received')&&!key.startsWith('admin_new_booking'))){
    return sendLegacyWorkflowOutboxItem(env,requestUrl,item);
  }
  const preference=preferenceLabel(payload.requestedDate,payload.requestedDaypartLabel||payload.requestedDaypart);
  let copy;
  if(key.startsWith('supplier_date_confirmation')){
    const supplierUrl=buildSupplierUrl(requestUrl,payload.supplierToken);
    copy={
      subject:key.includes('reminder')?'Rappel · confirmation studio attendue':'Nouvelle réservation HORS NORME à confirmer',
      title:key.includes('reminder')?'Votre réponse est attendue':'Confirmez la date et précisez l’heure réelle',
      html:`${clientLine(item)}${card('PRÉFÉRENCE CLIENT',preference)}${payload.configurationChoice?card('CONFIGURATION',payload.configurationChoice):''}<p>Le client a choisi une date et une plage horaire. Ouvrez la page sécurisée pour confirmer l’heure exacte, proposer un autre créneau ou signaler une indisponibilité.</p>${supplierButtons(supplierUrl)}`,
    };
  }else if(key.startsWith('client_payment_received')){
    copy={subject:'Paiement confirmé · Date en validation',title:'Votre réservation Neptune Media est enregistrée',html:`${card('PRÉFÉRENCE DE PASSAGE',preference)}<p>Le studio confirme maintenant l’heure exacte. Vous pouvez réserver votre échange de préparation en parallèle ; Neptune vous avertira dès que le créneau sera verrouillé.</p>${button(portalUrl(requestUrl,item.clientEmail),'Accéder à mon espace client')}`};
  }else{
    copy={subject:`Nouvelle réservation · ${name(item)}`,title:'Le dossier est pris en charge automatiquement',html:`${clientLine(item)}${card('PRÉFÉRENCE CLIENT',preference)}${payload.configurationChoice?card('CONFIGURATION',payload.configurationChoice):''}<p>La demande sécurisée est transmise au studio. Les relances, le contrôle du délai et le suivi du dossier sont automatiques.</p>`};
  }
  return sendEmail(env,{to:item.toEmail,subject:copy.subject,html:layout(copy.title,copy.html),text:strip(copy.html)});
}

function preferenceLabel(dateValue,daypart){
  const date=new Date(`${dateValue}T12:00:00`);
  const label=Number.isNaN(date.getTime())?String(dateValue||''):new Intl.DateTimeFormat('fr-FR',{dateStyle:'full',timeZone:'Europe/Paris'}).format(date);
  const part=({morning:'Matin',afternoon:'Après-midi',flexible:'Horaire flexible'})[String(daypart||'')]||String(daypart||'');
  return [label,part].filter(Boolean).join(' · ');
}
function buildSupplierUrl(requestUrl,token){const u=new URL('/confirmation-studio/',new URL(requestUrl).origin);if(token)u.searchParams.set('token',token);return u.toString();}
function supplierButtons(url){const confirm=decisionUrl(url,'confirm'),alternate=decisionUrl(url,'alternate');return `<table role="presentation" cellspacing="0" cellpadding="0" style="margin:20px 0"><tr><td style="padding:0 10px 10px 0">${buttonInline(confirm,'Confirmer + préciser l’heure')}</td><td style="padding:0 0 10px">${buttonInline(alternate,'Proposer un autre créneau',true)}</td></tr></table><p style="font-size:12px;color:#747b91">La validation finale se fait sur une page sécurisée afin qu’aucun scanner automatique d’e-mail ne puisse confirmer à votre place.</p>`;}
function decisionUrl(value,decision){try{const u=new URL(value);u.searchParams.set('decision',decision);return u.toString();}catch{return value||'';}}
function clientLine(item){return `<p><strong>${e(item.fullName||'Client Neptune Media')}</strong>${item.company?` · ${e(item.company)}`:''}</p><p>${e(item.title||'Passage Neptune Media')} · ${e(item.format||'HORS NORME')}</p>`;}
function name(item){return item.fullName||item.company||item.clientEmail||'Client Neptune Media';}
function portalUrl(requestUrl,email){const u=new URL('/espace-client/',new URL(requestUrl).origin);if(email)u.searchParams.set('email',email);return u.toString();}
function card(label,value){return `<div style="margin:18px 0;padding:18px;border-radius:16px;background:#f5f3ff"><small style="font-weight:800;color:#6756d9">${e(label)}</small><p style="margin:7px 0 0;font-size:19px;font-weight:850">${e(value||'À confirmer')}</p></div>`;}
function button(url,label){return url?`<p><a href="${e(url)}" style="display:inline-block;padding:14px 22px;border-radius:999px;background:linear-gradient(120deg,#4267ff,#8d4cff,#ef4ba2);color:#fff;text-decoration:none;font-weight:800">${e(label)}</a></p>`:'';}
function buttonInline(url,label,secondary=false){return url?`<a href="${e(url)}" style="display:inline-block;padding:13px 18px;border-radius:999px;background:${secondary?'#eef0f8':'linear-gradient(120deg,#4267ff,#8d4cff,#ef4ba2)'};color:${secondary?'#26315c':'#fff'};border:${secondary?'1px solid #d9ddec':'0'};text-decoration:none;font-weight:800;white-space:nowrap">${e(label)}</a>`:'';}
function layout(title,content){return `<div style="font-family:Arial,sans-serif;max-width:640px;margin:auto;padding:34px;color:#11152b"><p style="letter-spacing:.16em;color:#6d55e8;font-weight:800">NEPTUNE MEDIA</p><h1 style="font-size:30px;line-height:1.08">${e(title)}</h1>${content}<hr style="border:0;border-top:1px solid #e7e8ef;margin:30px 0"><p style="font-size:13px;color:#73798d">Neptune Media · <a href="mailto:${CONTACT}">${CONTACT}</a></p></div>`;}
function strip(v){return String(v||'').replace(/<[^>]+>/gu,' ').replace(/&amp;/gu,'&').replace(/&lt;/gu,'<').replace(/&gt;/gu,'>').replace(/&#39;/gu,"'").replace(/&quot;/gu,'"').replace(/\s+/gu,' ').trim();}
function e(v){return String(v||'').replace(/[&<>"']/gu,(x)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[x]);}
