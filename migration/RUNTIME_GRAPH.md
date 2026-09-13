# Graphe du runtime actif

Ce document sépare le runtime Cloudflare encore nécessaire de l'architecture cible VPS. L'objectif n'est pas de rendre l'ancien runtime élégant avant la migration, mais de savoir exactement ce qui reste une dépendance de compatibilité et ce qui doit être reconstruit proprement dans la cible.

## Entrée canonique

Les configurations Wrangler de production pointent vers :

```text
neptune-tv-media-cloudflare/src/entry-v48.js
```

Le début de chaîne active est :

```text
entry-v48.js
├─ entry-v47.js
│  ├─ entry-v46.js
│  │  └─ entry-v45.js puis descendants importés transitivement
│  ├─ reservation-client-projection-v179.js
│  └─ reservation-stripe-redirect-v180.js
├─ effective-offer-v181.js
└─ security.js
```

Les `entry-vXX.js` descendants encore importés sont classés **LEGACY_REQUIRED**. Ils restent en place parce que l'application Cloudflare active en dépend ; ils sont explicitement exclus de l'architecture VPS. Le script `verify-migration-readiness.mjs` recompte cette dette à chaque validation afin qu'elle ne soit pas confondue avec du code cible.

## Frontend et stores

Les surfaces actives sont servies depuis `neptune-tv-media-cloudflare/public/`, notamment :

```text
public/studio/
public/espace-client/
public/reserver/
public/hors-norme/
public/direct/
```

Le dépôt contient encore plusieurs générations d'assets, de shims et de stores historiques. Leur présence n'autorise pas à les copier dans `apps/media/`. Une génération ancienne peut rester nécessaire parce qu'un wrapper ou une page active l'injecte encore ; elle ne doit être supprimée de l'ancienne plateforme qu'après suppression de cette dépendance ou après le cutover VPS.

## Classification

| Classe | Définition | Traitement |
| --- | --- | --- |
| `ACTIVE` | entrée canonique, surfaces, contrats et modules utilisés directement | conserver et tester jusqu'au cutover |
| `MIGRATION_SOURCE` | comportement métier ou UX à porter vers `apps/backend` / `apps/media` | porter par domaine puis vérifier la parité |
| `LEGACY_REQUIRED` | wrapper, shim, asset ou adaptateur historique encore atteint | conserver temporairement ; ne jamais reproduire comme architecture cible |
| `DEAD` | aucun import, injection, route, test canonique ou contrat actif | supprimer quand cette absence est démontrée |

## Cible de recomposition

La chaîne actuelle n'est pas traduite wrapper par wrapper. Les responsabilités convergent vers :

```text
apps/media
  site public / HORS NORME / réservation / espace client / Studio / direct

apps/backend
  routes Express
  services catalogue / prospect / réservation / disponibilité / paiement / commande
  services client / Studio / fournisseur / contenu / publication / WebTV / notification
  adaptateurs stockage / e-mail / Drive / paiement / vidéo

PostgreSQL / Prisma
  source de vérité métier persistante
```

Le détail de l'ordre de bascule est dans `PORTING_PLAN.md`.

## État de nettoyage

Le nettoyage CI/CD et la gouvernance du dépôt sont terminés : un seul workflow déploie le Worker, l'allowlist des workflows est contrôlée automatiquement et les diagnostics versionnés ne sont plus une architecture parallèle.

La dette runtime restante est **intentionnelle et bornée au système Cloudflare actuel**. La supprimer maintenant reviendrait à réécrire l'application avant de la migrer et augmenterait le risque de régression. Elle est donc retirée au moment où chaque domaine est porté et validé sur le VPS, puis définitivement supprimée après le basculement de trafic et de données.

Cette règle évite deux erreurs : considérer un ancien numéro de version comme une preuve de code mort, ou recopier une dépendance historique simplement parce qu'elle est encore nécessaire à l'ancien runtime.
