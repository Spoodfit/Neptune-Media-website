# Neptune Media — carte du dépôt

Ce document répond à une question simple : **où aller, qu'est-ce qui est encore actif, et qu'est-ce qu'on peut supprimer sans casser Neptune Media ?**

## Vue d'ensemble

```text
Neptune-Media-website/
├── .github/workflows/                 CI/CD et audits actifs
├── google-apps-script/                 automatisations Google Drive côté Apps Script
├── integrations/google-drive/          synchronisation Drive côté Node / runtime
├── migration/                          documentation et contrats de migration VPS
├── neptune-tv-media-cloudflare/        APPLICATION DE RÉFÉRENCE ACTUELLE
│   ├── public/                         surfaces web servies
│   ├── react/hors-norme/               source React HORS NORME
│   ├── src/                            Worker, stores, routes et compatibilité legacy
│   ├── containers/                     WebTV / vidéo exécutés en conteneur
│   ├── local-video-engine/             interface locale liée au moteur vidéo
│   ├── scripts/                        builds, validations, audits et garde-fous
│   ├── integrations/                   adaptateurs propres au runtime Cloudflare
│   └── config/                         configuration runtime
├── neptune-video-engine/               service vidéo local permanent
├── tests/                              tests UI/parcours exécutés par GitHub Actions
├── package.json                        commandes canoniques dépôt complet
├── wrangler.jsonc                      configuration Cloudflare canonique racine
└── MIGRATION.md                        principes d'architecture cible
```

## Carte fonctionnelle

### 1. Site public

**Chemin principal** : `neptune-tv-media-cloudflare/public/`

Contient la surface publique Neptune Media et les assets générés/servis par le runtime actuel.

Statut : **ACTIVE**.

### 2. HORS NORME

**Source de vérité frontend** : `neptune-tv-media-cloudflare/react/hors-norme/`

Le contenu généré dans `public/hors-norme/` n'est pas une source à éditer manuellement lorsqu'il est produit par le build React.

Statut : **ACTIVE**.

### 3. Studio

**Frontend** : `neptune-tv-media-cloudflare/public/studio/`

**Backend / orchestration actuelle** : `neptune-tv-media-cloudflare/src/` via `worker.js` et sa chaîne d'imports.

Statut : **ACTIVE + MIGRATION_SOURCE**.

### 4. Espace client

**Frontend** : `neptune-tv-media-cloudflare/public/espace-client/`

**Tests dédiés** : `tests/client-*.mjs` et workflow `.github/workflows/client-dashboard-validation.yml`.

Statut : **ACTIVE + ACTIVE CI**.

### 5. Réservation

**Frontend** : `neptune-tv-media-cloudflare/public/reserver/`

**URL canonique actuelle** : `https://neptune-media-webtv.neptunebusinessclub.workers.dev/reserver`

Statut : **ACTIVE** jusqu'au basculement VPS.

### 6. Direct / WebTV

**Frontend** : `neptune-tv-media-cloudflare/public/direct/`

**Conteneur** : `neptune-tv-media-cloudflare/containers/webtv/`

Statut : **ACTIVE**.

### 7. Backend Cloudflare actuel

**Entrée unique** : `neptune-tv-media-cloudflare/src/worker.js`

Chaîne connue :

```text
worker.js
├── entry-v47.js
│   ├── entry-v46.js
│   │   └── entry-v45.js → descendants importés transitivement
│   ├── reservation-client-projection-v179.js
│   └── reservation-stripe-redirect-v180.js
├── effective-offer-v181.js
└── security.js
```

Les wrappers `entry-vXX.js` atteints par cette chaîne sont **LEGACY_REQUIRED**. Ne pas les fusionner, renommer ou supprimer sans preuve de déconnexion.

### 8. Neptune Video Engine

**Chemin** : `neptune-video-engine/`

Service local permanent utilisé pour la génération de shorts. `runtime.py` conserve l'entrypoint historique et délègue actuellement à `runtime_v75.py`, qui réutilise encore `runtime_v74.py`.

Statut : **ACTIVE SERVICE + dette interne bornée**.

### 9. Google Drive

Deux zones complémentaires existent :

- `google-apps-script/` : code exécuté dans Google Apps Script ;
- `integrations/google-drive/` : logique Node/runtime contrôlée depuis le dépôt.

Elles ne sont pas des doublons par défaut.

Statut : **ACTIVE AUTOMATION / ACTIVE INTEGRATION**.

### 10. Migration VPS

**Chemin** : `migration/`

Ce dossier ne fait pas partie du runtime utilisateur mais constitue la référence pour porter correctement le produit vers `Neptune-main`.

Statut : **MIGRATION_SOURCE**.

## Matrice de décision avant suppression

Un fichier peut être classé `DEAD` seulement si toutes les réponses suivantes sont **non** :

| Question | Si oui |
| --- | --- |
| Est-il importé directement ? | conserver |
| Est-il importé transitivement ? | conserver |
| Est-il injecté dans une page HTML ? | conserver |
| Est-il servi par une route Worker ? | conserver |
| Est-il référencé par Wrangler ? | conserver |
| Est-il exécuté dans `package.json` ? | conserver |
| Est-il exécuté par un workflow GitHub ? | conserver |
| Est-il utilisé par Studio / client / réservation / WebTV ? | conserver |
| Est-il une source de parité nécessaire à la migration ? | conserver jusqu'au portage |

Un nom versionné (`v38`, `v118`, `v181`) n'est **jamais** une preuve de code mort.

## Ce qui est réellement legacy mais encore nécessaire

- chaîne `entry-vXX.js` atteinte depuis `worker.js` ;
- Durable Object `StudioStore` / SQLite ;
- shims et transformations HTML encore utilisées par les surfaces actives ;
- bindings Cloudflare nécessaires à la référence de production ;
- certains tests versionnés qui protègent encore les parcours validés.

Ils doivent disparaître **pendant le portage**, pas avant.

## Ce qui ne doit plus apparaître

Le dépôt ne doit plus accueillir :

- fichiers `deploy-trigger-*` ;
- snapshots d'audit ponctuels à la racine ;
- scripts de mutation one-shot conservés après usage ;
- nouvelle série de dossiers versionnés pour un écran ;
- workflow de déploiement Worker concurrent ;
- nouvelle URL de réservation concurrente ;
- nouvelle base ou nouvelle source de vérité métier parallèle.

## Architecture cible après migration

```text
Neptune-main/
├── apps/media/       React : site, HORS NORME, réservation, client, Studio, direct
└── apps/backend/     Express : domaines métier et adaptateurs
        ↓
PostgreSQL / Prisma   source de vérité persistante
```

Le dépôt actuel est donc une **référence fonctionnelle temporaire**, pas un modèle à reproduire fichier pour fichier.

## Règle simple pour l'équipe

- Modifier une expérience utilisateur actuelle → commencer dans `neptune-tv-media-cloudflare/`.
- Modifier la génération vidéo locale → `neptune-video-engine/`.
- Modifier la synchro Drive → `google-apps-script/` ou `integrations/google-drive/` selon le côté concerné.
- Modifier les validations → `tests/`, `neptune-tv-media-cloudflare/scripts/` ou `.github/workflows/`.
- Préparer le VPS → lire `migration/` avant de coder.
- Ne jamais créer un nouveau propriétaire métier lorsque le domaine existe déjà.
