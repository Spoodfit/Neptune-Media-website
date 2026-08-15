import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const read=(file)=>fs.readFileSync(path.join(root,file),'utf8');
const assert=(condition,message)=>{if(!condition)throw new Error(message);};
const has=(text,needle,message)=>assert(text.includes(needle),message||`Missing: ${needle}`);
const lacks=(text,needle,message)=>assert(!text.includes(needle),message||`Unexpected: ${needle}`);

const wrangler=read('wrangler.jsonc');
const entry=read('src/entry-v39.js');
const store=read('src/store-v29.js');
const production=read('src/portal-production-v120.js');
const offerSync=read('src/portal-production-offer-sync-v120.js');
const http=read('src/portal-http-utils.js');
const ia=read('public/studio/studio-information-architecture-v65-1.js');
const shell=read('public/studio/studio-shell-v105.css');
const advanced=read('public/studio/advanced.html');
const ui=read('public/studio/production-cockpit-v120.js');
const css=read('public/studio/production-cockpit-v120.css');
const wizard=read('public/studio/client-passage-wizard-v118.js');

has(wrangler,'"main": "src/entry-v39.js"','v120 must stay additive on entry-v39');
has(entry,"productionCockpit:PRODUCTION_RELEASE",'public release does not expose v120');
has(entry,"/studio/studio-information-architecture-v65-1.js?v=108",'Studio IA cache-bust v120 missing');
has(entry,"/studio/studio-shell-v105.css?v=4",'Studio shell cache-bust v120 missing');

for(const label of ['Parcours clients','Production','Diffusion','Finances','Réglages'])has(ia,label,`Primary Studio navigation missing ${label}`);
has(ia,"link('production', '/studio/advanced.html#production'",'Production is not a primary Studio route');
has(ia,"link('finances', '/studio/advanced.html#finances'",'Finances is not a primary Studio route');
lacks(shell,'[data-studio-route="production"] {','Production is still hidden by canonical shell CSS');

has(advanced,'production-cockpit-v120.css','Production CSS not loaded on advanced Studio');
has(advanced,'production-cockpit-v120.js','Production runtime not loaded on advanced Studio');
has(css,'max-height:calc(100vh - 390px)','Desktop workspace is not height-bounded');
has(css,'.p120-drawer','Context drawer layout missing');

for(const table of ['portal_supplier_payment_settings_v120','portal_format_preparation_cards_v120','portal_order_supplier_snapshot_v120'])has(production,table,`Missing v120 table ${table}`);
has(production,'portal_supplier_payment_snapshot_insert_v120','Supplier payment snapshot trigger missing');
has(production,'captureOrderSupplierSnapshotV120','Order supplier snapshot capture missing');
has(production,'production_preparation_card_save','Preparation-card action missing');
has(production,'production_order_supplier_assign','Historical passage supplier assignment missing');
has(production,'migratePreparationCards','Existing HORS NORME/configuration cards are not migrated');
has(production,'syncPreparationCardToOffers','Format cards are not synchronized to offers');
has(offerSync,'AFTER INSERT ON portal_media_offers_v96','New offers do not inherit format preparation cards');
has(offerSync,'portal_format_preparation_cards_v120','Offer preparation trigger not backed by format master cards');

for(const field of ['formatId','serviceId','supplierRateId','cityId','supplierId','offerId'])has(http,`${field}:`,`normalizeOrderPayload drops ${field}`);
has(store,"url.pathname==='/portal/admin-upsert'",'Order creation interception missing');
has(store,'captureOrderSupplierSnapshotV120','Order creation does not freeze supplier rate');
has(store,'reconcileSupplierPaymentFromSnapshotV120','Supplier payment is not reconciled with snapshot');
has(store,'ensureProductionOfferSyncV120','New offer preparation-card trigger is not installed');

for(const view of ["view==='overview'","view==='suppliers'","view==='services'","view==='passages'","view==='formats'"])has(ui,view,`Production view missing: ${view}`);
for(const label of ['Vue d’ensemble','Fournisseurs','Prestations & tarifs','Passages & paiements','Formats & préparation'])has(ui,label,`Production navigation label missing: ${label}`);
has(ui,'function supplierWizard()','New supplier wizard missing');
has(ui,'function formatWizard()','New format wizard missing');
has(ui,"labels=['Format','Cards préparation','Fournisseurs','Tarifs','Validation']",'New-format workflow does not include preparation/suppliers/rates');
has(ui,"catalogAction('service_save'",'Production UI cannot assign a format to suppliers');
has(ui,"production_preparation_card_save",'Production UI cannot save format preparation cards');
has(ui,'supplierPaymentStatus','Supplier payment tracking missing from Production UI');
has(ui,'paymentUrl','Supplier payment link/settings missing from Production UI');
lacks(ui,'SUPPLIER_AMOUNT','Production UI must not use the historical fixed supplier amount');

has(wizard,'supplierRateId','Passage wizard no longer sends supplier rate');
has(wizard,'serviceId','Passage wizard no longer sends supplier service');

console.log('Production cockpit v120 static contract: OK — 5-entry IA, format-level preparation cards, supplier capabilities/rates, passage snapshots and payment tracking are wired.');
