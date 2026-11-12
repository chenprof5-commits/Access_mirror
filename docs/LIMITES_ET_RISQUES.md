# Limites et risques

- Une passerelle indépendante ne verrouille pas le site public existant. Les anciens liens ne changent pas ; un client qui connaît l’adresse publique peut l’utiliser directement.
- Le proxy HTTP intégré est volontairement limité et n’a pas été audité indépendamment ; aucune bibliothèque proxy tierce n’a pu être installée dans l’environnement hors ligne. Un site tiers avec URLs absolues, CSP/CORS strictes, authentification externe, WebSockets, service worker ou comportements particuliers peut échouer ou contourner l’interface. Les WebSockets sont refusés.
- Les téléchargements déjà reçus, fichiers enregistrés, caches et données déjà affichées ne peuvent pas être retirés après expiration. Les flux longs sont interrompus au mieux.
- Le lien d’invitation est transmissible. La liaison au premier navigateur et la réinitialisation admin ne constituent pas une preuve d’identité ; aucun OTP n’est inclus.
- L’administration permet les codes 1/7/30 jours et permanents, et le renouvellement par nouvelle confirmation manuelle. L’export CSV, les statistiques de synthèse et les filtres recherchables ne sont pas complets.
- Le service a des limites de tentatives sur le login admin (par identifiant) et l’activation (par invitation), mais pas de limite globale distribuée. Les sessions ne sont pas rotatives. SQLite convient à une seule instance et au faible trafic.
- `npm run build` exécute le typecheck strict avec TypeScript. Aucun test Playwright ni audit indépendant n’est fourni. Le test accélère la durée en fixant directement la date SQLite ; il ne vérifie pas chaque frontière seconde via horloge injectable.
- Le module SQLite intégré de Node 26 est actuellement classé « Release candidate » par la documentation Node. Remplacer ou valider explicitement ce choix avant une exploitation réglementée ou à forte disponibilité.
- La configuration privée est hors projet et le script pose des ACL Windows. Le script ne crée pas le service Windows, DNS ou certificat TLS et ne valide pas la configuration d’IIS/Nginx. Il faut un frontal HTTPS et une procédure d’exploitation surveillée.
- Les données client et d’audit restent dans SQLite jusqu’à suppression manuelle. Définir durée de conservation, sauvegardes chiffrées, surveillance et restauration selon les règles de l’entreprise.
- Une revue contractuelle et une campagne de compatibilité interne avec la cible réelle sont requises avant toute ouverture. Aucune cible réelle n’a été consultée pendant le développement.

La préparation de fichiers et de contrôles de démarrage ne constitue pas une certification de sécurité ni une garantie de compatibilité universelle.
