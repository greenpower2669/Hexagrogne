# Diagnostics importants
8 octobre : plusieurs Sites homonymes trouvés. V3 (dernière modification 30 août, version Sites 12) récupérée directement ; ancienne archive du 26 août non utilisée pour remplacer sa source.
Environnement local : Java 17 présent, SDK Android et Gradle non trouvés aux emplacements usuels. Compilation à préparer, aucun APK annoncé.

Le typage strict révèle des défauts déjà présents dans Work : useRef sans valeur initiale (React 19), rétrécissement de type AudioContext après await, occupant potentiellement absent lors d’un toucher en échec. Corrections ciblées de types/présence, moteur inchangé. Le typecheck mobile passe ; les tests historiques ont encore des erreurs de types (unknown dans un test de ligue), leur exécution passe.
Gradle : téléchargement Java direct impossible dans cet environnement ; curl fonctionne. Diagnostic proxy en cours. Push Git direct sans identifiants ; connecteur GitHub à utiliser pour les textes, binaires via ZIP uniquement.

Revue indépendante : Retour historique manquant corrigé (ferme replay et journal) ; configuration générée resynchronisée, SystemBars native confirmé. Gradle installé directement via curl puis proxy explicite pour résolution Maven : configure maintenant les projets, compilation en cours.
