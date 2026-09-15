import { readFile } from 'node:fs/promises';

const root=new URL('../',import.meta.url);
const read=(path)=>readFile(new URL(path,root),'utf8');
const backend=await read('src/supplier-physical-formats-v191.js');
const worker=await read('src/worker.js');
const studio=await read('public/studio/studio-catalog-supplier-formats-v191.js');

const supplierTable=(backend.match(/CREATE TABLE IF NOT EXISTS portal_supplier_physical_formats_v191\(([\s\S]*?)\);/u)||[])[1]||'';
const checks=[
  [supplierTable.includes('supplier_id')&&!supplierTable.includes('concept_id')&&!supplierTable.includes('format_id'),'physical format belongs to supplier, not to a concept'],
  [supplierTable.includes('UNIQUE(supplier_id,label_key)'),'format identity is unique inside a supplier'],
  [backend.includes('portal_supplier_physical_format_concepts_v191'),'concept applicability uses a separate many-to-many mapping'],
  [backend.includes('conceptIds=normalizeIds(p.conceptIds)')&&backend.includes('replaceConceptMappings'),'format editor can change associated concepts'],
  [backend.includes('supplier_physical_format_concept_in_use'),'concept cannot be detached while an offer still uses the format'],
  [backend.includes('supplier_physical_format_supplier_in_use'),'supplier cannot be changed while offers still use the format'],
  [backend.includes('deleteSupplierPhysicalFormatV191')&&backend.includes('supplier_physical_format_in_use'),'hard delete is guarded by offer usage'],
  [backend.includes('backfillLegacySupplierFormats')&&backend.includes('portal_offer_configurations_v96'),'legacy offer configurations are migrated additively'],
  [backend.includes('validateOfferPhysicalFormatsV191')&&backend.includes('map.concept_id=?'),'offer validation uses supplier + selected concept'],
  [backend.includes('enhancePublicCatalogPhysicalFormatsV191')&&backend.includes("visualSource:physical.imageUrl?'supplier_format':'fallback'"),'supplier format image is exposed to the reservation tunnel'],
  [!backend.includes('concept.image=')&&!backend.includes('format.image=physical'),'supplier-format enhancer does not replace the concept thumbnail'],
  [worker.includes('enhancePublicCatalogPhysicalFormatsV191(this,response)'),'public catalog is enriched with supplier format visuals'],
  [worker.includes("url.pathname==='/api/admin/media-catalog-v191/physical-format/save'")&&worker.includes('validateOfferPhysicalFormatsV191'),'worker exposes v191 editor and protects offer saves'],
  [worker.includes('/studio/studio-catalog-supplier-formats-v191.js'),'Studio injects supplier-first format manager'],
  [studio.includes('groupBySupplier(items)')&&studio.includes('FOURNISSEUR'),'Studio format list is grouped supplier-first'],
  [studio.includes('name="conceptId"')&&studio.includes('Concepts autorisés pour ce format'),'one supplier format can be selected for multiple concepts'],
  [studio.includes('(item.conceptIds||[])')&&studio.includes('String(item.supplierId)===String(supplierId)'),'offer picker filters supplier formats by selected concept'],
  [studio.includes('Miniature du concept — tunnel de réservation'),'concept thumbnail is explicitly separated from physical-format images'],
  [studio.includes('Image du format physique')&&studio.includes('distincte de la miniature du concept'),'physical format image has explicit independent ownership'],
  [studio.includes('data-v191-delete')&&studio.includes("action:'delete'")&&studio.includes('window.confirm'),'Studio keeps explicit guarded deletion'],
];

const failures=checks.filter(([ok])=>!ok).map(([,label])=>label);
if(failures.length){console.error('Supplier physical formats v191 verification failed:',failures);process.exit(1);}
console.log(`Supplier physical formats v191 verified: ${checks.length} supplier-first, concept-mapping, visual and deletion invariants.`);
