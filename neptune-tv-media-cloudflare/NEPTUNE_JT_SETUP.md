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
- Si des paiements ont déjà été encaissés lors d'une annulation de l'édition par Neptune, les participants sont prévenus et une demande de remboursement canonique est créée dans Studio. Le remboursement Stripe reste une action financière contrôlée ; le report nécessite l'accord du client.
- Une annulation demandée par le participant après paiement reste non remboursable conformément aux conditions particulières Neptune JT. Cette situation est distinguée d'une annulation décidée par Neptune.

## Synchronisation avec le cœur Studio

Une réservation JT conserve les données spécifiques à l'émission — édition, sujet, contexte, CTA, parrainage et statut éditorial — mais un paiement Stripe validé est également matérialisé dans les objets canoniques Studio.

Après confirmation vérifiée d'un paiement de 200 EUR :

- le client est créé ou réutilisé dans `portal_clients` à partir de son e-mail ;
- une seule commande `portal_orders` est créée pour la Checkout Session Stripe, avec `product_code=neptune-jt` ;
- la commande est initialisée avec le workflow Studio existant via `syncSteps` ;
- la participation JT conserve `portal_client_id`, `portal_order_id` et `canonical_materialized_at` ;
- la date de tournage de l'édition est synchronisée vers la commande Studio lorsque l'édition est modifiée ;
- les anciens paiements JT vérifiés à 200 EUR et disposant d'une Checkout Session sont rattachés de façon additive lorsqu'ils n'ont pas encore de commande canonique.

La Checkout Session Stripe reste l'identifiant financier externe unique : une collision avec une autre commande n'est jamais relinkée silencieusement.

Le coût REC BOX reste un coût collectif de production et n'est pas dupliqué artificiellement comme une charge fournisseur par participant JT.

## Mois Neptune offert

Le bénéfice « 1 mois Neptune offert » est réservé aux participants déclarés **non-membres** dans le tunnel.

Dès que le paiement Stripe est réellement confirmé, l'e-mail de confirmation de place contient le code promotionnel :

`NEPTUNEJT`

Le code n'est pas affiché sur la landing page ni dans le tunnel avant paiement. Le même e-mail est protégé par une clé d'idempotence stable afin qu'un webhook Stripe et une réconciliation depuis la page de confirmation ne provoquent pas deux envois distincts.

La présente intégration gère l'éligibilité et l'envoi du code. L'existence, la durée, les restrictions et la validité commerciale du code dans le moteur d'abonnement Neptune Business doivent rester configurées dans le système qui consomme ce code ; ce dépôt Neptune Media n'en est pas la source de vérité.

## Gestion des éditions depuis le Studio

La source de vérité opérationnelle est **Studio > Neptune JT**.

Le Studio lit la même base que le tunnel public, Stripe et le traitement J-7. L'écran se resynchronise automatiquement toutes les 10 secondes tant que l'onglet est visible et immédiatement au retour sur l'onglet ou au focus de la fenêtre. Les réponses concurrentes sont traitées en « latest request wins » afin qu'un rafraîchissement plus ancien ne puisse pas écraser un état plus récent.

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
- enregistrer explicitement une annulation demandée par le participant ou une annulation décidée par Neptune ;
- exporter les participants en CSV.

Les rôles `admin` et `editor` peuvent agir. Le rôle `analyst` peut consulter sans modifier.

## Source de vérité et initialisation

Les paramètres d'exploitation courante ne sont pas stockés dans `wrangler.jsonc`. Le backend possède seulement des valeurs de repli pour amorcer la première édition si la base est vide.

Dès qu'une édition existe, sa date, son lieu, son statut, son cutoff J-7, son lien de paiement et le choix de l'édition active sont persistés dans le Durable Object du Studio et se gèrent depuis l'interface.

Il n'est donc pas nécessaire de modifier une configuration Cloudflare à chaque trimestre : une nouvelle édition se crée directement depuis **Studio > Neptune JT**.

## E-mails — matrice de déclenchement auditée

Tous les e-mails Neptune JT passent par le service Resend existant, avec clés d'idempotence et politique de retry du service d'e-mail. Les événements actifs sont :

| Événement | Destinataire | Contenu / règle |
| --- | --- | --- |
| Pré-réservation avant le seuil | Participant | Confirmation, compteur vers 4, absence de paiement immédiat, lien personnel de partage, rappel du contrôle J-7. |
| 4e pré-réservation | Participants éligibles | Le mail de paiement 200 € TTC remplace le simple accusé pour éviter deux mails successifs au 4e participant. |
| 5e / 6e pré-réservation lorsque le paiement est ouvert | Nouveau participant | Lien de paiement 200 € TTC et rappel du maximum de 6. |
| Paiement Stripe confirmé | Participant concerné | Place payée/confirmée, rappel du J-7 ; pour un non-membre, envoi du code `NEPTUNEJT` donnant accès au mois Neptune offert. |
| Renvoi manuel depuis Studio | Participant concerné | Renvoi du message correspondant à son état réel. Si l'état est payé et le participant est non-membre, le code promo est inclus. |
| Déplacement vers une autre édition | Participant déplacé | Message dédié avec nouvelle édition, date/lieu et lien de paiement seulement si le paiement est effectivement ouvert. |
| Annulation demandée par le participant | Participant | Si payé : rappel explicite du caractère non remboursable de cette annulation à son initiative. Si non payé : aucun paiement dû. |
| Annulation d'une participation par Neptune | Participant | Si payé : remboursement ou report uniquement avec accord du client. Si non payé : aucun paiement dû. |
| Annulation complète décidée par Neptune | Tous les participants concernés | Motif d'annulation ; remboursement des montants encaissés ou report uniquement avec accord du client. |
| Annulation automatique à J-7 | Tous les participants concernés | Motif explicite : moins de 4 paiements confirmés à J-7 ; remboursement/report pour les dossiers payés. |
| Édition annulée avec paiements encaissés | `contact@neptunebusiness.com` | Alerte d'action : remboursements Stripe ou reports à convenir explicitement. |
| Anomalie de paiement Stripe | `contact@neptunebusiness.com` | Alerte financière avec participant, réservation, session Stripe, montant correctement formaté en euros et contrôle humain requis. |

Les actions qui ne nécessitent pas de communication client — création/modification d'édition, activation, fermeture/réouverture des inscriptions, archivage — n'envoient pas d'e-mail automatiquement.

## Remboursements

Une annulation décidée par Neptune ou par le cutoff J-7 sur un dossier payé crée une entrée `portal_refund_requests` et place la commande Studio en `refund_pending`.

Cette étape représente une **demande de remboursement à traiter**, pas la preuve que Stripe a déjà remboursé la transaction. Le système ne marque donc jamais un paiement « remboursé » sans exécution/réconciliation financière réelle. Le report vers une autre édition doit être accepté explicitement par le client.

Une annulation demandée par le participant après paiement ne crée pas de demande de remboursement automatique.

## Sécurité d'exploitation

- Les écritures Studio sont protégées par la session administrateur existante, le jeton CSRF et le contrôle same-origin.
- Les données d'authentification issues de la session serveur prennent priorité sur tout champ envoyé par le navigateur.
- Les actions destructrices demandent une confirmation dans l'interface et sont revalidées côté serveur.
- L'origine d'une annulation individuelle (`participant` ou `neptune`) est obligatoire côté serveur ; une demande ambiguë est refusée.
- Un participant payé ne peut pas être déplacé automatiquement.
- Un participant ayant déjà reçu un lien de paiement ne peut pas être déplacé vers une édition où le paiement redeviendrait fermé.
- Une annulation décidée par Neptune contenant des paiements exige une confirmation explicite et ne simule jamais un remboursement Stripe.
- Une annulation demandée par le participant n'ouvre pas d'alerte de remboursement automatique.
- Après une annulation individuelle, le statut de l'édition est recalculé afin de ne pas continuer à afficher « maintenue » si le nombre de paiements confirmés repasse sous 4.
- Le paiement reste confirmé uniquement par Stripe.
- Le tunnel public reste fermé lorsque l'état de l'édition ne peut pas être vérifié et applique un garde anti-robot léger en complément des validations serveur.
- L'export CSV neutralise les valeurs pouvant être interprétées comme des formules par un tableur.

## CGV et consentements

Le tunnel exige l'acceptation des CGV Neptune Media existantes **et** des conditions particulières Neptune JT. Le fichier `public/cgv-neptune-jt.html` complète les CGV générales sans écraser leur version source, qui n'est pas présente dans ce dépôt.

Les conditions particulières distinguent correctement :

- l'annulation de l'édition par Neptune faute de minimum, qui entraîne le remboursement sauf report accepté expressément ;
- l'annulation, le désistement ou l'absence du participant après paiement, qui n'ouvre pas droit à remboursement ;
- le mois Neptune offert aux non-membres, fourni au moyen d'un code promotionnel envoyé après confirmation effective du paiement.

Les participations JT conservent également une version explicite des conditions et de l'autorisation média associées à l'acceptation afin d'éviter de dépendre uniquement d'une URL dont le contenu peut évoluer.
