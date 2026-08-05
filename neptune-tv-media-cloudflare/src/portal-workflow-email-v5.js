import { sendEmail } from './email-service.js';

const CONTACT='contact@neptunebusiness.com';
const ADDRESS='11 Allée de Longueterre, 31850 Montrabé';
const MAP='https://www.google.com/maps/search/?api=1&query=11%20All%C3%A9e%20de%20Longueterre%2C%2031850%20Montrab%C3%A9';

export async function sendWorkflowOutboxItem(env,requestUrl,item={}){
  const c=context(requestUrl,item),copy=content(item.messageKey,c);
  return sendEmail(env,{to:item.toEmail,subject:copy.subject,html:layout(copy.title,copy.html),text:strip(copy.html)});
}

function context(requestUrl,item){const p=item.payload&&typeof item.payload==='object'?item.payload:{};return{...item,...p,portal:portalUrl(requestUrl,item.clientEmail),supplier:supplierUrl(requestUrl,p.supplierToken),filming:date(p.filmingAt||item.filmingAt||item.requestedFilmingAt),appointment:date(p.appointmentAt||item.appointmentAt),sourceDue:date(p.sourceDueAt||item.sourceDeliveryDueAt),deliveryDue:date(p.deliveryDueAt||item.deliveryDueAt),broadcast:date(p.broadcastAt||item.broadcastAt),broadcastUrl:p.broadcastUrl||item.broadcastUrl||''};}

function content(key,c){
  if(key.startsWith('supplier_date_confirmation'))return msg(
    key.includes('reminder')?'Rappel · confirmation studio attendue':'Nouvelle réservation HORS NORME à confirmer',
    key.includes('reminder')?'Votre réponse est attendue':'Pouvez-vous confirmer ce créneau ?',
    clientLine(c)+card('DATE DEMANDÉE',c.filming)+'<p>Choisissez directement l’action adaptée. Le bouton ouvre une page sécurisée déjà préremplie afin d’éviter toute erreur de date.</p>'+supplierDecisionButtons(c),
  );
  if(key.startsWith('client_payment_received'))return msg('Paiement confirmé · Date en validation','Votre réservation Neptune Media est enregistrée',card('DATE DEMANDÉE',c.filming)+'<p>Le studio dispose de 48 heures pour confirmer cette date. Réservez dès maintenant votre échange de préparation de 15 à 30 minutes.</p>'+button(c.portal,'Accéder à mon espace client'));
  if(key.startsWith('admin_new_booking'))return msg(`Nouvelle réservation · ${name(c)}`,'Une réservation doit être suivie',clientLine(c)+card('DATE DEMANDÉE',c.filming)+'<p>La demande sécurisée a été envoyée au studio. Les relances et alertes sont automatiques.</p>');
  if(key.startsWith('client_appointment_booked'))return msg('Rendez-vous de préparation réservé','Votre préparation est planifiée',card('RENDEZ-VOUS',c.appointment)+'<p>Ce rendez-vous de 15 à 30 minutes sert à préparer votre venue et répondre à vos questions.</p>'+button(c.portal,'Voir mon suivi'));
  if(key.startsWith('admin_appointment_booked'))return msg(`Préparation réservée · ${name(c)}`,'Le rendez-vous est synchronisé',clientLine(c)+card('RENDEZ-VOUS',c.appointment)+'<p>Aucune action n’est requise sauf anomalie.</p>');
  if(key.includes('date_confirmed'))return msg(key.startsWith('client_')?'Votre passage est confirmé':`Date confirmée · ${name(c)}`,'La date du studio est verrouillée',card('PASSAGE CONFIRMÉ',c.filming)+practical()+partyNote(c)+button(c.recipientType==='client'?c.portal:'','Voir les informations'));
  if(key.includes('date_alternate'))return msg(key.startsWith('client_')?'Le studio propose une autre date':'Nouvelle date proposée','Une autre date doit être validée',card('DATE PROPOSÉE',date(c.proposedAt))+(c.note?`<p><strong>Note :</strong> ${e(c.note)}</p>`:'')+'<p>Neptune vérifie cette proposition avec le client.</p>');
  if(key.includes('date_rejected'))return msg(key.startsWith('client_')?'La date demandée n’est pas disponible':'Date refusée par le studio','Une nouvelle date doit être organisée',(c.note?`<p><strong>Note :</strong> ${e(c.note)}</p>`:'')+'<p>Neptune reprend contact pour organiser un autre créneau.</p>');
  if(key.includes('preparation_completed'))return msg(key.startsWith('client_')?'Préparation terminée':`Préparation terminée · ${name(c)}`,'Le passage est prêt','<p>L’échange de préparation est terminé. Le système poursuit automatiquement les rappels et le suivi du studio.</p>'+button(c.recipientType==='client'?c.portal:'','Consulter le passage'));
  if(key.includes('reminder_7d'))return reminder(c,'J-7 · Votre passage approche','Préparez les idées, exemples et messages que vous souhaitez faire ressortir. Aucun texte n’est à apprendre.');
  if(key.includes('reminder_3d'))return reminder(c,'J-3 · Vérifiez les derniers détails','Vérifiez votre tenue, votre trajet et les éventuels éléments demandés dans votre espace client.');
  if(key.includes('reminder_1d')&&!key.includes('broadcast'))return reminder(c,'J-1 · Votre passage a lieu demain','Arrivez 15 minutes avant le créneau. En cas d’imprévu, contactez Neptune immédiatement.');
  if(key.includes('filming_completed'))return msg(key.startsWith('client_')?'Votre passage est terminé':`Tournage terminé · ${name(c)}`,'Le délai de livraison fournisseur démarre',card('FICHIERS SOURCES ATTENDUS',c.sourceDue)+'<p>REC BOX dispose de 7 jours ouvrés maximum pour transmettre les fichiers à Neptune.</p>'+button(c.recipientType==='client'?c.portal:'','Suivre la production'));
  if(key.includes('source_delivery_requested'))return msg('Fichiers du tournage à transmettre','Livraison fournisseur attendue',card('ÉCHÉANCE MAXIMALE',c.sourceDue)+'<p>Merci de transmettre l’intégralité des fichiers image et son exploitables. Neptune confirmera leur réception.</p>');
  if(key.includes('source_due_2d'))return msg('Rappel · Sources attendues sous 2 jours','Échéance fournisseur proche',card('ÉCHÉANCE',c.sourceDue)+'<p>Merci de vérifier que tous les fichiers seront livrés dans les délais.</p>');
  if(key.includes('source_overdue'))return msg(key.startsWith('admin_')?`Sources en retard · ${name(c)}`:'Retard de livraison des fichiers','L’échéance fournisseur est dépassée',card('ÉCHÉANCE',c.sourceDue)+'<p>Le montage reste bloqué tant que les sources ne sont pas reçues.</p>');
  if(key.includes('sources_received'))return msg(key.startsWith('client_')?'Les fichiers du studio sont reçus':`Sources reçues · ${name(c)}`,'Contrôle technique en cours',card('LIVRAISON NEPTUNE CIBLE',c.deliveryDue)+'<p>Neptune vérifie l’image, le son, l’intégrité et la complétude des fichiers.</p>'+button(c.recipientType==='client'?c.portal:'','Voir le suivi'));
  if(key.includes('qc_failed'))return msg(key.startsWith('supplier_')?'Fichiers à corriger':`Contrôle technique en échec · ${name(c)}`,'Une correction est nécessaire',`<p>${e(c.note||'Certains fichiers sont incomplets ou non exploitables.')}</p>`);
  if(key.includes('editing_started'))return msg(key.startsWith('client_')?'Le montage de vos contenus a commencé':`Montage lancé · ${name(c)}`,'Production Neptune en cours',card('LIVRAISON CIBLE',c.deliveryDue)+'<p>Le long format et les contenus courts sont en montage, sous-titrage, export et contrôle qualité.</p>'+button(c.recipientType==='client'?c.portal:'','Suivre le montage'));
  if(key.includes('delivery_overdue'))return msg(`Montage en retard · ${name(c)}`,'Échéance de livraison dépassée',card('ÉCHÉANCE',c.deliveryDue)+'<p>Le dossier doit être vérifié dans le Studio Admin.</p>');
  if(key.includes('delivery_ready'))return msg(key.startsWith('client_')?'Vos contenus sont disponibles':`Livraison prête · ${name(c)}`,'La livraison est prête',`<p><strong>${Number(c.finalCount||0)}</strong> émission · <strong>${Number(c.shortCount||0)}</strong> contenu(s) court(s)</p><p>Le long format entre maintenant dans la programmation de diffusion.</p>`+button(c.recipientType==='client'?c.portal:'','Accéder aux contenus'));
  if(key.includes('broadcast_scheduled'))return msg('Diffusion programmée · Neptune Media','La date de diffusion est fixée',card('DIFFUSION',c.broadcast)+(c.broadcastUrl?button(c.broadcastUrl,'Ouvrir la page de diffusion'):'')+'<p>Le client, Neptune et le fournisseur ont été informés.</p>');
  if(key.includes('broadcast_reminder_1d'))return msg('Rappel · Diffusion demain','L’émission sera diffusée demain',card('DIFFUSION',c.broadcast)+(c.broadcastUrl?button(c.broadcastUrl,'Ouvrir la diffusion'):''));
  if(key.includes('broadcast_published'))return msg('L’émission est diffusée','Le parcours est terminé',(c.broadcastUrl?button(c.broadcastUrl,'Voir le replay'):'<p>Le replay sera ajouté dès sa disponibilité.</p>')+button(c.recipientType==='client'?c.portal:'','Retrouver mes contenus'));
  if(key.includes('supplier_confirmation_overdue'))return msg(`Confirmation studio en retard · ${name(c)}`,'Le délai de 48 heures est dépassé',card('DATE DEMANDÉE',c.filming)+'<p>Le dossier nécessite une intervention Neptune.</p>');
  return msg('Mise à jour Neptune Media','Votre parcours a été mis à jour',`<p>${e(c.nextAction||'Consultez le suivi pour connaître la prochaine étape.')}</p>`+button(c.recipientType==='client'?c.portal:'','Voir mon suivi'));
}

function supplierDecisionButtons(c){
  const confirm=decisionUrl(c.supplier,'confirm'),alternate=decisionUrl(c.supplier,'alternate');
  return `<table role="presentation" cellspacing="0" cellpadding="0" style="margin:20px 0"><tr><td style="padding:0 10px 10px 0">${buttonInline(confirm,'Confirmer ce créneau')}</td><td style="padding:0 0 10px">${buttonInline(alternate,'Proposer un autre créneau',true)}</td></tr></table><p style="font-size:12px;color:#747b91">Par sécurité, le clic ouvre la réponse préremplie avant son enregistrement définitif. Cela évite qu’un scanner automatique d’e-mail confirme le rendez-vous à votre place.</p>`;
}
function decisionUrl(value,decision){try{const u=new URL(value);u.searchParams.set('decision',decision);return u.toString();}catch{return value||'';}}
function buttonInline(url,label,secondary=false){return url?`<a href="${e(url)}" style="display:inline-block;padding:13px 18px;border-radius:999px;background:${secondary?'#eef0f8':'linear-gradient(120deg,#4267ff,#8d4cff,#ef4ba2)'};color:${secondary?'#26315c':'#fff'};border:${secondary?'1px solid #d9ddec':'0'};text-decoration:none;font-weight:800;white-space:nowrap">${e(label)}</a>`:'';}
function reminder(c,title,advice){return msg(`Rappel passage · ${c.filming}`,title,card('DATE ET HEURE',c.filming)+practical()+`<p>${e(advice)}</p>`+button(c.recipientType==='client'?c.portal:'','Ouvrir la checklist'));}
function partyNote(c){return c.recipientType==='client'?'<p>Les rappels J-7, J-3 et J-1 sont maintenant actifs.</p>':'<p>La campagne de préparation est maintenant active.</p>';}
function clientLine(c){return `<p><strong>${e(c.fullName||'Client Neptune Media')}</strong>${c.company?` · ${e(c.company)}`:''}</p><p>${e(c.title||'Passage Neptune Media')} · ${e(c.format||'HORS NORME')}</p>`;}
function practical(){return `<div style="margin:18px 0;padding:18px;border-radius:16px;background:#f5f3ff"><small style="font-weight:800;color:#6756d9">STUDIO</small><p style="margin:7px 0 4px;font-weight:800">REC BOX Studio</p><p style="margin:0;color:#555d73">${e(ADDRESS)}</p><p><a href="${MAP}" style="color:#5b42ff;font-weight:800">Ouvrir l’itinéraire</a></p></div>`;}
function msg(subject,title,html){return{subject,title,html};}
function card(label,value){return `<div style="margin:18px 0;padding:18px;border-radius:16px;background:#f5f3ff"><small style="font-weight:800;color:#6756d9">${e(label)}</small><p style="margin:7px 0 0;font-size:19px;font-weight:850">${e(value||'À confirmer')}</p></div>`;}
function button(url,label){return url?`<p><a href="${e(url)}" style="display:inline-block;padding:14px 22px;border-radius:999px;background:linear-gradient(120deg,#4267ff,#8d4cff,#ef4ba2);color:#fff;text-decoration:none;font-weight:800">${e(label)}</a></p>`:'';}
function layout(title,content){return `<div style="font-family:Arial,sans-serif;max-width:640px;margin:auto;padding:34px;color:#11152b"><p style="letter-spacing:.16em;color:#6d55e8;font-weight:800">NEPTUNE MEDIA</p><h1 style="font-size:30px;line-height:1.08">${e(title)}</h1>${content}<hr style="border:0;border-top:1px solid #e7e8ef;margin:30px 0"><p style="font-size:13px;color:#73798d">Neptune Media · <a href="mailto:${CONTACT}">${CONTACT}</a></p></div>`;}
function portalUrl(requestUrl,email){const u=new URL('/espace-client/',new URL(requestUrl).origin);if(email)u.searchParams.set('email',email);return u.toString();}
function supplierUrl(requestUrl,token){const u=new URL('/confirmation-studio/',new URL(requestUrl).origin);if(token)u.searchParams.set('token',token);return u.toString();}
function date(value){const d=new Date(value||'');return Number.isNaN(d.getTime())?'À confirmer':new Intl.DateTimeFormat('fr-FR',{dateStyle:'full',timeStyle:'short',timeZone:'Europe/Paris'}).format(d);}
function name(c){return c.fullName||c.company||c.clientEmail||'Client Neptune Media';}
function strip(v){return String(v||'').replace(/<[^>]+>/gu,' ').replace(/&amp;/gu,'&').replace(/&lt;/gu,'<').replace(/&gt;/gu,'>').replace(/&#39;/gu,"'").replace(/&quot;/gu,'"').replace(/\s+/gu,' ').trim();}
function e(v){return String(v||'').replace(/[&<>"']/gu,(x)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[x]);}
