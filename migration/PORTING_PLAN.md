# Plan de portage Neptune Media vers le VPS

Ce document transforme la cartographie existante en ordre d'exécution. La cible reste celle décrite dans `TARGET_VPS.md` : `media.neptunebusiness.com` entre par le NGINX natif du VPS, le frontend converge vers `apps/media/`, les API convergent vers `apps/backend/`, et PostgreSQL/Prisma devient la source de vérité métier.

## Principe de migration

La migration ne consiste pas à recopier `neptune-tv-media-cloudflare/`. Les comportements actifs sont portés domaine par domaine. La chaîne `entry-vXX.js`, les réécritures HTML successives, le SQL du Durable Object et les bindings Cloudflare restent des mécanismes de compatibilité de l'ancienne plateforme jusqu'au basculement ; ils ne deviennent pas l'architecture VPS.

## Découpage cible

| Responsabilité actuelle | Cible | Règle de portage |
| --- | --- | --- |
| `public/`, `public/hors-norme/`, `public/reserver/` | `apps/media/` | Porter les parcours et l'interface ; consommer les contrats backend au lieu de recalculer les règles métier. |
| `public/espace-client/` | `apps/media/` + routes client backend | Garder la projection client, les contenus, le calendrier et les actions ; déplacer toute décision métier côté backend. |
| `public/studio/` | `apps/media/` + routes Studio backend | Conserver le cockpit opérationnel ; le Studio déclenche des use cases, il ne devient pas une base de données. |
| `src/worker.js` + descendants | routes/middlewares Express dans `apps/backend/` | Reconstituer les routes par domaine. Ne pas reproduire l'empilement des wrappers. |
| `StudioStore` + SQL Durable Object | services/repositories Prisma | Migrer les entités, relations, contraintes et invariants ; ne pas translittérer les requêtes ligne par ligne. |
| R2 / fichiers externes | adaptateur stockage Neptune | Garder les métadonnées métier en PostgreSQL et isoler le stockage binaire derrière un adaptateur. |
| WebTV / HLS / container | `mediaWebtv` + service Docker si nécessaire | Séparer régie, état métier, stockage et diffusion publique. |
| moteur vidéo local / IA | service IA/vidéo | Préserver les contrats de job/résultat et remplacer seulement le runtime d'exécution. |
| Resend / Google Drive / Stripe / fournisseurs | adaptateurs backend | Une intégration externe ne doit jamais devenir propriétaire d'une règle métier Neptune. |

## Domaines backend à stabiliser

Les domaines déjà identifiés dans le manifeste sont la frontière de migration : catalogue, prospect, réservation, disponibilité, paiement, commande, client, Studio, fournisseur, contenu, publication, WebTV, notification et analytics.

Les points d'ancrage déjà présents dans le backend VPS sont :

```text
apps/backend/src/routes/media.js
apps/backend/src/routes/mediaClient.js
apps/backend/src/routes/mediaStudio.js
apps/backend/src/routes/mediaWebtv.js
apps/backend/src/services/mediaBookingService.js
apps/backend/prisma/schema.prisma
```

Ils servent de convergence. Le contrat cible peut être enrichi, mais il doit rester compatible avec les comptes Neptune existants et avec les conventions du backend principal.

## Modèle de données

La cible PostgreSQL/Prisma doit couvrir les objets métier actuellement dispersés entre le Store, les API et les intégrations. Les noms de tables ne sont pas imposés ici : ils seront dérivés du schéma actuel lors de l'import. Les familles fonctionnelles à préserver sont au minimum :

- identités, comptes, clients, sessions et rôles ;
- programmes, épisodes, contenus et médias ;
- prospects et `reservation_token` ;
- concepts/offres, prix effectifs, capacités, villes et disponibilités ;
- réservations, holds, commandes, passages et paiements ;
- états du parcours client et du passage Studio ;
- fichiers, livraisons et métadonnées de stockage ;
- publications, calendrier et historique de réutilisation ;
- demandes fournisseur, réponses et changements de date ;
- notifications, e-mails et journal d'activité ;
- programmation et état WebTV ;
- jobs vidéo/IA et résultats ;
- événements nécessaires aux analytics du Studio.

Les identifiants métier doivent être conservés lors de l'import quand leur modification casserait les relations ou les liens déjà distribués.

## Adaptateurs obligatoires

Le backend doit présenter des interfaces stables aux services métier :

- **database** : Prisma/PostgreSQL ;
- **storage** : stockage binaire choisi par Neptune, sans dépendance métier directe au fournisseur ;
- **email** : Resend aujourd'hui, remplaçable sans changer le domaine ;
- **drive** : Google Drive via un seul adaptateur backend ;
- **payment** : Stripe et ses webhooks, avec vérification serveur du prix et de la commande ;
- **video engine** : service Docker local exposant le contrat de job/résultat ;
- **supplier** : échanges fournisseur et anti-doublon ;
- **scheduler** : remplacement des crons Worker par le scheduler/cron de l'infrastructure Neptune.

## Ordre de bascule

1. **Geler l'architecture de l'ancienne plateforme.** Les workflows, le déploiement et le graphe runtime sont maintenant explicitement gouvernés ; aucune nouvelle couche `entry-vXX` ne doit être introduite pour la migration.
2. **Construire le schéma Prisma cible et l'import idempotent.** Exporter les données du Store, préserver les identifiants nécessaires et produire un rapport de comptage/relations avant toute lecture en production.
3. **Migrer le stockage binaire.** Copier les objets nécessaires vers le stockage Neptune, vérifier tailles/hash lorsque disponibles et mettre à jour uniquement les métadonnées de référence.
4. **Porter les services backend par domaine.** Commencer par catalogue/offre effective, disponibilité, réservation, paiement et commande : ce sont les règles qui alimentent toutes les surfaces.
5. **Porter les surfaces publiques.** Site Media, HORS NORME et réservation doivent utiliser les nouvelles API sans logique commerciale dupliquée.
6. **Porter l'espace client.** Lire le même objet commande/passage que Studio, conserver vidéos, calendrier, livraisons et actions client.
7. **Porter Studio.** Rebrancher le cockpit sur les mêmes services métier et conserver uniquement les actions opérationnelles nécessaires.
8. **Porter WebTV et le moteur vidéo.** Les services longs restent isolés en Docker ; l'état métier et la configuration restent dans le backend.
9. **Exécuter une période de parité.** Comparer catalogue, capacités, réservations, commandes, fichiers, états client/Studio et surfaces publiques entre Cloudflare et VPS.
10. **Basculer `media.neptunebusiness.com`.** Faire le changement uniquement après validation de l'import, des parcours critiques, des webhooks et des sauvegardes.
11. **Retirer la dette Cloudflare.** La chaîne `entry-vXX`, les anciens stores et les bindings Cloudflare sont supprimés seulement après confirmation que le VPS est la source de vérité et qu'aucun trafic utile n'en dépend encore.

## Critères de sortie

La migration est considérée terminée lorsque :

- PostgreSQL est l'unique source de vérité métier ;
- aucune règle de prix, capacité, disponibilité ou confirmation n'est dupliquée dans les frontends ;
- Studio et espace client lisent les mêmes objets backend ;
- les webhooks et intégrations écrivent dans les services backend canoniques ;
- les fichiers accessibles dans les parcours actifs sont présents dans le stockage cible ;
- les parcours `/`, `/hors-norme/`, `/reserver/`, `/espace-client/`, `/studio/`, `/direct/` et les API associées ont une parité fonctionnelle validée ;
- le domaine public pointe vers le VPS avec TLS, sauvegarde et restauration testées ;
- aucun composant du VPS n'importe ou n'émule la chaîne `entry-vXX`.
