# Gouvernance des workflows GitHub

Le dépôt doit rester migrable sans faire dépendre le comportement métier d'une accumulation de workflows historiques.

## Propriétaires canoniques

| Responsabilité | Workflow canonique | Règle |
| --- | --- | --- |
| Validation source / PR | `.github/workflows/validate.yml` | contrôle `npm run check` et le bundle Worker, sans déployer |
| Déploiement Cloudflare de référence | `.github/workflows/deploy-cloudflare.yml` | seul workflow autorisé à exécuter un vrai `wrangler deploy` du Worker Media |
| Vérification après déploiement | `.github/workflows/verify-production-after-deploy.yml` | vérifie les surfaces et contrats de production après succès du déploiement canonique |
| Configuration CORS WebTV R2 | `.github/workflows/configure-webtv-r2-cors.yml` | infrastructure spécialisée ; ne s'exécute que lorsque sa configuration change ou manuellement |

## Règles

1. Un workflow de diagnostic ne déploie jamais l'application.
2. Un contrôle de production ne doit pas démarrer sur un simple `push` avant que le déploiement correspondant soit terminé.
3. Une configuration d'infrastructure spécialisée ne doit pas s'exécuter à chaque commit applicatif.
4. Les assertions fonctionnelles réutilisables doivent vivre dans `neptune-tv-media-cloudflare/scripts/` plutôt que dans de longs blocs shell dupliqués.
5. Les workflows versionnés par fonctionnalité sont considérés comme dette de migration tant que leur assertion unique n'a pas été absorbée par un contrôle canonique.
6. Les workflows devenus strictement redondants doivent être supprimés par lot après vérification de leur couverture.

## Nettoyage effectué

Le workflow `validate-worker.yml` a été supprimé : il doublonnait `validate.yml` en exécutant les mêmes contrôles (`npm run check` + dry-run Wrangler).

Le workflow `configure-webtv-r2-cors.yml` ne tourne plus à chaque push sur `main`. Il est déclenché uniquement par une modification de sa configuration ou manuellement.

Les anciens workflows de déploiement spécialisés Client, Réservation et HORS NORME ont déjà été remplacés par le pipeline canonique unique.

## Dette restante

Plusieurs workflows historiques de diagnostic ou de vérification post-déploiement existent encore. Ils doivent être consolidés progressivement selon cette règle : **déplacer d'abord toute assertion encore utile vers un script ou le vérificateur post-déploiement canonique, puis supprimer le workflow redondant**.
