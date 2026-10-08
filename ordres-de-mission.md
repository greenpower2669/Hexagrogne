# Ordres de mission
## HEX-ANDROID-001 — 8 octobre 2026 — APK livrée, à valider sur téléphone
Porter le vrai projet Work vers Android sans recréation ni changement des règles. Source récupérée : FabHexaGrogne V3, commit 6c557735ed15a863835fbd35d41ef5cff2dd7c36.
Livrer Hexagrogne-<version>-debug.apk ; préparer une architecture AAB, sa chaîne sera finalisée après validation téléphone.
Un seul Hexagrogne-assets.zip avec tous les vrais fichiers, aucun transport Base64, aucune optimisation média demandée. Fab déposera le ZIP en Release.
Branche feature/android-apk-v1 depuis main ccd13087ca559076fe6a08af870d422cee1ccf60. Aucun merge main ni publication de Release sans ordre explicite.
Préserver plateau, proportions, tactile, lisibilité, animations, sauvegardes, menus, options. Boutons compacts. Mémoires courtes synchronisées.

Preuve : Hexagrogne-0.1.0-debug.apk, 17 809 609 octets, SHA-256 9be1653af1886bb6e9f5e596390b0d0a4b7c9d3daa025d8b1db2ec860300eb8c. Signature APK v2 et contenu embarqué vérifiés. Installation/exécution Android réelle en attente du test de Fab ; HEX-ANDROID-001 reste à valider.

8 octobre, ZIP déposé par Fab à la racine de main (ff05aa4). 29 assets téléchargés et vérifiés conformes. Workflow branche Android : URL raw immuable par défaut, entrées/variable personnalisées conservées. Aucun merge main ni Release.
