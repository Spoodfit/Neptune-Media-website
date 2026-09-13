# Architecture cible VPS

Ce document décrit la cible de migration validée pour Neptune Media.

## Entrée publique

```text
media.neptunebusiness.com
→ NGINX natif du VPS + TLS Let's Encrypt
→ 127.0.0.1:8081
→ conteneur Docker `neptune-media`
```

Le domaine public **ne change pas** lors du remplacement de l'ancienne version Media.

## Frontend Media

Dans le monorepo Neptune actuel, la cible est :

```text
apps/media/
```

Le service Docker `media` sert l'application via son NGINX interne. Les appels API sont relayés vers le backend Neptune.

La nouvelle version doit y apporter progressivement les surfaces suivantes :

- site Media ;
- landing / tunnel HORS NORME ;
- réservation ;
- espace client ;
- Studio ;
- WebTV / direct ;
- pages de confirmation et contenus publics associés.

## Backend

La cible backend est :

```text
apps/backend/
```

Stack cible :

- Node.js / Express ;
- Prisma ;
- PostgreSQL ;
- services backend pour les intégrations externes.

Le snapshot serveur fourni contient déjà des points d'ancrage Media :

```text
apps/backend/src/routes/media.js
apps/backend/src/routes/mediaClient.js
apps/backend/src/routes/mediaStudio.js
apps/backend/src/routes/mediaWebtv.js
apps/backend/src/services/mediaBookingService.js
apps/backend/prisma/schema.prisma
```

Ces modules sont des points de convergence, pas une obligation de conserver leurs contrats historiques lorsqu'un contrat plus complet est nécessaire. Les migrations doivent cependant rester compatibles avec les comptes Neptune existants et les conventions du backend principal.

## Source de vérité

La cible définitive est PostgreSQL.

Studio ne stocke pas les données : il les présente et permet de déclencher des cas d'usage backend.

Les autres surfaces lisent exactement les mêmes objets métier :

```text
Landing / Site ─────┐
Réservation ────────┤
Espace client ──────┼→ API domaine Neptune → PostgreSQL
Studio ─────────────┤
Automatisations ────┤
WebTV / Contenus ───┘
```

## Correspondances de plateforme

| Runtime actuel | Cible VPS |
| --- | --- |
| Cloudflare Worker | Express / middleware / routes |
| Durable Object `StudioStore` | services + repositories Prisma/PostgreSQL |
| SQLite du Durable Object | PostgreSQL |
| `env.STUDIO` | appel direct à un service métier backend |
| `env.MEDIA` / R2 | adaptateur de stockage choisi par Neptune |
| HTML response rewriting | build/routage frontend explicite |
| cron Worker | scheduler/cron de l'infrastructure Neptune |
| secrets Worker | variables/secrets du déploiement VPS |
| Cloudflare Containers | service Docker dédié si le moteur nécessite un process long |

## Contraintes de migration

- ne pas introduire de seconde base de données métier ;
- ne pas reproduire une règle de prix ou de disponibilité dans le frontend ;
- ne pas faire dépendre le Studio de données uniquement calculées dans le navigateur ;
- maintenir les identifiants métiers lors de l'import lorsque cela évite les ruptures de relation ;
- prévoir des migrations Prisma réversibles ou au minimum idempotentes pour les imports ;
- conserver une couche d'adaptation pour les intégrations externes afin de pouvoir changer de fournisseur sans toucher au domaine.
