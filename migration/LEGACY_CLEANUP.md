# Inventaire de nettoyage legacy

Ce fichier distingue ce qui peut être nettoyé de ce qui doit rester disponible tant que la version Cloudflare sert encore de référence fonctionnelle.

## Ne pas supprimer avant migration

Même si leur architecture n'est pas la cible, les éléments suivants participent encore au runtime actif :

- `src/entry-v48.js` et ses imports descendants ;
- les modules Store appelés par la chaîne active ;
- les assets réellement injectés dans Studio, Espace client et Réservation ;
- les workflows de déploiement Cloudflare encore utilisés pendant la finalisation ;
- les scripts d'intégration Drive / Stripe / Resend / WebTV en production.

Leur statut est **legacy actif** : à documenter et encapsuler, pas à supprimer prématurément.

## Dette de structure identifiée

### Chaîne `entry-vXX.js`

Le Worker courant repose sur une succession de wrappers historiques. Cette chaîne est utile pour comprendre les ajouts successifs mais ne doit pas être reproduite dans Express.

Cible : routes par domaine + services métier + adaptateurs.

### Multiples workflows de déploiement

Plusieurs workflows peuvent exécuter `wrangler deploy` sur le même Worker. Pendant la phase de finalisation il faut les considérer comme dette de livraison.

Cible avant cutover :

```text
checks spécialisés
        ↓
un seul pipeline de déploiement canonique
```

### Artefacts de diagnostic à la racine

Les fichiers suivants ressemblent à des sorties ponctuelles ou déclencheurs historiques et doivent être archivés/supprimés après vérification des références :

```text
accessibility-deployment-trigger.txt
aida-production-diagnostic.json
auth-apply-trigger.txt
client-portal-production-diagnostic.json
copy-hotfix-deployment-status.json
copy-production-verification.json
deployment-status.json
media-import-status.json
```

`npm run audit:migration` remonte également automatiquement les fichiers de cette famille présents à la racine.

## Politique de suppression

Avant de supprimer un fichier legacy :

1. rechercher les imports/références ;
2. vérifier les injections HTML du Worker ;
3. vérifier les workflows GitHub ;
4. vérifier les routes/API encore consommées ;
5. vérifier la production de référence ;
6. supprimer par lot cohérent avec un test de non-régression.

## Ordre conseillé du nettoyage destructif

1. diagnostics et triggers non référencés ;
2. workflows de vérification historiques manifestement remplacés ;
3. assets frontend non injectés et non référencés ;
4. shims frontend neutralisés ;
5. anciens wrappers serveur non atteignables depuis l'entrée canonique ;
6. anciennes tables/outils uniquement après export ou migration des données.

Le nettoyage destructif doit être séparé de la migration fonctionnelle afin de pouvoir attribuer rapidement une régression à l'un ou l'autre chantier.
