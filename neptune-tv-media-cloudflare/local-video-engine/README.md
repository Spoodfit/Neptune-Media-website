# Neptune Video Local Engine

Moteur de production vidéo exécuté dans Chrome ou Edge, selon le même principe de confidentialité que Neptune Video Clean.

## Flux

1. La vidéo source est sélectionnée localement et n’est jamais envoyée dans R2.
2. Mediabunny extrait l’audio par flux et le découpe en blocs bornés.
3. Whisper Base timestamped s’exécute dans un Web Worker avec WebGPU, puis WASM en secours.
4. Le moteur local détecte et score les passages TOFU, MOFU et BOFU.
5. Workers AI est interrogé uniquement lorsque l’analyse locale ne produit pas assez de candidats.
6. Les shorts verticaux 1080 × 1920 et leurs sous-titres sont rendus avec WebCodecs/Mediabunny.
7. Les blobs générés restent dans IndexedDB sur l’ordinateur de production.
8. Après validation, le navigateur envoie uniquement le short retenu au Worker, qui le transmet en flux vers le dossier Google Drive du client.

## Contraintes assumées

- garder l’onglet ouvert pendant le traitement ;
- empêcher la mise en veille ;
- utiliser Chrome ou Edge à jour ;
- disposer d’espace disque temporaire ;
- un rendu local absent d’un autre navigateur doit être régénéré sur l’ordinateur d’origine.

## Coût cloud

- aucun Cloudflare Container ;
- aucun stockage R2 de la vidéo source ou des rendus ;
- Workers AI seulement en secours, dans l’allocation gratuite disponible ;
- Durable Object limité aux métadonnées et états de validation.
