# Studio operating UX v135

## Corrections

- Diffusion: neutralise les anciennes couches `webtv-workspace-v1` et `webtv-control-room-v122` sur l'écran Web TV pour conserver uniquement le cockpit v125.
- Diffusion: réduit l'entête et confine le défilement aux panneaux internes du cockpit.
- Catalogue: la recherche met à jour uniquement le contenu filtré et ne détruit plus le champ actif à chaque frappe.
- Nouveau passage: renouvelle le jeton CSRF depuis `/api/auth/status` avant de charger le contexte Catalogue protégé.
- Nouveau client: utilise Prénom, Nom, E-mail et Téléphone, avec Entreprise facultative. Le nom complet reste synchronisé avec le modèle historique.
- Contact: le téléphone est sauvegardé dans `portal_client_profiles_v96`, le même profil utilisé par le tunnel public.
- Parcours clients: ajoute un accès direct à l'Agenda Studio sans devoir ouvrir un dossier.
- Agenda: navigation mensuelle, vues Passages/Préparations, événements cliquables, création d'un passage depuis une date et création d'une préparation rattachée à un passage.

## Sécurité

- Aucune désactivation de la protection CSRF.
- Les appels protégés renouvellent le jeton de session puis l'envoient via `X-CSRF-Token`.
- La synchronisation de contact v135 requiert une session opérateur valide et un appel same-origin.
