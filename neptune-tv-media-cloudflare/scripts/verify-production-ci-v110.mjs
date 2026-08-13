import fs from 'node:fs';
import path from 'node:path';

const root=path.resolve(process.cwd());
const workflowDir=path.join(root,'.github/workflows');
const workflowPath=(name)=>path.join(workflowDir,name);
const readWorkflow=(name)=>fs.readFileSync(workflowPath(name),'utf8');
const deployWorkflow=readWorkflow('deploy-cloudflare.yml');
const must=(condition,message)=>{if(!condition)throw new Error(`production-ci-v113: ${message}`);};

must(deployWorkflow.includes('node neptune-tv-media-cloudflare/scripts/verify-studio-information-architecture-production-v65.mjs'),'deployment must call the canonical Studio/Catalogue production verifier');
must(!deployWorkflow.includes('mkdir -p /tmp/neptune-studio-v109'),'deployment must not keep the duplicated Studio/Catalogue verifier');
must(!deployWorkflow.includes("grep -Fq 'let wasActive=active()'"),'deployment must not duplicate Catalogue implementation assertions');

for(const obsolete of [
  'build-client-portal.yml','implement-studio-password-reset.yml','upgrade-client-account.yml','post-deploy-render-polish.yml','diagnose-aida-production.yml','diagnose-story-home-production.yml',
  'check-render-polish-production.yml','deploy-neptune-copy-hotfix.yml','fix-render-polish-idempotence.yml','fix-studio-auth-now.yml','harden-password-reset-rate-limit.yml',
  'install-exact-backstage-media.yml','integrate-visual-polish-v11.yml','persist-client-portal.yml','persist-render-polish-source.yml','publish-visual-artifact.yml',
  'run-studio-auth-patch.yml','trigger-studio-auth.yml','validate-render-polish.yml','visual-final-audit-v14.yml','visual-preview.yml','visual-regression-v13.yml',
  'visual-render-audit-v11.yml','visual-render-audit-v12.yml','diagnose-video-cloud-v67.yml','verify-neptune-copy.yml','verify-openai-video-production-v66.yml',
]){
  must(!fs.existsSync(workflowPath(obsolete)),`${obsolete} is obsolete and must stay removed`);
}

const workflowFiles=fs.readdirSync(workflowDir).filter((name)=>/\.ya?ml$/u.test(name));
const repositoryWriters=[];
for(const name of workflowFiles){
  const content=readWorkflow(name);
  const reasons=[];
  if(/^\s*contents:\s*write\s*$/mu.test(content))reasons.push('contents:write');
  if(/(^|\s)git\s+push(?:\s|$)/mu.test(content))reasons.push('git-push');
  if(reasons.length)repositoryWriters.push(`${name}(${reasons.join('+')})`);
}
must(repositoryWriters.length===0,`repository-mutating workflows remain: ${repositoryWriters.join(', ')}`);

for(const diagnostic of ['visual-render-audit.yml','diagnose-streaming-production.yml','ui-quality-gate.yml','validate-streaming-source.yml','diagnose-client-portal-production.yml','diagnose-public-accessibility.yml','import-launch-emissions.yml']){
  const content=readWorkflow(diagnostic);
  must(content.includes('actions/upload-artifact@v4'),`${diagnostic} must preserve evidence as a GitHub artifact`);
}

const streamingSource=readWorkflow('validate-streaming-source.yml');
must(!streamingSource.includes('python3 scripts/apply-streaming-index.py'),'streaming source validation must not mutate the source it validates');
must(streamingSource.includes("grep -q 'data-home-structure='"),'streaming source validation must validate the current home architecture without pinning an obsolete version string');

const publicCatalog=readWorkflow('diagnose-public-catalog.yml');
must(publicCatalog.includes("catalog.get('programs', [])"),'public catalog diagnostic must validate catalog semantics');
must(!publicCatalog.includes('curl --silent --show-error --head'),'public catalog diagnostic must not require an irrelevant HEAD contract');
must(!publicCatalog.includes("grep -qi '^cache-control:.*no-store'"),'public catalog diagnostic must not require private-cache semantics for public data');

const publicLayout=fs.readFileSync(path.join(root,'neptune-tv-media-cloudflare/src/public-layout.js'),'utf8');
must(publicLayout.includes("raw === '/media/posters/hors-norme.webp'"),'legacy HORS NORME poster must map to a maintained asset');
must(publicLayout.includes("raw === '/media/posters/jeu-connexio.webp'"),'legacy Connexio poster must use the safe fallback until an authoritative visual exists');
must(publicLayout.includes("'/assets/posters/default.svg'"),'public images must retain a safe default poster');

const activeStore=fs.readFileSync(path.join(root,'neptune-tv-media-cloudflare/src/store-v29.js'),'utf8');
must(activeStore.includes("url.pathname==='/auth/request-reset'"),'active Studio store must intercept password reset requests');
must(activeStore.includes('RESET_LIMIT=3'),'active Studio store must limit reset email requests');
must(activeStore.includes('RESET_WINDOW_MS=15*60*1000'),'reset email limit must use a 15-minute window');
must(activeStore.includes('throttled:true'),'excess reset requests must be silently throttled without account enumeration');

console.log(`Production CI v113 contract: OK — ${workflowFiles.length} workflows are repository-read-only, legacy mutators are removed, diagnostics use artifacts and reset e-mail rate limiting is active.`);
