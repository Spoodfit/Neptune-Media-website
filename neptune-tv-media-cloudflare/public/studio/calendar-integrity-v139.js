const RELEASE='neptune-calendar-integrity-ui-20260824-v139';
const nativeFetch=window.fetch.bind(window);
const filmingCalendars=new Map();
let queued=false;

start();

function start(){
  document.documentElement.dataset.neptuneCalendarIntegrity=RELEASE;
  window.fetch=calendarAwareFetch;
  document.readyState==='loading'
    ? document.addEventListener('DOMContentLoaded',boot,{once:true})
    : boot();
}

function boot(){
  enhance();
  new MutationObserver(schedule).observe(document.body,{subtree:true,childList:true,characterData:true});
  window.addEventListener('hashchange',schedule);
}

async function calendarAwareFetch(input,init={}){
  const url=requestUrl(input);
  let nextInit=init||{};
  let payload=null;

  if(url?.pathname==='/api/admin/journey-v92/action'&&String(nextInit.method||'POST').toUpperCase()==='POST'){
    payload=parseBody(nextInit.body);
    if(payload?.action==='set_filming_date'){
      const toggle=document.querySelector('[data-v139-filming-meet]');
      payload={...payload,createCalendar:toggle?toggle.checked:true,durationMinutes:60};
      nextInit={...nextInit,body:JSON.stringify(payload)};
    }
  }

  const response=await nativeFetch(input,nextInit);

  if(url?.pathname==='/api/admin/journey-v92/context'&&response.ok){
    const requestPayload=parseBody(nextInit.body);
    const data=await response.clone().json().catch(()=>null);
    const orderId=String(requestPayload?.orderId||data?.order?.id||'').trim();
    if(orderId){
      if(data?.filmingCalendar?.meetingUrl)filmingCalendars.set(orderId,data.filmingCalendar);
      else filmingCalendars.delete(orderId);
      schedule();
    }
  }

  if(url?.pathname==='/api/admin/journey-v92/action'){
    const data=await response.clone().json().catch(()=>null);
    if(data?.filmingCalendar?.meetingUrl&&payload?.orderId){
      filmingCalendars.set(String(payload.orderId),data.filmingCalendar);
      schedule();
    }
    if(!response.ok&&data?.error){
      const friendly=friendlyError(data.error,data);
      if(friendly!==data.error)return jsonResponse(response,{...data,error:friendly});
    }
  }

  return response;
}

function enhance(){
  enhanceFilmingEditor();
  enhancePreparationEditor();
  enhanceRetryLabels();
  enhanceFilmingMeetLink();
}

function enhanceFilmingEditor(){
  const dialog=document.querySelector('#v92ActionDialog');
  const input=dialog?.querySelector('[data-v92-edit-filming]');
  if(!input||dialog.querySelector('[data-v139-filming-meet]'))return;
  const label=input.closest('label');
  label?.insertAdjacentHTML('afterend',`
    <label class="v92-field" data-v139-filming-calendar-option>
      <span><input type="checkbox" data-v139-filming-meet checked> Créer ou mettre à jour Google Agenda + Meet</span>
      <small>Le client reçoit l’invitation Google et le même événement est déplacé si vous modifiez ce créneau.</small>
    </label>`);
  const submit=dialog.querySelector('[data-v92-dialog-submit]');
  if(submit){
    submit.textContent='Enregistrer + envoyer le Meet';
    submit.dataset.originalLabel='Enregistrer + envoyer le Meet';
  }
}

function enhancePreparationEditor(){
  const dialog=document.querySelector('#v92ActionDialog');
  const input=dialog?.querySelector('[data-v92-edit-preparation]');
  if(!input)return;
  if(!dialog.querySelector('[data-v139-preparation-note]')){
    const note=document.createElement('p');
    note.className='v92-dialog-note';
    note.dataset.v139PreparationNote='true';
    note.textContent='Neptune ne considérera pas cette action comme totalement réussie tant que Google Meet n’aura pas été créé et l’invitation envoyée.';
    input.closest('label')?.insertAdjacentElement('afterend',note);
  }
  const submit=dialog.querySelector('[data-v92-dialog-submit]');
  if(submit){
    submit.textContent='Enregistrer + envoyer le Meet';
    submit.dataset.originalLabel='Enregistrer + envoyer le Meet';
  }
}

function enhanceRetryLabels(){
  const dialog=document.querySelector('#v92ActionDialog');
  const message=dialog?.querySelector('[data-v92-dialog-message].is-error');
  const submit=dialog?.querySelector('[data-v92-dialog-submit]');
  if(!message||!submit)return;
  if(/Google|Meet|Agenda/iu.test(message.textContent||'')){
    submit.textContent='Réessayer Google Meet';
    submit.dataset.originalLabel='Réessayer Google Meet';
  }
}

function enhanceFilmingMeetLink(){
  const root=document.querySelector('#clientDetail');
  const orderId=String(root?.dataset.orderId||'').trim();
  const calendar=filmingCalendars.get(orderId);
  if(!root||!calendar?.meetingUrl)return;
  const meet=safeMeet(calendar.meetingUrl);
  if(!meet)return;
  const step=[...root.querySelectorAll('.v92-step')].find(node=>node.querySelector('h3')?.textContent?.trim()==='Date du passage');
  const actions=step?.querySelector('.v92-step-actions');
  if(!actions||actions.querySelector('[data-v139-filming-meet-link]'))return;
  const link=document.createElement('a');
  link.className='v92-secondary';
  link.dataset.v139FilmingMeetLink='true';
  link.href=meet;
  link.target='_blank';
  link.rel='noopener noreferrer';
  link.textContent='Rejoindre le Meet du passage';
  actions.append(link);
}

function friendlyError(code,data={}){
  const messages={
    calendar_meet_missing:'Le créneau est enregistré, mais Google Meet n’a pas pu être créé. Cliquez sur « Réessayer Google Meet » : Neptune mettra à jour le même événement sans créer de doublon.',
    calendar_access_missing:'Le créneau est enregistré, mais Google Agenda doit être réautorisé avant l’envoi du Meet.',
    calendar_sync_failed:'Le créneau est enregistré, mais Google Agenda n’a pas confirmé la synchronisation. Réessayez le Meet.',
    filming_calendar_failed:'La date du passage est enregistrée, mais l’invitation Google Agenda + Meet n’a pas été confirmée. Réessayez sans recréer le passage.',
  };
  if(messages[code])return messages[code];
  if(data?.calendarIssue&&messages[data.calendarIssue])return messages[data.calendarIssue];
  return code;
}

function schedule(){
  if(queued)return;
  queued=true;
  queueMicrotask(()=>{queued=false;enhance();});
}

function requestUrl(input){
  try{return new URL(typeof input==='string'?input:input?.url,location.href);}catch{return null;}
}

function parseBody(body){
  if(typeof body!=='string')return null;
  try{return JSON.parse(body);}catch{return null;}
}

function jsonResponse(response,data){
  const headers=new Headers(response.headers);
  headers.delete('Content-Length');
  headers.set('Content-Type','application/json; charset=utf-8');
  headers.set('Cache-Control','no-store');
  return new Response(JSON.stringify(data),{status:response.status,statusText:response.statusText,headers});
}

function safeMeet(value){
  try{
    const url=new URL(String(value||''));
    return url.protocol==='https:'&&url.hostname.toLowerCase()==='meet.google.com'?url.toString():'';
  }catch{return '';}
}
