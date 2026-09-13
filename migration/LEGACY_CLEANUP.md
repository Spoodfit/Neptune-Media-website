# Inventaire de nettoyage legacy

Ce fichier distingue ce qui peut être nettoyé de ce qui doit rester disponible tant que la version Cloudflare sert encore de référence fonctionnelle.

## Ne pas supprimer avant migration

Même si leur architecture n'est pas la cible, les éléments suivants participent encore au runtime actif :

- `src/entry-v48.js` et ses imports descendants ;
- les modules Store appelés par la chaîne active ;
- les assets réellement injectés dans Studio, Espace client et Réservation ;
- les workflows de déploiement Cloudflare encore utilisés pendant la finalisation ;
- les scripts d'intégration Drive / Stripe / Resend / WebTV en production.

Leur statut est **LEGACY_REQUIRED** : à documenter et encapsuler, pas à supprimer prématurément.

Voir `migration/RUNTIME_GRAPH.md` pour la classification et le début de chaîne vérifié.

## Nettoyage exécuté le 13 septembre 2026

Les sorties ponctuelles et déclencheurs historiques suivants ont été retirés de la racine du dépôt :

```text
accessibility-deployment-trigger.txt
aida-production-diagnostic.json
auth-apply-trigger.txt
client-portal-production-diagnostic.json
copy-hotfix-deployment-status.json
copy-production-verification.json
deployment-status.json
media-import-status.json
public-accessibility-production-diagnostic.json
render-polish-production-check.json
render-polish-production.json
render-polish-source-validation.json
story-home-production-diagnostic.json
streaming-production-diagnostic.json
streaming-source-validation.json
studio-v65-production-status.json
video-cloud-v67-diagnostic.json
visual-audit-v11-trigger.txt
visual-audit-v12-trigger.txt
visual-audit-v13-trigger.txt
visual-audit-v14-trigger.txt
```

Ils n'appartiennent ni au runtime ni au modèle de données à migrer. `.gitignore` empêche désormais leur réintroduction accidentelle à la racine.

`ui-quality-status.json` n'est pas supprimé dans ce lot : il reste traité séparément tant que le workflow de qualité UI n'a pas été consolidé.

## Dette de structure encore présente

### Chaîne `entry-vXX.js`

Le Worker courant repose sur une succession de wrappers historiques. `entry-v48.js` importe `entry-v47.js`, qui importe `entry-v46.js`, qui importe `entry-v45.js`. Une suppression massive fondée uniquement sur les numéros de version casserait donc le runtime.

Cible : routes par domaine + services métier + adaptateurs.

### Multiples workflows de déploiement

Plusieurs workflows peuvent encore exécuter `wrangler deploy` sur le même Worker. Le pipeline général déclaré canonique dans `migration/manifest.json` est :

```text
.github/workflows/deploy-cloudflare.yml
```

Les workflows spécialisés restent une dette de livraison à convertir en contrôles sans déploiement ou à absorber dans le pipeline canonique.

Cible avant cutover :

```text
checks spécialisés
        ↓
un seul pipeline de déploiement canonique
```

## Politique de suppression

Avant de supprimer un fichier legacy :

1. rechercher les imports/références ;
2. vérifier les injections HTML du Worker ;
3. vérifier les workflows GitHub ;
4. vérifier les routes/API encore consommées ;
5. vérifier la production de référence ;
6. supprimer par lot cohérent avec un test de non-régression.

## Ordre du nettoyage destructif restant

1. workflows de vérification historiques manifestement remplacés ;
2. assets frontend non injectés et non référencés ;
3. shims frontend neutralisés ;
4. anciens wrappers serveur non atteignables depuis l'entrée canonique ;
5. anciennes tables/outils uniquement après export ou migration des données.

Le nettoyage destructif doit rester séparé de la migration fonctionnelle afin de pouvoir attribuer rapidement une régression à l'un ou l'autre chantier.
