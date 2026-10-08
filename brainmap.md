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
