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
