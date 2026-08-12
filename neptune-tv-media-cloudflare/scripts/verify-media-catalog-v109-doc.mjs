import fs from 'node:fs';
const audit=fs.readFileSync('CATALOG_V109_AUDIT.md','utf8');
for(const marker of ['Chaise » Concept Libre','Connexio','plusieurs fournisseurs','garbage collector','(format_id, label)']){
  if(!audit.includes(marker))throw new Error(`CATALOG_V109_AUDIT.md missing residual decision: ${marker}`);
}
console.log('Catalogue v109 residual decisions documented.');
