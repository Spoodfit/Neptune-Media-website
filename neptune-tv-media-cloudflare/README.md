# Neptune Media — runtime Cloudflare de référence

Ce dossier contient le runtime actuellement utilisé pour finaliser Neptune Media avant son portage dans l'infrastructure VPS Neptune.

Il ne représente **pas** l'architecture cible définitive.

## Runtime actuel

- Cloudflare Worker + Static Assets ;
- entrée canonique : `src/worker.js` ;
- Durable Object `StudioStore` / SQLite ;
- R2 et fournisseurs externes pour les médias selon les domaines ;
- Workers AI / OpenAI pour les fonctions IA ;
- Resend pour les e-mails transactionnels ;
- Stripe pour le paiement ;
- Google Drive et autres intégrations de production.

Les principales surfaces sont :

```text
/studio/
/espace-client/
/reserver/
/hors-norme/
/direct/
```

## Architecture cible

Les comportements validés ici doivent être portés vers :

```text
media.neptunebusiness.com
→ NGINX VPS
→ conteneur neptune-media
→ neptune-backend / Express
→ PostgreSQL / Prisma
```

Voir à la racine :

- `MIGRATION.md`
- `migration/COMPONENT_MAP.md`
- `migration/API_CONTRACTS.md`
- `migration/DATA_OWNERSHIP.md`
- `migration/TARGET_VPS.md`

## Règle de développement pendant la transition

Éviter d'ajouter une nouvelle règle métier directement dans un wrapper `entry-vXX.js` ou uniquement dans un script frontend lorsqu'elle peut être exprimée comme un service de domaine portable.

Les wrappers, transformations HTML et shims actuels sont tolérés pour stabiliser la production de référence, mais ils sont classés comme **dette de migration**.

## Validation

```bash
npm install
npm run check
npm run audit:migration
```

L'audit de migration contrôle notamment l'entrée Worker canonique, les surfaces à préserver, les couplages Cloudflare et les incohérences de déploiement connues.
