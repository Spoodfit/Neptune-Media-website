# Neptune Media

Ce dépôt contient la **version de référence fonctionnelle de Neptune Media** en cours de finalisation avant son intégration dans le monorepo Neptune hébergé sur le VPS.

## Dépôt canonique à transférer

```text
Spoodfit/Neptune-Media-website
branche : main
```

Le périmètre de transfert comprend explicitement :

- le site web Media ;
- la landing HORS NORME ;
- le tunnel de réservation ;
- l'espace client ;
- le Studio ;
- la WebTV / le direct et les fonctions associées.

La frontière exacte du transfert est décrite dans [`migration/TRANSFER_MANIFEST.md`](./migration/TRANSFER_MANIFEST.md).

## Objectif

La version Cloudflare actuelle sert de runtime de développement et de référence comportementale. La cible définitive n'est pas de conserver une infrastructure Media parallèle : les fonctionnalités validées ici doivent être portées dans l'infrastructure Neptune existante.

```text
media.neptunebusiness.com
→ NGINX du VPS
→ conteneur neptune-media
→ neptune-backend (Express)
→ PostgreSQL / Prisma
```

Le cockpit **Studio** reste le point central de gestion pour l'équipe Neptune. En revanche, la source de vérité doit être le domaine backend et sa base de données, jamais l'interface Studio elle-même.

## Runtime actuel

- application principale : `neptune-tv-media-cloudflare/`
- Worker actif : `neptune-tv-media-cloudflare/src/entry-v48.js`
- surfaces principales :
  - `/`
  - `/studio/`
  - `/espace-client/`
  - `/reserver/`
  - `/hors-norme/`
  - `/direct/`
- persistance actuelle : Durable Object `StudioStore` / SQLite
- médias : Cloudflare R2 et assets statiques selon les fonctions
- intégrations : Stripe, Resend, Google Drive, Workers AI / OpenAI, WebTV

## Règles de migration

1. **Migrer le comportement métier, pas l'implémentation Cloudflare.**
2. Toute règle métier doit avoir un propriétaire unique et un contrat explicite avant d'être portée vers Express/PostgreSQL.
3. Les frontends Studio, Espace client, Réservation et HORS NORME ne doivent pas devenir des sources de vérité.
4. Aucun nouveau système parallèle de prospects, commandes, catalogue, disponibilités ou paiements ne doit être créé.
5. Les wrappers historiques `entry-vXX.js`, injections HTML et shims de compatibilité sont considérés comme des détails du runtime actuel, pas comme l'architecture cible.
6. La future landing HORS NORME doit créer/enrichir un prospect Neptune puis transmettre un `reservation_token` au tunnel de réservation canonique.

## Documentation de migration

Commencer par :

- [`migration/TRANSFER_MANIFEST.md`](./migration/TRANSFER_MANIFEST.md) — périmètre exact du dépôt à transférer ;
- [`migration/VPS_FILE_MAP.md`](./migration/VPS_FILE_MAP.md) — correspondance précise source → fichiers `Neptune-main` ;
- [`MIGRATION.md`](./MIGRATION.md) — architecture et principes ;
- [`migration/PORTING_PLAN.md`](./migration/PORTING_PLAN.md) — ordre de portage ;
- [`migration/CUTOVER_CHECKLIST.md`](./migration/CUTOVER_CHECKLIST.md) — critères GO/NO-GO ;
- [`migration/COMPONENT_MAP.md`](./migration/COMPONENT_MAP.md) — cartographie des composants ;
- [`migration/API_CONTRACTS.md`](./migration/API_CONTRACTS.md) — contrats fonctionnels ;
- [`migration/DATA_OWNERSHIP.md`](./migration/DATA_OWNERSHIP.md) — source de vérité et données ;
- [`migration/TARGET_VPS.md`](./migration/TARGET_VPS.md) — architecture cible ;
- [`migration/manifest.json`](./migration/manifest.json) — manifeste machine-readable.

## Validation

```bash
npm install
npm run check
npm run audit:migration
```

`npm run audit:migration` vérifie notamment que les six surfaces canoniques sont présentes, que le dépôt source est bien identifié, que les documents de migration existent, que les workflows restent gouvernés et qu'un seul pipeline possède le déploiement Worker pendant la période de transition.
