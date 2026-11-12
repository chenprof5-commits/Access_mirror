# Déploiement

Le service est préparé pour fonctionner derrière un frontal TLS, sur un serveur distinct. Il écoute uniquement sur `127.0.0.1:8080`; ne l’exposez pas directement sur Internet. Utilisez un sous-domaine neuf et gardez les enregistrements DNS de l’ancien site inchangés.

## Frontal TLS

Terminez TLS sur IIS ARR, Nginx ou un frontal équivalent, redirigez HTTP vers HTTPS, transmettez le `Host` public attendu et limitez l’accès au port local. Les connexions WebSocket sont désactivées. N’ajoutez pas d’en-têtes `X-Forwarded-*` de confiance : l’application se base sur l’URL publique privée et rejette un Host différent. Configurez les limites de taille et les délais du frontal en cohérence avec la limite applicative de 100 Mo.

## Lancement

Suivez [CONFIGURATION_PRIVEE.md](CONFIGURATION_PRIVEE.md) après fermeture de Codex. Créez d’abord le compte administrateur une fois avec `npm run admin:create:production`, puis démarrez sous le compte de service avec `./scripts/start-production.ps1`. Gardez SQLite et les sauvegardes sous `C:\ProgramData\AlphaAccess`, hors du dossier du projet, et testez une restauration avant utilisation.

## Conditions avant ouverture aux clients

Il faut encore installer et vérifier le service Windows / son redémarrage automatique, les certificats et le frontal TLS, la supervision, les sauvegardes protégées et la restauration. Une revue indépendante doit couvrir la bibliothèque proxy intégrée à Node, le comportement du site cible, les méthodes/formulaires/cookies, les limites de requête et les opérations admin. Le test automatisé ne qualifie pas toute compatibilité de site tiers.

Le site réel ne doit être configuré qu’après fermeture de Codex. Effectuez les essais réels en interne, selon les contrats et la politique informatique. Une passerelle séparée ne rend pas l’URL publique d’origine inaccessible. En multi-instance ou pour un trafic élevé, migrer SQLite vers PostgreSQL et partager les sessions.
