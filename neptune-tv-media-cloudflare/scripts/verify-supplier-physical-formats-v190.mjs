import { readFile } from 'node:fs/promises';

const root=new URL('../',import.meta.url);
const read=(path)=>readFile(new URL(path,root),'utf8');
const backend=await read('src/supplier-physical-formats-v190.js');
const worker=await read('src/worker.js');
const studio=await read('public/studio/studio-catalog-supplier-formats-v190.js');

const checks=[
  [backend.includes('portal_supplier_physical_formats_v190'),'canonical supplier physical formats table'],
  [backend.includes('UNIQUE(supplier_id,format_id,label_key)'),'supplier + concept + format uniqueness'],
  [backend.includes('portal_offer_configurations_v96')&&backend.includes('backfillLegacySupplierFormats'),'legacy offer-format backfill'],
  [backend.includes('supplier_physical_format_unavailable'),'server-side offer format validation'],
  [backend.includes('renameOfferConfigurations'),'format rename propagation to existing offers'],
  [backend.includes('supplier_physical_format_used_by_active_offer'),'safe deactivation guard'],
  [worker.includes("url.pathname==='/api/admin/media-catalog-v143/family/save'")&&worker.includes('validateOfferPhysicalFormatsV190'),'offer save is protected by supplier-format relation'],
  [worker.includes("url.pathname==='/api/admin/media-catalog-v98/context'")&&worker.includes('enhanceMediaCatalogContextV190'),'Studio context exposes supplier formats'],
  [worker.includes('/studio/studio-catalog-supplier-formats-v190.js'),'Studio runtime injects v190 catalog integration'],
  [studio.includes("String(item.supplierId)===String(supplierId)&&String(item.formatId)===String(formatId)"),'offer picker filters by supplier and concept'],
  [studio.includes('Aucun format disponible pour ce fournisseur et ce concept'),'empty supplier/concept state is explicit'],
  [studio.includes('data-v190-form="physical"')&&studio.includes('name="supplierId"')&&studio.includes('name="formatId"'),'physical format editor owns supplier and concept'],
  [studio.includes("supplier.addEventListener('change'")&&studio.includes("concept.addEventListener('change'"),'offer format choices react to supplier and concept changes'],
];

const failures=checks.filter(([ok])=>!ok).map(([,label])=>label);
if(failures.length){console.error('Supplier physical formats v190 verification failed:',failures);process.exit(1);}
console.log(`Supplier physical formats v190 verified: ${checks.length} architecture and UI invariants.`);
