# Diagnostics importants
8 octobre : plusieurs Sites homonymes trouvés. V3 (dernière modification 30 août, version Sites 12) récupérée directement ; ancienne archive du 26 août non utilisée pour remplacer sa source.
Environnement local : Java 17 présent, SDK Android et Gradle non trouvés aux emplacements usuels. Compilation à préparer, aucun APK annoncé.

Le typage strict révèle des défauts déjà présents dans Work : useRef sans valeur initiale (React 19), rétrécissement de type AudioContext après await, occupant potentiellement absent lors d’un toucher en échec. Corrections ciblées de types/présence, moteur inchangé. Le typecheck mobile passe ; les tests historiques ont encore des erreurs de types (unknown dans un test de ligue), leur exécution passe.
Gradle : téléchargement Java direct impossible dans cet environnement ; curl fonctionne. Diagnostic proxy en cours. Push Git direct sans identifiants ; connecteur GitHub à utiliser pour les textes, binaires via ZIP uniquement.

Revue indépendante : Retour historique manquant corrigé (ferme replay et journal) ; configuration générée resynchronisée, SystemBars native confirmé. Gradle installé directement via curl puis proxy explicite pour résolution Maven : configure maintenant les projets, compilation en cours.

Compilation Android obtenue après installation Gradle directe et proxy Maven explicite ; APK produite. Les temporaires d’outillage/logs ont été perdus lors du renouvellement du conteneur ; l’APK et le bundle conservés sont comparés byte-à-byte. Signature v2 RSA/SHA-256 et tous les blocs vérifiés cryptographiquement. Aucun test sur appareil/émulateur ; aucune prétention de validation téléphone.

8 octobre, ZIP déposé par Fab à la racine de main (ff05aa4). 29 assets téléchargés et vérifiés conformes. Workflow branche Android : URL raw immuable par défaut, entrées/variable personnalisées conservées. Aucun merge main ni Release.

9 octobre 2026 — HEX-ANDROID-001 / CI GitHub Actions : run 37840843176, job 113529509126, échec de android-actions/setup-android@v3 sur `sdkmanager tools` (`Failed to find package 'tools'`). Les licences sont acceptées ; l'action v3 spécifie par défaut `tools platform-tools`, le paquet `tools` n'est plus disponible. Correctif minimal dans `.github/workflows/android.yml` : `packages: 'platform-tools'` (sans `tools`). Gradle AGP 8.13.0 et compileSdk/targetSdk 36 déjà vérifiés dans le dépôt ; pas de mise à niveau ni de modification gameplay/assets. Les étapes ZIP/npx/npm/Gradle non exécutées par le run en échec : résultat du nouveau run à contrôler ; APK CI et téléphone NON validés à cette étape.
