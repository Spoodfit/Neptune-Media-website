import { syncSteps } from './portal-utils.js';

const DATA_MIGRATION_KEY = 'portal_schema_data_migration';
const DATA_MIGRATION_VERSION = 'portal-schema-20260729-efficiency-v1';

export function ensurePortalSchema(store){
  if(store.portalSchemaReady)return;
  store.sql.exec(`
    CREATE TABLE IF NOT EXISTS portal_clients(id TEXT PRIMARY KEY,email TEXT NOT NULL UNIQUE,full_name TEXT NOT NULL DEFAULT '',company TEXT NOT NULL DEFAULT '',active INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,last_access_at TEXT);
    CREATE TABLE IF NOT EXISTS portal_prospects(id TEXT PRIMARY KEY,client_id TEXT NOT NULL REFERENCES portal_clients(id) ON DELETE CASCADE,first_name TEXT NOT NULL DEFAULT '',last_name TEXT NOT NULL DEFAULT '',company TEXT NOT NULL DEFAULT '',email TEXT NOT NULL,token_hash TEXT NOT NULL UNIQUE,status TEXT NOT NULL DEFAULT 'captured',source TEXT NOT NULL DEFAULT 'neptune_media',intent TEXT NOT NULL DEFAULT 'book_passage',consent_at TEXT NOT NULL,expires_at TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,tunnel_started_at TEXT,paid_at TEXT,order_id TEXT);
    CREATE TABLE IF NOT EXISTS portal_orders(id TEXT PRIMARY KEY,client_id TEXT NOT NULL REFERENCES portal_clients(id) ON DELETE CASCADE,external_payment_id TEXT NOT NULL UNIQUE,order_reference TEXT NOT NULL DEFAULT '',product_code TEXT NOT NULL DEFAULT '',title TEXT NOT NULL,format TEXT NOT NULL DEFAULT '',payment_status TEXT NOT NULL DEFAULT 'paid',amount_total INTEGER NOT NULL DEFAULT 0,currency TEXT NOT NULL DEFAULT 'eur',status TEXT NOT NULL DEFAULT 'reservation_confirmed',appointment_at TEXT,filming_at TEXT,next_action TEXT NOT NULL DEFAULT '',preparation_url TEXT NOT NULL DEFAULT '',booking_url TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS portal_steps(id TEXT PRIMARY KEY,order_id TEXT NOT NULL REFERENCES portal_orders(id) ON DELETE CASCADE,step_key TEXT NOT NULL,label TEXT NOT NULL,state TEXT NOT NULL DEFAULT 'pending',display_order INTEGER NOT NULL DEFAULT 100,completed_at TEXT,note TEXT NOT NULL DEFAULT '',UNIQUE(order_id,step_key));
    CREATE TABLE IF NOT EXISTS portal_files(id TEXT PRIMARY KEY,order_id TEXT NOT NULL REFERENCES portal_orders(id) ON DELETE CASCADE,name TEXT NOT NULL,file_type TEXT NOT NULL DEFAULT 'livrable',storage_key TEXT NOT NULL DEFAULT '',external_url TEXT NOT NULL DEFAULT '',size_label TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS portal_content_schedule(id TEXT PRIMARY KEY,order_id TEXT NOT NULL REFERENCES portal_orders(id) ON DELETE CASCADE,file_id TEXT NOT NULL UNIQUE REFERENCES portal_files(id) ON DELETE CASCADE,publish_at TEXT NOT NULL,network TEXT NOT NULL DEFAULT 'youtube,tiktok,instagram',status TEXT NOT NULL DEFAULT 'ready',caption TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS portal_content_ai(file_id TEXT PRIMARY KEY REFERENCES portal_files(id) ON DELETE CASCADE,order_id TEXT NOT NULL REFERENCES portal_orders(id) ON DELETE CASCADE,title TEXT NOT NULL DEFAULT '',description TEXT NOT NULL DEFAULT '',hashtags TEXT NOT NULL DEFAULT '[]',trend_sources TEXT NOT NULL DEFAULT '[]',trend_summary TEXT NOT NULL DEFAULT '',ai_model TEXT NOT NULL DEFAULT '',generation_status TEXT NOT NULL DEFAULT 'pending',prompt_version TEXT NOT NULL DEFAULT 'neptune-content-v1',created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS portal_content_publications(id TEXT PRIMARY KEY,schedule_id TEXT NOT NULL REFERENCES portal_content_schedule(id) ON DELETE CASCADE,platform TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'prepared',published_url TEXT NOT NULL DEFAULT '',published_at TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,UNIQUE(schedule_id,platform));
    CREATE TABLE IF NOT EXISTS portal_content_occurrences(id TEXT PRIMARY KEY,order_id TEXT NOT NULL REFERENCES portal_orders(id) ON DELETE CASCADE,file_id TEXT NOT NULL REFERENCES portal_files(id) ON DELETE CASCADE,source_schedule_id TEXT UNIQUE REFERENCES portal_content_schedule(id) ON DELETE SET NULL,publish_at TEXT NOT NULL,network TEXT NOT NULL DEFAULT 'youtube,tiktok,instagram',status TEXT NOT NULL DEFAULT 'ready',title TEXT NOT NULL DEFAULT '',description TEXT NOT NULL DEFAULT '',hashtags TEXT NOT NULL DEFAULT '[]',caption TEXT NOT NULL DEFAULT '',use_index INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS portal_content_occurrence_publications(id TEXT PRIMARY KEY,occurrence_id TEXT NOT NULL REFERENCES portal_content_occurrences(id) ON DELETE CASCADE,platform TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'prepared',published_url TEXT NOT NULL DEFAULT '',published_at TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,UNIQUE(occurrence_id,platform));
    CREATE TABLE IF NOT EXISTS portal_supplier_payments(id TEXT PRIMARY KEY,order_id TEXT NOT NULL UNIQUE REFERENCES portal_orders(id) ON DELETE CASCADE,supplier_name TEXT NOT NULL DEFAULT 'Fournisseur studio',amount_total INTEGER NOT NULL DEFAULT 72000,currency TEXT NOT NULL DEFAULT 'eur',status TEXT NOT NULL DEFAULT 'due',due_at TEXT NOT NULL,paid_at TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS portal_refund_requests(id TEXT PRIMARY KEY,order_id TEXT NOT NULL REFERENCES portal_orders(id) ON DELETE CASCADE,reason TEXT NOT NULL DEFAULT '',eligible INTEGER NOT NULL DEFAULT 0,status TEXT NOT NULL DEFAULT 'pending',requested_at TEXT NOT NULL,processed_at TEXT);
    CREATE TABLE IF NOT EXISTS portal_deletion_requests(id TEXT PRIMARY KEY,client_id TEXT NOT NULL REFERENCES portal_clients(id) ON DELETE CASCADE,status TEXT NOT NULL DEFAULT 'pending',requested_at TEXT NOT NULL,processed_at TEXT,note TEXT NOT NULL DEFAULT '');
    CREATE TABLE IF NOT EXISTS portal_codes(id TEXT PRIMARY KEY,email TEXT NOT NULL,code_hash TEXT NOT NULL,expires_at TEXT NOT NULL,created_at TEXT NOT NULL,used_at TEXT);
    CREATE TABLE IF NOT EXISTS portal_sessions(id TEXT PRIMARY KEY,client_id TEXT NOT NULL REFERENCES portal_clients(id) ON DELETE CASCADE,token_hash TEXT NOT NULL UNIQUE,expires_at TEXT NOT NULL,created_at TEXT NOT NULL,last_seen_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS portal_auth_attempts(email TEXT PRIMARY KEY,count INTEGER NOT NULL DEFAULT 0,window_started_at TEXT NOT NULL,locked_until TEXT);
    CREATE TABLE IF NOT EXISTS portal_notifications(id TEXT PRIMARY KEY,order_id TEXT NOT NULL REFERENCES portal_orders(id) ON DELETE CASCADE,notification_key TEXT NOT NULL,email_id TEXT NOT NULL DEFAULT '',sent_at TEXT NOT NULL,UNIQUE(order_id,notification_key));
    CREATE TABLE IF NOT EXISTS portal_feedback_requests(id TEXT PRIMARY KEY,order_id TEXT NOT NULL UNIQUE REFERENCES portal_orders(id) ON DELETE CASCADE,token_hash TEXT NOT NULL UNIQUE,expires_at TEXT NOT NULL,created_at TEXT NOT NULL,submitted_at TEXT);
    CREATE TABLE IF NOT EXISTS portal_feedback(id TEXT PRIMARY KEY,order_id TEXT NOT NULL UNIQUE REFERENCES portal_orders(id) ON DELETE CASCADE,satisfaction INTEGER NOT NULL,experience TEXT NOT NULL DEFAULT '',recommend_to TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS portal_referral_codes(client_id TEXT PRIMARY KEY REFERENCES portal_clients(id) ON DELETE CASCADE,code TEXT NOT NULL UNIQUE,created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS portal_referral_aliases(alias TEXT PRIMARY KEY,client_id TEXT NOT NULL UNIQUE REFERENCES portal_clients(id) ON DELETE CASCADE,created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS portal_referrals(id TEXT PRIMARY KEY,referrer_client_id TEXT NOT NULL REFERENCES portal_clients(id) ON DELETE CASCADE,referred_client_id TEXT NOT NULL UNIQUE REFERENCES portal_clients(id) ON DELETE CASCADE,order_id TEXT NOT NULL UNIQUE REFERENCES portal_orders(id) ON DELETE CASCADE,referral_code TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'effective',created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS portal_referral_rewards(id TEXT PRIMARY KEY,client_id TEXT NOT NULL UNIQUE REFERENCES portal_clients(id) ON DELETE CASCADE,threshold INTEGER NOT NULL DEFAULT 3,status TEXT NOT NULL DEFAULT 'unlocked',unlocked_at TEXT NOT NULL,claimed_at TEXT);
    CREATE INDEX IF NOT EXISTS idx_portal_prospects_token ON portal_prospects(token_hash);
    CREATE INDEX IF NOT EXISTS idx_portal_prospects_client ON portal_prospects(client_id,created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_portal_prospects_status ON portal_prospects(status,updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_portal_orders_client ON portal_orders(client_id,created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_portal_steps_order ON portal_steps(order_id,display_order);
    CREATE INDEX IF NOT EXISTS idx_portal_files_order ON portal_files(order_id,created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_portal_schedule_order ON portal_content_schedule(order_id,publish_at);
    CREATE INDEX IF NOT EXISTS idx_portal_content_ai_order ON portal_content_ai(order_id,updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_portal_content_publications_schedule ON portal_content_publications(schedule_id,platform);
    CREATE INDEX IF NOT EXISTS idx_portal_occurrences_order ON portal_content_occurrences(order_id,publish_at);
    CREATE INDEX IF NOT EXISTS idx_portal_occurrences_file ON portal_content_occurrences(file_id,publish_at);
    CREATE INDEX IF NOT EXISTS idx_portal_occurrence_publications ON portal_content_occurrence_publications(occurrence_id,platform);
    CREATE INDEX IF NOT EXISTS idx_portal_supplier_status ON portal_supplier_payments(status,due_at);
    CREATE INDEX IF NOT EXISTS idx_portal_refunds_status ON portal_refund_requests(status,requested_at);
    CREATE INDEX IF NOT EXISTS idx_portal_deletions_status ON portal_deletion_requests(status,requested_at);
    CREATE INDEX IF NOT EXISTS idx_portal_codes_email ON portal_codes(email,created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_portal_sessions_token ON portal_sessions(token_hash);
    CREATE INDEX IF NOT EXISTS idx_portal_notifications_order ON portal_notifications(order_id,notification_key);
    CREATE INDEX IF NOT EXISTS idx_portal_feedback_request_token ON portal_feedback_requests(token_hash);
    CREATE INDEX IF NOT EXISTS idx_portal_referrals_referrer ON portal_referrals(referrer_client_id,created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_portal_referrals_order ON portal_referrals(order_id);
    CREATE INDEX IF NOT EXISTS idx_portal_referral_alias_client ON portal_referral_aliases(client_id);
  `);

  const applied = store.sql.exec('SELECT value FROM meta WHERE key=?', DATA_MIGRATION_KEY).toArray()[0]?.value;
  if (applied !== DATA_MIGRATION_VERSION) {
    store.sql.exec("DELETE FROM portal_steps WHERE step_key='approval'");
    store.sql.exec(`
      INSERT OR IGNORE INTO portal_content_occurrences
        (id,order_id,file_id,source_schedule_id,publish_at,network,status,title,description,hashtags,caption,use_index,created_at,updated_at)
      SELECT 'occ-' || s.id,s.order_id,s.file_id,s.id,s.publish_at,s.network,s.status,
             COALESCE(a.title,''),COALESCE(a.description,''),COALESCE(a.hashtags,'[]'),s.caption,1,s.created_at,s.updated_at
      FROM portal_content_schedule s
      LEFT JOIN portal_content_ai a ON a.file_id=s.file_id;
    `);
    const now=new Date().toISOString();
    for(const order of store.sql.exec('SELECT id,status,updated_at AS updatedAt FROM portal_orders').toArray()){
      syncSteps(store,order.id,order.status,order.updatedAt||now);
    }
    store.sql.exec(`
      INSERT INTO meta(key,value) VALUES(?,?)
      ON CONFLICT(key) DO UPDATE SET value=excluded.value
      WHERE meta.value IS NOT excluded.value
    `,DATA_MIGRATION_KEY,DATA_MIGRATION_VERSION);
  }
  store.portalSchemaReady=true;
}
