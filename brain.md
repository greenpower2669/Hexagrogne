# Hexagrogne — contrat vivant
Référence : Work FabHexaGrogne V3, package 3.1.1-t3 ; source 6c557735ed15a863835fbd35d41ef5cff2dd7c36. La V3 est la version Work la plus récente retrouvée.
Moteur TypeScript rulesVersion 15, plateau rayon 5, 2–6 colonies humaines/IA. Roi/reine/pion/œuf, territoires et potentiel, éclosion, promotion, acide, cocons, échec/mat/évasion, zombies anti-boucle : à conserver.
React/WebGL/Canvas/CSS et audio WebAudio ; IA Core/Queen Escape/HexConv, entraînement Worker et WASM. Persistance locale : partie, poids, historique, corpus, options audio.
Choix Android : Capacitor 8, bundle Vite autonome embarqué ; aucun serveur Work nécessaire au gameplay. Pas de réécriture moteur.
Assets : 29 fichiers d’origine avec manifeste SHA-256, ZIP unique ; noms et qualité conservés.

9 modules canoniques comparés octet par octet sans changement, dont moteur et rendu WebGL. Corrections UI ciblées : garde occupant absent et types React/AudioContext. Typecheck mobile propre ; 109 tests exécutés avec succès.

Livraison initiale Android : APK 0.1.0, 17 809 609 octets ; SHA-256 9be1653af1886bb6e9f5e596390b0d0a4b7c9d3daa025d8b1db2ec860300eb8c. Signature v2 et bundle final vérifiés, validation téléphone en attente.
