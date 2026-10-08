# Hexagrogne — contrat vivant
Référence : Work FabHexaGrogne V3, package 3.1.1-t3 ; source 6c557735ed15a863835fbd35d41ef5cff2dd7c36. La V3 est la version Work la plus récente retrouvée.
Moteur TypeScript rulesVersion 15, plateau rayon 5, 2–6 colonies humaines/IA. Roi/reine/pion/œuf, territoires et potentiel, éclosion, promotion, acide, cocons, échec/mat/évasion, zombies anti-boucle : à conserver.
React/WebGL/Canvas/CSS et audio WebAudio ; IA Core/Queen Escape/HexConv, entraînement Worker et WASM. Persistance locale : partie, poids, historique, corpus, options audio.
Choix Android : Capacitor 8, bundle Vite autonome embarqué ; aucun serveur Work nécessaire au gameplay. Pas de réécriture moteur.
Assets : 29 fichiers d’origine avec manifeste SHA-256, ZIP unique ; noms et qualité conservés.

9 modules canoniques comparés octet par octet sans changement, dont moteur et rendu WebGL. Corrections UI ciblées : garde occupant absent et types React/AudioContext. Typecheck mobile propre ; 109 tests exécutés avec succès.

Livraison initiale Android : APK 0.1.0, 17 809 609 octets ; SHA-256 9be1653af1886bb6e9f5e596390b0d0a4b7c9d3daa025d8b1db2ec860300eb8c. Signature v2 et bundle final vérifiés, validation téléphone en attente.

8 octobre, ZIP déposé par Fab à la racine de main (ff05aa4). 29 assets téléchargés et vérifiés conformes. Workflow branche Android : URL raw immuable par défaut, entrées/variable personnalisées conservées. Aucun merge main ni Release.

9 octobre 2026 — GitHub Actions run #37852407591 (commit 35924958624beaf0da50510ba7a4e00bc75058a0) : SUCCESS. Étapes ZIP (29 assets, tailles et SHA-256), npm ci, 109 tests/109, typecheck, Capacitor sync, Gradle assembleDebug, renommage et upload artefact toutes GREEN. APK CI : Hexagrogne-0.1.0-debug.apk, 17 422 098 octets, SHA-256 14c23ac71c22a090ccee3e8442fdb63ea1a37e86ae436f226d40bee42f4fdd17. Artefact : https://github.com/greenpower2669/Hexagrogne/actions/runs/37852407591/artifacts/11582891444 . APK distincte de l'ancien build local. Installation et test du gameplay sur téléphone en attente de Fab. Aucune Release, aucun merge main.

HEX-ANDROID-002 (09/10/2026) : le ZIP Work V3 complet (package 3.1.1-t3, source 6c557735ed15a863835fbd35d41ef5cff2dd7c36) est authentifié SHA-256 43ab0a532959ef6f11f7898e6c7be0faf1d477c5cbd58dfc0cb106f2f7a995ca ; 86 fichiers inventoriés/contrôlés, 29 assets identiques. Aucun changement de version du moteur. Trois exports Fab sur main (2026-10-08) : cerveau T3 cycle 1341 et trois modules compatibles, corpus V2 640 décisions et six victoires humaines 240 frames (v15). Les importeurs déjà en place fonctionnent ; conservation de l'APK 0.1.0, import uniquement après action volontaire de Fab, sans initialisation automatique des données du téléphone. Audit : https://github.com/greenpower2669/Hexagrogne/actions/runs/37855459563 .
