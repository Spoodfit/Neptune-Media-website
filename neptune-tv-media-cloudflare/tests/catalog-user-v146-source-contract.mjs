import {readFileSync} from 'node:fs';
const entry=readFileSync(new URL('../src/entry-v44.js',import.meta.url),'utf8');
const cockpit=readFileSync(new URL('../public/studio/studio-catalog-commercial-cockpit-v145.js',import.meta.url),'utf8');
const layer=readFileSync(new URL('../public/studio/studio-catalog-user-reliability-v146.js',import.meta.url),'utf8');
for(const needle of ["studio-catalog-commercial-cockpit-v145.js?v=1","studio-catalog-user-reliability-v146.js?v=1","X-Neptune-Catalog-Cockpit','v145","X-Neptune-Catalog-Reliability','v146"])if(!entry.includes(needle))throw new Error(`entry contract missing: ${needle}`);
for(const needle of ["commercialCityIds","commercialSupplierIds","if(state.status==='hidden')state.showInactive=true","clean.startsWith('/')","pop.setAttribute('role','menu')","markMenuItems","offer.launchRemaining===0"])if(!cockpit.includes(needle))throw new Error(`native cockpit reliability missing: ${needle}`);
for(const needle of ["await import('/studio/studio-catalog-commercial-cockpit-v145.js?v=1')","neptuneCatalogReliability='v146'","catalogUserReliability='v146'"])if(!layer.includes(needle))throw new Error(`reliability certification missing: ${needle}`);
console.log('catalog user reliability v146 source contract: OK');
