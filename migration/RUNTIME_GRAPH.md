# Graphe du runtime actif

Ce document sépare le runtime Cloudflare encore nécessaire de l'architecture cible VPS. L'objectif n'est pas de réécrire la chaîne historique avant la migration, mais de garder une entrée canonique claire et de borner explicitement la dette de compatibilité encore active.

## Entrée canonique

Les configurations Wrangler de production pointent vers :

```text
neptune-tv-media-cloudflare/src/worker.js
```

Le début de chaîne active est :

```text
worker.js
├─ entry-v47.js
│  ├─ entry-v46.js
│  │  └─ entry-v45.js puis descendants importés transitivement
│  ├─ reservation-client-projection-v179.js
│  └─ reservation-stripe-redirect-v180.js
├─ effective-offer-v181.js
└─ security.js
```

`worker.js` est la seule entrée Cloudflare canonique. Les `entry-vXX.js` descendants encore importés sont classés **LEGACY_REQUIRED** : ils restent nécessaires au runtime actuel mais sont explicitement exclus de l'architecture VPS.

## Frontend et stores

Les surfaces actives sont servies depuis `neptune-tv-media-cloudflare/public/`, notamment :

```text
public/studio/
public/espace-client/
public/reserver/
public/hors-norme/
public/direct/
```

Le dépôt contient encore des assets et adaptateurs historiques lorsqu'ils sont réellement atteints par le runtime. Une génération ancienne ne doit pas être supprimée uniquement sur la base de son numéro de version ; elle doit d'abord être détachée de la chaîne active ou disparaître lors du cutover VPS.

## Classification

| Classe | Définition | Traitement |
| --- | --- | --- |
| `ACTIVE` | entrée canonique, surfaces, contrats et modules utilisés directement | conserver et tester jusqu'au cutover |
| `MIGRATION_SOURCE` | comportement métier ou UX à porter vers `apps/backend` / `apps/media` | porter par domaine puis vérifier la parité |
| `LEGACY_REQUIRED` | wrapper, shim, asset ou adaptateur historique encore atteint | conserver temporairement ; ne jamais reproduire comme architecture cible |
| `DEAD` | aucun import, injection, route, test canonique ou contrat actif | supprimer immédiatement du dépôt de référence |

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

La gouvernance du dépôt est verrouillée :

- une seule branche canonique (`main`) ;
- aucun workflow temporaire ;
- un seul workflow propriétaire du déploiement Worker ;
- une entrée Worker canonique non versionnée (`worker.js`) ;
- aucune sortie d'audit générée ou script one-shot conservé comme source ;
- les conteneurs actifs utilisent des noms de fichiers canoniques ;
- le tunnel de réservation canonique est déclaré dans `migration/manifest.json` et les configurations runtime.

La dette restante dans les `entry-vXX.js` est donc **délibérée, active et bornée**. Elle n'est pas une collection de mauvaises versions : c'est la chaîne de compatibilité encore requise par la production Cloudflare. Elle ne doit pas être transférée telle quelle vers le VPS.
