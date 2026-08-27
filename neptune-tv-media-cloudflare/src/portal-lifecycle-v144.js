import { ensurePortalSchema } from './portal-schema.js';

export const PORTAL_LIFECYCLE_V144_RELEASE = 'neptune-portal-lifecycle-20260827-v144';

export function ensurePortalLifecycleV144(store) {
  ensurePortalSchema(store);
  if (store.portalLifecycleV144Ready) return;

  store.sql.exec(`
    CREATE TRIGGER IF NOT EXISTS portal_prospect_paid_activate_client_v144
    AFTER UPDATE OF status ON portal_prospects
    WHEN NEW.status='paid'
    BEGIN
      UPDATE portal_clients
      SET active=1,updated_at=NEW.updated_at
      WHERE id=NEW.client_id;
    END;

    CREATE TRIGGER IF NOT EXISTS portal_paid_order_insert_activate_client_v144
    AFTER INSERT ON portal_orders
    WHEN lower(NEW.payment_status) IN ('paid','succeeded','complete','completed','no_payment_required')
    BEGIN
      UPDATE portal_clients
      SET active=1,updated_at=NEW.updated_at
      WHERE id=NEW.client_id;
    END;

    CREATE TRIGGER IF NOT EXISTS portal_paid_order_update_activate_client_v144
    AFTER UPDATE OF payment_status ON portal_orders
    WHEN lower(NEW.payment_status) IN ('paid','succeeded','complete','completed','no_payment_required')
    BEGIN
      UPDATE portal_clients
      SET active=1,updated_at=NEW.updated_at
      WHERE id=NEW.client_id;
    END;
  `);

  store.portalLifecycleV144Ready = true;
}
