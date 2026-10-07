# Plan HEX-ANDROID-001
But : vraie APK embarquant le jeu existant. Version initiale Android 0.1.0.
1. Copier app/ et tests/ depuis le commit Work identifié. Vérifier que game-engine.ts et les modules IA restent identiques.
2. Ajouter mobile/main.tsx et vite.mobile.config.ts pour React sans serveur Next/Vinext. Garder les dépendances existantes et le lock ; ajouter Capacitor 8.5.3 et plugins fichiers/partage/app.
3. Créer android/ via Capacitor ; reprendre icône V3 ; identité com.fab.hexagrogne ; adapter Retour, installation PWA et export JSON natif. Import via sélecteur de fichiers Capacitor.
4. scripts/restore-assets.py vérifie chemins et SHA-256 avant extraction. ZIP conserve public/ et app/ ; petits assets en Git, médias lourds externes.
5. Tester règles Work, vérifier bundle/Worker/WASM/médias puis compiler APK debug. Workflow Actions sans Release et sans merge ; AAB après téléphone.
Risques : localStorage distinct du navigateur (pas de migration implicite), blob downloads non natifs, pause audio/IA, ressources Worker/WASM, performance 6 IA, zones système/rotation.
Alternatives : WebView Java manuelle (plus de code de pont), réécriture native (risque gameplay injustifié). Capacitor conserve le moteur avec ponts maintenus.
Références : https://capacitorjs.com/docs/android ; https://capacitorjs.com/docs/apis/filesystem
