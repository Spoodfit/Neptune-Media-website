# Neptune Video Engine

Service local permanent utilisé par Neptune Media Studio pour produire des shorts sans dépendre d’un onglet navigateur ni de Cloudflare Containers.

## Pipeline

1. Import local depuis Neptune Studio.
2. Mise en file persistante dans SQLite.
3. Transcription `faster-whisper`.
4. Analyse visuelle OpenCV.
5. Sélection éditoriale OpenAI, puis Ollama, puis règles Neptune.
6. Recadrage vertical, sous-titres et rendu FFmpeg.
7. Reconnexion du Studio et synchronisation des clips pour validation.

## Démarrage

```powershell
powershell -ExecutionPolicy Bypass -File .\install-windows.ps1
```

L’installateur :

- vérifie Docker Desktop ;
- télécharge la version active ;
- génère un jeton de connexion local ;
- crée le volume persistant `neptune_video_data` ;
- démarre le service sur `http://127.0.0.1:4318` ;
- copie le jeton dans le presse-papiers.

## API locale

- `GET /health`
- `POST /v1/jobs`
- `GET /v1/jobs/{id}`
- `POST /v1/jobs/{id}/retry`
- `GET /v1/jobs/{id}/preview`
- `GET /v1/jobs/{id}/clips/{clipId}`
- `DELETE /v1/jobs/{id}`

Quand `NEPTUNE_ENGINE_TOKEN` est défini, toutes les requêtes doivent inclure `X-Neptune-Engine-Token`.

## Persistance

Les sources, rendus et états sont conservés dans le volume Docker `neptune_video_data`. Les jobs `queued` ou `processing` sont automatiquement repris au redémarrage du service.

## Confidentialité

La vidéo reste sur la machine Neptune. Seule la transcription horodatée est transmise à OpenAI lorsque `OPENAI_API_KEY` est configurée. Le paramètre `store: false` est utilisé. En l’absence de clé, le service tente Ollama, puis applique les règles locales Neptune.
