# Graphe du runtime actif

Ce document sépare le runtime de référence encore nécessaire de la dette historique qui ne doit pas être reproduite pendant la migration VPS.

## Entrée canonique

Les deux configurations Wrangler doivent pointer vers :

```text
neptune-tv-media-cloudflare/src/entry-v48.js
```

Le début de chaîne vérifié est :

```text
entry-v48.js
├─ entry-v47.js
│  ├─ entry-v46.js
│  │  └─ entry-v45.js puis descendants legacy
│  ├─ reservation-client-projection-v179.js
│  └─ reservation-stripe-redirect-v180.js
├─ effective-offer-v181.js
└─ security.js
```

`entry-v48.js`, `entry-v47.js` et `entry-v46.js` importent explicitement leur prédécesseur. Les wrappers descendants doivent donc rester classés **LEGACY_REQUIRED** tant qu'une analyse d'atteignabilité n'a pas prouvé qu'ils sont hors de cette chaîne.

## Classification

| Classe | Règle | Action |
| --- | --- | --- |
| `ACTIVE` | entrée canonique, surfaces et modules directement utilisés | conserver et tester |
| `MIGRATION_SOURCE` | logique métier à porter vers `apps/backend` / `apps/media` | conserver jusqu'au portage |
| `LEGACY_REQUIRED` | wrapper, shim ou adaptateur historique encore atteint par le runtime actif | conserver temporairement, ne pas reproduire |
| `DEAD` | aucun import, injection, workflow ou contrat actif | supprimer |

## Frontières de migration

La migration ne doit pas traduire la chaîne `entry-vXX.js` wrapper par wrapper. Les responsabilités doivent être redistribuées entre :

```text
apps/media
  public / espace-client / reserver / studio / direct

apps/backend
  catalog / reservation / payment / client / studio / supplier / content / webtv / notification

PostgreSQL / Prisma
  source de vérité persistante
```

## Dette encore ouverte

- terminer l'analyse transitive de toute la chaîne `entry-vXX.js` ;
- faire la même analyse pour `store-vXX.js` ;
- inventorier les assets frontend injectés dynamiquement par les wrappers ;
- réduire les workflows capables d'exécuter `wrangler deploy` à un pipeline canonique ;
- extraire les règles métier des wrappers vers des services portables avant leur suppression.

La présence d'un numéro de version ancien n'est jamais, à elle seule, une preuve qu'un fichier est mort.
