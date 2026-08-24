import { adminAuth } from './portal-http-utils.js';

const RELEASE='neptune-calendar-integrity-20260824-v139';
const JOURNEY_ACTION='/api/admin/journey-v92/action';
const JOURNEY_CONTEXT='/api/admin/journey-v92/context';
const CALENDAR_API='https://www.googleapis.com/calendar/v3';
const TIME_ZONE='Europe/Paris';
const PREPARATION_ACTION='set_appointment';
const FILMING_ACTION='set_filming_date';

export async function captureCalendarIntegrityV139(request){
  if(request.method!=='POST')return null;
  const url=new URL(request.url);
  if(![JOURNEY_ACTION,JOURNEY_CONTEXT].includes(url.pathname))return null;
  const payload=await request.clone().json().catch(()=>({}));
  if(url.pathname===JOURNEY_CONTEXT){
    const orderId=String(payload.orderId||'').trim();
    return orderId?{kind:'context',orderId,payload,request:request.clone()}:null;
  }
  const action=String(payload.action||'').trim();
  if(![PREPARATION_ACTION,FILMING_ACTION].includes(action))return null;
  const orderId=String(payload.orderId||'').trim();
  return orderId?{kind:'action',action,orderId,payload,request:request.clone()}:null;
}

export async function finalizeCalendarIntegrityV139(meta,response,env){
  if(!meta||!response)return response;
  if(meta.kind==='context')return enrichJourneyContext(meta,response,env);
  if(!response.ok)return response;

  const body=await readJson(response);
  if(!body)return response;

  if(meta.action===PREPARATION_ACTION&&meta.payload.createCalendar!==false){
    const prepared=await ensurePreparationMeet(meta,body,env);
    if(!prepared.ok){
      return rewriteJson(response,{
        ...body,
        calendarConfirmed:false,
        calendarIssue:prepared.error||'calendar_meet_missing',
        error:prepared.error||'calendar_meet_missing',
        partialSuccess:true,
        retryable:true,
      },502);
    }
    return rewriteJson(response,{
      ...body,
      calendar:prepared.calendar,
      calendarConfirmed:true,
      meetingUrl:prepared.meetingUrl,
    });
  }

  if(meta.action===FILMING_ACTION&&meta.payload.createCalendar===true&&body.filmingAt){
    const filming=await upsertFilmingCalendar(meta.request,env,meta.orderId,body.filmingAt,Number(meta.payload.durationMinutes||60));
    if(!filming.ok){
      return rewriteJson(response,{
        ...body,
        filmingCalendar:filming,
        filmingCalendarConfirmed:false,
        error:filming.error||'filming_calendar_failed',
        partialSuccess:true,
        retryable:true,
      },502);
    }
    return rewriteJson(response,{
      ...body,
      filmingCalendar:filming,
      filmingCalendarConfirmed:true,
    });
  }

  return responseFromJson(response,body);
}

export async function injectCalendarIntegrityV139(response){
  let body=await response.text();
  body=body.replace(/<script\b[^>]*src=["'][^"']*\/studio\/calendar-integrity-v139\.js[^"']*["'][^>]*>\s*<\/script>\s*/giu,'');
  body=body.replace('</body>','<script type="module" src="/studio/calendar-integrity-v139.js?v=1"></script></body>');
  const headers=new Headers(response.headers);
  headers.delete('Content-Length');
  headers.set('Cache-Control','private, no-store, max-age=0');
  headers.set('X-Neptune-Calendar-Integrity',RELEASE);
  return new Response(body,{status:response.status,statusText:response.statusText,headers});
}

export async function augmentCalendarIntegrityReleaseV139(response){
  const current=await response.json().catch(()=>({}));
  const headers=new Headers(response.headers);
  headers.delete('Content-Length');
  headers.set('Content-Type','application/json; charset=utf-8');
  headers.set('Cache-Control','no-store');
  headers.set('X-Neptune-Calendar-Integrity',RELEASE);
  return new Response(JSON.stringify({
    ...current,
    calendarIntegrity:RELEASE,
    manualPreparationMeet:'strict-confirmed-meet-or-visible-retry-v139',
    manualFilmingMeet:'google-calendar-meet-upsert-send-updates-all-v139',
    calendarIdempotency:'preparation-event-id-and-filming-private-extended-properties-v139',
  }),{status:response.status,statusText:response.statusText,headers});
}

async function enrichJourneyContext(meta,response,env){
  if(!response.ok)return response;
  const body=await readJson(response);
  if(!body?.order?.filmingAt)return responseFromJson(response,body||{});
  const token=await googleToken(env);
  if(!token)return responseFromJson(response,body);
  const filming=await findFilmingCalendar(token,meta.orderId);
  if(!filming)return responseFromJson(response,body);
  return rewriteJson(response,{...body,filmingCalendar:publicCalendar(filming)});
}

async function ensurePreparationMeet(meta,body,env){
  const calendar=body.calendar||null;
  if(calendar?.ok===false)return {ok:false,error:calendar.error||'calendar_sync_failed'};

  const nested=calendar?.calendar||calendar||{};
  const direct=safeMeetUrl(nested.meetingUrl||body.meetingUrl||'');
  if(direct){
    return {ok:true,meetingUrl:direct,calendar:{...calendar,calendar:{...(calendar?.calendar||{}),meetingUrl:direct}}};
  }

  const eventId=String(nested.eventId||calendar?.eventId||'').trim();
  if(!eventId)return {ok:false,error:'calendar_meet_missing'};
  const token=await googleToken(env);
  if(!token)return {ok:false,error:'calendar_access_missing'};

  let event=await getCalendarEvent(token,eventId);
  if(!event.ok)return {ok:false,error:calendarError(event)};
  let meet=safeMeetUrl(meetingUrl(event.data));
  if(!meet){
    const patched=await googleRequest(token,`${CALENDAR_API}/calendars/primary/events/${encodeURIComponent(eventId)}?conferenceDataVersion=1&sendUpdates=all`,'PATCH',{
      conferenceData:{createRequest:{requestId:requestId(`prep-${meta.orderId}`),conferenceSolutionKey:{type:'hangoutsMeet'}}},
    });
    if(!patched.ok)return {ok:false,error:calendarError(patched)};
    event=patched;
    meet=safeMeetUrl(meetingUrl(event.data));
  }
  if(!meet){
    const waited=await waitForMeet(token,eventId);
    if(!waited.ok)return {ok:false,error:waited.error||'calendar_meet_missing'};
    event=waited.event;
    meet=waited.meetingUrl;
  }

  const studio=env.STUDIO.get(env.STUDIO.idFromName('neptune-media-main'));
  const savedResponse=await callStore(studio,'/portal/preparation-calendar-synced-v85',{
    ...adminAuth(meta.request),
    payload:{
      orderId:meta.orderId,
      appointmentAt:body.appointmentAt||meta.payload.appointmentAt,
      calendarEventId:event.data.id||eventId,
      meetingUrl:meet,
      calendarHtmlUrl:safeCalendarUrl(event.data.htmlLink),
    },
  });
  const saved=await savedResponse.json().catch(()=>({}));
  if(!savedResponse.ok)return {ok:false,error:saved.error||'calendar_sync_failed'};

  return {
    ok:true,
    meetingUrl:meet,
    calendar:{
      ...(calendar||{}),
      ...saved,
      calendar:{
        ...(calendar?.calendar||{}),
        eventId:event.data.id||eventId,
        htmlLink:safeCalendarUrl(event.data.htmlLink),
        meetingUrl:meet,
        status:event.data.status||'confirmed',
        attendees:Array.isArray(event.data.attendees)?event.data.attendees.length:0,
      },
    },
  };
}

async function upsertFilmingCalendar(request,env,orderId,filmingAt,durationMinutes){
  const studio=env.STUDIO.get(env.STUDIO.idFromName('neptune-media-main'));
  const contextResponse=await callStore(studio,'/portal/simple-journey-context-v92',{
    ...adminAuth(request),
    payload:{orderId},
  });
  const context=await contextResponse.json().catch(()=>({}));
  if(!contextResponse.ok)return {ok:false,error:context.error||'order_not_found'};
  const order=context.order||{};
  const token=await googleToken(env);
  if(!token)return {ok:false,error:'calendar_access_missing'};

  const start=new Date(filmingAt);
  if(Number.isNaN(start.getTime()))return {ok:false,error:'filming_date_invalid'};
  const duration=clamp(durationMinutes,15,240);
  const end=new Date(start.getTime()+duration*60000);
  const existing=await findFilmingCalendar(token,orderId);
  const payload=buildFilmingEvent(order,start,end);
  if(!safeMeetUrl(meetingUrl(existing))){
    payload.conferenceData={createRequest:{requestId:requestId(`filming-${orderId}`),conferenceSolutionKey:{type:'hangoutsMeet'}}};
  }

  let result;
  if(existing?.id){
    result=await googleRequest(token,`${CALENDAR_API}/calendars/primary/events/${encodeURIComponent(existing.id)}?conferenceDataVersion=1&sendUpdates=all`,'PATCH',payload);
  }else{
    result=await googleRequest(token,`${CALENDAR_API}/calendars/primary/events?conferenceDataVersion=1&sendUpdates=all`,'POST',payload);
  }
  if(!result.ok)return {ok:false,error:calendarError(result),providerStatus:result.status||0};

  let meet=safeMeetUrl(meetingUrl(result.data));
  if(!meet&&result.data?.id){
    const waited=await waitForMeet(token,result.data.id);
    if(waited.ok){result=waited.event;meet=waited.meetingUrl;}
  }
  if(!meet)return {ok:false,error:'calendar_meet_missing',eventId:result.data?.id||existing?.id||''};

  return {
    ok:true,
    state:existing?.id?'updated':'created',
    eventId:result.data.id||existing?.id||'',
    appointmentAt:start.toISOString(),
    meetingUrl:meet,
    htmlLink:safeCalendarUrl(result.data.htmlLink),
    attendees:Array.isArray(result.data.attendees)?result.data.attendees.length:0,
  };
}

async function findFilmingCalendar(token,orderId){
  const url=new URL(`${CALENDAR_API}/calendars/primary/events`);
  url.searchParams.set('singleEvents','true');
  url.searchParams.set('maxResults','20');
  url.searchParams.append('privateExtendedProperty',`neptuneOrderId=${orderId}`);
  url.searchParams.append('privateExtendedProperty','neptuneEventKind=filming');
  const response=await googleRequest(token,url.toString(),'GET');
  if(!response.ok)return null;
  return (response.data.items||[]).find(event=>event.status!=='cancelled')||null;
}

function buildFilmingEvent(order,start,end){
  const identity=order.fullName||order.company||order.email||'Client Neptune Media';
  return {
    summary:`Neptune Media · Passage · ${identity}`,
    description:`Passage Neptune Media · ${order.title||order.format||'Production'}.`,
    start:{dateTime:start.toISOString(),timeZone:TIME_ZONE},
    end:{dateTime:end.toISOString(),timeZone:TIME_ZONE},
    attendees:order.email?[{email:order.email,displayName:identity}]:[],
    guestsCanModify:false,
    guestsCanInviteOthers:false,
    guestsCanSeeOtherGuests:false,
    extendedProperties:{private:{neptuneOrderId:order.id||'',neptuneEventKind:'filming'}},
  };
}

async function googleToken(env){
  try{
    const studio=env.STUDIO.get(env.STUDIO.idFromName('neptune-media-main'));
    const response=await callStore(studio,'/portal/drive-token-get',{});
    const data=await response.json().catch(()=>({}));
    return response.ok&&data.accessToken?String(data.accessToken):'';
  }catch{return '';}
}

async function getCalendarEvent(token,eventId){
  return googleRequest(token,`${CALENDAR_API}/calendars/primary/events/${encodeURIComponent(eventId)}?conferenceDataVersion=1`,'GET');
}

async function waitForMeet(token,eventId){
  for(let attempt=0;attempt<6;attempt+=1){
    if(attempt)await sleep(180+attempt*170);
    const event=await getCalendarEvent(token,eventId);
    if(!event.ok)return {ok:false,error:calendarError(event)};
    const meet=safeMeetUrl(meetingUrl(event.data));
    if(meet)return {ok:true,event,meetingUrl:meet};
  }
  return {ok:false,error:'calendar_meet_missing'};
}

async function googleRequest(token,url,method='GET',body=null){
  try{
    const response=await fetch(url,{
      method,
      headers:{
        Authorization:`Bearer ${token}`,
        Accept:'application/json',
        ...(body?{'Content-Type':'application/json'}:{}),
        'User-Agent':'Neptune-Media-Studio/1.0',
      },
      ...(body?{body:JSON.stringify(body)}:{}),
    });
    const text=method==='DELETE'&&response.status===204?'':await response.text();
    let data={};
    try{data=text?JSON.parse(text):{};}catch{data={raw:text.slice(0,500)};}
    return {ok:response.ok,status:response.status,data};
  }catch(error){
    return {ok:false,status:0,data:{error:{message:String(error?.message||error||'google_calendar_unavailable')}}};
  }
}

function meetingUrl(event={}){
  const direct=safeMeetUrl(event.hangoutLink);
  if(direct)return direct;
  const points=Array.isArray(event.conferenceData?.entryPoints)?event.conferenceData.entryPoints:[];
  for(const point of points){
    if(point?.entryPointType!=='video')continue;
    const url=safeMeetUrl(point.uri);
    if(url)return url;
  }
  return '';
}

function publicCalendar(event){
  const meet=safeMeetUrl(meetingUrl(event));
  return {
    ok:Boolean(meet),
    eventId:event?.id||'',
    meetingUrl:meet,
    htmlLink:safeCalendarUrl(event?.htmlLink),
    appointmentAt:event?.start?.dateTime||'',
    status:event?.status||'',
  };
}

function safeMeetUrl(value){
  try{
    const url=new URL(String(value||''));
    return url.protocol==='https:'&&url.hostname.toLowerCase()==='meet.google.com'?url.toString():'';
  }catch{return '';}
}

function safeCalendarUrl(value){
  try{
    const url=new URL(String(value||''));
    return url.protocol==='https:'&&/(^|\.)google\.com$/iu.test(url.hostname)?url.toString():'';
  }catch{return '';}
}

function calendarError(result){
  const reason=String(result?.data?.error?.status||result?.data?.error?.errors?.[0]?.reason||result?.data?.error?.message||'');
  if(result?.status===401||result?.status===403||/scope|permission|insufficient|auth/iu.test(reason))return 'calendar_access_missing';
  return 'calendar_sync_failed';
}

function requestId(prefix){
  return `neptune-${String(prefix||'event').replace(/[^a-z0-9]/giu,'').slice(0,30)}-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
}

function clamp(value,min,max){
  const number=Number.isFinite(value)?value:min;
  return Math.min(max,Math.max(min,number));
}

function sleep(ms){return new Promise(resolve=>setTimeout(resolve,ms));}

function callStore(studio,path,body){
  return studio.fetch(`https://store${path}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body||{})});
}

async function readJson(response){
  try{return await response.clone().json();}catch{return null;}
}

function responseFromJson(response,data){return rewriteJson(response,data,response.status);}

function rewriteJson(response,data,status=response.status){
  const headers=new Headers(response.headers);
  headers.delete('Content-Length');
  headers.set('Content-Type','application/json; charset=utf-8');
  headers.set('Cache-Control','private, no-store, max-age=0');
  headers.set('X-Neptune-Calendar-Integrity',RELEASE);
  return new Response(JSON.stringify(data),{status,statusText:status===response.status?response.statusText:'',headers});
}
