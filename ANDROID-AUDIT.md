# HEX-ANDROID-001 — audit du vrai projet Work

## 1. Source réellement retrouvée
Quatre Sites : FabHexaGrogne (hexa-royaumes, version 36), FabHexaGrogne (version 3), V2 (version 10), V3 (version 12, mise à jour le 30 août 2026). Source retenue : V3, la plus récente retrouvée, commit `6c557735ed15a863835fbd35d41ef5cff2dd7c36`, paquet `3.1.1-t3`. Archive du 26 août et fichier IA cycle 172 également retrouvés ; ils ne remplacent pas cette source. GitHub main vérifié au commit `ccd13087ca559076fe6a08af870d422cee1ccf60`, contenant LICENSE et README seulement.

## 2. Technologie
TypeScript/React 19, Next 16 et Vinext/Vite pour le site. Le jeu est côté client : aucune API distante nécessaire à la partie. Plateau WebGL, secours Canvas 2D, coordonnées axiales. Événements pointer utilisables souris et tactile. Audio WebAudio + MP3, vidéo MP4 et poster WebP. Polices système uniquement. Worker d’auto-jeu, WebAssembly de scoring et données JSON IA.

## 3. Architecture et canon
`game-engine.ts` : règles v15, plateau rayon 5, 2–6 colonies, roi/reine/pion/œuf. Territoires polygonaux, richesse et capacité de population, ponte sûre, éclosion en trois tours, saut/acide de reine, explosion d’œuf sans chaîne, promotion et fertilisation en cocon, échec/mat/évasion, anti-boucle/zombie et analyse contextuelle. Aucun de ces mécanismes n’est simplifié.
`fab-hexa-game.tsx` orchestre plateau, nouvelle partie, règles, panneau audio, journaux, historique/replays, victoire et atelier administrateur. Les modules IA Core, Queen Escape, HexConv et corpus T2 sont conservés.
Les sauvegardes et paramètres passent par localStorage : partie, poids, ligue, corpus, replays, mode audio, volumes, puissance d’entraînement. Les exports/imports JSON existants sont conservés. Une installation Android crée son propre stockage ; aucune migration automatique du navigateur n’est annoncée.
Animations : WebGL/Canvas, cocons, acide, œufs, évasions, zombies, effets de colonies et introduction. Neuf modules centraux comparés octet par octet à Work, sans changement, dont moteur, rendu, Worker et cerveaux.

## 4. Assets
29 fichiers, 12 358 775 octets non compressés ; ZIP 12 274 442 octets.
- 16 PNG et 5 SVG : icônes V1/V2/V3, image sociale et ressources d’origine.
- 1 ICO, 1 WebP (poster), 1 MP4 (intro), 1 MP3 (musique).
- 1 WASM, 1 JSON (ligue cycle 172), 1 manifest PWA, 1 service worker.
Aucune police externe. Beaucoup de sons/animations sont procéduraux, donc restent dans le code.
Le manifeste détaille chaque chemin, taille et SHA-256. Aucune conversion Base64 ni optimisation média.

## 5. Portage retenu
Capacitor 8.5.3 avec bundle React/Vite autonome embarqué. Réutilisés : moteur, rendu, IA, Worker, WASM, audio, animations, règles, menus, données. Adaptés : point d’entrée sans serveur, partage JSON natif, Retour Android, visibilité Worker, marges système, installation PWA désactivée en natif. Remplacée pour le build Android : couche serveur Next/Vinext par entrée statique ; aucun remplacement de gameplay.
Alternative WebView Java seule : plus de code de pont à maintenir. Réécriture native : risque inutile de divergence. Capacitor permet APK et future chaîne AAB sur le même projet Gradle.
Sources techniques : https://capacitorjs.com/docs/android ; https://capacitorjs.com/docs/apis/filesystem.

## 6. Risques et validation
À vérifier sur téléphone : charge de six IA et entraînement, WebGL/Canvas, audio après interruption, sélection sur écran étroit, rotation et gros texte, sauvegarde après arrêt, import/export Android et feuille de partage. Pas de téléphone ni émulateur utilisé pour cette validation initiale. Signature et AAB Play seront traités après validation APK.
Typage Work préexistant corrigé dans UI (refs React, état AudioContext) et garde d’une case vide en situation d’échec ; moteur intact. Des erreurs de typage historiques restent dans un ancien test de ligue, distinctes du typecheck mobile ; les tests s’exécutent sans échec.

## 7. Arborescence Git
- `app/` : moteur, UI, rendu, IA et données ; `mobile/` : entrée et pont plateforme.
- `public/` : ressources restaurées du ZIP ; textes/SVG suivis, binaires transportés par ZIP.
- `android/` : projet Gradle et identité `com.fab.hexagrogne`.
- `tests/`, `scripts/`, `.github/workflows/android.yml` : contrôles, restauration et build.
- `assets-manifest.json`, `capacitor.config.ts`, `vite.mobile.config.ts` et lock npm.
- cinq mémoires vivantes, README, plan et cet audit.

## 8. ZIP
`Hexagrogne-assets.zip` conserve `public/intro/`, `public/audio/`, `public/icons/`, les ressources racine de `public/` et `app/fabhexagrogne-ai-league-cycle-172.json`, plus `assets-manifest.json`. Le script refuse tout fichier ajouté, manquant, modifié ou chemin interdit avant d’écrire. Les icônes Android sont copiées depuis les PNG du ZIP par un script, sans changement des originaux.

## 9. Plan vers APK
Source retrouvée → branche dédiée → sauvegarde des sources et ZIP → bundle mobile → pont Android → tests/rendu → compilation debug → APK nommée → test Fab sur téléphone. Ensuite seulement préparation AAB/signature. Aucun merge main ni Release autorisé.
Résultats et statut de compilation à consulter dans `todo.md` ; ne pas confondre build réussi et validation téléphone.

## Livraison initiale
APK 0.1.0 : 17 809 609 octets, SHA-256 `9be1653af1886bb6e9f5e596390b0d0a4b7c9d3daa025d8b1db2ec860300eb8c`. Signature APK v2 vérifiée, bundle et 28 ressources public conformes aux sources. 109 tests TypeScript et contrôle de types mobile réussis. Android réel à valider par Fab.
