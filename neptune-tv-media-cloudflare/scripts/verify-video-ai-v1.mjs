import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scriptDir=dirname(fileURLToPath(import.meta.url));
const appRoot=resolve(scriptDir,'..');
const repoRoot=resolve(appRoot,'..');
const read=async(path)=>readFile(resolve(appRoot,path),'utf8');

const [wrangler,entry,routes,store,analysis,security,html,css,clientJs,containerJs,dockerfile,pythonApp,rootPackage,nestedPackage]=await Promise.all([
  readFile(resolve(repoRoot,'wrangler.jsonc'),'utf8'),
  read('src/entry-v14.js'),
  read('src/video-ai-routes-v1.js'),
  read('src/store-v10.js'),
  read('src/video-ai-analysis-v1.js'),
  read('src/video-ai-security-v1.js'),
  read('public/studio/video-ai.html'),
  read('public/studio/video-ai-v1.css'),
  read('public/studio/video-ai-v1.js'),
  read('src/video-ai-container-v1.js'),
  read('containers/video-ai/Dockerfile'),
  read('containers/video-ai/app.py'),
  readFile(resolve(repoRoot,'package.json'),'utf8'),
  read('package.json'),
]);

assert.match(wrangler,/entry-v14\.js/u);
assert.match(wrangler,/"VIDEO_PROCESSOR"/u);
assert.match(wrangler,/"class_name": "VideoProcessor"/u);
assert.match(wrangler,/"instance_type": "standard-2"/u);
assert.match(wrangler,/containers\/video-ai\/Dockerfile/u);
assert.match(wrangler,/"new_sqlite_classes": \["VideoProcessor"\]/u);

assert.match(entry,/handleVideoAiRoute/u);
assert.match(entry,/reconcileVideoAiJobs/u);
assert.match(entry,/videoAiMinimumScore: 60/u);
assert.match(entry,/videoAiEditorialProposals: 3/u);
assert.match(entry,/internal-validation-required-before-drive-export/u);

for(const marker of [
  '/api/admin/video-ai/upload/init',
  '/api/admin/video-ai/upload/part',
  '/api/admin/video-ai/upload/complete',
  '/api/internal/video-ai/transcribe/',
  '/api/internal/video-ai/analyze/',
  '/api/internal/video-ai/output/',
  '/api/internal/video-ai/complete/',
  'createMultipartUpload',
  'resumeMultipartUpload',
  '@cf/openai/whisper-large-v3-turbo',
  'getContainer(env.VIDEO_PROCESSOR, jobId)',
  'origin: \'neptune_ai_generated\'',
  'shortsFolderId',
  'uploadType=resumable',
  'contact@neptunebusiness.com',
]) assert.ok(routes.includes(marker),`Missing route marker: ${marker}`);

for(const marker of [
  'CREATE TABLE IF NOT EXISTS video_ai_jobs',
  'CREATE TABLE IF NOT EXISTS video_ai_clips',
  'UNIQUE(order_id,source_fingerprint)',
  '>= 60',
  "status='review_ready'",
  'selected_proposal_id',
  'drive_file_id',
]) assert.ok(store.includes(marker),`Missing store marker: ${marker}`);

for(const marker of [
  "const MIN_SCORE = 60",
  "const FUNNELS = new Set(['TOFU', 'MOFU', 'BOFU'])",
  "['direct', 'Directe et provocante']",
  "['humour', 'Humoristique et situationnelle']",
  "['expertise', 'Professionnelle et conversationnelle']",
  'deduplicateCandidates',
  'normalizeCaptionPreset',
]) assert.ok(analysis.includes(marker),`Missing analysis marker: ${marker}`);

assert.match(security,/HMAC/u);
assert.match(security,/VIDEO_AI_INTERNAL_SECRET/u);
assert.match(security,/timingSafeEqual/u);
assert.match(containerJs,/extends Container/u);
assert.match(containerJs,/sleepAfter = '20m'/u);

for(const marker of ['Studio Vidéo IA','Glissez la vidéo longue ici','SEUIL 60/100','VALIDATION INTERNE','Envoyer les validés dans Drive']) assert.ok(html.includes(marker),`Missing UI marker: ${marker}`);
for(const marker of ['multipartUpload','fileFingerprint','approveVisibleClips','exportApprovedClips','data-select-proposal','score-breakdown']) assert.ok(clientJs.includes(marker),`Missing client marker: ${marker}`);
assert.match(css,/@media\(max-width:600px\)/u);
assert.match(css,/\.clips-grid/u);
assert.match(css,/\.clip-preview video/u);

for(const marker of ['ffmpeg','fonts-dejavu-core','opencv-python-headless','uvicorn']) assert.ok(`${dockerfile}\n${nestedPackage}`.includes(marker),`Missing container dependency: ${marker}`);
for(const marker of ['transcribe_source','analyze_visual_profile','request_analysis','render_clip','write_ass_subtitles','upload_output','haarcascade_frontalface_default.xml','libx264']) assert.ok(pythonApp.includes(marker),`Missing processor marker: ${marker}`);
assert.match(rootPackage,/@cloudflare\/containers/u);
assert.match(nestedPackage,/@cloudflare\/containers/u);

const pythonCheck=spawnSync('python3',['-m','py_compile',resolve(appRoot,'containers/video-ai/app.py')],{encoding:'utf8'});
assert.equal(pythonCheck.status,0,pythonCheck.stderr||'Python processor syntax failed');

const moduleUrl=pathToFileURL(resolve(appRoot,'src/video-ai-analysis-v1.js')).href;
const { analyzeVideoForClips }=await import(moduleUrl);
const text='Pourquoi tout le monde fait cette erreur alors que la solution est simple ? Un client nous a montré un cas concret : avant, il perdait du temps et de l’argent parce que personne ne posait la bonne question. Pourtant, avec une méthode claire en trois étapes, le résultat change vraiment. La première étape consiste à comprendre le problème réel. La deuxième évite les décisions prises trop vite. La troisième transforme le conseil en action mesurable. C’est important parce qu’une offre ne vaut rien si le client ne comprend jamais le bénéfice. Cette méthode a réduit la frustration, amélioré le processus et rendu la décision beaucoup plus simple.';
const words=text.split(/\s+/u);
const segments=[];
for(let index=0;index<words.length;index+=14){
  const start=(index/14)*7;
  segments.push({start,end:start+7,text:words.slice(index,index+14).join(' ')});
}
const fallback=await analyzeVideoForClips({}, {
  transcript:text,
  segments,
  durationSeconds:segments.at(-1).end,
  company:'Neptune Test',
  orderTitle:'Test qualité',
  visualProfile:{luminance:.42,contrast:.62,motion:.2,technicalQuality:.9},
});
assert.ok(fallback.candidates.length>=1,'Fallback must retain at least one coherent candidate');
for(const candidate of fallback.candidates){
  assert.ok(candidate.score>=60&&candidate.score<=100,'Candidate score outside policy');
  assert.ok(['TOFU','MOFU','BOFU'].includes(candidate.funnel),'Invalid funnel');
  assert.equal(candidate.editorialProposals.length,3,'Each candidate must have exactly three proposals');
  assert.deepEqual(candidate.editorialProposals.map(item=>item.id),['direct','humour','expertise']);
  for(const proposal of candidate.editorialProposals){
    assert.ok(proposal.hook&&proposal.description&&proposal.fullPost,'Incomplete editorial proposal');
    assert.match(proposal.cta,/\?$/u,'CTA must be a question');
    assert.ok(proposal.hashtags.length>=3&&proposal.hashtags.length<=6,'Hashtag policy violated');
  }
}

console.log(`Neptune Video AI v1 verified: ${fallback.candidates.length} fallback candidate(s), exact 3-proposal contract.`);
