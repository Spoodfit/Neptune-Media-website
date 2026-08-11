# Neptune Media Web TV — architecture de production V1

## Décision

La Web TV ne doit pas utiliser Google Colab comme encodeur permanent. Le projet possède déjà le bon plan de contrôle Cloudflare : Worker, Studio Admin authentifié, Durable Object, R2 (`MEDIA`), cron et observabilité.

La V1 ajoute donc une régie Web TV au Studio existant et conserve la diffusion vidéo comme un plan de données séparé.

## Architecture cible

```text
Studio Admin (/studio/webtv.html)
        |
        v
Worker neptune-media-webtv
  - auth Studio existante
  - API /api/admin/webtv/state
  - validation de la programmation
        |
        +--> R2 neptune-media-assets
        |      - vidéos existantes
        |      - webtv/control/state-v1.json
        |      - écran/jingle de secours
        |
        +--> Durable Object STUDIO (comptes/catalogue existants)
        |
        +--> Cloudflare Container : WebTvEncoder
                    |
                    v
                 FFmpeg
                    |
              RTMPS :443
                    |
                    v
              YouTube Live
```

## Responsabilités

### Worker / Studio

- Gestion de la playlist et de son ordre.
- Activation/désactivation de l'antenne.
- Sélection du mode boucle ou planning.
- Programme de secours.
- Statut de configuration YouTube sans exposer de secret.
- Supervision du heartbeat de l'encodeur.
- Le navigateur ne reçoit jamais la clé de stream YouTube.

### R2

- Conserver les médias et l'état durable de la programmation.
- Ne jamais dépendre du disque local du container pour les données durables.
- Les URLs sélectionnables depuis la régie restent limitées au domaine `tv.neptunebusiness.com`.

### Container `WebTvEncoder`

- Une seule instance active pour la chaîne Neptune en V1.
- Linux amd64 avec FFmpeg.
- Récupère la programmation validée auprès du Worker.
- Lit les médias via le Worker/R2.
- Diffuse sur l'URL RTMPS YouTube en port 443.
- Envoie un heartbeat régulier au Worker.
- Ignore un média illisible et passe au suivant.
- Utilise le programme de secours si la playlist est vide ou invalide.
- Redémarre proprement FFmpeg après une coupure de sortie.

## Secrets

À créer comme secrets Cloudflare Worker, jamais dans GitHub, R2 ou le frontend :

```text
YOUTUBE_RTMPS_URL
YOUTUBE_STREAM_KEY
WEBTV_ENCODER_TOKEN
```

Le statut `output.configured` doit être calculé côté serveur à partir de la présence des deux secrets YouTube.

## Profil d'encodage de sécurité V1

Les vidéos historiques peuvent avoir des codecs, framerates, résolutions et GOP différents. Il ne faut donc pas faire une concaténation aveugle avec `-c copy`.

Pour la V1, privilégier la stabilité :

```text
1920x1080
30 fps
H.264
CBR
GOP 2 s
AAC stereo 128 kb/s
pix_fmt yuv420p
```

Une V2 pourra normaliser les fichiers une seule fois à l'ingestion, puis réduire fortement le coût CPU du direct.

## Comportement antenne

1. Charger l'état de programmation courant.
2. Si `enabled=false`, ne pas pousser de flux.
3. Si la playlist est vide, diffuser le média de secours.
4. Pour chaque item actif :
   - vérifier sa disponibilité avant lecture ;
   - lire jusqu'à la fin ;
   - signaler les erreurs ;
   - passer au suivant sans interrompre volontairement l'antenne.
5. Recharger la version de playlist entre deux items pour éviter une coupure au milieu d'une émission.
6. En mode `loop`, recommencer au premier item.
7. En mode `schedule`, sélectionner le prochain créneau calculé par le Worker.

## Watchdog

Le cron Cloudflare existant tourne toutes les 5 minutes. Ajouter au handler programmé :

```text
si enabled=true
ET heartbeat encodeur > 90 s
=> redémarrer/réveiller WebTvEncoder
=> conserver l'erreur précédente
=> alerter après plusieurs échecs consécutifs
```

Le container doit également relancer FFmpeg localement après une sortie non nulle avec backoff borné (par exemple 2 s, 5 s, 10 s, puis 30 s maximum).

## Secrets et exposition

La clé YouTube est assimilable à un mot de passe de diffusion. Elle ne doit apparaître :

- ni dans le DOM ;
- ni dans une réponse API ;
- ni dans les logs ;
- ni dans les paramètres de playlist ;
- ni dans un commit GitHub.

## Critères de mise en production

Avant activation 24/7 :

- `npm run check` passe sur la branche.
- Test d'auth : un utilisateur non Studio ne lit/modifie pas `/api/admin/webtv/state`.
- Test CSRF/origin sur les mutations.
- Test fichier corrompu : passage automatique au suivant.
- Test media 404 : programme de secours.
- Test coupure RTMPS : reconnexion automatique.
- Test changement de playlist pendant une émission : prise en compte à la frontière suivante.
- Test rotation de la clé YouTube.
- Soak test 72 h sans intervention humaine.
- Mesure du CPU, de la RAM, des erreurs FFmpeg et du volume d'egress avant passage en 24/7.

## Hors périmètre V1

- Multidiffusion Facebook/Twitch.
- Insertion publicitaire dynamique au niveau image.
- Régie live multi-caméras.
- Sous-titrage temps réel.
- Montage temps réel.

Ces fonctions ne doivent pas retarder la mise en service d'une chaîne linéaire simple et stable.
