import {readFileSync} from 'node:fs';
const entry=readFileSync(new URL('../src/entry-v44.js',import.meta.url),'utf8');
const layer=readFileSync(new URL('../public/studio/studio-catalog-user-reliability-v146.js',import.meta.url),'utf8');
for(const needle of ["studio-catalog-commercial-cockpit-v145.js?v=1","studio-catalog-user-reliability-v146.js?v=1","X-Neptune-Catalog-Cockpit','v145","X-Neptune-Catalog-Reliability','v146"])if(!entry.includes(needle))throw new Error(`entry contract missing: ${needle}`);
for(const needle of ["status.value!=='hidden'","Villes actives","Fournisseurs actifs","catalogUserReliability='v146'","fixRelativeVisuals","role','menuitem"])if(!layer.includes(needle))throw new Error(`reliability contract missing: ${needle}`);
console.log('catalog user reliability v146 source contract: OK');
