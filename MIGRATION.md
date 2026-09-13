# Migration Neptune Media vers le VPS Neptune

## But

Ce dépôt doit devenir une **source de référence propre et portable** avant le remplacement de l'application Media actuellement déployée sur le VPS.

La migration finale ne consiste pas à copier le Worker Cloudflare dans le VPS. Elle consiste à porter les fonctionnalités validées vers l'architecture Neptune existante :

```text
media.neptunebusiness.com
→ NGINX hôte
→ neptune-media
→ neptune-backend
→ PostgreSQL / Prisma
```

## Principe directeur

**Studio est le cockpit de gestion ; le backend est la source de vérité.**

Les mêmes objets métier doivent alimenter :

- le site et la landing HORS NORME ;
- le tunnel de réservation ;
- l'espace client ;
- le Studio ;
- les fournisseurs et automatisations ;
- les paiements et commandes ;
- la WebTV et les contenus lorsque ces domaines sont concernés.

Aucune synchronisation interface-à-interface ne doit être nécessaire.

## Ce qui doit être conservé

Les comportements fonctionnels déjà validés :

- catalogue ville / concept / format / offre / configuration ;
- offre effective, capacité et disponibilité ;
- prospects et reprise par `reservation_token` ;
- choix de date et créneau ;
- réservation, hold, paiement et matérialisation de commande ;
- projection du parcours dans l'espace client ;
- pilotage des dossiers et passages dans Studio ;
- automatisations fournisseur et préparation ;
- bibliothèque de contenus et calendrier éditorial ;
- WebTV, analytics et contenus ;
- e-mails transactionnels et gouvernance anti-doublon ;
- intégrations Google Drive, Stripe, Resend et IA utiles.

## Ce qui ne doit pas être migré tel quel

Ces éléments sont des mécanismes de compatibilité de la version actuelle et doivent être remplacés par des composants adaptés au VPS :

- la chaîne de wrappers `entry-vXX.js` ;
- le routage spécifique Cloudflare Worker ;
- les accès SQL directement attachés au Durable Object ;
- les bindings `env.STUDIO`, `env.MEDIA`, `env.AI` ;
- les injections HTML réalisées dans les réponses du Worker ;
- les cache-busters et shims historiques devenus inutiles ;
- les workflows GitHub conçus uniquement pour déployer le Worker Cloudflare ;
- les scripts front qui dupliquent une règle métier déjà disponible côté backend.

## Découpage de la migration

### Phase 0 — Mise au propre du dépôt

- documenter l'architecture active ;
- déclarer un propriétaire unique pour chaque domaine ;
- inventorier les surfaces publiques et les contrats API ;
- séparer explicitement comportement métier et adaptateurs Cloudflare ;
- identifier les fichiers legacy avant toute suppression ;
- empêcher l'ajout de nouvelles dépendances métier au runtime Cloudflare.

### Phase 1 — Modèle de données PostgreSQL

Créer ou étendre les modèles Prisma nécessaires pour représenter sans perte :

- clients ;
- prospects et qualification commerciale ;
- catalogue et offres ;
- politiques de capacité ;
- holds et créneaux ;
- réservations / commandes ;
- workflow de passage ;
- fichiers et livraisons ;
- publications ;
- fournisseurs ;
- activités / audit.

Les tables Durable Object ne sont pas la cible : leur **sémantique** doit être traduite en modèles PostgreSQL.

### Phase 2 — Services métier Express

Porter les cas d'usage derrière des services backend indépendants du frontend :

- catalogue ;
- réservation ;
- paiement ;
- dossiers clients ;
- workflow Studio ;
- contenus ;
- WebTV ;
- notifications.

Les routes Express doivent devenir les seuls points d'entrée vers ces services.

### Phase 3 — Frontends

Porter les surfaces actuelles dans `apps/media` en conservant leurs comportements :

- site public ;
- HORS NORME ;
- `/reserver` ;
- `/espace-client` ;
- `/studio` ;
- `/direct`.

Les frontends consomment les API du backend ; ils ne portent pas de règles commerciales cachées.

### Phase 4 — Intégrations externes

Raccorder proprement :

- Stripe ;
- Resend ;
- Google Drive ;
- Google Calendar / fournisseur ;
- OpenAI / moteur vidéo ;
- stockage média ;
- WebTV.

Chaque intégration doit être derrière un adaptateur remplaçable.

### Phase 5 — Import des données et double validation

Avant le cutover :

1. exporter les données nécessaires depuis le runtime actuel ;
2. les importer dans PostgreSQL ;
3. comparer les projections Studio / client / réservation ;
4. tester les parcours complets sans paiement réel lorsque possible ;
5. exécuter un test de paiement contrôlé ;
6. vérifier les notifications et le fournisseur ;
7. vérifier la diffusion / contenus.

### Phase 6 — Cutover

Le remplacement de l'application Media actuelle doit se faire sans changer le domaine public :

```text
media.neptunebusiness.com
```

Le NGINX du VPS continue à pointer vers le service `neptune-media`. Seule l'implémentation du frontend et des API Media évolue.

## Critères de readiness

Le dépôt est prêt à migrer lorsqu'on peut répondre sans ambiguïté aux questions suivantes :

- quel module possède chaque règle métier ?
- quelles données doivent être persistées ?
- quelle API les lit ou les modifie ?
- quelles interfaces consomment cette API ?
- quelles dépendances sont spécifiques à Cloudflare ?
- quelle équivalence existe dans `apps/backend` / Prisma ?
- quels fichiers sont legacy et peuvent être supprimés après migration ?

Le manifeste `migration/manifest.json` et `npm run audit:migration` servent de garde-fou pendant cette phase.
