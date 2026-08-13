import fs from 'node:fs';
import path from 'node:path';

const root=path.resolve(process.cwd());
const workflow=fs.readFileSync(path.join(root,'.github/workflows/deploy-cloudflare.yml'),'utf8');
const must=(condition,message)=>{if(!condition)throw new Error(`production-ci-v110: ${message}`);};

must(workflow.includes('node neptune-tv-media-cloudflare/scripts/verify-studio-information-architecture-production-v65.mjs'),'deployment must call the canonical Studio/Catalogue production verifier');
must(!workflow.includes('mkdir -p /tmp/neptune-studio-v109'),'deployment must not keep the duplicated Studio/Catalogue verifier');
must(!workflow.includes("grep -Fq 'let wasActive=active()'"),'deployment must not duplicate Catalogue implementation assertions');
must(!fs.existsSync(path.join(root,'.github/workflows/build-client-portal.yml')),'obsolete client portal builder must stay removed');
must(!fs.existsSync(path.join(root,'.github/workflows/implement-studio-password-reset.yml')),'obsolete password reset builder must stay removed');

console.log('Production CI v110 contract: OK — one canonical Studio/Catalogue verifier and no self-modifying legacy builders.');
