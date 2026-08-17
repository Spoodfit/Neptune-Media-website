import {ensureStudioOperationsV95Schema} from './portal-studio-operations-v95.js';
import {ensureSalesTunnelV96Schema} from './portal-sales-tunnel-v96.js';

export const SUPPLIER_INTEGRITY_V121_RELEASE='neptune-supplier-cost-integrity-20260817-v121';
const META_KEY='supplier_cost_integrity_v121';
const FILMED_STATUSES="'filmed','videos_pending','videos_received','editing','approval','delivered','completed'";

export function ensureSupplierPaymentIntegrityV121(store){
  if(store.supplierPaymentIntegrityV121Ready)return;
  ensureStudioOperationsV95Schema(store);
  ensureSalesTunnelV96Schema(store);
  store.sql.exec(`
    CREATE TRIGGER IF NOT EXISTS portal_supplier_payment_guard_v121
    BEFORE INSERT ON portal_supplier_payments
    WHEN NEW.amount_total=72000
      AND NOT EXISTS(
        SELECT 1 FROM portal_supplier_finance_v95 f
        WHERE f.order_id=NEW.order_id AND f.gross_cents>0
      )
    BEGIN
      SELECT RAISE(IGNORE);
    END;

    CREATE TRIGGER IF NOT EXISTS portal_supplier_payment_real_cost_insert_v121
    AFTER INSERT ON portal_supplier_payments
    WHEN EXISTS(
      SELECT 1 FROM portal_supplier_finance_v95 f
      WHERE f.order_id=NEW.order_id AND f.gross_cents>0
    )
    BEGIN
      UPDATE portal_supplier_payments
      SET supplier_name=COALESCE((
            SELECT s.name FROM portal_supplier_finance_v95 f
            JOIN portal_media_suppliers_v95 s ON s.id=f.supplier_id
            WHERE f.order_id=NEW.order_id AND f.gross_cents>0
            ORDER BY f.created_at DESC LIMIT 1
          ),supplier_name),
          amount_total=COALESCE((
            SELECT f.gross_cents FROM portal_supplier_finance_v95 f
            WHERE f.order_id=NEW.order_id AND f.gross_cents>0
            ORDER BY f.created_at DESC LIMIT 1
          ),amount_total),
          currency='eur',
          updated_at=NEW.updated_at
      WHERE id=NEW.id;
    END;

    CREATE TRIGGER IF NOT EXISTS portal_supplier_finance_create_due_insert_v121
    AFTER INSERT ON portal_supplier_finance_v95
    WHEN NEW.gross_cents>0
      AND EXISTS(SELECT 1 FROM portal_orders o WHERE o.id=NEW.order_id AND o.status IN (${FILMED_STATUSES}))
      AND NOT EXISTS(SELECT 1 FROM portal_supplier_payments p WHERE p.order_id=NEW.order_id)
    BEGIN
      INSERT INTO portal_supplier_payments(id,order_id,supplier_name,amount_total,currency,status,due_at,paid_at,created_at,updated_at)
      SELECT lower(hex(randomblob(16))),NEW.order_id,COALESCE(s.name,'Fournisseur studio'),NEW.gross_cents,'eur','due',
             COALESCE(o.filming_at,o.updated_at,NEW.updated_at),NULL,NEW.updated_at,NEW.updated_at
      FROM portal_orders o LEFT JOIN portal_media_suppliers_v95 s ON s.id=NEW.supplier_id
      WHERE o.id=NEW.order_id;
    END;

    CREATE TRIGGER IF NOT EXISTS portal_supplier_finance_reconcile_insert_v121
    AFTER INSERT ON portal_supplier_finance_v95
    WHEN NEW.gross_cents>0
    BEGIN
      UPDATE portal_supplier_payments
      SET supplier_name=COALESCE((SELECT name FROM portal_media_suppliers_v95 WHERE id=NEW.supplier_id),supplier_name),
          amount_total=NEW.gross_cents,
          currency='eur',
          updated_at=NEW.updated_at
      WHERE order_id=NEW.order_id AND status<>'paid'
        AND (amount_total<>NEW.gross_cents OR currency<>'eur' OR supplier_name<>COALESCE((SELECT name FROM portal_media_suppliers_v95 WHERE id=NEW.supplier_id),supplier_name));
    END;

    CREATE TRIGGER IF NOT EXISTS portal_supplier_finance_create_due_update_v121
    AFTER UPDATE OF gross_cents,supplier_id ON portal_supplier_finance_v95
    WHEN NEW.gross_cents>0
      AND EXISTS(SELECT 1 FROM portal_orders o WHERE o.id=NEW.order_id AND o.status IN (${FILMED_STATUSES}))
      AND NOT EXISTS(SELECT 1 FROM portal_supplier_payments p WHERE p.order_id=NEW.order_id)
    BEGIN
      INSERT INTO portal_supplier_payments(id,order_id,supplier_name,amount_total,currency,status,due_at,paid_at,created_at,updated_at)
      SELECT lower(hex(randomblob(16))),NEW.order_id,COALESCE(s.name,'Fournisseur studio'),NEW.gross_cents,'eur','due',
             COALESCE(o.filming_at,o.updated_at,NEW.updated_at),NULL,NEW.updated_at,NEW.updated_at
      FROM portal_orders o LEFT JOIN portal_media_suppliers_v95 s ON s.id=NEW.supplier_id
      WHERE o.id=NEW.order_id;
    END;

    CREATE TRIGGER IF NOT EXISTS portal_supplier_finance_reconcile_update_v121
    AFTER UPDATE OF gross_cents,supplier_id ON portal_supplier_finance_v95
    WHEN NEW.gross_cents>0
    BEGIN
      UPDATE portal_supplier_payments
      SET supplier_name=COALESCE((SELECT name FROM portal_media_suppliers_v95 WHERE id=NEW.supplier_id),supplier_name),
          amount_total=NEW.gross_cents,
          currency='eur',
          updated_at=NEW.updated_at
      WHERE order_id=NEW.order_id AND status<>'paid'
        AND (amount_total<>NEW.gross_cents OR currency<>'eur' OR supplier_name<>COALESCE((SELECT name FROM portal_media_suppliers_v95 WHERE id=NEW.supplier_id),supplier_name));
    END;
  `);
  reconcileDueSupplierPaymentsV121(store);
  store.supplierPaymentIntegrityV121Ready=true;
}

export function reconcileDueSupplierPaymentsV121(store){
  const now=new Date().toISOString();
  store.sql.exec(`
    UPDATE portal_supplier_payments
    SET supplier_name=COALESCE((
          SELECT s.name FROM portal_supplier_finance_v95 f
          JOIN portal_media_suppliers_v95 s ON s.id=f.supplier_id
          WHERE f.order_id=portal_supplier_payments.order_id AND f.gross_cents>0
          ORDER BY f.created_at DESC LIMIT 1
        ),supplier_name),
        amount_total=COALESCE((
          SELECT f.gross_cents FROM portal_supplier_finance_v95 f
          WHERE f.order_id=portal_supplier_payments.order_id AND f.gross_cents>0
          ORDER BY f.created_at DESC LIMIT 1
        ),amount_total),
        currency='eur',updated_at=?
    WHERE status<>'paid'
      AND EXISTS(SELECT 1 FROM portal_supplier_finance_v95 f WHERE f.order_id=portal_supplier_payments.order_id AND f.gross_cents>0)
      AND (
        amount_total<>COALESCE((SELECT f.gross_cents FROM portal_supplier_finance_v95 f WHERE f.order_id=portal_supplier_payments.order_id AND f.gross_cents>0 ORDER BY f.created_at DESC LIMIT 1),amount_total)
        OR currency<>'eur'
        OR supplier_name<>COALESCE((SELECT s.name FROM portal_supplier_finance_v95 f JOIN portal_media_suppliers_v95 s ON s.id=f.supplier_id WHERE f.order_id=portal_supplier_payments.order_id AND f.gross_cents>0 ORDER BY f.created_at DESC LIMIT 1),supplier_name)
      )
  `,now);
  const meta=store.sql.exec('SELECT value FROM meta WHERE key=? LIMIT 1',META_KEY).toArray()[0];
  if(meta?.value!==SUPPLIER_INTEGRITY_V121_RELEASE){
    store.sql.exec('INSERT INTO meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',META_KEY,SUPPLIER_INTEGRITY_V121_RELEASE);
  }
}

export function supplierIntegritySnapshotV121(store){
  ensureSupplierPaymentIntegrityV121(store);
  const orphanLegacy=Number(store.sql.exec(`
    SELECT COUNT(*) AS n FROM portal_supplier_payments p
    WHERE p.status<>'paid' AND p.amount_total=72000
      AND NOT EXISTS(SELECT 1 FROM portal_supplier_finance_v95 f WHERE f.order_id=p.order_id AND f.gross_cents>0)
  `).toArray()[0]?.n||0);
  const linkedDue=Number(store.sql.exec(`
    SELECT COUNT(*) AS n FROM portal_supplier_payments p
    WHERE p.status='due' AND EXISTS(SELECT 1 FROM portal_supplier_finance_v95 f WHERE f.order_id=p.order_id AND f.gross_cents>0)
  `).toArray()[0]?.n||0);
  return {release:SUPPLIER_INTEGRITY_V121_RELEASE,orphanLegacy,linkedDue};
}
