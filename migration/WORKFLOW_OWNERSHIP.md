# Gouvernance des workflows GitHub

Le dépôt doit rester migrable sans faire dépendre le comportement métier d'une accumulation de workflows historiques.

## Propriétaires canoniques

| Responsabilité | Workflow canonique | Règle |
| --- | --- | --- |
| Validation source / PR | `.github/workflows/validate.yml` | contrôle `npm run check` et le bundle Worker, sans déployer |
| Déploiement Cloudflare de référence | `.github/workflows/deploy-cloudflare.yml` | seul workflow autorisé à exécuter un vrai `wrangler deploy` du Worker Media |
| Vérification après déploiement | `.github/workflows/verify-production-after-deploy.yml` | vérifie les surfaces, le contrôle d'accès Studio et les contrats de production après succès du déploiement canonique |
| Audit visuel | `.github/workflows/visual-render-audit.yml` | s'exécute après un déploiement réussi, jamais avant lui |
| Audit applicatif exhaustif | `.github/workflows/audit-entire-application-v60-20260730.yml` | contrôle lourd réservé aux PR concernées ou à un lancement manuel |
| Validation détaillée espace client | `.github/workflows/client-dashboard-validation.yml` | contrôle Playwright spécialisé conservé sur PR / manuel tant que sa couverture n'est pas absorbée par les tests canoniques |
| Configuration CORS WebTV R2 | `.github/workflows/configure-webtv-r2-cors.yml` | infrastructure spécialisée ; ne s'exécute que lorsque sa configuration change ou manuellement |

## Règles

1. Un workflow de diagnostic ne déploie jamais l'application.
2. Un contrôle de production ne doit pas démarrer sur un simple `push` avant que le déploiement correspondant soit terminé.
3. Une configuration d'infrastructure spécialisée ne doit pas s'exécuter à chaque commit applicatif.
4. Les assertions fonctionnelles réutilisables doivent vivre dans `neptune-tv-media-cloudflare/scripts/` plutôt que dans de longs blocs shell dupliqués.
5. Les workflows versionnés par fonctionnalité sont considérés comme dette de migration tant que leur assertion unique n'a pas été absorbée par un contrôle canonique.
6. Les workflows devenus strictement redondants doivent être supprimés par lot après vérification de leur couverture.
7. Les contrôles du déploiement Cloudflare doivent viser les ingress réellement servis par ce déploiement (`workers.dev` et `tv.neptunebusiness.com`). Les autres ingress restent vérifiés pour leur disponibilité, sans leur imposer l'arborescence d'assets du Worker.
8. Les audits Playwright coûteux ne tournent pas automatiquement sur chaque commit lorsque le pipeline canonique couvre déjà la validation syntaxique et fonctionnelle.

## Nettoyage effectué

- `validate-worker.yml` supprimé : doublon de `validate.yml` (`npm run check` + dry-run Wrangler).
- `verify-production.yml` supprimé : son contrôle de présence de `/api/admin/control-room` a été absorbé par le vérificateur post-déploiement canonique.
- `client-dashboard-production-check.yml` supprimé : contrôle ponctuel de l'ancien dashboard v37, remplacé depuis longtemps par les contrats client v118.x et le contrôle post-déploiement canonique.
- `configure-webtv-r2-cors.yml` limité aux changements de sa configuration ou à un lancement manuel.
- `visual-render-audit.yml` déplacé de `push` vers un déclenchement après succès du déploiement canonique.
- `audit-entire-application-v60-20260730.yml` ne s'exécute plus à chaque push ; il reste disponible sur PR pertinente et manuellement comme audit lourd.
- les anciens workflows de déploiement spécialisés Client, Réservation et HORS NORME ont été remplacés par le pipeline canonique unique.

## Dette restante

Plusieurs workflows historiques de diagnostic ou de vérification post-déploiement existent encore. Ils doivent être consolidés progressivement selon cette règle : **déplacer d'abord toute assertion encore utile vers un script ou le vérificateur post-déploiement canonique, puis supprimer le workflow redondant**.
