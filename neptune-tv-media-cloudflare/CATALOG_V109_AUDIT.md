# Catalogue Media v109 — audit technique

Ce fichier documente les invariants vérifiés par la v109. Il ne remplace pas les tests automatisés.

## Corrigé

- CSRF du Catalogue et fin du spinner infini (v108).
- Remontage du Catalogue après navigation vers Finances / Équipe / Journal / Général.
- Fin du remount automatique sur toute mutation DOM en cas d’erreur réseau/backend.
- Aperçu `/reserver` isolé du localStorage client et ciblé sur l’écran édité.
- Synchronisation de l’aperçu quand l’onglet ou la famille catalogue change.
- Description client d’une configuration réellement affichée dans le tunnel.
- Ordre des configurations conservé selon `public_order`.
- Mapping vérifié des médias fournis : HN Canapé=exact-hn1, HN Chaise=exact-hn2, Bar=exact-cl1, Canapé Concept Libre=exact-cl2, Plateau=exact-cl3.
- Endpoint de découverte Stripe Payment Links protégé par authentification Studio.
- Vérificateurs production alignés sur les assets Studio courants v107/v3 et sans commits automatiques de statut vers `main`.

## Décisions/données encore nécessaires

- Aucun visuel source autoritatif de la configuration « Chaise » Concept Libre n’est présent dans `media.zip`; la v109 utilise donc un visuel studio neutre au lieu d’attribuer incorrectement `exact-cl3`.
- Aucun visuel source autoritatif « Connexio » n’est présent dans `media.zip`; le fallback existant reste non certifié par les fichiers fournis.
- Si plusieurs fournisseurs sont liés au même couple ville+format, le tunnel public n’expose aujourd’hui qu’une famille. Une règle métier explicite de fournisseur principal reste à définir avant de modifier ce comportement.
- Les anciens objets R2 remplacés et les visuels de configurations retirées ne disposent pas encore d’un garbage collector de références.
- Les visuels de configuration sont actuellement globaux par `(format_id, label)`, pas spécifiques à un fournisseur/studio. Une migration ne doit être faite que si Neptune veut des décors différents selon studio.
