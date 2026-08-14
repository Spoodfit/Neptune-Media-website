import http from 'node:http';
import { spawn } from 'node:child_process';
import { createReadStream, existsSync, mkdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';

const PORT=Number(process.env.PORT||8080);
const NATIVE_PORT=23000,YOUTUBE_PORT=23001;
const NATIVE_INPUT=`udp://127.0.0.1:${NATIVE_PORT}?fifo_size=1000000&overrun_nonfatal=1`;
const YOUTUBE_INPUT=`udp://127.0.0.1:${YOUTUBE_PORT}?fifo_size=1000000&overrun_nonfatal=1`;
const NATIVE_OUTPUT=`udp://127.0.0.1:${NATIVE_PORT}?pkt_size=1316`;
const YOUTUBE_OUTPUT=`udp://127.0.0.1:${YOUTUBE_PORT}?pkt_size=1316`;
const HLS_DIR='/tmp/neptune-webtv-live';
const RESTART_DELAYS=[500,1000,2000,4000,8000];
const OUTPUT_FRESH_MS=15000,STALL_GRACE_MS=25000;
const startedAt=Date.now();

let config=null,nativeRelay=null,youtubeRelay=null,playout=null,playoutToken=0,activePlayoutToken=null,nativeToken=0,youtubeToken=0;
let nativeRestartTimer=null,youtubeRestartTimer=null,nativeRestartAttempt=0,youtubeRestartAttempt=0,nativeStartedAt=0;
const audioCache=new Map(),audioPending=new Map();
let state={status:'idle',heartbeatAt:new Date().toISOString(),lastError:null,currentItem:null,revision:null,ffmpegPid:null,nativeRelayPid:null,youtubeRelayPid:null,playoutPid:null,relayRestarts:0,lastOutputProgressAt:null,youtubeStatus:'off',youtubeLastError:null};

prepareHls();
const server=http.createServer(async(req,res)=>{
  try{
    if(req.method==='GET'&&req.url==='/health')return sendJson(res,200,snapshot());
    if(req.method==='GET'&&req.url?.startsWith('/live/'))return serveLive(req,res);
    if(req.method==='POST'&&req.url==='/control/apply'){
      const next=validateConfig(await readJson(req)),previous=config;
      const revisionChanged=!previous||previous.revision!==next.revision;
      const nativeChanged=!previous||encodingFingerprint(previous)!==encodingFingerprint(next);
      const youtubeChanged=!previous||youtubeFingerprint(previous)!==youtubeFingerprint(next);
      config=next;state.revision=next.revision;state.lastError=null;touch();
      if(nativeChanged){restartAll('native_transport_changed');}
      else{
        if(revisionChanged||next.forceRestart)restartPlayout(next.forceRestart?'manual_restart':'playlist_changed');else ensurePlayout(playoutToken);
        ensureNative(nativeToken);
        if(youtubeChanged||next.forceRestart)restartYoutube('youtube_configuration_changed');else ensureYoutube(youtubeToken);
      }
      return sendJson(res,200,snapshot());
    }
    if(req.method==='POST'&&req.url==='/control/stop'){
      config=null;stopAll('control_stop');state.status='stopped';state.currentItem=null;state.lastError=null;state.youtubeStatus='off';touch();return sendJson(res,200,snapshot());
    }
    return sendJson(res,404,{error:'not_found'});
  }catch(error){state.lastError=safeError(error);state.status=config?.enabled?'error':state.status;touch();return sendJson(res,400,{error:state.lastError});}
});
server.listen(PORT,'0.0.0.0',()=>console.log(`webtv_v118_encoder_listening:${PORT}`));

setInterval(()=>{
  touch();if(!config?.enabled)return;
  if(nativeRelay&&playout&&nativeStartedAt&&Date.now()-nativeStartedAt>STALL_GRACE_MS&&!outputFresh()){restartNative('native_hls_stalled');return;}
  ensureNative(nativeToken);ensureYoutube(youtubeToken);ensurePlayout(playoutToken);
},5000).unref();

function restartAll(reason){nativeToken+=1;youtubeToken+=1;playoutToken+=1;stopPlayout(reason);stopNative(reason);stopYoutube(reason);prepareHls();state.status='starting';state.currentItem=null;state.lastOutputProgressAt=null;nativeRestartAttempt=0;youtubeRestartAttempt=0;touch();ensureNative(nativeToken);ensureYoutube(youtubeToken);ensurePlayout(playoutToken);}
function restartPlayout(reason){playoutToken+=1;stopPlayout(reason);state.currentItem=null;state.status=outputFresh()?'streaming':nativeRelay?'starting':'reconnecting';touch();ensureNative(nativeToken);ensureYoutube(youtubeToken);ensurePlayout(playoutToken);}
function restartNative(reason){const token=nativeToken;stopNative(reason);state.status='reconnecting';state.lastError=reason;state.relayRestarts+=1;state.lastOutputProgressAt=null;touch();scheduleNative(token,RESTART_DELAYS[0]);}
function restartYoutube(reason){youtubeToken+=1;stopYoutube(reason);youtubeRestartAttempt=0;ensureYoutube(youtubeToken);}
function stopAll(reason){nativeToken+=1;youtubeToken+=1;playoutToken+=1;stopPlayout(reason);stopNative(reason);stopYoutube(reason);}

function ensureNative(token){
  if(nativeRelay||!config?.enabled||token!==nativeToken)return;clearTimeout(nativeRestartTimer);nativeRestartTimer=null;prepareHls();
  const child=spawn('ffmpeg',buildNativeRelayArgs(),{stdio:['ignore','pipe','pipe']});nativeRelay=child;nativeStartedAt=Date.now();state.nativeRelayPid=child.pid||null;state.ffmpegPid=child.pid||null;state.status='starting';touch();
  let stderr='',progress='';
  child.stdout.on('data',chunk=>{progress+=chunk.toString('utf8');const lines=progress.split(/\r?\n/u);progress=lines.pop()||'';for(const line of lines){if(!line.startsWith('out_time_'))continue;state.lastOutputProgressAt=new Date().toISOString();state.status=playout?'streaming':'starting';state.lastError=null;nativeRestartAttempt=0;touch();}});
  child.stderr.on('data',chunk=>stderr=(stderr+chunk.toString('utf8')).slice(-4000));
  child.once('error',error=>nativeExited(child,token,sanitize(error.message)));
  child.once('exit',(code,signal)=>{if(['SIGTERM','SIGKILL'].includes(signal)||token!==nativeToken||!config?.enabled){if(nativeRelay===child)clearNative(child);return;}nativeExited(child,token,sanitize(stderr||`native_relay_exit_${code}`));});
}
function nativeExited(child,token,error){if(nativeRelay!==child)return;clearNative(child);if(token!==nativeToken||!config?.enabled)return;state.status='reconnecting';state.lastError=error||'native_hls_disconnected';state.relayRestarts+=1;state.lastOutputProgressAt=null;touch();const delay=RESTART_DELAYS[Math.min(nativeRestartAttempt,RESTART_DELAYS.length-1)];nativeRestartAttempt+=1;scheduleNative(token,delay);}
function scheduleNative(token,delay){clearTimeout(nativeRestartTimer);nativeRestartTimer=setTimeout(()=>{nativeRestartTimer=null;ensureNative(token);},delay);nativeRestartTimer.unref?.();}
function clearNative(child){if(nativeRelay===child)nativeRelay=null;nativeStartedAt=0;state.nativeRelayPid=null;state.ffmpegPid=null;touch();}

function ensureYoutube(token){
  const youtube=config?.output?.youtube;if(!config?.enabled||!youtube?.enabled){state.youtubeStatus='off';state.youtubeLastError=null;return;}if(youtubeRelay||token!==youtubeToken)return;
  if(!youtube.ingestUrl||!youtube.streamKey){state.youtubeStatus='not_configured';state.youtubeLastError='youtube_not_configured';return;}
  const child=spawn('ffmpeg',buildYoutubeArgs(config),{stdio:['ignore','pipe','pipe']});youtubeRelay=child;state.youtubeRelayPid=child.pid||null;state.youtubeStatus='starting';state.youtubeLastError=null;touch();let stderr='',progress='';
  child.stdout.on('data',chunk=>{progress+=chunk.toString('utf8');const lines=progress.split(/\r?\n/u);progress=lines.pop()||'';for(const line of lines){if(line.startsWith('out_time_')){state.youtubeStatus='live';state.youtubeLastError=null;youtubeRestartAttempt=0;touch();}}});
  child.stderr.on('data',chunk=>stderr=(stderr+chunk.toString('utf8')).slice(-4000));
  child.once('error',error=>youtubeExited(child,token,sanitize(error.message)));
  child.once('exit',(code,signal)=>{if(['SIGTERM','SIGKILL'].includes(signal)||token!==youtubeToken||!config?.enabled||!config.output.youtube.enabled){if(youtubeRelay===child)clearYoutube(child);return;}youtubeExited(child,token,sanitize(stderr||`youtube_relay_exit_${code}`));});
}
function youtubeExited(child,token,error){if(youtubeRelay!==child)return;clearYoutube(child);if(token!==youtubeToken||!config?.enabled||!config.output.youtube.enabled)return;state.youtubeStatus='reconnecting';state.youtubeLastError=error||'youtube_relay_disconnected';touch();const delay=RESTART_DELAYS[Math.min(youtubeRestartAttempt,RESTART_DELAYS.length-1)];youtubeRestartAttempt+=1;clearTimeout(youtubeRestartTimer);youtubeRestartTimer=setTimeout(()=>{youtubeRestartTimer=null;ensureYoutube(token);},delay);youtubeRestartTimer.unref?.();}
function clearYoutube(child){if(youtubeRelay===child)youtubeRelay=null;state.youtubeRelayPid=null;touch();}

function ensurePlayout(token){if(playout||activePlayoutToken!==null||!config?.enabled||token!==playoutToken)return;activePlayoutToken=token;queueMicrotask(async()=>{try{await playoutLoop(token);}finally{if(activePlayoutToken===token)activePlayoutToken=null;if(config?.enabled&&!playout)ensurePlayout(playoutToken);}});}
async function playoutLoop(token){let failures=0;while(token===playoutToken&&config?.enabled){const items=config.playlist.filter(item=>item.mediaUrl);if(!items.length){state.status='error';state.lastError='playlist_empty';touch();await sleep(5000);continue;}for(let index=0;index<items.length;index+=1){if(token!==playoutToken||!config?.enabled)return;const item=items[index],next=items[(index+1)%items.length];if(next?.mediaUrl)void probeHasAudio(next.mediaUrl);state.status=outputFresh()?'streaming':nativeRelay?'starting':'reconnecting';state.currentItem={id:item.id,title:item.title,type:item.type,startedAt:new Date().toISOString()};state.lastError=null;touch();const result=await playItem(item,token);if(token!==playoutToken||!config?.enabled)return;if(result.ok){failures=0;continue;}failures+=1;state.lastError=result.error;touch();await playFallback(token,failures);await sleep(Math.min(5000,500*failures));}}}
async function playItem(item,token){const hasAudio=await probeHasAudio(item.mediaUrl);if(token!==playoutToken||!config?.enabled)return{ok:false,error:'superseded'};return runPlayout(buildPlayoutArgs(item.mediaUrl,hasAudio,config),token);}
async function playFallback(token,count){if(token!==playoutToken||!config?.enabled)return;const url=config.fallback?.mediaUrl||'';if(url){state.currentItem={id:'fallback',title:config.fallback.title||'Neptune Media',type:'fallback',startedAt:new Date().toISOString()};touch();const result=await runPlayout(buildPlayoutArgs(url,await probeHasAudio(url),config),token);if(result.ok)return;}const seconds=Math.min(20,Math.max(5,count*5));state.currentItem={id:'technical-slate',title:'Neptune Media — reprise de la diffusion',type:'fallback',startedAt:new Date().toISOString()};touch();await runPlayout(buildSlateArgs(seconds,config),token);}

function buildPlayoutArgs(mediaUrl,hasAudio,cfg){const e=cfg.encoding,args=['-hide_banner','-nostdin','-loglevel','warning','-re','-i',mediaUrl];if(!hasAudio)args.push('-re','-f','lavfi','-i','anullsrc=channel_layout=stereo:sample_rate=48000');args.push('-map','0:v:0',...(hasAudio?['-map','0:a:0?']:['-map','1:a:0']),'-vf',`scale=${e.width}:${e.height}:force_original_aspect_ratio=decrease,pad=${e.width}:${e.height}:(ow-iw)/2:(oh-ih)/2,fps=${e.fps},format=yuv420p,setpts=PTS-STARTPTS`,'-c:v','libx264','-preset',e.preset,'-tune','zerolatency','-b:v',`${e.videoBitrateKbps}k`,'-maxrate',`${e.videoBitrateKbps}k`,'-bufsize',`${e.videoBitrateKbps*2}k`,'-g',String(e.fps*2),'-keyint_min',String(e.fps*2),'-sc_threshold','0','-x264-params','repeat-headers=1','-c:a','aac','-b:a',`${e.audioBitrateKbps}k`,'-ar','48000','-ac','2','-af','aresample=async=1:first_pts=0','-shortest','-muxdelay','0','-muxpreload','0','-f','tee',`[f=mpegts:onfail=ignore]${NATIVE_OUTPUT}|[f=mpegts:onfail=ignore]${YOUTUBE_OUTPUT}`);return args;}
function buildSlateArgs(seconds,cfg){const e=cfg.encoding;return ['-hide_banner','-nostdin','-loglevel','warning','-re','-f','lavfi','-i',`color=c=0x06183f:s=${e.width}x${e.height}:r=${e.fps}:d=${seconds}`,'-re','-f','lavfi','-i',`anullsrc=channel_layout=stereo:sample_rate=48000:d=${seconds}`,'-map','0:v:0','-map','1:a:0','-c:v','libx264','-preset',e.preset,'-tune','zerolatency','-b:v',`${e.videoBitrateKbps}k`,'-g',String(e.fps*2),'-keyint_min',String(e.fps*2),'-sc_threshold','0','-c:a','aac','-b:a',`${e.audioBitrateKbps}k`,'-ar','48000','-ac','2','-shortest','-f','tee',`[f=mpegts:onfail=ignore]${NATIVE_OUTPUT}|[f=mpegts:onfail=ignore]${YOUTUBE_OUTPUT}`];}
function buildNativeRelayArgs(){return ['-hide_banner','-nostdin','-loglevel','warning','-fflags','+genpts+discardcorrupt','-use_wallclock_as_timestamps','1','-i',NATIVE_INPUT,'-map','0:v:0','-map','0:a:0?','-c:v','copy','-c:a','copy','-hls_time','4','-hls_list_size','10','-hls_delete_threshold','3','-hls_flags','delete_segments+append_list+independent_segments+program_date_time+omit_endlist','-hls_segment_filename',join(HLS_DIR,'segment-%08d.ts'),'-progress','pipe:1','-stats_period','1','-f','hls',join(HLS_DIR,'index.m3u8')];}
function buildYoutubeArgs(cfg){return ['-hide_banner','-nostdin','-loglevel','warning','-fflags','+genpts+discardcorrupt','-use_wallclock_as_timestamps','1','-i',YOUTUBE_INPUT,'-map','0:v:0','-map','0:a:0?','-c:v','copy','-c:a','copy','-flvflags','no_duration_filesize','-progress','pipe:1','-stats_period','1','-f','flv',youtubeTarget(cfg)];}
function runPlayout(args,token){return new Promise(resolve=>{if(token!==playoutToken)return resolve({ok:false,error:'superseded'});const child=spawn('ffmpeg',args,{stdio:['ignore','ignore','pipe']});playout=child;state.playoutPid=child.pid||null;touch();let stderr='',settled=false;const finish=result=>{if(settled)return;settled=true;if(playout===child)playout=null;state.playoutPid=null;touch();resolve(result);};child.stderr.on('data',chunk=>stderr=(stderr+chunk.toString('utf8')).slice(-4000));child.once('error',error=>finish({ok:false,error:sanitize(error.message)}));child.once('exit',(code,signal)=>{if(token!==playoutToken||['SIGTERM','SIGKILL'].includes(signal))return finish({ok:false,error:'stopped'});return finish(code===0?{ok:true}:{ok:false,error:sanitize(stderr||`playout_exit_${code}`)});});});}
function stopPlayout(reason){const child=playout;playout=null;state.playoutPid=null;terminate(child);if(reason)console.log(`webtv_v118_playout_stop:${reason}`);}
function stopNative(reason){clearTimeout(nativeRestartTimer);nativeRestartTimer=null;const child=nativeRelay;nativeRelay=null;nativeStartedAt=0;state.nativeRelayPid=null;state.ffmpegPid=null;terminate(child);if(reason)console.log(`webtv_v118_native_stop:${reason}`);}
function stopYoutube(reason){clearTimeout(youtubeRestartTimer);youtubeRestartTimer=null;const child=youtubeRelay;youtubeRelay=null;state.youtubeRelayPid=null;terminate(child);state.youtubeStatus=config?.output?.youtube?.enabled?'starting':'off';if(reason)console.log(`webtv_v118_youtube_stop:${reason}`);}
function terminate(child){if(!child||child.killed)return;try{child.kill('SIGTERM');}catch{}const timer=setTimeout(()=>{try{if(!child.killed)child.kill('SIGKILL');}catch{}},3000);timer.unref?.();}

function serveLive(req,res){const name=String(req.url||'').replace('/live/','').split('?')[0];if(!/^(index\.m3u8|segment-\d+\.ts)$/u.test(name))return sendJson(res,404,{error:'not_found'});const path=join(HLS_DIR,name);if(!existsSync(path))return sendJson(res,503,{error:'stream_starting'});let stat;try{stat=statSync(path);}catch{return sendJson(res,404,{error:'not_found'});}res.writeHead(200,{'Content-Type':name.endsWith('.m3u8')?'application/vnd.apple.mpegurl':'video/mp2t','Content-Length':String(stat.size),'Cache-Control':name.endsWith('.m3u8')?'no-store, max-age=0':'public, max-age=8','Access-Control-Allow-Origin':'*'});createReadStream(path).pipe(res);}
function prepareHls(){try{mkdirSync(HLS_DIR,{recursive:true});for(const name of ['index.m3u8']){const path=join(HLS_DIR,name);if(existsSync(path))rmSync(path,{force:true});}}catch{}}
function probeHasAudio(url){if(audioCache.has(url))return Promise.resolve(audioCache.get(url));if(audioPending.has(url))return audioPending.get(url);const promise=new Promise(resolve=>{const child=spawn('ffprobe',['-v','error','-select_streams','a:0','-show_entries','stream=codec_type','-of','csv=p=0',url],{stdio:['ignore','pipe','ignore']});let out='',done=false,timer;const finish=value=>{if(done)return;done=true;if(timer)clearTimeout(timer);const result=value!==false;audioCache.set(url,result);audioPending.delete(url);resolve(result);};child.stdout.on('data',c=>out=(out+c.toString('utf8')).slice(-1024));child.once('error',()=>finish(true));child.once('exit',code=>finish(code===0?out.includes('audio'):true));timer=setTimeout(()=>{try{child.kill('SIGKILL');}catch{}finish(true);},15000);timer.unref?.();});audioPending.set(url,promise);return promise;}
function youtubeTarget(cfg){const base=String(cfg.output.youtube.ingestUrl||'').replace(/\/+$/u,''),key=String(cfg.output.youtube.streamKey||'').trim();if(!base.startsWith('rtmps://')||!key)throw new Error('youtube_output_invalid');return `${base}/${encodeURIComponent(key)}`;}
function validateConfig(raw){if(!raw||raw.enabled!==true)throw new Error('webtv_disabled');if(!Array.isArray(raw.playlist)||!raw.playlist.length)throw new Error('playlist_empty');const e=raw.encoding||{},youtube=raw.output?.youtube||{};return {enabled:true,revision:String(raw.revision||Date.now()),forceRestart:raw.forceRestart===true,playlist:raw.playlist.slice(0,250).map(item=>({id:String(item.id||'').slice(0,100),title:String(item.title||'Programme Neptune').slice(0,180),type:String(item.type||'episode').slice(0,30),mediaUrl:requireHttps(item.mediaUrl),durationSeconds:Number(item.durationSeconds||0)})).filter(item=>item.mediaUrl),fallback:{title:String(raw.fallback?.title||'Neptune Media').slice(0,180),mediaUrl:optionalHttps(raw.fallback?.mediaUrl)},output:{provider:'neptune',protocol:'hls',youtube:{enabled:youtube.enabled===true,ingestUrl:String(youtube.ingestUrl||'').trim(),streamKey:String(youtube.streamKey||'').trim()}},encoding:{width:bounded(e.width,1280,640,1920),height:bounded(e.height,720,360,1080),fps:bounded(e.fps,30,24,60),videoBitrateKbps:bounded(e.videoBitrateKbps,4000,1500,12000),audioBitrateKbps:bounded(e.audioBitrateKbps,128,96,320),preset:['ultrafast','superfast','veryfast','faster','fast'].includes(e.preset)?e.preset:'superfast'}};}
function encodingFingerprint(cfg){return JSON.stringify(cfg?.encoding||{});}
function youtubeFingerprint(cfg){return JSON.stringify({enabled:Boolean(cfg?.output?.youtube?.enabled),ingestUrl:cfg?.output?.youtube?.ingestUrl||'',streamKey:Boolean(cfg?.output?.youtube?.streamKey)});}
function requireHttps(value){const raw=String(value||'').trim();if(!raw)return'';const url=new URL(raw);if(url.protocol!=='https:')throw new Error('media_url_forbidden');return url.toString();}
function optionalHttps(value){try{return requireHttps(value);}catch{return'';}}
function bounded(value,fallback,min,max){const n=Number(value);return Number.isFinite(n)?Math.max(min,Math.min(max,Math.round(n))):fallback;}
function outputFresh(){const t=Date.parse(state.lastOutputProgressAt||'');return Number.isFinite(t)&&Date.now()-t<=OUTPUT_FRESH_MS;}
function snapshot(){return {...state,heartbeatAt:new Date().toISOString(),uptimeSeconds:Math.floor((Date.now()-startedAt)/1000),relayConnected:Boolean(nativeRelay&&outputFresh()),nativeHlsReady:existsSync(join(HLS_DIR,'index.m3u8'))};}
function touch(){state.heartbeatAt=new Date().toISOString();}
function sanitize(value){let text=String(value||'ffmpeg_error');if(config?.output?.youtube?.streamKey)text=text.split(config.output.youtube.streamKey).join('[stream-key]');return text.replace(/rtmps:\/\/[^\s]+/giu,'rtmps://[youtube]').replace(/[\r\n]+/gu,' ').trim().slice(-500)||'ffmpeg_error';}
function safeError(error){return String(error?.message||error||'error').replace(/[\r\n]+/gu,' ').slice(0,500);}
function readJson(req){return new Promise((resolve,reject)=>{let body='';req.setEncoding('utf8');req.on('data',chunk=>{body+=chunk;if(body.length>1024*1024)reject(new Error('payload_too_large'));});req.on('end',()=>{try{resolve(JSON.parse(body||'{}'));}catch{reject(new Error('invalid_json'));}});req.on('error',reject);});}
function sendJson(res,status,payload){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(payload));}
function sleep(ms){return new Promise(resolve=>setTimeout(resolve,ms));}
process.on('SIGTERM',()=>{config=null;stopAll('sigterm');server.close(()=>process.exit(0));setTimeout(()=>process.exit(0),4000).unref();});
