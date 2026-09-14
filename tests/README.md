# Tests Neptune Media

**Statut : ACTIVE CI**

Ce dossier contient des tests de régression et de rendu encore exécutés par GitHub Actions. Les suffixes `v117`, `v118`, etc. correspondent à des jalons fonctionnels validés ; ils ne signifient pas que les fichiers sont obsolètes.

Le workflow principal côté espace client est `.github/workflows/client-dashboard-validation.yml`, qui exécute notamment les tests de dashboard, command center, cohérence visuelle, UX, réservation directe et runtime de contenus.

## Règle de suppression

Ne supprimer un test versionné qu'après avoir vérifié qu'il n'est plus référencé par un workflow actif et que son contrat est couvert par un test canonique de remplacement.

Les sorties générées (`test-results/`, captures, rapports) doivent rester des artefacts de CI ou des fichiers locaux ignorés, pas des sources versionnées.
