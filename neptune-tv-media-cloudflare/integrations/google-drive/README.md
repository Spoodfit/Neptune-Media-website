# Synchronisation Google Drive → Neptune Media

## Architecture

```text
07_Clients
└── Client — Entreprise
    └── Passage 01 — Format — Année
        ├── Long format
        └── Shorts
```

Le rattachement technique utilise `clientId` et `orderId`. Les noms de dossiers sont uniquement destinés à la lecture humaine.

## Propriétés Apps Script

Dans **Paramètres du projet → Propriétés du script** :

| Propriété | Valeur |
|---|---|
| `ROOT_FOLDER_ID` | `16hWU7CORiSob2ip-19SHbVtu-tWRIwur` |
| `NEPTUNE_API_URL` | `https://tv.neptunebusiness.com` |
| `DRIVE_WEBHOOK_SECRET` | même secret que dans Cloudflare |

## Installation

1. Remplacer le code Apps Script par `NeptuneDriveSync.gs`.
2. Enregistrer.
3. Exécuter `installerSynchronisationDrive` une seule fois.
4. Accepter les autorisations Drive et requêtes externes.
5. Vérifier qu’un seul déclencheur `synchroniserDriveNeptune` existe, toutes les 5 minutes.

Aucun déploiement en application Web n’est nécessaire. Apps Script appelle directement les webhooks Cloudflare.

## Fonctionnement

- Le script demande à Neptune les réservations payées sans dossier Drive.
- Il réutilise le dossier principal d’un client existant.
- Il crée un dossier par passage, puis `Long format` et `Shorts`.
- Il inspecte les deux sous-dossiers toutes les 5 minutes.
- Les fichiers vidéo nouveaux ou modifiés sont envoyés au Worker sous forme de métadonnées.
- Le Worker enregistre les fichiers dans l’espace client et envoie un e-mail Resend groupé.
- Les permissions de lecture du fichier sont accordées au client sans e-mail Google Drive afin que Resend reste l’unique notification métier.

## Sécurité

- Le dossier `07_Clients` doit rester en **Accès limité**.
- Le secret n’est jamais placé dans l’URL.
- Les webhooks exigent `X-Neptune-Drive-Secret`.
- Un événement est unique par `driveFileId + modifiedAt`, ce qui évite les doublons d’e-mails.
