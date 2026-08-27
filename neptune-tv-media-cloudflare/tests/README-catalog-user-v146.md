# Catalogue utilisateur v146 — couverture de l’audit

Le contrôle v146 complète l’audit v145 qui validait surtout le rendu nominal avec données simulées.

Scénarios automatisés :
- vue desktop 1920×1080 et mobile 390×844 ;
- recherche du cockpit et montage du runtime réel ;
- cohérence des KPI commerciaux lorsqu’une ville ou un fournisseur actif ne possède aucune offre ;
- filtre `Masquées` avec offre réellement inactive ;
- alerte de quota lancement épuisé sans faux écran vide ;
- visuel catalogue fourni avec une URL relative ;
- libellés accessibles des menus offre/fournisseur ;
- ouverture du drawer de configuration historique v143.4 ;
- absence d’overflow horizontal et de valeurs `undefined` / `NaN` visibles.

Le workflow de production reste strictement en lecture seule : il vérifie les assets v146 sur les deux domaines et confirme que l’API admin du catalogue refuse un appel non authentifié. Aucune mutation de données de production n’est effectuée.
