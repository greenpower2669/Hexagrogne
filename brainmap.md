# Carte technique
- app/game-engine.ts : état et règles v15, coordonnées axiales, coups légaux, territoires, reproduction, évasions, anti-boucle et IA.
- app/queen-escape-context.ts : évaluation des sorties des reines.
- app/fab-hexa-game.tsx : orchestration React, menus/règles, sauvegardes et import/export.
- app/hex-board.tsx : plateau WebGL avec secours Canvas 2D, sélection pointer, figures et animations.
- app/game-effects.ts, game-intro.tsx, audio-system.ts : effets, intro et sons.
- app/self-play.ts, self-play-worker.ts : ligue et entraînement en tâche Worker.
- app/hexconv-brain.ts, ai-weight-modules.ts, human-training.ts, training-dataset.ts, t2-league-seed.ts : cerveaux, modules et corpus.
- app/match-history.ts, game-input-guard.ts, admin-animation-lab.ts : replays, garde tactile et laboratoire admin.
- public/ : 28 ressources statiques dont MP4, WebP, MP3, WASM et icônes ; app/*.json : données IA.
- tests/ : tests canoniques Work conservés.
- Android : entrée mobile/main.tsx + vite.mobile.config.ts → dist-mobile → Capacitor → android/.
- scripts/restore-assets.py : restauration ZIP contrôlée par manifeste.

- mobile/platform.ts : export JSON natif UTF-8 via Filesystem Cache + Share ; export Blob web conservé.
- Capacitor SystemBars gère les marges natives ; Back ferme les fenêtres puis demande avant quitter.
- scripts/prepare-android-assets.py : reprend les PNG V3 sans encodage ; workflow Android restaure le ZIP avant build.

- ANDROID-AUDIT.md : neuf points de l’audit source et portage ; assets-manifest.json : inventaire canonique.
- APK debug universelle minSdk 24 / target 36, versionCode 1 ; assets et bundle autonome embarqués.

8 octobre, ZIP déposé par Fab à la racine de main (ff05aa4). 29 assets téléchargés et vérifiés conformes. Workflow branche Android : URL raw immuable par défaut, entrées/variable personnalisées conservées. Aucun merge main ni Release.

- HEX-ANDROID-002 : `main` contient le ZIP complet V3 et les JSON originaux (noms exacts dans `docs/HEX-ANDROID-002.md`). Audit dédié : `.github/workflows/hex-android-002-audit.yml` télécharge les originaux à SHA `4d900a8f...`, contrôle ZIP, provenance (86 chemins/tailles/SHA-256), assets (29), JSON et importeurs réels, sans les incorporer à l'APK.
- Import corpus V2 et victoires humaines : `app/training-dataset.ts::importTrainingPayload` via panneau « Importer des fichiers », dédoublonnage puis entraînement HexConv T3 volontaire ; import pack IA T3 : `app/fab-hexa-game.tsx::importAi`, `app/ai-weight-modules.ts::importNamedWeightModules`, `app/self-play.ts::validateSelfPlayLeague`, bouton « Importer des modules ». Sources réseau non nécessaires au gameplay offline, sauvegardes existantes conservées jusqu'à action utilisateur.

- scripts/stage-fab-exports.py : contrôle SHA des trois exports Fab prélevés sur main figée, et copie uniquement au build dans public/fab-exports/ puis bundle Capacitor ; scripts/restore-assets.py reste exclusivement pour les 29 médias.
- app/fab-exports.ts : lecteur local validé par schéma/version ; app/ai-import-backup.ts : garde de snapshot IA ; deux boutons explicites ajoutés au panneau IA et apprentissage, sans auto-import.

9 octobre 2026 — HEX-ANDROID-002 CODE VALIDÉ : commit d1c4bddd1b51be8158e67c5ad6d7a5ade1d856f3, GitHub Actions https://github.com/greenpower2669/Hexagrogne/actions/runs/37857671752 SUCCESS ; 111/111 tests, typecheck, sync Capacitor, 29 assets validés et 3 exports Fab présents dans le bundle Android avec SHA-256 originaux, Gradle BUILD SUCCESSFUL. APK Hexagrogne-0.1.1-debug.apk, 18 904 566 octets, SHA-256 5761c81521b152c4789dfe3a6b817ca46e8f8e8da0d1e078cb900a71a9513de4. Artifact https://github.com/greenpower2669/Hexagrogne/actions/runs/37857671752/artifacts/11585041977 . Téléphone à vérifier : bouton corpus/880 décisions + bouton pack IA 1341 et rollback ; aucune installation réelle testée, pas de merge main / Release / AAB.
