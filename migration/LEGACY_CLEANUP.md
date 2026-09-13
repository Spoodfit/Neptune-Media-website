# Inventaire de nettoyage legacy

Le nettoyage du dépôt et de la CI/CD est terminé au niveau de l'architecture de référence. La dette qui reste dans le runtime Cloudflare est volontaire : elle sert encore l'application actuelle et sera retirée avec le basculement VPS, domaine par domaine.

## Nettoyage terminé

Le dépôt ne conserve plus comme architecture active :

- les sorties ponctuelles de diagnostic et de déploiement commitées à la racine ;
- `ui-quality-status.json`, ancien instantané d'un audit UI d'août 2026 ;
- les workflows versionnés par écran, release ou correctif ;
- les anciens diagnostics Catalogue, City, Studio, WebTV, Drive, Client et Vidéo ;
- les probes de production remplacées par les contrats de vérification canoniques ;
- plusieurs propriétaires concurrents du déploiement Worker.

Les sorties d'audit sont désormais produites comme artefacts GitHub Actions ou fichiers locaux ignorés par Git. Elles ne constituent plus une source de vérité versionnée.

## CI/CD canonique

La liste fermée des workflows autorisés est déclarée dans `migration/manifest.json` et vérifiée par `neptune-tv-media-cloudflare/scripts/verify-migration-readiness.mjs`.

Le seul propriétaire du déploiement Worker est :

```text
.github/workflows/deploy-cloudflare.yml
```

Les contrats de production sont regroupés dans :

```text
neptune-tv-media-cloudflare/scripts/verify-production-contracts.mjs
.github/workflows/verify-production-after-deploy.yml
```

Les audits visuels de production sont regroupés dans :

```text
neptune-tv-media-cloudflare/scripts/qa-production-ui.mjs
neptune-tv-media-cloudflare/scripts/visual-render-audit.mjs
.github/workflows/visual-render-audit.yml
```

Les imports de médias de lancement sont manuels uniquement et demandent une confirmation explicite.

## Legacy encore nécessaire

Les éléments suivants ne sont pas supprimés tant que la version Cloudflare reste la référence en production :

- `src/entry-v48.js` et les wrappers descendants réellement importés ;
- les modules Store et bindings Cloudflare encore appelés par cette chaîne ;
- les assets réellement injectés dans Studio, Espace client, Réservation, HORS NORME et Direct ;
- les intégrations Drive, Stripe, Resend, R2, WebTV et vidéo dont les parcours actifs dépendent ;
- les tests historiques encore utilisés comme garde-fous ou source de parité pour la migration.

Leur statut est **LEGACY_REQUIRED** ou **MIGRATION_SOURCE**, selon `migration/RUNTIME_GRAPH.md`. Leur présence est une contrainte de compatibilité de l'ancienne plateforme, pas une architecture à reproduire sur le VPS.

## Règle de suppression runtime

Un fichier runtime ancien n'est supprimé que lorsque l'une de ces conditions est démontrée :

1. il n'a plus aucun import, injection HTML, route, test canonique ni consommateur actif ;
2. son comportement a été porté vers `apps/media` ou `apps/backend`, la parité a été vérifiée et le trafic concerné a basculé sur le VPS.

Une version `vXX` élevée ou ancienne n'est jamais, à elle seule, une preuve de code mort.

## Fin de la dette Cloudflare

La suppression finale de la chaîne `entry-vXX`, du Store Durable Object, des bindings R2/Workers et des shims de compatibilité intervient après :

- import idempotent des données dans PostgreSQL/Prisma ;
- portage des services métier vers les modules Express de `apps/backend` ;
- portage des surfaces vers `apps/media` ;
- migration du stockage nécessaire ;
- validation de parité des parcours critiques ;
- basculement de `media.neptunebusiness.com` vers le VPS ;
- confirmation qu'aucun trafic utile ni webhook ne dépend encore du runtime Cloudflare.

L'ordre détaillé est défini dans `migration/PORTING_PLAN.md`.
