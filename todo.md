# HEX-ANDROID-001 — APK livrée, à valider
## Fait
- Source Work V3 récupérée : 6c557735ed15a863835fbd35d41ef5cff2dd7c36 ; neuf modules centraux identiques.
- Code sur feature/android-apk-v1 ; cinq mémoires, audit, manifeste et build documentés.
- ZIP livré : 29 fichiers, 12 274 442 octets, CRC et SHA-256 validés ; aucun Base64.
- Bundle autonome + Worker/WASM ; Capacitor 8.5.3 ; export natif, Retour et marges système ; icône V3.
- 109 tests TS et test restauration ZIP réussis ; typecheck mobile propre ; revue indépendante intégrée.
- APK 0.1.0 compilée : 17 809 609 octets, SHA-256 9be1653af1886bb6e9f5e596390b0d0a4b7c9d3daa025d8b1db2ec860300eb8c. Signature v2 vérifiée ; bundle et assets APK comparés à la source finale.
## À tester
- Installation et exécution Android réelles, non effectuées ici.
## Bloqué
- Aucun blocage assets : ZIP présent dans main ff05aa4, URL immuable configurée dans le workflow. Prochain build CI à observer.
## Prochain
- Retour téléphone ; corriger les défauts observés puis préparer AAB/signature Play.
## Téléphone à vérifier
- Intro/audio ; cases tactiles ; 2–6 équipes ; replays/journaux ; sauvegarde après relance ; import/export ; rotation ; zones système ; gros texte ; charge IA.

## CI Android — 9 octobre 2026
- Échec initial du run 37840843176 : paquet SDK obsolète `tools` demandé implicitement par `android-actions/setup-android@v3`.
- Correction limitée au workflow : `packages: 'platform-tools'` ; 29 assets et URL ZIP immuable inchangés ; garder l'échec visible.
- [x] Run 37852407591 réussi : ZIP 29 SHA-256, `npm ci`, 109 tests, typecheck, Capacitor sync, Gradle assembleDebug et upload artefact.
- [x] Commit applicatif 35924958624beaf0da50510ba7a4e00bc75058a0 ; APK du run #37852407591 : 17 422 098 octets, SHA-256 14c23ac71c22a090ccee3e8442fdb63ea1a37e86ae436f226d40bee42f4fdd17.
- [ ] Téléphone à vérifier par Fab : installation, intro/audio, tactile, IA 2–6 équipes, sauvegardes/replays, import/export, orientation et lisibilité.
- [ ] AAB uniquement après validation téléphone ; aucun merge main ni Release.

9 octobre 2026 — GitHub Actions run #37852407591 (commit 35924958624beaf0da50510ba7a4e00bc75058a0) : SUCCESS. Étapes ZIP (29 assets, tailles et SHA-256), npm ci, 109 tests/109, typecheck, Capacitor sync, Gradle assembleDebug, renommage et upload artefact toutes GREEN. APK CI : Hexagrogne-0.1.0-debug.apk, 17 422 098 octets, SHA-256 14c23ac71c22a090ccee3e8442fdb63ea1a37e86ae436f226d40bee42f4fdd17. Artefact : https://github.com/greenpower2669/Hexagrogne/actions/runs/37852407591/artifacts/11582891444 . APK distincte de l'ancien build local. Installation et test du gameplay sur téléphone en attente de Fab. Aucune Release, aucun merge main.

# HEX-ANDROID-002 — 9 octobre 2026
## Fait
- [x] HEAD main et branche Android vérifiés, sources récentes préservées.
- [x] ZIP V3 complet : 12 646 880 octets, SHA-256 conforme, 86/86 inventoriés/tailles/empreintes, 29/29 assets originaux identiques.
- [x] Comparaison source : 45 identiques ; 6 modifiés ; 35 non suivis dans la branche Android (dont assets restaurables). Pas d'écrasement avec la source web.
- [x] Trois originaux JSON identifiés ; importeurs réels testés dans audit GitHub Actions 37855459563 : corpus 640, humains 240, modules Core/Queen Escape/HexConv et ligue 1341 ; re-import corpus 0 ajout/640 doublons.
- [x] Aucun changement applicatif nécessaire : référence APK 0.1.0 de CI 37852407591 inchangée ; compatibilité V3 package 3.1.1-t3 / règles 15 maintenue.
## À tester
- [ ] Tester sur téléphone les boutons d'import de deux JSON d'entraînement et du pack IA (après export de sauvegarde de Fab) ; confirmer affichages et persistance IndexedDB/localStorage.
- [ ] Vérifier l'espace libre et la restauration de la sauvegarde IA avant d'appliquer le pack 1341 : backup d'import existant susceptible d'échouer si localStorage plein.
## Bloqué
- Aucun blocage de structure JSON/ZIP ; adoption des nouveaux poids actifs non autorisée implicitement (action volontaire de Fab requise pour préserver son cerveau existant).
## Prochain
- Guider l'import manuel ; enregistrer les retours téléphone ; décider d'un éventuel durcissement de la sauvegarde d'import avant évolution de l'interface ; AAB après validation téléphone uniquement.
## Téléphone à vérifier
- Installation, vidéo/son, cases tactiles, IA 2–6 joueurs, règles V3, sauvegardes/replays, import/export JSON, rotation, lisibilité/zoom, zones système. Aucun test réel téléphone par l'assistant.
