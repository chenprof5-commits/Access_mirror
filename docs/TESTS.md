# Tests

`npm run check` exécute la validation syntaxique puis une intégration locale en processus, avec SQLite temporaire et le mock sur loopback. Aucun serveur ne reste lancé après le test.

Couvert : requête anonyme refusée sans toucher le mock (C01), GET d’invitation sans démarrer (C03), POST explicite de démarrage (C04), proxy actif pendant l’essai, expiration sans requête proxy, second navigateur refusé, réinitialisation sans prolonger l’essai, code inutilisable sur une autre invitation, activation après expiration, priorité de la licence et limitation des essais d’activation/admin.

Non couvert : concurrence multi-processus en production, précision de l’horloge à 14:59/15:00 via horloge injectable, test Playwright, charge, failover/sauvegarde restaurée, multipart et fichiers volumineux, ensemble exhaustif des redirections/cookies/CSP/CORS, et compatibilité avec un site réel. Les WebSockets sont non pris en charge. Les tests ne remplacent pas un audit sécurité ni une campagne autorisée de compatibilité.

`npm run build` fait le typecheck strict avec TypeScript (`tsc --noEmit`). Le runtime natif TypeScript de Node retire les annotations à l’exécution.
