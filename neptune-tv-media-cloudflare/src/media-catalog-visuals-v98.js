import { ensureSalesTunnelOptionsV96Schema } from './portal-sales-tunnel-options-v96.js';

export const MEDIA_CATALOG_VISUALS_RELEASE='neptune-media-catalog-visuals-20260813-v109';

export function ensureMediaCatalogVisualsV98Schema(store){
  ensureSalesTunnelOptionsV96Schema(store);
  if(store.mediaCatalogVisualsV98Ready)return;
  store.sql.exec(`
    CREATE TABLE IF NOT EXISTS portal_media_format_visuals_v98(
      format_id TEXT PRIMARY KEY REFERENCES portal_media_formats_v95(id) ON DELETE CASCADE,
      image_url TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS portal_media_configuration_visuals_v98(
      format_id TEXT NOT NULL REFERENCES portal_media_formats_v95(id) ON DELETE CASCADE,
      label TEXT NOT NULL,
      image_url TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL,
      PRIMARY KEY(format_id,label)
    );
  `);
  store.mediaCatalogVisualsV98Ready=true;
}

export function formatVisualV98(store,formatId,slug){
  ensureMediaCatalogVisualsV98Schema(store);
  const row=store.sql.exec('SELECT image_url AS imageUrl FROM portal_media_format_visuals_v98 WHERE format_id=? LIMIT 1',formatId).toArray()[0]||{};
  return {image:String(row.imageUrl||defaultFormatImage(slug)),imageSource:row.imageUrl?'custom':'fallback'};
}

export function configurationVisualV98(store,formatId,formatSlug,label){
  ensureMediaCatalogVisualsV98Schema(store);
  const row=store.sql.exec('SELECT image_url AS imageUrl,description FROM portal_media_configuration_visuals_v98 WHERE format_id=? AND label=? LIMIT 1',formatId,label).toArray()[0]||{};
  const fallback=defaultConfigurationVisual(formatSlug,label);
  return {
    label,
    image:String(row.imageUrl||fallback.image||''),
    imageBase64:row.imageUrl?'':String(fallback.imageBase64||''),
    description:String(row.description||fallback.description||''),
    imageSource:row.imageUrl?'custom':String(fallback.imageBase64||fallback.image||'')?'fallback':'missing',
  };
}

export function saveFormatVisualV98(store,formatId,imageUrl){
  ensureMediaCatalogVisualsV98Schema(store);
  const at=new Date().toISOString(),value=safeVisualUrl(imageUrl);
  if(!value){
    store.sql.exec('DELETE FROM portal_media_format_visuals_v98 WHERE format_id=?',formatId);
    return;
  }
  store.sql.exec(`INSERT INTO portal_media_format_visuals_v98(format_id,image_url,updated_at) VALUES(?,?,?)
    ON CONFLICT(format_id) DO UPDATE SET image_url=excluded.image_url,updated_at=excluded.updated_at`,formatId,value,at);
}

export function saveConfigurationVisualV98(store,formatId,label,imageUrl,description=''){
  ensureMediaCatalogVisualsV98Schema(store);
  const at=new Date().toISOString(),value=safeVisualUrl(imageUrl),desc=String(description||'').trim().slice(0,500);
  if(!value&&!desc){
    store.sql.exec('DELETE FROM portal_media_configuration_visuals_v98 WHERE format_id=? AND label=?',formatId,label);
    return;
  }
  store.sql.exec(`INSERT INTO portal_media_configuration_visuals_v98(format_id,label,image_url,description,updated_at) VALUES(?,?,?,?,?)
    ON CONFLICT(format_id,label) DO UPDATE SET image_url=excluded.image_url,description=excluded.description,updated_at=excluded.updated_at`,
    formatId,label,value,desc,at);
}

export function safeVisualUrl(value){
  const raw=String(value||'').trim();
  if(!raw)return '';
  if(/^\/(?:assets|media\/catalog-v98)\//u.test(raw))return raw.slice(0,1200);
  try{const url=new URL(raw);return url.protocol==='https:'?url.toString().slice(0,1200):'';}catch{return '';}
}

export function defaultFormatImage(slug){
  const n=normal(slug);
  if(n.includes('hors-norme')||n==='hors')return '/assets/catalog-v98/hors-norme.svg';
  if(n.includes('connexio'))return '/assets/catalog-v98/connexio.svg';
  if(n.includes('libre'))return '/assets/posters/concept-libre-wide.webp';
  return '/assets/posters/studio-wide.webp';
}

export function defaultConfigurationVisual(formatSlug,label){
  const n=normal(label),format=normal(formatSlug),hn=format.includes('hors');
  if(hn&&n.includes('canap'))return {imageBase64:'/assets/formats/exact-hn1.b64',description:'Échange posé, chaleureux et conversationnel.'};
  if(hn&&n.includes('chaise'))return {imageBase64:'/assets/formats/exact-hn2.b64',description:'Interview dynamique, directe et éditoriale.'};
  if(n.includes('bar'))return {imageBase64:'/assets/formats/exact-cl1.b64',description:'Univers clair, vivant et plus informel.'};
  if(n.includes('canap'))return {imageBase64:'/assets/formats/exact-cl2.b64',description:'Échange posé, chaleureux et conversationnel.'};
  if(n.includes('plateau'))return {imageBase64:'/assets/formats/exact-cl3.b64',description:'Mise en scène structurée pour un format incarné.'};
  if(n.includes('chaise'))return {image:'/assets/posters/studio-wide.webp',description:'Interview dynamique, directe et éditoriale.'};
  return {image:'/assets/posters/studio-wide.webp',description:'Une configuration adaptée à votre concept.'};
}

function normal(value){
  return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/gu,'').trim().toLowerCase().replace(/\s+/gu,'-');
}
