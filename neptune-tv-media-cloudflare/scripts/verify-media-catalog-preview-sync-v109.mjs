import fs from 'node:fs';

const sync=fs.readFileSync('public/studio/media-catalog-preview-sync-v109.js','utf8');
const advanced=fs.readFileSync('public/studio/advanced.html','utf8');
const must=(condition,message)=>{if(!condition)throw new Error(`catalog-preview-sync-v109: ${message}`);};

must(advanced.includes('/studio/media-catalog-preview-sync-v109.js?v=1'),'advanced Studio does not load preview synchronization');
must(sync.includes("catalog_view:active==='configurations'?'configuration':'format'"),'preview screen is not synchronized to the active catalog tab');
must(sync.includes("params.set('catalog_family',selectedFamilyKey)"),'selected family is not propagated to tunnel preview');
must(sync.includes("event.target.closest('[data-c99-family]')"),'changing the family cannot refresh preview');
must(sync.includes("event.target.closest('[data-c98-tab]')"),'changing catalog tab cannot refresh preview');
must(sync.includes('if(current.pathname===target.pathname&&current.search===target.search)return'),'preview synchronizer lacks idempotence guard');
console.log('Catalogue preview sync v109 contract: OK.');
