import fs from 'node:fs';
import path from 'node:path';

const root=path.resolve(process.cwd());
const workflowPath=(name)=>path.join(root,'.github/workflows',name);
const readWorkflow=(name)=>fs.readFileSync(workflowPath(name),'utf8');
const deployWorkflow=readWorkflow('deploy-cloudflare.yml');
const must=(condition,message)=>{if(!condition)throw new Error(`production-ci-v112: ${message}`);};

must(deployWorkflow.includes('node neptune-tv-media-cloudflare/scripts/verify-studio-information-architecture-production-v65.mjs'),'deployment must call the canonical Studio/Catalogue production verifier');
must(!deployWorkflow.includes('mkdir -p /tmp/neptune-studio-v109'),'deployment must not keep the duplicated Studio/Catalogue verifier');
must(!deployWorkflow.includes("grep -Fq 'let wasActive=active()'"),'deployment must not duplicate Catalogue implementation assertions');

for(const obsolete of [
  'build-client-portal.yml',
  'implement-studio-password-reset.yml',
  'upgrade-client-account.yml',
  'post-deploy-render-polish.yml',
  'diagnose-aida-production.yml',
  'diagnose-story-home-production.yml',
]){
  must(!fs.existsSync(workflowPath(obsolete)),`${obsolete} is obsolete and must stay removed`);
}

for(const diagnostic of ['visual-render-audit.yml','diagnose-streaming-production.yml','ui-quality-gate.yml']){
  const content=readWorkflow(diagnostic);
  must(!content.includes('contents: write'),`${diagnostic} must not have repository write permission`);
  must(!content.includes('git push'),`${diagnostic} must not push evidence back to main`);
  must(content.includes('actions/upload-artifact@v4'),`${diagnostic} must preserve evidence as a GitHub artifact`);
}

const publicCatalog=readWorkflow('diagnose-public-catalog.yml');
must(publicCatalog.includes("catalog.get('programs', [])"),'public catalog diagnostic must validate catalog semantics');
must(!publicCatalog.includes('curl --silent --show-error --head'),'public catalog diagnostic must not require an irrelevant HEAD contract');
must(!publicCatalog.includes("grep -qi '^cache-control:.*no-store'"),'public catalog diagnostic must not require private-cache semantics for public data');

const publicLayout=fs.readFileSync(path.join(root,'neptune-tv-media-cloudflare/src/public-layout.js'),'utf8');
must(publicLayout.includes("raw === '/media/posters/hors-norme.webp'"),'legacy HORS NORME poster must map to a maintained asset');
must(publicLayout.includes("raw === '/media/posters/jeu-connexio.webp'"),'legacy Connexio poster must use the safe fallback until an authoritative visual exists');
must(publicLayout.includes("'/assets/posters/default.svg'"),'public images must retain a safe default poster');

console.log('Production CI v112 contract: OK — canonical verification, semantic diagnostics, read-only artifacts and safe legacy poster fallbacks.');
