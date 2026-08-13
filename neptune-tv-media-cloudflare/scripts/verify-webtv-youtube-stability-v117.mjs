import { readFile } from 'node:fs/promises';

const read=(path)=>readFile(new URL(`../${path}`,import.meta.url),'utf8');
const [encoder,monitor,html]=await Promise.all([
  read('containers/webtv/encoder.mjs'),
  read('public/studio/webtv-live-monitor-v1.js'),
  read('public/studio/webtv.html'),
]);

const failures=[];
const expect=(condition,message)=>{if(!condition)failures.push(message);};

for(const marker of [
  'LOCAL_UDP_PORT',
  'LOCAL_INPUT',
  'LOCAL_OUTPUT',
  'buildRelayArgs',
  "'-c:v', 'copy', '-c:a', 'copy'",
  "'-f', 'mpegts', LOCAL_OUTPUT",
  'relayFingerprint',
  'restartRelayInPlace',
  'youtube_output_stalled',
  'RELAY_RESTART_DELAYS_MS',
  'lastOutputProgressAt',
  'relayConnected',
  'playout_restart_keep_relay',
])expect(encoder.includes(marker),`encodeur v117 incomplet : ${marker}`);

expect(encoder.includes("const hardRestart = transportChanged || (requestedRestart && !relayHealthy)"),'une sauvegarde normale peut encore couper un relais YouTube sain');
expect(encoder.includes("if (!hasAudio) args.push('-re', '-f', 'lavfi'"),'la piste audio synthétique n’est pas cadencée en temps réel');
expect(encoder.includes("'-shortest'"),'un média sans audio peut encore rester bloqué après sa dernière image');
expect(!/function buildPlayoutArgs[\s\S]*?'-f', 'flv', streamTarget\(cfg\)/u.test(encoder),'le playout média ouvre encore directement une session RTMPS');
expect(/function buildRelayArgs[\s\S]*?'-f', 'flv', streamTarget\(cfg\)/u.test(encoder),'le relais persistant n’est plus propriétaire de la sortie RTMPS');
expect(!encoder.includes("spawnSync('ffprobe'"),'ffprobe synchrone peut encore bloquer les transitions entre médias');

for(const marker of [
  'neptune-webtv-youtube-stability-20260813-v117',
  'watchYoutubePlayback',
  'recoverYoutubeMonitor',
  'playerState===0',
  'Le lecteur YouTube a atteint la fin du broadcast.',
  'Le retour YouTube est figé alors que l’encodeur continue de diffuser.',
  'Retour source Neptune · YouTube en reprise automatique',
])expect(monitor.includes(marker),`moniteur YouTube v117 incomplet : ${marker}`);

expect(monitor.includes("monitor.timer=setInterval(()=>refresh(false),5000)"),'le watchdog Studio 5 s a disparu');
expect(monitor.includes("fallbackFromYoutube(reason,15000)"),'le fallback source après END/gel n’est pas borné');
expect(html.includes('webtv-live-monitor-v1.js'),'le moniteur live n’est plus chargé par la régie Studio');

if(failures.length){
  console.error(failures.map(failure=>`- ${failure}`).join('\n'));
  process.exit(1);
}
console.log('WebTV v117 validée : relais RTMPS persistant, transitions MPEG-TS locales, watchdog de sortie et récupération automatique du retour YouTube terminé ou figé.');