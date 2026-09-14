# Neptune JT — configuration et exploitation

## URLs

- Landing page : `https://tv.neptunebusiness.com/neptune-jt/`
- Tunnel de pré-réservation : `https://tv.neptunebusiness.com/reserver/neptune-jt/`
- Confirmation Stripe : `https://tv.neptunebusiness.com/reserver/neptune-jt/confirmation/?session_id={CHECKOUT_SESSION_ID}`
- Studio Neptune JT : `https://tv.neptunebusiness.com/studio/neptune-jt`
- Conditions spécifiques : `https://media.neptunebusiness.com/cgv-neptune-jt.html`
- Payment Link : `https://buy.stripe.com/bJe28rcdngXw0586qi73G0d`

## Architecture front

La source de vérité des quatre surfaces Neptune JT est l'application **React / Next.js / TypeScript** située dans `react/neptune-jt` : landing, tunnel, confirmation de paiement et console Studio. `npm run build:react-surfaces` effectue l'export statique puis publie les pages vers leurs URLs historiques et les bundles sous `/neptune-jt-assets/_next/`.

Les anciens runtimes UI impératifs (`status-v184.js`, `assets/app.js`, `release-guard-v184.js`) sont supprimés du répertoire de déploiement pendant le build. Ils ne doivent plus être chargés en production. Le backend Worker, le Durable Object, Stripe, Resend et les règles 4/6 restent indépendants du framework front et constituent toujours la source de vérité métier.

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

La page de retour n'est jamais utilisée seule comme preuve de paiement : le Worker vérifie la Checkout Session côté serveur et le webhook Stripe reste la source de confirmation asynchrone. Le Studio ne propose volontairement aucun bouton « marquer payé » afin d'éviter de créer une divergence avec Stripe.

En cas de paiement anormal (lien utilisé après annulation, deuxième paiement, mauvaise situation de réservation, dépassement de capacité), le système ne valide pas silencieusement la place : il ouvre une alerte financière interne et demande un contrôle humain.

## Règles du tunnel

- 4 participants minimum.
- 6 participants maximum.
- La pré-réservation est gratuite.
- Une édition sans date future valide n'accepte aucune pré-réservation.
- À la 4e pré-réservation, les participants éligibles reçoivent automatiquement leur lien de paiement.
- Les 5e et 6e pré-réservations reçoivent également leur lien tant que l'édition est ouverte.
- Une place est confirmée uniquement après un paiement Stripe de 200 EUR TTC.
- À J-7, l'édition est maintenue uniquement si au moins 4 paiements sont confirmés.
- Si moins de 4 paiements sont confirmés à J-7, l'édition est annulée automatiquement.
- Aucun maintien manuel sous le seuil de 4 n'est autorisé : la règle publique, les CGV et le backend appliquent le même seuil.
- Si des paiements ont déjà été encaissés lors d'une annulation de l'édition, les participants sont prévenus et un e-mail interne demande le traitement des remboursements ou du report. Aucun remboursement financier n'est déclenché silencieusement par le Worker.

## Gestion des éditions depuis le Studio

La source de vérité opérationnelle est **Studio > Neptune JT**.

Depuis cet écran, un administrateur ou un éditeur peut :

- créer les prochaines éditions ;
- définir la date, l'heure, le lieu, le lien Stripe et des notes internes ;
- choisir l'édition active affichée dans le tunnel public ;
- modifier une édition existante ;
- fermer ou réouvrir les inscriptions ;
- annuler une édition avec garde-fou lorsqu'il existe des paiements à rembourser ou reporter ;
- archiver une édition terminée/annulée ;
- consulter les compteurs 4/6, les paiements confirmés et le CA encaissé ;
- consulter chaque dossier participant, son sujet, son CTA, sa source, son statut membre et son parrainage ;
- renvoyer l'e-mail utile à un participant ;
- déplacer un participant non payé vers une autre édition lorsque son état de paiement reste cohérent ;
- annuler une participation avec contrôle renforcé si un paiement existe ;
- exporter les participants en CSV.

Les rôles `admin` et `editor` peuvent agir. Le rôle `analyst` peut consulter sans modifier.

## Source de vérité et initialisation

Les paramètres d'exploitation courante ne sont pas stockés dans `wrangler.jsonc`. Le backend possède seulement des valeurs de repli pour amorcer la première édition si la base est vide.

Dès qu'une édition existe, sa date, son lieu, son statut, son cutoff J-7, son lien de paiement et le choix de l'édition active sont persistés dans le Durable Object du Studio et se gèrent depuis l'interface.

Il n'est donc pas nécessaire de modifier une configuration Cloudflare à chaque trimestre : une nouvelle édition se crée directement depuis **Studio > Neptune JT**.

## E-mails

Le système utilise le service Resend déjà configuré pour :

- confirmer la pré-réservation ;
- envoyer les liens de paiement au franchissement du seuil de 4 ;
- confirmer un paiement ;
- renvoyer manuellement l'e-mail utile depuis le Studio ;
- notifier une annulation automatique ou manuelle ;
- alerter Neptune lorsqu'un remboursement/report ou une anomalie Stripe doit être traité.

## Sécurité d'exploitation

- Les écritures Studio sont protégées par la session administrateur existante, le jeton CSRF et le contrôle same-origin.
- Les données d'authentification issues de la session serveur prennent priorité sur tout champ envoyé par le navigateur.
- Les actions destructrices demandent une confirmation dans l'interface et sont revalidées côté serveur.
- Un participant payé ne peut pas être déplacé automatiquement.
- Un participant ayant déjà reçu un lien de paiement ne peut pas être déplacé vers une édition où le paiement redeviendrait fermé.
- Une annulation contenant des paiements exige une confirmation explicite et ne simule jamais un remboursement Stripe.
- Le paiement reste confirmé uniquement par Stripe.
- Le tunnel public reste fermé lorsque l'état de l'édition ne peut pas être vérifié et applique un garde anti-robot léger en complément des validations serveur.
- L'export CSV neutralise les valeurs pouvant être interprétées comme des formules par un tableur.

## CGV

Le tunnel exige l'acceptation des CGV Neptune Media existantes **et** des conditions particulières Neptune JT. Le fichier `public/cgv-neptune-jt.html` complète les CGV générales sans écraser leur version source, qui n'est pas présente dans ce dépôt.
