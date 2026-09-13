# Propriété des données

La migration doit supprimer toute ambiguïté sur la source de vérité.

## Règle centrale

**PostgreSQL est la source de vérité cible. Studio est le cockpit de gestion, pas la base de données.**

Les données temporaires du navigateur (`localStorage`, `sessionStorage`, query string) servent uniquement à améliorer l'expérience. Elles ne doivent jamais être le seul endroit où une information métier existe.

## Entités principales

| Entité | Source cible | Consommateurs |
| --- | --- | --- |
| Utilisateur / compte Neptune | PostgreSQL Neptune | authentification, espace client, Studio |
| Client Media | PostgreSQL | Studio, espace client, réservation |
| Prospect | PostgreSQL | landing, réservation, Studio/CRM |
| Qualification commerciale | PostgreSQL | Studio, analytics, réservation |
| Catalogue | PostgreSQL | site, réservation, espace client, Studio |
| Offre / tarif | PostgreSQL | réservation, Studio |
| Politique de capacité | PostgreSQL | réservation, Studio |
| Hold | PostgreSQL | réservation, paiement, Studio |
| Créneau | PostgreSQL | réservation, Studio, fournisseur |
| Commande / réservation payée | PostgreSQL | Studio, espace client, finance |
| Workflow du passage | PostgreSQL | Studio, espace client |
| Fournisseur | PostgreSQL | Studio, automatisations |
| Activité / audit | PostgreSQL | Studio, diagnostic |
| Fichier Media | métadonnées PostgreSQL + stockage externe | Studio, espace client, WebTV |
| Publication | PostgreSQL | espace client, Studio |
| Événement analytics | backend / stockage choisi | Studio, reporting |

## Client / prospect

Un prospect peut exister avant la création complète du compte client. Le passage landing → tunnel ne doit donc pas créer plusieurs identités pour la même personne.

Identifiants recommandés :

```text
userId / clientId
prospectId
reservationToken (opaque, temporaire)
```

Le `reservationToken` est un moyen de reprendre un parcours, pas un identifiant métier permanent.

La qualification HORS NORME doit être persistée avec le prospect :

- `source` ;
- `campaign` ;
- `sector` ;
- `objective` ;
- `horizon` ;
- `landingVersion` ;
- données de consentement utiles.

## Catalogue / offre

Le frontend peut afficher le catalogue mais ne doit jamais décider :

- quel tarif est effectif ;
- combien de places restent ;
- si une offre est vendable ;
- quel fournisseur est retenu ;
- si une date est valide.

Ces décisions appartiennent au backend.

## Réservation / commande

Il faut éviter deux objets concurrents du type « booking côté site » et « order côté Studio » qui seraient ensuite synchronisés.

La cible doit avoir un agrégat canonique — ou deux entités avec une relation explicite — permettant de répondre sans ambiguïté :

```text
qui a acheté ?
quoi ?
à quel prix ?
où ?
quel créneau ?
quel fournisseur ?
quel état de production ?
quels fichiers ?
quelles publications ?
```

Le snapshot payé doit être immuable pour les informations financières essentielles, même si le catalogue évolue ensuite.

## Workflow Studio / client

Un changement d'état doit être enregistré côté serveur avec :

- état précédent ;
- nouvel état ;
- date ;
- origine ;
- acteur lorsque pertinent ;
- données associées.

L'espace client reçoit une **projection** de ce workflow. Il ne possède pas son propre workflow indépendant.

## Fichiers

Séparer :

```text
métadonnées métier
≠
stockage binaire
```

La base doit connaître au minimum :

- identifiant ;
- client/commande ;
- catégorie ;
- nom ;
- fournisseur de stockage ;
- clé/URL interne ;
- statut ;
- dates ;
- métadonnées vidéo utiles.

Cela permet de migrer de R2 vers un autre stockage ou de conserver R2 sans changer les contrats client/Studio.

## Anti-patterns interdits dans la cible

- synchroniser Studio vers l'espace client par copie de données ;
- recalculer un tarif dans JavaScript ;
- enregistrer une date uniquement en `localStorage` ;
- créer une réservation depuis un retour Stripe sans vérification serveur ;
- stocker la qualification Cursor uniquement dans l'URL ;
- avoir deux tables indépendantes représentant le même passage sans relation canonique ;
- utiliser l'adresse e-mail comme unique clé métier lorsqu'un identifiant stable existe.
