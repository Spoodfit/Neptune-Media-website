import {readFileSync} from 'node:fs';
const entry=readFileSync(new URL('../src/entry-v44.js',import.meta.url),'utf8');
const layer=readFileSync(new URL('../public/studio/studio-catalog-user-reliability-v146.js',import.meta.url),'utf8');
const workflow=readFileSync(new URL('../../.github/workflows/audit-catalog-user-v146.yml',import.meta.url),'utf8');
for(const needle of ['studio-catalog-user-reliability-v146.js?v=1',"X-Neptune-Catalog-Cockpit','v146"])if(!entry.includes(needle))throw new Error(`entry missing ${needle}`);
for(const needle of ['neptune-catalog-user-reliability-v146-20260825',"status.value!=='hidden'",'fixCommercialKpis','fixRelativeVisuals','catalogUserReliability'])if(!layer.includes(needle))throw new Error(`layer missing ${needle}`);
if(!workflow.includes('audit-catalog-user-v146.mjs'))throw new Error('browser audit not wired');
console.log('verify catalog user v146: OK');
