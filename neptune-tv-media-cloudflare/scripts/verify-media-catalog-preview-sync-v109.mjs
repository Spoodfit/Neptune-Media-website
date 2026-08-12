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
must(sync.includes("preview.dataset.catalogPreviewOwner='v109'"),'v109 does not explicitly own the preview lifecycle');
must(sync.includes('preview.replaceChildren()'),'legacy preview iframe is not replaced by the v109 owner');
must(sync.includes("frame.dataset.catalogPreviewV109='1'"),'stable v109 iframe marker missing');
must(sync.includes("frame.dataset.c99LivePreview='v109'"),'v99 does not recognize the stable v109 iframe as an existing live preview');
must(sync.includes("preview.dataset.c99='1'"),'v109 ownership marker missing');
console.log('Catalogue preview sync v109 contract: OK — single owner, v99-compatible stable iframe and synchronized family/screen.');
