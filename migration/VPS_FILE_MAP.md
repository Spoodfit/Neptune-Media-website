# Matrice de portage vers Neptune-main

Cette matrice relie la version de référence `Spoodfit/Neptune-Media-website` aux points d'ancrage réellement présents dans le monorepo VPS `Neptune-main` fourni pour la migration.

Le principe reste : **porter le comportement dans l'architecture VPS, ne pas copier l'architecture Cloudflare**.

## Frontend

| Domaine | Source fonctionnelle de référence | Cible `Neptune-main` | Action |
| --- | --- | --- | --- |
| Shell Media / routage public | `neptune-tv-media-cloudflare/public/index.html`, `public/app.js`, styles/assets publics actifs | `apps/media/src/App.jsx`, `apps/media/src/main.jsx`, `apps/media/src/styles/` | Recomposer les routes/pages React à partir du rendu de référence. Ne pas conserver les injections Worker comme mécanisme de rendu. |
| Landing principale Media | `/` + assets/scripts actifs de `public/` | `apps/media/src/pages/LandingPage.jsx` | Remplacer/enrichir la landing VPS jusqu'à parité visuelle et fonctionnelle. |
| HORS NORME | `neptune-tv-media-cloudflare/public/hors-norme/` | nouvelle page/composants dans `apps/media/src/pages/` | Porter la landing finale ; son CTA doit créer/enrichir le prospect via le backend puis ouvrir la réservation canonique. |
| Réservation | `neptune-tv-media-cloudflare/public/reserver/` | `apps/media/src/pages/ReservationPage.jsx` | Remplacer la logique UI antérieure ; toutes les décisions prix/capacité/disponibilité doivent venir du backend. |
| Espace client | `neptune-tv-media-cloudflare/public/espace-client/` | nouvelles pages/composants sous `apps/media/src/` | Porter navigation, parcours, contenus, calendrier, actions et livraisons. Aucun état métier canonique dans le navigateur. |
| Studio | `neptune-tv-media-cloudflare/public/studio/` | nouvelles pages/composants sous `apps/media/src/` | Porter le cockpit ; chaque action doit appeler un use case backend canonique. |
| Direct / WebTV | `neptune-tv-media-cloudflare/public/direct/` + scripts WebTV publics | nouvelle page/composants sous `apps/media/src/` | Porter lecteur, grille/état public et contrôles nécessaires sans coupler le frontend au runtime Cloudflare. |
| Assets Media | `neptune-tv-media-cloudflare/public/assets/` et médias statiques réellement utilisés | `apps/media/public/` ou pipeline d'assets du frontend | Copier uniquement les assets encore référencés par les surfaces portées ; dédupliquer avant cutover. |

Les fichiers VPS existants `apps/media/src/gtm.js`, `apps/media/src/pages/landingEnhancements.js`, `apps/media/src/styles/media.css` et `apps/media/src/styles/site-public.css` doivent être conservés, fusionnés ou remplacés selon la parité obtenue ; ils ne sont pas automatiquement la source de vérité fonctionnelle.

## Backend

| Domaine | Source comportementale actuelle | Cible `Neptune-main` | Action |
| --- | --- | --- | --- |
| API Media publique | routes actives dans la chaîne `src/worker.js` et descendants | `apps/backend/src/routes/media.js` | Reconstituer des routes Express explicites et déléguer la logique à des services. |
| Client | routes/session/commandes/contenus client du Store et Worker | `apps/backend/src/routes/mediaClient.js` | Centraliser authentification client, projection du passage, fichiers, actions et réservation récurrente. |
| Studio | routes opérateur, clients, passages, catalogue, fournisseurs, contenus | `apps/backend/src/routes/mediaStudio.js` | Studio reste cockpit ; contrôles d'accès et use cases restent serveur. |
| WebTV | régie, état antenne, HLS/import et programmation | `apps/backend/src/routes/mediaWebtv.js` + service Docker si nécessaire | Séparer API métier, stockage et processus vidéo long. |
| Réservation | règles offre effective, disponibilité, hold, sélection, commande | `apps/backend/src/services/mediaBookingService.js` + routes Media | Faire de ce service (ou de services découpés) la frontière canonique des règles commerciales. |
| Données | `StudioStore`, SQL Durable Object et schémas implicites | `apps/backend/prisma/schema.prisma` + migrations Prisma | Recréer le modèle relationnel, contraintes et index. Ne pas translittérer le SQL Cloudflare ligne par ligne. |

## Services backend à extraire pendant le portage

Même si certains peuvent commencer dans les routes existantes, la cible doit isoler au minimum les responsabilités suivantes :

```text
catalogService
availabilityService
reservationService
paymentService
orderService
clientJourneyService
studioPassageService
supplierService
contentService
publicationService
notificationService
webtvService
analyticsService
```

Les noms exacts peuvent suivre les conventions de `Neptune-main`, mais une responsabilité métier ne doit pas avoir deux propriétaires concurrents.

## Intégrations

| Intégration actuelle | Cible recommandée |
| --- | --- |
| Stripe | adaptateur/service backend ; webhooks Express idempotents |
| Resend | adaptateur e-mail backend avec gouverneur anti-doublon |
| Google Drive / Apps Script | un adaptateur Drive backend ; Apps Script limité au relais strictement nécessaire |
| R2 | adaptateur `storage` ; PostgreSQL conserve les métadonnées métier |
| Workers AI / OpenAI | adaptateur IA backend avec contrats d'entrée/sortie stables |
| Cloudflare Containers vidéo | service Docker Neptune pour les tâches longues nécessaires |
| Cron Workers | scheduler/cron du VPS ou service de jobs Neptune |

## Objets à réconcilier avec Prisma

Avant de porter les écrans, le schéma cible doit rendre explicites au minimum :

```text
User / Account / Session
Client / Company
Prospect / ReservationToken
Concept / Format / Offer / PriceTier
City / Supplier / Capacity / Availability
Reservation / Hold
Order / Payment
Passage / PassageStep / PreparationMeeting
MediaAsset / Delivery / Content
Publication / PublicationSchedule
SupplierRequest / SupplierResponse
Notification / EmailActivity
WebTvSchedule / WebTvState
VideoJob / VideoResult
AnalyticsEvent (ou agrégats équivalents)
```

Les noms Prisma finaux peuvent différer. La règle importante est la conservation des relations, identifiants métier nécessaires et invariants fonctionnels.

## Ordre de portage fichier par fichier

1. `schema.prisma` + migrations/import test.
2. `mediaBookingService.js` et services catalogue/disponibilité/réservation/paiement/commande.
3. `media.js` pour les contrats publics.
4. `ReservationPage.jsx` et HORS NORME.
5. `mediaClient.js` puis UI espace client.
6. `mediaStudio.js` puis UI Studio.
7. `mediaWebtv.js` puis UI `/direct/` et service vidéo/WebTV.
8. Landing/site Media et finition commune des assets/styles.
9. Intégrations, scheduler, observabilité et tests de parité.
10. Cutover selon `CUTOVER_CHECKLIST.md`.

## Règle de suppression

Aucun fichier `entry-vXX.js`, store Cloudflare ou shim utilisé par la version de référence ne doit être supprimé uniquement parce que son comportement a été porté partiellement. Sa suppression appartient à la phase **post-cutover**, après confirmation qu'aucun trafic, donnée ou rollback utile n'en dépend.