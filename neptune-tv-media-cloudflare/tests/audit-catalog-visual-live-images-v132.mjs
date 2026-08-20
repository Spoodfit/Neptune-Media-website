import {readFile,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';

const production='https://neptune-media-webtv.neptunebusinessclub.workers.dev';
const response=await fetch(`${production}/api/reservation/catalog-v96`,{headers:{'Cache-Control':'no-cache, no-store'}});
if(!response.ok)throw new Error(`Catalogue production indisponible: HTTP ${response.status}`);
const live=await response.json();
const rows=(live.cities||[]).flatMap(city=>(city.formats||[]).map(format=>({city:city.name,format:format.name,image:format.image})));
const hors=rows.find(row=>String(row.format).toLowerCase()==='hors norme')?.image;
const libre=rows.find(row=>String(row.format).toLowerCase()==='libre')?.image;
if(!hors||!libre)throw new Error('Visuels production Hors Norme / Libre introuvables');
const absolute=value=>new URL(value,production).toString();

const sourcePath=new URL('./audit-catalog-visual-v132.mjs',import.meta.url);
let source=await readFile(sourcePath,'utf8');
source=source.replace("image:'/assets/logo-neptune.svg'",`image:'${absolute(hors)}'`);
source=source.replace("image:'/assets/logo-neptune.svg'",`image:'${absolute(libre)}'`);
if(source.includes("image:'/assets/logo-neptune.svg'"))throw new Error('Le logo mock subsiste dans la preuve live');
source=source.replace("const snapshot=await evaluate(cdp,`(()=>({", `const liveImages=await evaluate(cdp,\`(()=>Array.from(document.querySelectorAll('.v132-offer-visual img')).map(img=>({src:img.src,complete:img.complete,naturalWidth:img.naturalWidth})))()\`);assert(liveImages.some(x=>x.src==='${absolute(hors)}'&&x.complete&&x.naturalWidth>0),'Image production Hors Norme non chargée');assert(liveImages.some(x=>x.src==='${absolute(libre)}'&&x.complete&&x.naturalWidth>0),'Image production Libre non chargée');\n    const snapshot=await evaluate(cdp,\`(()=>({`);
const tmp='/tmp/audit-catalog-visual-live-images-v132.mjs';
await writeFile(tmp,source,'utf8');
await import(pathToFileURL(tmp).href+`?v=${Date.now()}`);
