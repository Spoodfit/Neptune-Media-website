import { sanitizeText, sanitizeUrl } from './security.js';

export const CODE_TTL = 10 * 60;
export const SESSION_TTL = 12 * 60 * 60;

export const ORDER_STEPS = [
  ['payment','Paiement reçu'],
  ['reservation','Commande enregistrée'],
  ['appointment','Rendez-vous de préparation réservé'],
  ['date_confirmation','Date à confirmer par le studio'],
  ['preparation','Préparation terminée'],
  ['filming','Passage confirmé'],
  ['shot','Passage réalisé'],
  ['videos_pending','Vidéos du studio attendues'],
  ['videos_received','Vidéos reçues par Neptune'],
  ['editing','Vidéos en traitement'],
  ['delivery','Vidéos montées et livrées'],
  ['done','Projet terminé'],
];

export const STATUS_PROGRESS = {
  payment_confirmed:1,
  reservation_confirmed:2,
  preparation_booking_pending:2,
  appointment_confirmed:3,
  appointment_booked:3,
  preparation:3,
  studio_date_confirmation_pending:4,
  preparation_complete:5,
  filming_scheduled:6,
  filming_confirmed:6,
  filmed:7,
  videos_pending:8,
  videos_received:9,
  editing:10,
  approval:10,
  delivered:11,
  completed:12,
};

export const STATUS_LABELS = {
  payment_confirmed:'Paiement reçu',
  reservation_confirmed:'Rendez-vous de préparation à réserver',
  preparation_booking_pending:'Rendez-vous de préparation à réserver',
  appointment_confirmed:'Rendez-vous de préparation réservé',
  appointment_booked:'Rendez-vous de préparation réservé',
  preparation:'Préparation en cours',
  studio_date_confirmation_pending:'Confirmation de date attendue',
  preparation_complete:'Rendez-vous de préparation terminé',
  filming_scheduled:'Passage confirmé',
  filming_confirmed:'Passage confirmé',
  filmed:'Passage réalisé',
  videos_pending:'Vidéos du studio attendues',
  videos_received:'Vidéos reçues',
  editing:'Vidéos en cours de traitement',
  approval:'Vidéos en cours de traitement',
  delivered:'Vidéos montées et livrées',
  completed:'Projet terminé',
};

export const NEXT_STATUS = {
  payment_confirmed:'reservation_confirmed',
  reservation_confirmed:'appointment_confirmed',
  preparation_booking_pending:'appointment_confirmed',
  appointment_confirmed:'studio_date_confirmation_pending',
  appointment_booked:'studio_date_confirmation_pending',
  preparation:'preparation_complete',
  studio_date_confirmation_pending:'preparation_complete',
  preparation_complete:'filming_scheduled',
  filming_scheduled:'filmed',
  filming_confirmed:'filmed',
  filmed:'videos_pending',
  videos_pending:'videos_received',
  videos_received:'editing',
  editing:'delivered',
  approval:'delivered',
  delivered:'completed',
};

export function normalizeEmail(value){const email=sanitizeText(value,254).toLowerCase();return /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email)?email:'';}
export function nullableIso(value){const text=sanitizeText(value,80);if(!text)return null;const date=new Date(text);return Number.isNaN(date.getTime())?null:date.toISOString();}
export function safeInteger(value,min=0,max=100000000){const number=Number(value);return Number.isFinite(number)?Math.min(max,Math.max(min,Math.round(number))):min;}
export function normalizeStatus(value){const status=sanitizeText(value,60);return Object.hasOwn(STATUS_PROGRESS,status)?status:'reservation_confirmed';}
export function statusLabel(value){return STATUS_LABELS[value]||'En cours';}
export function statusRank(value){return STATUS_PROGRESS[value]||2;}
export function nextStatus(value){return NEXT_STATUS[value]||'';}
export function nextActionForStatus(status,context={}){
  const filming=context.filmingAt?new Intl.DateTimeFormat('fr-FR',{dateStyle:'long',timeStyle:'short',timeZone:'Europe/Paris'}).format(new Date(context.filmingAt)):'';
  return ({
    payment_confirmed:'Réserver le rendez-vous de préparation',
    reservation_confirmed:'Réserver le rendez-vous de préparation',
    preparation_booking_pending:'Réserver le rendez-vous de préparation',
    appointment_confirmed:'Neptune confirme votre demande de date sous 48 h',
    appointment_booked:'Neptune confirme votre demande de date sous 48 h',
    preparation:'Terminer le rendez-vous de préparation',
    studio_date_confirmation_pending:'Attendre la confirmation de la date par le studio',
    preparation_complete:'Confirmer le passage au studio',
    filming_scheduled:filming?`Se présenter au studio le ${filming}`:'Se présenter au passage confirmé',
    filming_confirmed:filming?`Se présenter au studio le ${filming}`:'Se présenter au passage confirmé',
    filmed:'Attendre la réception des vidéos du studio, sous 7 jours maximum',
    videos_pending:'Réception des vidéos du studio sous 7 jours maximum',
    videos_received:'Lancer le traitement et le montage des vidéos',
    editing:'Livraison sous 15 jours maximum après le passage',
    approval:'Livraison sous 15 jours maximum après le passage',
    delivered:'Télécharger et planifier les contenus livrés',
    completed:'Projet terminé',
  })[status]||'Suivre la prochaine étape';
}
export function cleanOrderPayload(payload={}){return {
  email:normalizeEmail(payload.email),fullName:sanitizeText(payload.fullName||payload.name,160),company:sanitizeText(payload.company,180),
  externalPaymentId:sanitizeText(payload.externalPaymentId||payload.stripePaymentId||payload.paymentIntentId||payload.checkoutSessionId,220),
  orderReference:sanitizeText(payload.orderReference,160),productCode:sanitizeText(payload.productCode,100),
  title:sanitizeText(payload.title,200),format:sanitizeText(payload.format,100),paymentStatus:sanitizeText(payload.paymentStatus,40).toLowerCase()||'paid',
  amountTotal:safeInteger(payload.amountTotal),currency:sanitizeText(payload.currency,10).toLowerCase()||'eur',
  status:normalizeStatus(payload.status||'reservation_confirmed'),appointmentAt:nullableIso(payload.appointmentAt),filmingAt:nullableIso(payload.filmingAt),
  nextAction:sanitizeText(payload.nextAction,320),preparationUrl:sanitizeUrl(payload.preparationUrl,1200),bookingUrl:sanitizeUrl(payload.bookingUrl,1200),
};}
export function createSteps(store,orderId,status,now){
  const progress=statusRank(status);
  for(let i=0;i<ORDER_STEPS.length;i+=1){
    const [key,label]=ORDER_STEPS[i],pos=i+1,state=pos<progress?'done':pos===progress?'current':'pending';
    store.sql.exec(`
      INSERT INTO portal_steps (id,order_id,step_key,label,state,display_order,completed_at,note)
      VALUES (?,?,?,?,?,?,?,?)
      ON CONFLICT(order_id,step_key) DO UPDATE SET
        label=excluded.label,
        display_order=excluded.display_order
      WHERE portal_steps.label IS NOT excluded.label
         OR portal_steps.display_order IS NOT excluded.display_order
    `,crypto.randomUUID(),orderId,key,label,state,pos*10,state==='done'?now:null,'');
  }
}
export function syncSteps(store,orderId,status,now){
  createSteps(store,orderId,status,now);
  const progress=statusRank(status);
  for(let i=0;i<ORDER_STEPS.length;i+=1){
    const key=ORDER_STEPS[i][0],pos=i+1,state=pos<progress?'done':pos===progress?'current':'pending';
    store.sql.exec(`
      UPDATE portal_steps
      SET state=?,
          completed_at=CASE WHEN ?='done' THEN COALESCE(completed_at,?) ELSE NULL END
      WHERE order_id=? AND step_key=?
        AND (
          state<>?
          OR (?='done' AND completed_at IS NULL)
          OR (?<>'done' AND completed_at IS NOT NULL)
        )
    `,state,state,now,orderId,key,state,state,state);
  }
}
