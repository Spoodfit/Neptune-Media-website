# Neptune JT — configuration de lancement

## URLs

- Landing page : `https://tv.neptunebusiness.com/neptune-jt/`
- Tunnel de pré-réservation : `https://tv.neptunebusiness.com/reserver/neptune-jt/`
- Confirmation Stripe : `https://tv.neptunebusiness.com/reserver/neptune-jt/confirmation/?session_id={CHECKOUT_SESSION_ID}`
- Conditions spécifiques : `https://media.neptunebusiness.com/cgv-neptune-jt.html`
- Payment Link : `https://buy.stripe.com/bJe28rcdngXw0586qi73G0d`

## Stripe

Dans le Payment Link Neptune JT :

1. Choisir **Ne pas afficher la page de confirmation**.
2. Choisir **Redirigez les clients vers votre site Web**.
3. Renseigner exactement :

   `https://tv.neptunebusiness.com/reserver/neptune-jt/confirmation/?session_id={CHECKOUT_SESSION_ID}`

Le tunnel ajoute à chaque URL de paiement :

- `client_reference_id=NPJTE_<reservation_uuid>` pour rattacher le paiement à la bonne pré-réservation ;
- `locked_prefilled_email=<email>` ;
- les paramètres UTM Neptune JT.

La page de retour n'est jamais utilisée seule comme preuve de paiement : le Worker vérifie la Checkout Session côté serveur et le webhook Stripe reste la source de confirmation asynchrone.

## Règles du tunnel

- 4 participants minimum.
- 6 participants maximum.
- La pré-réservation est gratuite.
- À la 4e pré-réservation, les 4 participants reçoivent automatiquement leur lien de paiement.
- Les 5e et 6e pré-réservations reçoivent également leur lien tant que l'édition est ouverte.
- Une place est confirmée uniquement après un paiement Stripe de 200 EUR TTC.
- À J-7, si moins de 4 paiements sont confirmés, l'édition passe automatiquement en `cancelled` et les participants sont prévenus.
- Si des paiements ont déjà été encaissés lors d'une annulation de l'édition, un e-mail interne demande le traitement des remboursements. Le remboursement n'est volontairement pas déclenché sans contrôle humain.

## Date obligatoire avant ouverture publique

Configurer `NEPTUNE_JT_EVENT_AT` dans `wrangler.jsonc` au format ISO 8601. Exemple :

`2026-10-08T13:30:00+02:00`

Le Worker calcule automatiquement le cutoff J-7. Tant que cette variable est vide, le tunnel fonctionne mais l'annulation automatique J-7 reste inactive afin de ne pas inventer une date.

Pour chaque nouvelle édition, changer également `NEPTUNE_JT_EDITION_ID` afin d'ouvrir un nouveau compteur et de conserver l'historique de l'édition précédente.

## E-mails

Le système utilise le service Resend déjà configuré pour :

- confirmer la pré-réservation ;
- envoyer les liens de paiement au franchissement du seuil de 4 ;
- confirmer un paiement ;
- notifier une annulation à J-7.

## CGV

Le tunnel exige l'acceptation des CGV Neptune Media existantes **et** des conditions particulières Neptune JT. Le fichier `public/cgv-neptune-jt.html` complète les CGV générales sans écraser leur version source, qui n'est pas présente dans ce dépôt.
