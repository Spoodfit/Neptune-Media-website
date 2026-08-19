# WebTV smoothness v124

Objectif : supprimer les micro-saccades de la WebTV Neptune en traitant la cadence d'image, le débit de transport, la segmentation HLS et les collisions de cache après redémarrage.

Décisions :
- sortie antenne 720p25 au lieu de 720p30 ;
- débit vidéo 2,8 Mbit/s au lieu de 4 Mbit/s ;
- segments HLS de 2 s au lieu de 4 s ;
- fenêtre de 15 segments ;
- numérotation HLS basée sur epoch pour éviter de réutiliser une URL de segment après redémarrage ;
- écriture atomique des segments avec `temp_file` ;
- suppression de `append_list`, qui n'apporte rien puisque le manifeste est recréé au redémarrage.

Le patch de build `encoder-smoothness-v124.mjs` vérifie que chaque transformation correspond exactement une fois au moteur v118. Le build échoue si le moteur source change et que le patch n'est plus applicable, afin d'éviter un déploiement partiellement corrigé.
