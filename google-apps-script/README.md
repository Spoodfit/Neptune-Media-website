# Google Apps Script — automatisations Drive

**Statut : ACTIVE AUTOMATION**

Ce dossier contient le code exécuté côté Google Apps Script pour la synchronisation Neptune Media avec Google Drive.

## Fichiers

- `NeptuneDriveSync.gs` : synchronisation Drive.
- `NeptuneDriveTokenRelay.gs` : relais de jeton nécessaire aux échanges contrôlés avec le runtime Neptune.

## À ne pas confondre

`integrations/google-drive/` contient la logique Node/runtime du dépôt. Les deux zones sont complémentaires : l'une s'exécute dans Google Apps Script, l'autre côté Neptune.

Ne pas déplacer ou fusionner ces fichiers sans mettre à jour les déploiements Apps Script déjà installés et vérifier le parcours Drive de bout en bout.
