# Installation Windows

1. Démonstration : installer Node 24 ou 26 LTS et PowerShell 7. Production : Node 26 LTS ou ultérieur. L’application n’utilise aucun paquet d’exécution npm.
2. Depuis le dossier du projet, lancer `./scripts/install-windows.ps1`.
3. `./scripts/start-local.ps1` crée un `.env` de démonstration avec secrets aléatoires s’il manque, migre SQLite, puis lance le mock et l’application en arrière-plan.
4. Lancer `npm run admin:create` dans le terminal, puis utiliser `/admin/login`.
5. Arrêter avec `./scripts/stop-local.ps1`.

Données : `data/alpha-access.sqlite`. Le dossier et le `.env` sont ignorés par Git. Supprimer les données uniquement après sauvegarde voulue.

`npm run build` exécute maintenant `tsc --noEmit` en mode strict. Le serveur exécute les sources TS avec le strip-types natif de Node ; aucun fichier JavaScript compilé n’est généré.
