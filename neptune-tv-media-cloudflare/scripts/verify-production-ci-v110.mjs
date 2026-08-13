import fs from 'node:fs';
import path from 'node:path';

const root=path.resolve(process.cwd());
const workflowPath=(name)=>path.join(root,'.github/workflows',name);
const readWorkflow=(name)=>fs.readFileSync(workflowPath(name),'utf8');
const workflow=readWorkflow('deploy-cloudflare.yml');
const must=(condition,message)=>{if(!condition)throw new Error(`production-ci-v111: ${message}`);};

must(workflow.includes('node neptune-tv-media-cloudflare/scripts/verify-studio-information-architecture-production-v65.mjs'),'deployment must call the canonical Studio/Catalogue production verifier');
must(!workflow.includes('mkdir -p /tmp/neptune-studio-v109'),'deployment must not keep the duplicated Studio/Catalogue verifier');
must(!workflow.includes("grep -Fq 'let wasActive=active()'"),'deployment must not duplicate Catalogue implementation assertions');

for(const legacy of ['build-client-portal.yml','implement-studio-password-reset.yml','upgrade-client-account.yml']){
  must(!fs.existsSync(workflowPath(legacy)),`${legacy} is an obsolete self-modifying builder and must stay removed`);
}

for(const diagnostic of ['visual-render-audit.yml','diagnose-story-home-production.yml','diagnose-streaming-production.yml']){
  const content=readWorkflow(diagnostic);
  must(!content.includes('contents: write'),`${diagnostic} must not have repository write permission`);
  must(!content.includes('git push'),`${diagnostic} must not push evidence back to main`);
  must(content.includes('actions/upload-artifact@v4'),`${diagnostic} must preserve evidence as a GitHub artifact`);
}

console.log('Production CI v111 contract: OK — canonical verification, no legacy self-modifying builders, diagnostics are artifact-only.');
