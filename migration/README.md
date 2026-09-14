# Migration Neptune Media vers le VPS

**Statut : MIGRATION_SOURCE — pas un runtime utilisateur**

Ce dossier contient les contrats, cartes et critères nécessaires pour porter Neptune Media depuis le runtime Cloudflare de référence vers le monorepo Neptune sur VPS.

## Ordre de lecture

1. `TRANSFER_MANIFEST.md` — ce qui doit réellement être transféré.
2. `RUNTIME_GRAPH.md` — ce qui est encore actif dans Cloudflare.
3. `LEGACY_CLEANUP.md` — ce qui peut ou ne peut pas être supprimé.
4. `VPS_FILE_MAP.md` — correspondance source → destination Neptune-main.
5. `COMPONENT_MAP.md` — composants et responsabilités.
6. `API_CONTRACTS.md` — contrats fonctionnels à préserver.
7. `DATA_OWNERSHIP.md` — propriétaire de chaque donnée et source de vérité.
8. `PORTING_PLAN.md` — ordre de portage.
9. `CUTOVER_CHECKLIST.md` — critères GO / NO-GO avant basculement.
10. `TARGET_VPS.md` — architecture cible.

## Principe central

Ne pas transposer l'architecture Cloudflare fichier par fichier. Il faut porter les comportements validés vers `apps/media`, `apps/backend` et PostgreSQL/Prisma, puis supprimer la compatibilité Cloudflare seulement après validation de parité et cutover.
