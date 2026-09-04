export const RESERVATION_POLICY_V173_RELEASE='neptune-reservation-policy-20260904-v173';
export const RESERVATION_MIN_LEAD_DAYS=15;
export const RESERVATION_TIMEZONE='Europe/Paris';

export function reservationDatePolicyV173(value,now=new Date()){
  const dateKey=cleanDateKey(value);
  if(!dateKey)return{ok:false,reason:'invalid_date',date:'',minDate:minimumReservationDateV173(now),leadDays:RESERVATION_MIN_LEAD_DAYS,timezone:RESERVATION_TIMEZONE};
  const minDate=minimumReservationDateV173(now);
  if(dateKey<minDate)return{ok:false,reason:'lead_time',date:dateKey,minDate,leadDays:RESERVATION_MIN_LEAD_DAYS,timezone:RESERVATION_TIMEZONE};
  const day=dayOfWeek(dateKey);
  if(day===0||day===6)return{ok:false,reason:'weekend',date:dateKey,minDate,leadDays:RESERVATION_MIN_LEAD_DAYS,timezone:RESERVATION_TIMEZONE};
  const year=Number(dateKey.slice(0,4));
  if(frenchHolidaysV173(year).has(dateKey))return{ok:false,reason:'holiday',date:dateKey,minDate,leadDays:RESERVATION_MIN_LEAD_DAYS,timezone:RESERVATION_TIMEZONE};
  return{ok:true,reason:'',date:dateKey,minDate,leadDays:RESERVATION_MIN_LEAD_DAYS,timezone:RESERVATION_TIMEZONE};
}

export function isBookableReservationDateV173(value,now=new Date()){
  return reservationDatePolicyV173(value,now).ok;
}

export function minimumReservationDateV173(now=new Date()){
  const today=parisDateKey(now);
  return addDays(today,RESERVATION_MIN_LEAD_DAYS);
}

export function nonBookableDatesForMonthV173(month,now=new Date()){
  if(!/^\d{4}-\d{2}$/u.test(String(month||'')))return[];
  const [year,monthNumber]=String(month).split('-').map(Number);
  if(!year||monthNumber<1||monthNumber>12)return[];
  const lastDay=new Date(Date.UTC(year,monthNumber,0)).getUTCDate();
  const out=[];
  for(let day=1;day<=lastDay;day+=1){
    const key=`${year}-${String(monthNumber).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    const policy=reservationDatePolicyV173(key,now);
    if(!policy.ok)out.push({date:key,reason:policy.reason});
  }
  return out;
}

export function frenchHolidaysV173(year){
  const y=Number(year);
  if(!Number.isInteger(y)||y<1970||y>2200)return new Set();
  const fixed=['01-01','05-01','05-08','07-14','08-15','11-01','11-11','12-25'].map(md=>`${y}-${md}`);
  const easter=easterDateKey(y);
  return new Set([...fixed,addDays(easter,1),addDays(easter,39),addDays(easter,50)]);
}

export function parisDateKey(value=new Date()){
  const date=value instanceof Date?value:new Date(value);
  if(Number.isNaN(date.getTime()))return'';
  const parts=new Intl.DateTimeFormat('fr-FR',{timeZone:RESERVATION_TIMEZONE,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);
  const map=Object.fromEntries(parts.map(part=>[part.type,part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function cleanDateKey(value){
  const text=String(value||'').trim();
  if(!/^\d{4}-\d{2}-\d{2}$/u.test(text))return'';
  const [year,month,day]=text.split('-').map(Number);
  const probe=new Date(Date.UTC(year,month-1,day));
  if(probe.getUTCFullYear()!==year||probe.getUTCMonth()!==month-1||probe.getUTCDate()!==day)return'';
  return text;
}

function dayOfWeek(dateKey){
  const [year,month,day]=dateKey.split('-').map(Number);
  return new Date(Date.UTC(year,month-1,day)).getUTCDay();
}

function addDays(dateKey,count){
  const [year,month,day]=String(dateKey||'').split('-').map(Number);
  const date=new Date(Date.UTC(year,month-1,day));
  if(Number.isNaN(date.getTime()))return'';
  date.setUTCDate(date.getUTCDate()+Number(count||0));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth()+1).padStart(2,'0')}-${String(date.getUTCDate()).padStart(2,'0')}`;
}

function easterDateKey(year){
  const a=year%19,b=Math.floor(year/100),c=year%100,d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451),month=Math.floor((h+l-7*m+114)/31),day=(h+l-7*m+114)%31+1;
  return `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
}
