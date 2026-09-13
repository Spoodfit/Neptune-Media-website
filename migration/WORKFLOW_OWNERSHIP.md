# Gouvernance des workflows GitHub

Le dépôt Neptune Media possède désormais un jeu fermé de workflows. Cette liste est déclarée dans `migration/manifest.json` et contrôlée par `npm run audit:migration`. Un nouveau workflow ne doit pas être ajouté pour corriger ponctuellement une fonctionnalité : sa vérification doit être rattachée au propriétaire canonique correspondant.

## Workflows canoniques

| Responsabilité | Workflow | Déclenchement |
| --- | --- | --- |
| Validation source et architecture | `.github/workflows/validate.yml` | push `main` et pull request |
| Déploiement Cloudflare de référence | `.github/workflows/deploy-cloudflare.yml` | pipeline de production ; seul propriétaire du vrai `wrangler deploy` |
| Vérification fonctionnelle après déploiement | `.github/workflows/verify-production-after-deploy.yml` | succès du déploiement canonique ou manuel |
| Audit UI et rendu Playwright | `.github/workflows/visual-render-audit.yml` | succès du déploiement canonique ou manuel |
| Audit applicatif exhaustif | `.github/workflows/audit-application.yml` | pull request pertinente ou manuel |
| Validation détaillée de l'espace client | `.github/workflows/client-dashboard-validation.yml` | pull request pertinente ou manuel |
| Validation du moteur vidéo local | `.github/workflows/video-engine.yml` | pull request touchant le moteur/Studio vidéo ou manuel |
| Configuration CORS WebTV R2 | `.github/workflows/configure-webtv-r2-cors.yml` | opération d'infrastructure spécialisée |
| Import des émissions de lancement | `.github/workflows/import-launch-emissions.yml` | manuel uniquement, confirmation explicite |

## Règles d'ownership

1. `deploy-cloudflare.yml` est l'unique workflow autorisé à exécuter un déploiement réel du Worker Media. Les autres usages de Wrangler restent des dry-runs ou des opérations d'infrastructure ciblées.
2. `verify-production-after-deploy.yml` centralise les contrats de production réutilisables via `scripts/verify-production-contracts.mjs`; aucun workflow versionné par écran ou par release ne doit renaître.
3. `visual-render-audit.yml` possède les audits Playwright de production, y compris le quality gate UI et les captures multi-viewports.
4. `validate.yml` possède la validation source, `npm run check`, l'audit de migration et le dry-run Worker.
5. `audit-application.yml` est le contrôle lourd du périmètre complet ; il ne tourne pas à chaque push.
6. `client-dashboard-validation.yml` reste volontairement spécialisé tant que ses scénarios clients ne sont pas entièrement absorbés par l'audit applicatif.
7. `video-engine.yml` est l'unique contrôle dédié au moteur vidéo : compatibilité Worker/Studio, build Docker, santé API et rendu déterministe.
8. Les imports ou écritures opérationnelles en production sont manuels. Modifier un fichier source ne doit jamais déclencher un import média.
9. Les assertions fonctionnelles doivent vivre dans `neptune-tv-media-cloudflare/scripts/` ou dans les tests ; les workflows orchestrent, ils ne deviennent pas une seconde couche applicative.

## État du nettoyage

La consolidation des workflows historiques est terminée au niveau du dépôt. Les anciens diagnostics et vérificateurs `vXX`, les probes ponctuels, les contrôles catalogue/city/Studio/WebTV versionnés et les anciens pipelines vidéo ne font plus partie de l'architecture GitHub Actions.

La garde-fou est automatique : toute réintroduction d'un fichier workflow en dehors de l'allowlist de `migration/manifest.json` fait échouer `npm run audit:migration`.

Cette fermeture du pipeline ne signifie pas que la chaîne runtime Cloudflare est elle-même supprimée. Les wrappers `entry-vXX` encore importés restent nécessaires à l'application actuelle jusqu'au basculement VPS ; cette dette est décrite séparément dans `RUNTIME_GRAPH.md` et ne doit pas être confondue avec la gouvernance CI/CD.
