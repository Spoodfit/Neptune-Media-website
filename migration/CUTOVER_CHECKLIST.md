# Checklist de bascule Media vers le VPS

Cette checklist est le dernier garde-fou avant de remplacer la version Media actuellement déployée sur le VPS par l'implémentation portée depuis `Spoodfit/Neptune-Media-website`.

## 1. Données

- [ ] Schéma Prisma cible validé.
- [ ] Export de la source actuelle effectué.
- [ ] Import idempotent testé sur une base hors production.
- [ ] Comptage des prospects, clients, réservations, commandes, passages, contenus et publications comparé avant/après.
- [ ] Identifiants distribués (`reservation_token`, IDs commande/client/passages nécessaires) conservés lorsqu'ils sont encore utilisés.
- [ ] Contraintes d'unicité et relations vérifiées.
- [ ] Sauvegarde PostgreSQL réalisée et restauration testée.

## 2. Règles métier

- [ ] Catalogue/offre effective identique à la référence.
- [ ] Prix calculé côté backend uniquement.
- [ ] Capacités et disponibilités calculées côté backend uniquement.
- [ ] Holds de réservation et concurrence vérifiés.
- [ ] Paiement Stripe lié à la bonne opportunité/commande.
- [ ] Webhooks Stripe idempotents.
- [ ] Une réservation issue de la landing HORS NORME passe par le prospect Neptune puis le tunnel canonique.
- [ ] Une réservation depuis l'espace client rejoint le même pipeline qu'une réservation publique.

## 3. Parité des surfaces

Tester au minimum :

- [ ] `/`
- [ ] `/hors-norme/`
- [ ] `/reserver/`
- [ ] `/espace-client/`
- [ ] `/studio/`
- [ ] `/direct/`

Pour chaque surface :

- [ ] desktop ;
- [ ] mobile ;
- [ ] navigation ;
- [ ] authentification si applicable ;
- [ ] erreurs API ;
- [ ] chargements ;
- [ ] actions principales ;
- [ ] accessibilité de base ;
- [ ] aucun appel involontaire vers le Worker Cloudflare après bascule.

## 4. Synchronisation Studio / client

- [ ] Un nouveau client apparaît dans Studio.
- [ ] La commande payée alimente le passage Studio.
- [ ] Les modifications de date suivent le même objet métier côté client et Studio.
- [ ] Les actions requises côté client sont visibles dans le parcours.
- [ ] Les statuts modifiés dans Studio se reflètent dans l'espace client.
- [ ] Les fichiers/livraisons apparaissent dans les deux surfaces selon les droits.
- [ ] L'historique et les notifications n'envoient pas de doublons.

## 5. Intégrations

- [ ] Resend : domaine, expéditeur, clés et anti-doublon vérifiés.
- [ ] Google Drive : adaptateur backend vérifié sans logique métier dans Apps Script.
- [ ] Stripe : clés, webhook secret et URLs de retour VPS vérifiés.
- [ ] Stockage binaire : objets copiés, références valides, droits d'accès corrects.
- [ ] Fournisseur : notifications et réponses fonctionnelles.
- [ ] Moteur vidéo : jobs, résultats et reprise sur erreur validés.
- [ ] WebTV : playlist, direct/HLS et état de diffusion validés.

## 6. Infrastructure

- [ ] `apps/media` build correctement dans Docker.
- [ ] `apps/backend` démarre avec le schéma migré.
- [ ] NGINX hôte route `media.neptunebusiness.com` vers `127.0.0.1:8081`.
- [ ] NGINX du conteneur Media route `/api/` vers `neptune-backend`.
- [ ] Certificat TLS valide.
- [ ] Healthchecks Media + backend verts.
- [ ] Logs disponibles et exploitables.
- [ ] Plan de rollback documenté et testé.

## 7. Cutover

Ordre recommandé :

1. figer les écritures sur l'ancienne plateforme pendant la fenêtre de bascule ;
2. réaliser le dernier export delta ;
3. importer le delta sur PostgreSQL ;
4. vérifier les comptages et invariants ;
5. déployer `neptune-backend` puis `neptune-media` ;
6. tester les parcours critiques via le VPS avant ouverture publique ;
7. basculer le trafic `media.neptunebusiness.com` ;
8. surveiller erreurs, paiements, réservations, authentification et Studio ;
9. conserver l'ancienne plateforme disponible uniquement pour rollback pendant la période décidée ;
10. désactiver les écritures Cloudflare après validation définitive.

## 8. Critère GO / NO-GO

**GO** uniquement si :

- zéro divergence bloquante sur prix/disponibilité/réservation/paiement ;
- Studio et espace client lisent les mêmes objets backend ;
- les webhooks de paiement sont idempotents ;
- les données importées sont réconciliées ;
- les fichiers critiques sont accessibles ;
- le rollback est possible.

Tout autre état est **NO-GO**.