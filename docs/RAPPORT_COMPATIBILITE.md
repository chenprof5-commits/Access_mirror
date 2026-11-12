# Rapport de compatibilité

La seule cible testable est le mock ALPHA ACCESS local sur `127.0.0.1:4100`. Il fournit une page, feuille CSS, JSON, formulaire POST, lien relatif et redirection. Le test automatisé C01 vérifie qu’une requête non autorisée n’atteint pas ce mock.

Résultats des parcours mock de base : voir la sortie `npm run check`. Aucune cible réelle n’a été consultée. Les comportements de proxy plus avancés (Set-Cookie, Location absolue externe, multipart, gros fichiers, compressions, CSP, CORS, TLS et streaming) ne sont pas qualifiés. Le remplacement d’une redirection vers une URL externe n’est pas fait. Les WebSockets sont non supportés.
