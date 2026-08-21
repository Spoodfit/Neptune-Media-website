import {readFile,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';

const sourcePath=new URL('./audit-catalog-visual-v132.mjs',import.meta.url);
let source=await readFile(sourcePath,'utf8');
source=source.replace("image:'/assets/logo-neptune.svg'","image:'/assets/catalog-v98/hors-norme.svg'");
source=source.replace("image:'/assets/logo-neptune.svg'","image:'/assets/posters/concept-libre-wide.webp'");
if(source.includes("image:'/assets/logo-neptune.svg'"))throw new Error('Le mock logo Neptune subsiste dans la preuve visuelle');
source=source.replace("const snapshot=await evaluate(cdp,`(()=>({", "const assetCheck=await evaluate(cdp,`(()=>Array.from(document.querySelectorAll('.v132-offer-visual img')).map(img=>({src:img.getAttribute('src'),complete:img.complete,naturalWidth:img.naturalWidth})))()`);assert(assetCheck.some(x=>x.src==='/assets/catalog-v98/hors-norme.svg'&&x.complete&&x.naturalWidth>0),'Visuel Hors Norme intégré non chargé');assert(assetCheck.some(x=>x.src==='/assets/posters/concept-libre-wide.webp'&&x.complete&&x.naturalWidth>0),'Visuel Libre intégré non chargé');\n    const snapshot=await evaluate(cdp,`(()=>({");
const tmp='/tmp/audit-catalog-visual-real-assets-v132.mjs';
await writeFile(tmp,source,'utf8');
await import(pathToFileURL(tmp).href+`?v=${Date.now()}`);
