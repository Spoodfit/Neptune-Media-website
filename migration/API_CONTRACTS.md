# Contrats API à préserver pendant la migration

Ce document décrit les **capacités métier** à conserver. Les chemins pourront être renommés dans Express si nécessaire ; les contrats fonctionnels, eux, doivent rester explicites.

## 1. Catalogue public

Capacités :

- retourner uniquement les concepts/villes/formats réellement réservables ;
- exposer l'offre effective ;
- exposer le prix courant et, lorsqu'il existe, le prix de référence ;
- exposer la capacité restante sans permettre au frontend de la recalculer ;
- exposer les configurations physiques disponibles ;
- exposer la politique de date minimale.

Référence actuelle :

```text
GET /api/reservation/catalog-v96
```

## 2. Prospect et reprise de parcours

Capacités :

- créer ou réutiliser un client/prospect ;
- conserver entreprise, identité, téléphone/e-mail lorsque connus ;
- conserver la source marketing et la qualification HORS NORME ;
- produire un `reservation_token` opaque ;
- recharger le contexte depuis ce token ;
- ne jamais utiliser le navigateur comme source de vérité du prospect.

Références actuelles :

```text
POST /api/reservation/prospect/start
GET  /api/reservation/prospect/context?reservation_token=...
```

Le futur tunnel HORS NORME doit converger vers ce domaine avant de rediriger vers `/reserver`.

## 3. Sélection commerciale

Capacités :

- sélectionner concept/ville/format/offre/configuration ;
- valider l'offre effective côté serveur ;
- refuser un tarif expiré ou épuisé ;
- conserver la date et le créneau demandés ;
- empêcher toute modification de prix par le navigateur.

Référence actuelle :

```text
POST /api/reservation/selection-v96
```

## 4. Disponibilité et hold

Capacités :

- appliquer la même politique de dates pour toutes les interfaces ;
- retourner les créneaux réellement disponibles ;
- créer un hold temporaire lorsqu'il est nécessaire ;
- confirmer/libérer le créneau lors du cycle de paiement ;
- rendre la même information visible dans Studio.

Références actuelles :

```text
POST /api/reservation/availability-v172
POST /api/reservation/hold-v172
GET  /api/admin/reservation-slots-v172
POST /api/admin/reservation-slots-v172
```

## 5. Paiement et commande

Capacités :

- préparer le paiement à partir d'une sélection serveur valide ;
- associer l'identité/prospect au paiement ;
- traiter le webhook Stripe idempotemment ;
- matérialiser une seule commande/réservation payée ;
- confirmer le créneau ;
- conserver un snapshot de la commande ;
- rendre la commande immédiatement exploitable dans Studio et l'espace client.

Le futur backend VPS doit privilégier les Checkout Sessions ou Payment Links pilotés par le serveur selon l'architecture Neptune retenue, mais un paiement ne doit jamais être matérialisé uniquement sur la base d'un retour navigateur.

## 6. Espace client

Capacités :

- authentifier un compte Neptune ;
- retourner les commandes/passages rattachés à ce compte ;
- projeter l'état du workflow ;
- exposer rendez-vous, tournage, montage, validation, livraison ;
- exposer fichiers et publications ;
- permettre une nouvelle réservation sans recréer un second client.

Références actuelles :

```text
POST /portal/session
POST /api/client/reservation/prepare-payment
```

La cible VPS possède déjà une base de contrat dans `apps/backend/src/routes/mediaClient.js` ; elle devra être étendue plutôt que doublée.

## 7. Studio

Capacités :

- lister prospects, clients, commandes et passages ;
- afficher la prochaine action réellement nécessaire ;
- gérer catalogue, capacité et fournisseurs ;
- gérer demandes/changements de créneau ;
- suivre préparation, tournage, production et livraison ;
- accéder aux activités et anomalies ;
- déclencher les actions sans modifier directement un état local du frontend.

La cible VPS possède déjà des routes Media Studio ; la migration doit enrichir ces routes ou les services sous-jacents.

## 8. Contenus et stockage

Capacités :

- enregistrer les métadonnées d'un fichier indépendamment de son fournisseur de stockage ;
- rattacher les fichiers à une commande/client ;
- distinguer formats longs et courts ;
- conserver l'état de validation/livraison ;
- exposer une URL ou un mécanisme de lecture sécurisé ;
- conserver l'identité d'un contenu lors de sa réutilisation éditoriale.

## 9. WebTV

Capacités :

- état public de la chaîne ;
- grille/programme ;
- bibliothèque Media ;
- contrôle Studio ;
- analytics de lecture et conversion ;
- moteur d'encodage séparé du contrat HTTP public.

## 10. Règle de compatibilité

Pendant la migration, un adaptateur peut conserver temporairement un ancien endpoint. Il ne doit toutefois pas créer une seconde implémentation métier.

```text
ancienne route → adaptateur → service métier canonique
nouvelle route → adaptateur → même service métier canonique
```

C'est ce principe qui permet de migrer progressivement sans désynchroniser Studio, espace client et réservation.
