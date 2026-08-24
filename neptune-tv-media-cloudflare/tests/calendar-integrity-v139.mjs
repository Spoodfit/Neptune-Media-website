import { readFile } from 'node:fs/promises';
import {
  captureCalendarIntegrityV139,
  finalizeCalendarIntegrityV139,
} from '../src/calendar-integrity-v139.js';

const read=(path)=>readFile(new URL(`../${path}`,import.meta.url),'utf8');
const [entry,server,client]=await Promise.all([
  read('src/entry-v41.js'),
  read('src/calendar-integrity-v139.js'),
  read('public/studio/calendar-integrity-v139.js'),
]);

const checks=[];
const expect=(condition,label)=>checks.push({condition:Boolean(condition),label});

expect(entry.includes("from './calendar-integrity-v139.js'"),'active v41 imports calendar integrity v139');
expect(entry.includes('captureCalendarIntegrityV139(request)'),'active entry captures Journey calendar actions before base');
expect(entry.includes('finalizeCalendarIntegrityV139(calendarMeta,response,env)'),'active entry validates Calendar/Meet after base action');
expect(entry.includes('injectCalendarIntegrityV139(response)'),'Studio clients receives v139 UI guard');

expect(server.includes("const PREPARATION_ACTION='set_appointment'"),'preparation action is governed');
expect(server.includes("const FILMING_ACTION='set_filming_date'"),'filming action is governed');
expect(server.includes("meta.payload.createCalendar!==false"),'manual preparation requires calendar unless explicitly disabled');
expect(server.includes("meta.payload.createCalendar===true"),'manual filming Meet only runs from explicit UI choice');
expect(server.includes('ensurePreparationMeet(meta,body,env)'),'preparation result is verified for a real Meet');
expect(server.includes("url.hostname.toLowerCase()==='meet.google.com'"),'calendar HTML links cannot masquerade as Meet links');
expect(server.includes('waitForMeet(token,eventId)'),'asynchronous Meet creation is polled before success');
expect(server.includes('conferenceDataVersion=1&sendUpdates=all'),'Google invitations are sent on create/update');
expect(server.includes("neptuneEventKind:'filming'"),'filming event has a stable private event kind');
expect(server.includes("privateExtendedProperty','neptuneEventKind=filming'"),'filming updates reuse the same event instead of duplicating');
expect(server.includes("calendarConfirmed:false"),'preparation partial success is not reported as full success');
expect(server.includes("filmingCalendarConfirmed:false"),'filming partial success is not reported as full success');
expect(server.includes("error:filming.error||'filming_calendar_failed'"),'filming Meet failure is explicit and retryable');
expect(server.includes('/portal/preparation-calendar-synced-v85'),'repaired preparation Meet is persisted back to Neptune');
expect(server.includes('sendUpdates=all'),'Calendar attendee updates are sent by Google');

expect(client.includes("payload?.action==='set_filming_date'"),'filming date request is augmented client-side');
expect(client.includes('data-v139-filming-meet'),'manual filming dialog exposes explicit Meet choice');
expect(client.includes('Enregistrer + envoyer le Meet'),'manual UI communicates the side effect before validation');
expect(client.includes('Réessayer Google Meet'),'failed synchronization stays retryable in the same dialog');
expect(client.includes('Le créneau est enregistré, mais Google Meet'),'partial preparation failure is explained truthfully');
expect(client.includes('Rejoindre le Meet du passage'),'filming Meet remains accessible from the passage dossier');
expect(client.includes("url.hostname.toLowerCase()==='meet.google.com'"),'client only exposes genuine Meet URLs');

await runtimePreparationRecovery();
await runtimePreparationFailure();
await runtimeFilmingCreation();

const failures=checks.filter(item=>!item.condition);
for(const item of checks)console.log(`${item.condition?'✓':'✗'} ${item.label}`);
if(failures.length){
  console.error(`Calendar integrity v139 failed: ${failures.length} check(s).`);
  process.exit(1);
}
console.log(`Calendar integrity v139 passed: ${checks.length} checks.`);

async function runtimePreparationRecovery(){
  const originalFetch=globalThis.fetch;
  const storeCalls=[];
  const env=fakeEnv(storeCalls,{orderId:'order-prep',email:'client@example.com'});
  let eventReads=0;
  globalThis.fetch=async (url,options={})=>{
    const target=String(url);
    if(target.includes('/events/prep-event')){
      if((options.method||'GET')==='PATCH'){
        return googleJson({id:'prep-event',status:'confirmed',htmlLink:'https://calendar.google.com/event?eid=prep',hangoutLink:'https://meet.google.com/abc-defg-hij',attendees:[{email:'client@example.com'}]});
      }
      eventReads+=1;
      return googleJson({id:'prep-event',status:'confirmed',htmlLink:'https://calendar.google.com/event?eid=prep',attendees:[{email:'client@example.com'}]});
    }
    throw new Error(`unexpected google call ${target}`);
  };
  try{
    const request=journeyRequest({orderId:'order-prep',action:'set_appointment',appointmentAt:'2026-09-01T10:00:00.000Z',createCalendar:true});
    const meta=await captureCalendarIntegrityV139(request);
    const base=new Response(JSON.stringify({ok:true,action:'set_appointment',orderId:'order-prep',appointmentAt:'2026-09-01T10:00:00.000Z',calendar:{eventId:'prep-event',htmlLink:'https://calendar.google.com/event?eid=prep'}}),{status:200,headers:{'Content-Type':'application/json'}});
    const result=await finalizeCalendarIntegrityV139(meta,base,env);
    const body=await result.json();
    expect(result.status===200,'runtime preparation recovery stays successful after Meet repair');
    expect(body.calendarConfirmed===true,'runtime preparation confirms Calendar only after Meet exists');
    expect(body.meetingUrl==='https://meet.google.com/abc-defg-hij','runtime preparation returns genuine Meet URL');
    expect(eventReads>=1,'runtime preparation re-reads Google event before repair');
    expect(storeCalls.some(call=>call.path==='/portal/preparation-calendar-synced-v85'&&call.body.payload.meetingUrl==='https://meet.google.com/abc-defg-hij'),'runtime preparation persists repaired Meet in Neptune');
  }finally{globalThis.fetch=originalFetch;}
}

async function runtimePreparationFailure(){
  const originalFetch=globalThis.fetch;
  const env=fakeEnv([],{orderId:'order-prep-fail',email:'client@example.com'});
  globalThis.fetch=async (url,options={})=>{
    const target=String(url);
    if(target.includes('/events/prep-event-fail')&&(options.method||'GET')==='GET')return googleJson({id:'prep-event-fail',status:'confirmed',htmlLink:'https://calendar.google.com/event?eid=fail'});
    if(target.includes('/events/prep-event-fail')&&(options.method||'GET')==='PATCH')return googleJson({error:{message:'conference unavailable'}},500);
    throw new Error(`unexpected google call ${target}`);
  };
  try{
    const request=journeyRequest({orderId:'order-prep-fail',action:'set_appointment',appointmentAt:'2026-09-01T11:00:00.000Z',createCalendar:true});
    const meta=await captureCalendarIntegrityV139(request);
    const base=new Response(JSON.stringify({ok:true,action:'set_appointment',orderId:'order-prep-fail',appointmentAt:'2026-09-01T11:00:00.000Z',calendar:{eventId:'prep-event-fail',htmlLink:'https://calendar.google.com/event?eid=fail'}}),{status:200,headers:{'Content-Type':'application/json'}});
    const result=await finalizeCalendarIntegrityV139(meta,base,env);
    const body=await result.json();
    expect(result.status===502,'runtime preparation refuses false success when Meet creation fails');
    expect(body.partialSuccess===true&&body.retryable===true,'runtime preparation exposes retryable partial success');
    expect(body.calendarConfirmed===false,'runtime preparation never marks failed Meet as confirmed');
  }finally{globalThis.fetch=originalFetch;}
}

async function runtimeFilmingCreation(){
  const originalFetch=globalThis.fetch;
  const storeCalls=[];
  const env=fakeEnv(storeCalls,{orderId:'order-film',email:'client@example.com',fullName:'Client Test',title:'Hors Norme'});
  let createdPayload=null;
  globalThis.fetch=async (url,options={})=>{
    const target=String(url);
    if(target.includes('/calendars/primary/events?')&&(options.method||'GET')==='GET')return googleJson({items:[]});
    if(target.includes('/calendars/primary/events?')&&(options.method||'GET')==='POST'){
      createdPayload=JSON.parse(options.body||'{}');
      return googleJson({id:'filming-event',status:'confirmed',htmlLink:'https://calendar.google.com/event?eid=film',hangoutLink:'https://meet.google.com/film-meet-001',attendees:[{email:'client@example.com'}]});
    }
    throw new Error(`unexpected google call ${target}`);
  };
  try{
    const request=journeyRequest({orderId:'order-film',action:'set_filming_date',filmingAt:'2026-09-10T13:00:00.000Z',createCalendar:true,durationMinutes:60});
    const meta=await captureCalendarIntegrityV139(request);
    const base=new Response(JSON.stringify({ok:true,action:'set_filming_date',orderId:'order-film',filmingAt:'2026-09-10T13:00:00.000Z'}),{status:200,headers:{'Content-Type':'application/json'}});
    const result=await finalizeCalendarIntegrityV139(meta,base,env);
    const body=await result.json();
    expect(result.status===200&&body.filmingCalendarConfirmed===true,'runtime filming confirms Google Calendar + Meet creation');
    expect(body.filmingCalendar.meetingUrl==='https://meet.google.com/film-meet-001','runtime filming returns passage Meet URL');
    expect(createdPayload?.attendees?.[0]?.email==='client@example.com','runtime filming invites the client');
    expect(createdPayload?.conferenceData?.createRequest?.conferenceSolutionKey?.type==='hangoutsMeet','runtime filming requests Google Meet conference');
    expect(createdPayload?.extendedProperties?.private?.neptuneEventKind==='filming','runtime filming tags event for idempotent future updates');
  }finally{globalThis.fetch=originalFetch;}
}

function fakeEnv(calls,order){
  const studio={
    async fetch(url,options={}){
      const path=new URL(url).pathname;
      const body=JSON.parse(options.body||'{}');
      calls.push({path,body});
      if(path==='/portal/drive-token-get')return json({accessToken:'google-token'});
      if(path==='/portal/simple-journey-context-v92')return json({ok:true,order:{id:order.orderId,email:order.email,fullName:order.fullName||'',company:'',title:order.title||'Passage',format:'Hors Norme'}});
      if(path==='/portal/preparation-calendar-synced-v85')return json({ok:true,updatedAt:'2026-08-24T08:00:00.000Z',meetingUrl:body.payload.meetingUrl});
      return json({error:`unexpected_store_${path}`},500);
    },
  };
  return {STUDIO:{idFromName:()=>({toString:()=> 'neptune-media-main'}),get:()=>studio}};
}

function journeyRequest(payload){
  return new Request('https://tv.neptunebusiness.com/api/admin/journey-v92/action',{method:'POST',headers:{'Content-Type':'application/json','X-Admin-Token':'test'},body:JSON.stringify(payload)});
}

function googleJson(data,status=200){return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});}
function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});}
