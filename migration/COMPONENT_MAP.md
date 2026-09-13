# Cartographie des composants

Cette cartographie sert à migrer les comportements sans transporter aveuglément les mécanismes Cloudflare historiques.

| Domaine | Référence actuelle | Cible VPS | Stratégie |
| --- | --- | --- | --- |
| Entrée HTTP | `src/worker.js` et chaîne `entry-vXX.js` | routes/middlewares Express | Recomposer les routes par domaine ; ne pas reproduire la chaîne de wrappers. |
| Persistance | `StudioStore` + SQL Durable Object | Prisma + PostgreSQL | Traduire les entités et contraintes, pas les requêtes SQL ligne par ligne. |
| Catalogue | `portal-media-catalog-*`, `portal-sales-tunnel-*`, `effective-offer-v181.js` | service catalogue Media | Conserver offre effective, capacité, visibilité, fournisseur, ville, concept et configuration. |
| Réservation | `reservation-domain-*`, `reservation-slot-management-*`, tunnel `/reserver` | service réservation | Une seule politique de date, disponibilité, hold et confirmation. |
| Prospect | `portal-sales-prospect-v121.js` | service prospects / CRM Media | Conserver le `reservation_token`, la qualification et la reprise du parcours. |
| Paiement | Stripe journey + liens / webhooks | service paiement backend | Le serveur décide du prix et matérialise la commande après confirmation Stripe. |
| Commande / passage | commandes et snapshots du Store | MediaBooking/Order enrichi | Un objet métier unique doit alimenter Studio et espace client. |
| Espace client | `public/espace-client/` + routes client | frontend `apps/media` + API backend | Projection uniquement ; aucune règle commerciale locale. |
| Studio | `public/studio/` + routes admin | frontend `apps/media` + API backend | Cockpit ; déclenche des use cases backend. |
| HORS NORME | `public/hors-norme/` et future landing Cursor | frontend `apps/media` | Qualifie le prospect puis redirige vers le tunnel canonique avec `reservation_token`. |
| Site public | `public/` | frontend `apps/media` | Réutiliser le catalogue et les CTA de réservation via contrats backend. |
| Fichiers / livraisons | Drive, R2, métadonnées Store | stockage Neptune + métadonnées PostgreSQL | Définir un adaptateur de stockage ; les relations métier restent en base. |
| Publications | calendrier client / contenus | service publications | Conserver historique, réutilisation et planification. |
| Fournisseur | workflow fournisseur / e-mails | service fournisseur | Centraliser demandes, réponses, changements de date et anti-doublon. |
| Resend | appels Worker | service e-mail backend | Adapter l'envoi ; conserver gouvernance et journalisation. |
| Google Drive | intégration Worker / Apps Script | service Drive backend | Remplacer les ponts historiques par un adaptateur unique si possible. |
| WebTV | Worker + Container + R2/HLS | `mediaWebtv` + service Docker si nécessaire | Séparer régie, stockage et rendu public. |
| IA / vidéo | Workers AI / OpenAI / moteur local | service IA/vidéo | Garder les contrats de job et de résultat ; adapter l'exécution au VPS. |
| Analytics | Store / événements | backend + PostgreSQL ou stockage événementiel choisi | Unifier les événements utilisés par Studio. |

## Propriétaires fonctionnels

Chaque domaine doit avoir **un propriétaire unique** avant migration :

- catalogue : backend ;
- disponibilité/créneaux : backend ;
- prix/capacité : backend ;
- paiement : backend ;
- commande : backend ;
- état du passage : backend ;
- fichiers/livraisons : backend + adaptateur stockage ;
- affichage : frontend concerné.

Si deux scripts front ou deux wrappers serveur recalculent la même règle, c'est une dette à éliminer avant ou pendant le portage.

## Surfaces à conserver fonctionnellement

```text
/
/hors-norme/
/reserver/
/espace-client/
/espace-client/videos/
/espace-client/calendrier/
/studio/
/studio/clients/
/direct/
/api/*
```

Les chemins exacts pourront être adaptés au routeur VPS, mais les parcours utilisateurs associés doivent être préservés.
