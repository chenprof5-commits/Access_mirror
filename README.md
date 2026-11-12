# ALPHA ACCESS

Prototype local de passerelle personnalisée, configuré par défaut exclusivement vers le site fictif `http://127.0.0.1:4100`. Le serveur exige une session valable avant de transmettre la moindre requête au mock. L’essai dure 900 secondes UTC.

## Démarrage Windows

Prérequis démonstration : Node.js 24 LTS ou 26 LTS et PowerShell 7. Production : Node.js 26 LTS ou ultérieur. HTTP, SQLite et crypto viennent de Node ; TypeScript et ses types Node sont des dépendances de développement. `npm run build` exécute le contrôle de types strict sans émettre de JS, puis Node exécute les sources TS avec son strip-types natif.

```powershell
./scripts/install-windows.ps1
./scripts/start-local.ps1
npm run admin:create
```

Ouvrir `http://127.0.0.1:8080/admin/login`. Le mock fictif écoute seulement sur `127.0.0.1:4100`. Pour arrêter, exécuter `./scripts/stop-local.ps1`. Vérification : `npm run check`.

La commande `admin:create` demande un identifiant et un mot de passe (14 caractères minimum) et stocke une dérivation scrypt salée. C’est une alternative standard intégrée à Node pour éviter les dépendances natives non disponibles hors ligne.

## Parcours démonstration

1. Se connecter à l’admin et créer une invitation fictive.
2. Copier le lien affiché une seule fois et l’ouvrir dans un navigateur.
3. Cliquer « Commencer mon essai » ; le statut et le lien « Continuer » donnent accès au mock.
4. Après fin de l’essai, utiliser le formulaire de paiement manuel. L’admin confirme le paiement et choisit un code de 1, 7, 30 jours ou permanent.

Cette version ne modifie pas et ne verrouille pas un site d’origine public. Les anciens liens restent hors de cette application ; toute personne connaissant l’adresse publique peut continuer à l’utiliser.

## Commandes

`npm run dev`, `npm start`, `npm run mock`, `npm run db:migrate`, `npm run admin:create`, `npm test`, `npm run test:e2e`, `npm run check`.

Voir les procédures de [Windows](docs/INSTALLATION_WINDOWS.md), [configuration privée](docs/CONFIGURATION_PRIVEE.md), [tests](docs/TESTS.md), [déploiement](docs/DEPLOIEMENT.md), [limites](docs/LIMITES_ET_RISQUES.md), [compatibilité](docs/RAPPORT_COMPATIBILITE.md) et [exploitation](GUIDE_EXPLOITATION.md).

## Données réelles et production

Ne renseignez aucune vraie cible dans ce dépôt. Après fermeture complète de Codex, un administrateur exécute `scripts/configure-production.ps1`; le fichier privé sera `C:\ProgramData\AlphaAccess\private.env`. Le guide [CONFIGURATION_PRIVEE.md](docs/CONFIGURATION_PRIVEE.md) décrit les ACL et le démarrage. Le service doit rester derrière un frontal TLS et l’entreprise doit vérifier les droits d’usage et la compatibilité réelle avant l’ouverture. La préparation de configuration ne rend pas le site public d’origine inaccessible.
