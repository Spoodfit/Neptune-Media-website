# Intégrations externes Neptune Media

**Statut : ACTIVE INTEGRATION**

Ce dossier regroupe les adaptateurs externes partagés qui ne sont ni une surface frontend ni une source de vérité métier.

## Google Drive

`google-drive/neptune-drive-delta-sync.js` contient la logique de synchronisation incrémentale utilisée par les checks du dépôt et le runtime associé.

À distinguer de `google-apps-script/`, qui contient le code réellement exécuté dans l'environnement Google Apps Script.

## Règle d'architecture

Une intégration doit adapter un fournisseur externe au domaine Neptune. Elle ne doit pas devenir propriétaire des règles métier de réservation, client, catalogue, commande ou paiement.
