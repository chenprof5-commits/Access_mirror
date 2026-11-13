# Déploiement Netlify

ALPHA ACCESS utilise Netlify Server pour héberger le serveur HTTP et Netlify Database pour stocker les invitations, les sessions, les licences et l’audit. La passerelle n’est pas un site statique et ne doit pas être déployée comme une simple fonction.

## Préparer le projet Netlify

Le projet Netlify est `passerellemirror`. Le serveur est déclaré dans `netlify/server/index.ts`; le schéma PostgreSQL initial se trouve dans `netlify/database/migrations/001_alpha_access.sql`. Netlify applique cette migration lors du déploiement et provisionne la base pour le projet.

Dans **Project configuration → Environment variables**, ajouter au contexte Production, avec la portée **Netlify Server** :

- `ORIGIN_URL` : URL HTTPS complète du site que la passerelle doit protéger. Il s’agit de l’adresse d’origine du site, pas de son entrée DNS.
- `PUBLIC_BASE_URL` : adresse publique ALPHA ACCESS, actuellement `https://passerellemirror.netlify.app`. Mettre à jour cette variable si tu ajoutes ensuite un domaine personnalisé.
- `SESSION_SECRET` : secret aléatoire d’au moins 32 caractères.
- `ACTIVATION_HASH_SECRET` : autre secret aléatoire d’au moins 32 caractères.
- `INITIAL_ADMIN_USERNAME` et `INITIAL_ADMIN_PASSWORD` : identifiant et mot de passe temporaire du premier administrateur. Le mot de passe doit faire au moins 14 caractères. Ils ne créent le compte que si la table des administrateurs est vide.
- `PAYMENT_CONTACT_URL` : lien HTTPS de contact/paiement.
- `PAYMENT_CONTACT_LABEL` : texte affiché comme lien d’aide, par exemple `Contacter notre équipe`.
- `BUSINESS_NAME` : nom affiché aux clients.
- `TRIAL_SECONDS` : garder la valeur `900`.

Netlify fournit `NETLIFY_DB_URL` automatiquement après la création de la base. Ne copiez pas ce secret dans le dépôt. `ALPHA_PRIVATE_CONFIG_PATH` concerne uniquement le serveur Windows et ne doit pas être défini sur Netlify.

Les valeurs sensibles doivent être ajoutées dans le tableau de bord Netlify, pas dans `.env`, `netlify.toml` ou Git. Après les avoir ajoutées, vérifier la portée **Netlify Server** et le contexte **Production**.

Pour créer le premier administrateur, définis temporairement `INITIAL_ADMIN_USERNAME` et `INITIAL_ADMIN_PASSWORD`, puis déploie. Le serveur stocke uniquement le hash du mot de passe et ne crée le compte que si aucun administrateur n’existe. Après le premier déploiement réussi, supprime ces deux variables et redéploie. Connecte-toi sur `/admin/login`, puis utilise « Changer mon mot de passe » dans le tableau de bord pour remplacer le mot de passe temporaire.

## Mise en ligne

Avant le premier déploiement, vérifier les variables obligatoires. Le premier déploiement applique la migration et provisionne la base. `netlify database status` indiquera ensuite l’état de la base et des migrations.

Le dépôt Git doit contenir la migration, l’adaptateur Netlify, `netlify.toml`, `.node-version`, le code et les fichiers de dépendances. `data/`, les fichiers `.env` réels, `.netlify/` et `node_modules/` restent exclus.

Ne publiez pas l’application tant que `ORIGIN_URL` n’est pas connu et vérifié : le service refuse de démarrer avec l’origine fictive du mode local.
