# Hexagrogne Android
Portage fidèle de FabHexaGrogne V3 présent dans Work (source `6c557735ed15a863835fbd35d41ef5cff2dd7c36`, paquet 3.1.1-t3). Android 0.1.0 / `com.fab.hexagrogne`.

Le moteur TypeScript rulesVersion 15 et les modules IA sont conservés. React + WebGL/Canvas 2D, WebAudio, Worker et WASM sont embarqués hors ligne dans Capacitor 8.5.3. L’hébergement Work n’est pas requis au lancement.

## Reconstruction
Prérequis : Node 24, Python 3, JDK 21, SDK Android 36/build-tools 36, Gradle 8.14.3.
1. Télécharger le vrai `Hexagrogne-assets.zip` fourni par Fab.
2. `python3 scripts/restore-assets.py /chemin/Hexagrogne-assets.zip` (29 fichiers vérifiés avec le manifeste SHA-256 versionné).
3. `npm ci`
4. `npm test` puis `npm run typecheck`
5. `npm run android:sync`
6. `gradle -p android assembleDebug`
7. Copier `android/app/build/outputs/apk/debug/app-debug.apk` en `Hexagrogne-0.1.0-debug.apk`.

Le wrapper JAR et les images générées Android ne sont pas transportés par API/Base64 : Gradle installé suffit ; `gradle -p android wrapper` peut régénérer le wrapper. Les icônes sont restaurées depuis les vrais PNG du ZIP.

## GitHub Actions
Après dépôt manuel du ZIP en Release, définir la variable de dépôt `HEXAGROGNE_ASSETS_URL` avec son URL HTTPS puis relancer le workflow. Le workflow produit une APK de test, sans publier de Release ni merger main. L’entrée `assets_url` est également prévue pour un lancement manuel lorsque GitHub rend ce workflow disponible.

## Données et téléphone
Sauvegardes locales propres à l’application : celles du navigateur Work ne migrent pas automatiquement. Import/export IA et corpus conservés ; export natif par feuille de partage. Android 7+ avec WebView récente. Orientations autorisées, zones système gérées nativement. Icône originale V3.

À valider sur téléphone : intro/audio, sélection des cases, 2–6 colonies, replays, sauvegarde après arrêt, import/export, rotation, gros texte et charge IA. La production AAB et la signature Play seront préparées après validation, sur la même architecture Gradle.

Voir `ordres-de-mission.md`, `brain.md`, `brainmap.md`, `debughistorical.md`, `todo.md` et `ANDROID-PLAN.md`.
