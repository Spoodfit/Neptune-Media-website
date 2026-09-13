# Manifeste de transfert Neptune Media

Ce document désigne **le dépôt à transférer** et la frontière exacte du futur portage vers le monorepo VPS.

## Dépôt source canonique

```text
Spoodfit/Neptune-Media-website
branche : main
runtime de référence : neptune-tv-media-cloudflare/
```

Ce dépôt est la version fonctionnelle de référence à migrer. Il contient les surfaces Media qui doivent remplacer la version actuellement présente dans `Neptune-main/apps/media` après portage et validation.

## Surfaces fonctionnelles à transférer

| Surface | Source de référence actuelle | Destination VPS |
| --- | --- | --- |
| Site web Media | `neptune-tv-media-cloudflare/public/index.html` + assets/scripts/styles de `public/` | `apps/media/` |
| Landing HORS NORME | `neptune-tv-media-cloudflare/public/hors-norme/` | `apps/media/` |
| Tunnel de réservation public | `neptune-tv-media-cloudflare/public/reserver/` | `apps/media/` + API `apps/backend/` |
| Espace client | `neptune-tv-media-cloudflare/public/espace-client/` | `apps/media/` + routes client `apps/backend/` |
| Studio | `neptune-tv-media-cloudflare/public/studio/` | `apps/media/` + routes Studio `apps/backend/` |
| WebTV / direct | `neptune-tv-media-cloudflare/public/direct/` et logique WebTV associée | `apps/media/` + `mediaWebtv` / services backend |

Les sous-parcours actifs liés à la confirmation, aux disponibilités, aux contenus, aux calendriers et aux livraisons font partie du même périmètre et doivent être portés avec leur surface propriétaire.

## Cibles déjà existantes dans Neptune-main

Le monorepo VPS fourni contient déjà les points d'ancrage suivants :

### Frontend

```text
apps/media/src/App.jsx
apps/media/src/pages/LandingPage.jsx
apps/media/src/pages/ReservationPage.jsx
apps/media/public/
```

La version actuellement présente dans `apps/media/public/studio/` et `apps/media/public/espace-client/` est une version antérieure. Elle ne doit pas être considérée comme la référence fonctionnelle à conserver si elle diverge du dépôt Media source.

### Backend

```text
apps/backend/src/routes/media.js
apps/backend/src/routes/mediaClient.js
apps/backend/src/routes/mediaStudio.js
apps/backend/src/routes/mediaWebtv.js
apps/backend/src/services/mediaBookingService.js
apps/backend/prisma/schema.prisma
```

Ces fichiers sont les points de convergence du portage backend. Ils doivent être enrichis ou restructurés, pas contournés par un second backend Media parallèle.

## Ce qui doit être porté

Le transfert doit préserver :

- les parcours utilisateurs et l'ergonomie validée ;
- les contrats catalogue, prospect, réservation, disponibilité, paiement et commande ;
- le rattachement d'un prospect/réservation à un client puis à un passage Studio ;
- la synchronisation Studio ↔ espace client ;
- les contenus, fichiers, livraisons et calendriers ;
- la logique fournisseur et les changements de date ;
- les notifications et l'historique d'activité ;
- la WebTV et les fonctions vidéo nécessaires ;
- les intégrations Stripe, Resend, Google Drive et stockage via des adaptateurs backend.

## Ce qui ne doit pas être transféré comme architecture

Les éléments suivants restent des mécanismes de compatibilité de l'ancienne plateforme et **ne doivent pas être reproduits dans Neptune-main** :

- la chaîne `src/entry-vXX.js` ;
- les réécritures HTML cumulatives entre wrappers ;
- `StudioStore` / Durable Object comme base de données cible ;
- les bindings Cloudflare comme propriétaires des règles métier ;
- les workflows de déploiement Cloudflare ;
- les shims historiques dont le comportement est remplacé par un service backend canonique.

Ils restent présents dans le dépôt source uniquement pour maintenir la version de référence opérationnelle jusqu'au cutover.

## Source de vérité cible

Après migration :

```text
media.neptunebusiness.com
        ↓
NGINX VPS
        ↓
neptune-media
        ↓
neptune-backend
        ↓
PostgreSQL / Prisma
```

Studio reste le cockpit humain. Le backend Neptune et PostgreSQL deviennent l'unique source de vérité métier.

## Règle de remplacement

La migration n'est validée que lorsque la nouvelle implémentation VPS atteint la parité fonctionnelle avec ce dépôt pour :

```text
/
/hors-norme/
/reserver/
/espace-client/
/studio/
/direct/
```

et pour les API/domaines associés. À ce moment seulement, l'ancienne version Media de `Neptune-main/apps/media` peut être considérée comme remplacée et le domaine public peut être basculé définitivement.