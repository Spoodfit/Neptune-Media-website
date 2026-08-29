import { requireOperator } from './workflow-db-v5.js';
import { json, sanitizeText } from './security.js';

export const MEDIA_PRESENTERS_V146_RELEASE='neptune-media-presenters-20260827-v146';
const RANKS=new Set(['presenter','captain','admiral']);

export function ensureMediaPresentersV146(store){
  if(store.mediaPresentersV146Ready)return;
  store.sql.exec(`
    CREATE TABLE IF NOT EXISTS portal_media_presenters_v146(
      id TEXT PRIMARY KEY,
      full_name TEXT NOT NULL,
      email TEXT NOT NULL DEFAULT '',
      rank TEXT NOT NULL DEFAULT 'presenter' CHECK(rank IN ('presenter','captain','admiral')),
      club_name TEXT NOT NULL DEFAULT '',
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS portal_media_family_presenter_v146(
      city_id TEXT NOT NULL,
      format_id TEXT NOT NULL,
      supplier_id TEXT NOT NULL,
      presenter_id TEXT NOT NULL REFERENCES portal_media_presenters_v146(id) ON DELETE RESTRICT,
      updated_at TEXT NOT NULL,
      PRIMARY KEY(city_id,format_id,supplier_id)
    );
    CREATE INDEX IF NOT EXISTS idx_media_presenters_active_v146 ON portal_media_presenters_v146(active,rank,full_name);
    CREATE INDEX IF NOT EXISTS idx_media_family_presenter_v146 ON portal_media_family_presenter_v146(presenter_id);
  `);
  store.mediaPresentersV146Ready=true;
}

export async function handleMediaPresentersV146(store,request){
  const url=new URL(request.url);
  if(request.method!=='POST'||url.pathname!=='/api/admin/media-catalog-v143/presenters')return null;
  ensureMediaPresentersV146(store);
  const body=await request.clone().json().catch(()=>({}));
  const access=await requireOperator(store,body);if(!access.ok)return access.response;
  const p=payload(body),action=String(p.action||'list').trim().toLowerCase();
  if(action==='list')return json({ok:true,release:MEDIA_PRESENTERS_V146_RELEASE,...snapshot(store)});
  if(action==='save')return savePresenter(store,access,p);
  if(action==='assign')return assignPresenter(store,access,p);
  if(action==='unassign')return unassignPresenter(store,access,p);
  return json({error:'presenter_action_invalid'},400);
}

function savePresenter(store,access,p){
  const id=cleanId(p.id)||crypto.randomUUID(),fullName=sanitizeText(p.fullName,140).trim();if(!fullName)return json({error:'presenter_name_required'},400);
  const rank=RANKS.has(String(p.rank||'').trim().toLowerCase())?String(p.rank).trim().toLowerCase():'presenter',email=normalizeEmail(p.email),clubName=sanitizeText(p.clubName,160).trim(),active=boolInt(p.active),at=new Date().toISOString();
  const exists=store.sql.exec('SELECT id FROM portal_media_presenters_v146 WHERE id=? LIMIT 1',id).toArray()[0];
  if(exists)store.sql.exec('UPDATE portal_media_presenters_v146 SET full_name=?,email=?,rank=?,club_name=?,active=?,updated_at=? WHERE id=?',fullName,email,rank,clubName,active,at,id);
  else store.sql.exec('INSERT INTO portal_media_presenters_v146(id,full_name,email,rank,club_name,active,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)',id,fullName,email,rank,clubName,active,at,at);
  store.audit?.(access.actor?.id||'studio','media_presenter_saved_v146','media_presenter',id,{fullName,rank,clubName,active:Boolean(active)});
  return json({ok:true,release:MEDIA_PRESENTERS_V146_RELEASE,savedId:id,...snapshot(store)});
}

function assignPresenter(store,access,p){
  const cityId=cleanId(p.cityId),formatId=cleanId(p.formatId),supplierId=cleanId(p.supplierId),presenterId=cleanId(p.presenterId);if(!cityId||!formatId||!supplierId||!presenterId)return json({error:'presenter_assignment_fields_required'},400);
  const presenter=store.sql.exec('SELECT id,active FROM portal_media_presenters_v146 WHERE id=? LIMIT 1',presenterId).toArray()[0];if(!presenter||Number(presenter.active)!==1)return json({error:'presenter_not_available'},409);
  const family=store.sql.exec('SELECT id FROM portal_media_offers_v96 WHERE city_id=? AND format_id=? AND supplier_id=? LIMIT 1',cityId,formatId,supplierId).toArray()[0];if(!family)return json({error:'presenter_family_not_found'},404);
  const at=new Date().toISOString();store.sql.exec(`INSERT INTO portal_media_family_presenter_v146(city_id,format_id,supplier_id,presenter_id,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(city_id,format_id,supplier_id) DO UPDATE SET presenter_id=excluded.presenter_id,updated_at=excluded.updated_at`,cityId,formatId,supplierId,presenterId,at);
  store.audit?.(access.actor?.id||'studio','media_presenter_assigned_v146','media_offer_family',`${cityId}:${formatId}:${supplierId}`,{presenterId});
  return json({ok:true,release:MEDIA_PRESENTERS_V146_RELEASE,...snapshot(store)});
}

function unassignPresenter(store,access,p){
  const cityId=cleanId(p.cityId),formatId=cleanId(p.formatId),supplierId=cleanId(p.supplierId);if(!cityId||!formatId||!supplierId)return json({error:'presenter_assignment_fields_required'},400);
  store.sql.exec('DELETE FROM portal_media_family_presenter_v146 WHERE city_id=? AND format_id=? AND supplier_id=?',cityId,formatId,supplierId);
  store.audit?.(access.actor?.id||'studio','media_presenter_unassigned_v146','media_offer_family',`${cityId}:${formatId}:${supplierId}`,{});
  return json({ok:true,release:MEDIA_PRESENTERS_V146_RELEASE,...snapshot(store)});
}

function snapshot(store){
  const presenters=store.sql.exec('SELECT id,full_name AS fullName,email,rank,club_name AS clubName,active,created_at AS createdAt,updated_at AS updatedAt FROM portal_media_presenters_v146 ORDER BY active DESC,CASE rank WHEN \'admiral\' THEN 0 WHEN \'captain\' THEN 1 ELSE 2 END,full_name').toArray().map(row=>({...row,active:Boolean(row.active),rankLabel:rankLabel(row.rank)}));
  const assignments=store.sql.exec(`SELECT a.city_id AS cityId,a.format_id AS formatId,a.supplier_id AS supplierId,a.presenter_id AS presenterId,a.updated_at AS updatedAt,p.full_name AS fullName,p.rank,p.club_name AS clubName FROM portal_media_family_presenter_v146 a JOIN portal_media_presenters_v146 p ON p.id=a.presenter_id`).toArray().map(row=>({...row,rankLabel:rankLabel(row.rank)}));
  return{presenters,assignments,ranks:[{id:'presenter',label:'Présentateur'},{id:'captain',label:'Capitaine du club'},{id:'admiral',label:'Amiral du club'}]};
}
function rankLabel(rank){return rank==='admiral'?'Amiral du club':rank==='captain'?'Capitaine du club':'Présentateur';}
function payload(body){return body?.payload&&typeof body.payload==='object'?body.payload:body||{};}
function cleanId(value){const text=String(value||'').trim();return/^[a-zA-Z0-9._:-]{1,160}$/u.test(text)?text:'';}
function normalizeEmail(value){const text=String(value||'').trim().toLowerCase();return text&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(text)?text:'';}
function boolInt(value){return value===false||value===0||value==='0'?0:1;}
