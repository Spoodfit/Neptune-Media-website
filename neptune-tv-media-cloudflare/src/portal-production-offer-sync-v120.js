import { ensureProductionV120Schema } from './portal-production-v120.js';

export const PRODUCTION_OFFER_SYNC_V120_RELEASE='neptune-production-offer-preparation-sync-20260815-v120';

export function ensureProductionOfferSyncV120(store){
  ensureProductionV120Schema(store);
  if(store.productionOfferSyncV120Ready)return;
  store.sql.exec(`
    CREATE TRIGGER IF NOT EXISTS portal_offer_preparation_cards_insert_v120
    AFTER INSERT ON portal_media_offers_v96
    BEGIN
      INSERT OR IGNORE INTO portal_offer_configurations_v96
        (id,offer_id,label,public_order,active,created_at,updated_at)
      SELECT 'prep-v120-' || NEW.id || '-' || pc.id,
             NEW.id,pc.label,pc.public_order,pc.active,NEW.created_at,NEW.updated_at
      FROM portal_format_preparation_cards_v120 pc
      WHERE pc.format_id=NEW.format_id AND pc.active=1;
    END;
  `);
  store.productionOfferSyncV120Ready=true;
}
