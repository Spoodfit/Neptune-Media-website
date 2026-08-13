# WebTV YouTube stability v117

## Défaut corrigé

L’ancien encodeur ouvrait une sortie RTMPS YouTube directement dans chaque processus FFmpeg de média. La fin normale d’une vidéo fermait donc aussi la connexion RTMPS, avant le démarrage du média suivant. YouTube pouvait interpréter cette coupure comme une fin de broadcast tandis que le Studio continuait à considérer l’encodeur actif.

## Architecture v117

- un processus FFmpeg **relay** reste propriétaire de la connexion RTMPS YouTube ;
- les médias sont transcodés individuellement vers un transport MPEG-TS local en UDP ;
- les transitions de médias n’arrêtent plus le relais RTMPS ;
- les formats vidéo et audio sont normalisés avant le relais ;
- les médias sans audio reçoivent une piste silencieuse cadencée en temps réel et bornée par `-shortest` ;
- `ffprobe` est asynchrone et le média suivant est pré-analysé pendant la lecture courante ;
- un watchdog redémarre uniquement le relais si sa progression de sortie se fige ;
- les reconnexions utilisent un backoff court et borné ;
- une mise à jour de playlist redémarre le playout, pas un relais YouTube sain.

## Moniteur Studio

Le retour YouTube traite explicitement `YT.PlayerState.ENDED` et détecte également un lecteur dont le temps ou la durée ne progressent plus. Dans ces cas, le Studio bascule temporairement sur le retour source Neptune puis retente automatiquement YouTube, évitant l’écran bloqué sur la dernière image du broadcast.

## Validation

Le gate `Verify WebTV YouTube Stability V117` vérifie les contrats source et exécute un relais FFmpeg réel sur deux médias successifs de caractéristiques différentes, dont un sans piste audio. Il vérifie que le même processus de relais survit aux deux médias et que les timestamps vidéo de sortie restent monotones.
