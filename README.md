# Neptune Media — dépôt de référence

> **À lire avant toute modification.** Ce dépôt contient la version fonctionnelle de référence de Neptune Media pendant sa migration vers le monorepo Neptune sur VPS. Le runtime Cloudflare actuel reste nécessaire jusqu'au cutover : on ne supprime ni ne renomme un chemin actif uniquement parce qu'il paraît ancien.

## Où aller selon ce que vous voulez modifier

| Besoin | Dossier / fichier | Statut |
| --- | --- | --- |
| Site public Neptune Media | `neptune-tv-media-cloudflare/public/` | **ACTIVE** |
| Studio admin | `neptune-tv-media-cloudflare/public/studio/` + logique Worker associée | **ACTIVE** |
| Espace client | `neptune-tv-media-cloudflare/public/espace-client/` + logique Worker associée | **ACTIVE** |
| Tunnel de réservation | `neptune-tv-media-cloudflare/public/reserver/` | **ACTIVE** |
| HORS NORME | `neptune-tv-media-cloudflare/react/hors-norme/` | **ACTIVE — source React** |
| Direct / WebTV | `neptune-tv-media-cloudflare/public/direct/` + `containers/webtv/` | **ACTIVE** |
| Backend Cloudflare actuel | `neptune-tv-media-cloudflare/src/worker.js` et ses imports | **ACTIVE / LEGACY_REQUIRED** |
| Moteur vidéo local Neptune | `neptune-video-engine/` | **ACTIVE SERVICE** |
| Synchronisation Google Drive côté Apps Script | `google-apps-script/` | **ACTIVE AUTOMATION** |
| Synchronisation Drive côté Node/Worker | `integrations/google-drive/` | **ACTIVE INTEGRATION** |
| Tests UI et parcours client | `tests/` | **ACTIVE CI** |
| Déploiements / validations GitHub | `.github/workflows/` | **ACTIVE CI/CD** |
| Documentation de migration VPS | `migration/` + `MIGRATION.md` | **MIGRATION SOURCE** |

La cartographie détaillée, avec les règles de suppression et les pièges à éviter, est dans [`REPOSITORY_MAP.md`](./REPOSITORY_MAP.md).

## Les 4 statuts à connaître

- **ACTIVE** : utilisé directement par l'application, le déploiement ou les parcours actuels. À conserver et tester.
- **ACTIVE SERVICE / INTEGRATION / CI** : dépendance opérationnelle active mais séparée du frontend principal.
- **LEGACY_REQUIRED** : ancien mécanisme encore atteint par le runtime Cloudflare. Ne pas supprimer avant déconnexion ou cutover.
- **MIGRATION_SOURCE** : comportement, documentation ou garde-fou à préserver pour le portage VPS ; ce n'est pas l'architecture cible.
- **DEAD** : aucun import, route, injection, workflow, test ou consommateur actif démontré. Seulement cette catégorie peut être supprimée immédiatement.

## Runtime canonique actuel

```text
wrangler.jsonc
      ↓
neptune-tv-media-cloudflare/src/worker.js
      ↓
entry-v47.js → entry-v46.js → entry-v45.js → descendants encore importés
      ↓
public/ + StudioStore/SQLite + R2 + Stripe + Resend + Drive + WebTV
```

Les fichiers `entry-vXX.js` encore importés sont volontairement classés **LEGACY_REQUIRED**. Leur numéro de version ne prouve pas qu'ils sont morts.

### Surfaces à préserver jusqu'au cutover

```text
/
/hors-norme/
/reserver/
/espace-client/
/studio/
/direct/
```

## Architecture cible

Le dépôt Cloudflare n'est pas l'architecture définitive. Les comportements validés ici doivent converger vers :

```text
media.neptunebusiness.com
→ NGINX du VPS
→ conteneur neptune-media
→ apps/media (React)
→ apps/backend (Express)
→ PostgreSQL / Prisma
```

Principes :

1. migrer le **comportement métier**, pas les wrappers Cloudflare ;
2. une capacité métier = un propriétaire backend canonique ;
3. Studio reste le cockpit humain, jamais la source de vérité ;
4. les règles de prix, disponibilité, réservation, commande et paiement ne doivent pas être dupliquées dans les frontends ;
5. la chaîne `entry-vXX`, les réécritures HTML cumulatives et `StudioStore` ne doivent pas être reproduits sur le VPS.

## Deux `package.json` : lequel utiliser ?

- `package.json` à la racine : **point d'entrée canonique pour les checks, builds et audits du dépôt complet**.
- `neptune-tv-media-cloudflare/package.json` : commandes historiques permettant encore de travailler sur l'application Cloudflare de façon isolée. Ne pas le considérer comme la gouvernance globale du dépôt.

## Commandes de validation

Depuis la racine :

```bash
npm install
npm run check
npm run audit:migration
```

Avant toute suppression d'un fichier historique, vérifier qu'il n'a plus :

- d'import direct ou transitif ;
- de route Worker ;
- d'injection HTML ;
- de référence dans Wrangler ;
- de test CI ;
- de workflow GitHub ;
- de consommateur Studio, client, réservation, WebTV, vidéo ou intégration.

## Documentation utile

Commencer dans cet ordre :

1. [`REPOSITORY_MAP.md`](./REPOSITORY_MAP.md) — où se trouve quoi et ce qu'il ne faut pas casser ;
2. [`migration/TRANSFER_MANIFEST.md`](./migration/TRANSFER_MANIFEST.md) — périmètre fonctionnel à transférer ;
3. [`migration/RUNTIME_GRAPH.md`](./migration/RUNTIME_GRAPH.md) — chaîne réellement active ;
4. [`migration/LEGACY_CLEANUP.md`](./migration/LEGACY_CLEANUP.md) — ce qui est supprimable ou non ;
5. [`migration/VPS_FILE_MAP.md`](./migration/VPS_FILE_MAP.md) — correspondance vers Neptune-main ;
6. [`migration/PORTING_PLAN.md`](./migration/PORTING_PLAN.md) — ordre de migration ;
7. [`migration/CUTOVER_CHECKLIST.md`](./migration/CUTOVER_CHECKLIST.md) — critères GO / NO-GO.

## Règle de maintenance du dépôt

Ne pas créer un nouveau dossier racine pour une expérimentation, un audit ponctuel ou une nouvelle version d'écran. Utiliser les zones existantes, les artefacts GitHub Actions ou une branche de travail. Toute nouvelle zone racine doit avoir un propriétaire, un statut et une justification explicite dans `REPOSITORY_MAP.md`.
