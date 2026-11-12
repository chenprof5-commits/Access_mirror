# Configuration privée de production

## Emplacement des vraies valeurs

Après fermeture complète de Codex et des outils d’IA, un administrateur Windows exécute `scripts/configure-production.ps1` dans PowerShell 7 lancé en administrateur. Le script demande la cible HTTPS masquée et les paramètres publics, crée les secrets aléatoires et écrit la configuration hors du dépôt dans :

`C:\ProgramData\AlphaAccess\private.env`

La base est placée dans `C:\ProgramData\AlphaAccess\data\alpha-access.sqlite`. Les ACL donnent accès au compte Windows de service saisi, à SYSTEM et aux administrateurs. Le script définit `ALPHA_PRIVATE_CONFIG_PATH` au niveau machine. Configurez le service Windows pour qu’il s’exécute sous ce même compte ; ne copiez aucune valeur dans `.env`, `.env.example`, ce dépôt ou un outil d’IA.

La saisie de l’adresse d’origine est masquée. Le script ne l’affiche pas et n’en écrit pas dans le dépôt. N’envoyez jamais le fichier privé à Codex. `ALPHA_PRIVATE_CONFIG_PATH` doit être transmis au processus Node par l’environnement Windows.

## Mise en route

1. Fermer Codex et tout outil d’IA qui peut lire le poste ou le dépôt.
2. Faire valider par l’entreprise le droit de republier le site via proxy, le sous-domaine, le frontal TLS et le compte Windows de service.
3. Installer Node.js 26 LTS ou ultérieur et PowerShell 7.
4. En administrateur, exécuter `./scripts/configure-production.ps1` et saisir les valeurs réelles seulement à ce moment-là.
5. Sous le compte autorisé, lancer une fois `npm run admin:create:production` pour créer le premier administrateur.
6. Configurer IIS ARR, Nginx ou un frontal TLS équivalent pour transmettre le nouveau sous-domaine à `127.0.0.1:8080`, puis lancer `./scripts/start-production.ps1` sous le compte de service.

Le démarrage de production refuse une URL publique sans HTTPS, une cible sans HTTPS, une cible avec chemin/identifiants, une base dans le projet, des secrets manquants ou un chemin privé absent. Le service écoute uniquement sur loopback. Il n’expose aucun formulaire de modification de la cible.

## Limites opérationnelles restantes

Le script configure le fichier et ses ACL ; il ne crée pas le service Windows, le DNS ou les certificats TLS, et ne prouve pas à lui seul le bon réglage du frontal. L’entreprise doit vérifier ces points, tester les parcours sur le site réel en interne et autoriser explicitement le proxy. Une passerelle indépendante ne désactive jamais l’ancienne URL publique.
