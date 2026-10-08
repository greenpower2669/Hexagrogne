# HEX-ANDROID-002 — Provenance V3 et méthode sûre pour les exports

Date : 9 octobre 2026. Branche : `feature/android-apk-v1`.

## Source authentifiée

- `main` de récupération : `4d900a8fe71d87749fd5bae4a9f807724606cdc9`.
- Archive `Hexagrogne-V3-complet.zip` : **12 646 880 octets**, SHA-256 `43ab0a532959ef6f11f7898e6c7be0faf1d477c5cbd58dfc0cb106f2f7a995ca`.
- `EXPORT-V3.json` : package `3.1.1-t3`, source Work `6c557735ed15a863835fbd35d41ef5cff2dd7c36`, 86 fichiers (chemins, tailles, SHA-256 vérifiés).
- Comparaison au code Android versionné, avant restauration des assets : 45 fichiers identiques, 6 différents (`.gitignore`, `README.md`, `app/fab-hexa-game.tsx`, `app/game-intro.tsx`, `package-lock.json`, `package.json`) et 35 absents de la branche (assets restaurés pendant le build et fichiers propres au web). Les 29 assets attendus sont identiques au manifeste Android.
- Ne jamais confondre l'archive de source V3 et `Hexagrogne-assets.zip` : seul ce dernier est pris en charge par `scripts/restore-assets.py`.

## JSON d'origine sur main (fichiers intacts)

| Fichier | Taille | Données | Import dans l'application |
| --- | ---: | --- | --- |
| [FabHexaGrogne-IA-ligue-cycle-1341.json](https://github.com/greenpower2669/Hexagrogne/blob/4d900a8fe71d87749fd5bae4a9f807724606cdc9/FabHexaGrogne-IA-ligue-cycle-1341.json) | 1 933 080 | Pack IA format 9 ; T3 ; league cycle 1341 ; modules Core, Queen Escape, HexConv | « Importer des modules » |
| [FabHexaBrain-V2-corpus-2026-10-08.json](https://github.com/greenpower2669/Hexagrogne/blob/4d900a8fe71d87749fd5bae4a9f807724606cdc9/FabHexaBrain-V2-corpus-2026-10-08.json) | 11 421 819 | Corpus V2, rulesVersion 15, 640 décisions | « Importer des fichiers » |
| [FabHexaGrogne-victoires-humaines-2026-10-08.json](https://github.com/greenpower2669/Hexagrogne/blob/4d900a8fe71d87749fd5bae4a9f807724606cdc9/FabHexaGrogne-victoires-humaines-2026-10-08.json) | 4 951 321 | 6 victoires, 240 frames, rulesVersion 15 | « Importer des fichiers » |

Audit effectif : [GitHub Actions run #37855459563](https://github.com/greenpower2669/Hexagrogne/actions/runs/37855459563). Le test invoque les vrais parseurs TypeScript sans écrire ni dans localStorage ni dans IndexedDB. Corpus : 640 importés ; humain : 240 ajoutés ; réimport du corpus : 640 doublons détectés, 0 ajout. Les modules IA sont tous acceptés, sans module inconnu, ligue cycle 1341 reconnue.

## Chargement volontaire (aucun préchargement silencieux)

1. Conserver d'abord une copie des exports et données déjà présentes sur le téléphone (y compris cerveau actif).
2. Télécharger les JSON individuellement depuis leurs liens GitHub ci-dessus sur le téléphone.
3. Dans le panneau d'entraînement, choisir **Importer des fichiers** et sélectionner corpus V2 puis victoires humaines (un par un ou ensemble). Les décisions sont dédoublonnées, sans lancement automatique de l'entraînement.
4. Le bouton **Entraîner HexConv T3**, séparé, modifie les poids : ne l'utiliser qu'après décision explicite.
5. Si Fab souhaite remplacer/adapter sa ligue active, choisir **Importer des modules** puis le pack cycle 1341. L'import est volontaire et tente de sauvegarder l'état IA précédent ; **attention**, le mécanisme actuel ne bloque pas l'import si la sauvegarde locale manque de place. Sauvegarder manuellement les données en amont. Le bouton « Annuler l'import » dépend de cette sauvegarde.
6. Contrôler les données après fermeture/réouverture, en particulier le stockage mobile, les sauvegardes et les replays.

## Statut Android

Aucun code du jeu, aucun asset ni versionCode/versionName n'ont été modifiés pour HEX-ANDROID-002. APK de référence existante : [run #37852407591](https://github.com/greenpower2669/Hexagrogne/actions/runs/37852407591), `Hexagrogne-0.1.0-debug.apk`, 17 422 098 octets, SHA-256 `14c23ac71c22a090ccee3e8442fdb63ea1a37e86ae436f226d40bee42f4fdd17`. La validation sur téléphone reste à faire, puis AAB éventuel. Pas de merge main, pas de Release.
