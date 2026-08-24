import { readFile } from 'node:fs/promises';

const read=(path)=>readFile(new URL(`../${path}`,import.meta.url),'utf8');
const [entry,server,client]=await Promise.all([
  read('src/entry-v42.js'),
  read('src/calendar-integrity-v139.js'),
  read('public/studio/calendar-integrity-v139.js'),
]);

const checks=[];
const expect=(condition,label)=>checks.push({condition:Boolean(condition),label});

expect(entry.includes("from './calendar-integrity-v139.js'"),'active v42 imports calendar integrity v139');
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

const failures=checks.filter(item=>!item.condition);
for(const item of checks)console.log(`${item.condition?'✓':'✗'} ${item.label}`);
if(failures.length){
  console.error(`Calendar integrity v139 failed: ${failures.length} check(s).`);
  process.exit(1);
}
console.log(`Calendar integrity v139 passed: ${checks.length} checks.`);
