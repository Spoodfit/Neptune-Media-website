import {readFile,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';

const hors='/assets/catalog-v132-live/hors-norme-production.png';
const libre='/assets/catalog-v132-live/libre-production.png';
const sourcePath=new URL('./audit-catalog-visual-v132.mjs',import.meta.url);
let source=await readFile(sourcePath,'utf8');
source=source.replace("image:'/assets/logo-neptune.svg'",`image:'${hors}'`);
source=source.replace("image:'/assets/logo-neptune.svg'",`image:'${libre}'`);
if(source.includes("image:'/assets/logo-neptune.svg'"))throw new Error('Le logo mock subsiste dans la preuve live');
source=source.replace("const snapshot=await evaluate(cdp,`(()=>({", `const liveImages=await evaluate(cdp,\`(()=>Array.from(document.querySelectorAll('.v132-offer-visual img')).map(img=>({src:img.getAttribute('src'),complete:img.complete,naturalWidth:img.naturalWidth,naturalHeight:img.naturalHeight,fit:getComputedStyle(img).objectFit})))()\`);assert(liveImages.some(x=>x.src==='${hors}'&&x.complete&&x.naturalWidth===1672&&x.naturalHeight===941&&x.fit==='contain'),'Création production Hors Norme non préservée intégralement');assert(liveImages.some(x=>x.src==='${libre}'&&x.complete&&x.naturalWidth===1672&&x.naturalHeight===941&&x.fit==='contain'),'Création production Libre non préservée intégralement');\n    const snapshot=await evaluate(cdp,\`(()=>({`);
const tmp='/tmp/audit-catalog-visual-live-images-v132.mjs';
await writeFile(tmp,source,'utf8');
await import(pathToFileURL(tmp).href+`?v=${Date.now()}`);
