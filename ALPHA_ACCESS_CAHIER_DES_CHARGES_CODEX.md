# ALPHA ACCESS — Cahier des charges et plan d’exécution pour Codex

**Version :** 1.0 — 12 novembre 2026  
**Cible de développement :** Windows 10/11, PowerShell, Visual Studio Code + Codex  
**Livrable attendu :** application indépendante, code exécutable, tests, démonstration locale, documentation et préparation au déploiement  
**Langue des interfaces :** français

> **CONFIDENTIALITÉ IMPÉRATIVE** — Ne jamais demander, afficher, copier, déduire, enregistrer dans un dépôt ni transmettre à un modèle d’IA l’URL réelle du site d’origine, ses identifiants, ses cookies, ses données ou son code. Codex doit exclusivement développer et tester avec une fausse cible locale. Le paramétrage réel sera effectué ultérieurement par un humain, dans un fichier situé **hors du dossier de travail de Codex**, idéalement lorsque Codex est fermé. Aucun dispositif ne peut garantir la confidentialité d’une valeur que l’agent IA peut lire dans son environnement. Vérifier la politique informatique de l’entreprise avant tout essai réel.

## 1. Contexte et objectif

Un site web existe déjà. Tous les anciens clients ont déjà payé et utilisent **un même lien public**, sans compte ni mot de passe. Ils doivent continuer à utiliser ce lien sans aucun changement. L’entreprise dispose de la **gestion du domaine**, mais **ni du code source ni de l’accès à l’hébergement**. Il est formellement interdit de modifier le site existant ou de communiquer son adresse à une IA.

Créer un **nouveau service ALPHA ACCESS**, hébergé séparément, qui permet au personnel autorisé de générer, pour chaque **nouveau** client, un **lien personnalisé**. Après l’ouverture de son invitation et un clic explicite sur « Commencer mon essai », le client accède au site original **au travers de la passerelle** pendant **15 minutes chronologiques**. À l’échéance, les requêtes via la passerelle sont refusées ; une page de paiement manuel et de saisie d’un code d’activation apparaît. Après paiement confirmé manuellement, l’administrateur génère un code unique lié à cette invitation ; le client le saisit pour ouvrir un accès d’une durée définie par l’administrateur. Aucun paiement en ligne automatique n’est exigé pour la V1.

### Limites à annoncer sans ambiguïté

1. **Ce produit ne constitue PAS un verrouillage global du site existant.** L’ancienne URL est publique, toujours fonctionnelle et accessible à quiconque la découvre, nouveau client compris. Une passerelle indépendante ne peut pas empêcher cela sans contrôle de l’application ou du serveur d’origine.
2. Un reverse proxy peut échouer sur un site tiers qui a des cookies de domaine, des URLs absolues, une authentification externe, une CSP stricte, des WebSockets, un service worker, un anti-bot ou des redirections incompatibles. Le code devra mesurer cette compatibilité, la documenter et **échouer explicitement**, sans prétendre pouvoir servir tout site arbitraire.
3. La base de données ne prouve pas l’identité du destinataire : un lien personnel est un secret transmissible. En V1, lier l’activation au premier navigateur ; prévoir un déblocage/réinitialisation par administrateur. Une vérification d’identité plus robuste (OTP/e-mail) constitue une V2 et doit être possible sans refonte.
4. L’interface doit dire « accès interrompu **via votre lien personnalisé** » et ne jamais garantir un blocage de l’URL publique d’origine.
5. Vérifier que l’entreprise a le droit de republier le service derrière un proxy, notamment au regard de ses contrats, données et en-têtes de sécurité. Ne pas contourner des protections techniques à l’aveugle.

## 2. Livrables vérifiables

- Application Node.js + TypeScript complète, structurée, exécutable sur Windows.
- Site d’origine fictif `mock-origin` séparé avec plusieurs pages, CSS, images, formulaire, API et lien relatif/absolu de démonstration.
- Passerelle HTTP/HTTPS configurable avec filtre d’autorisation **avant toute transmission** au site cible.
- Page d’accueil d’invitation, écran d’essai, compteur, expiration, paiement manuel, code d’activation, erreur et renouvellement.
- Tableau de bord admin sécurisé : liens, durées, codes, statuts, historique, blocage/réinitialisation, paramètres non sensibles.
- Base SQLite locale, migrations versionnées, sauvegarde/restauration documentées.
- Tests unitaires, intégration, E2E ; vérifications de sécurité et de la règle des 15 minutes.
- Documents `README.md`, `INSTALLATION_WINDOWS.md`, `CONFIGURATION_PRIVEE.md`, `TESTS.md`, `DEPLOIEMENT.md`, `LIMITES_ET_RISQUES.md`, `RAPPORT_COMPATIBILITE.md`.
- Scripts PowerShell de démarrage/arrêt et de test ; un `.env.example` contenant **uniquement des valeurs fictives**.
- Exemple Docker optionnel, **non requis** pour la V1 locale.
- Aucun appel automatique à un service tiers ni besoin d’une carte bancaire pour les tests.

## 3. Technologies et règles de choix

- Node.js en version LTS prise en charge au moment du développement (Node 26 LTS au 12/11/2026), TypeScript strict.
- Express ou Fastify, choix justifié. Pour le reverse proxy : bibliothèque mature telle que `http-proxy-middleware`, version stable compatible avec le framework choisi.
- SQLite avec driver réputé et testé sur Windows ; requêtes paramétrées, transactions, migrations, contraintes d’unicité et index. Ne pas imposer un composant natif si le binaire Windows n’est pas disponible pour la version Node retenue : documenter le choix.
- HTML, CSS responsive et JavaScript/TypeScript minimal pour le frontend ; ne pas ajouter une grosse SPA sans nécessité.
- Tests : Vitest ou `node:test` ; Playwright pour les parcours navigateur si l’installation locale est réalisable.
- Validation des données avec Zod ou équivalent.
- Gestion et stockage sûrs des mots de passe administrateur avec Argon2id (ou alternative reconnue documentée), jamais en clair.
- Journalisation structurée avec masquage des secrets.
- Documentation et libellés utilisateur en français.

## 4. Architecture des routes (point critique)

### Entrée et session

- `GET /i/:invitationToken` : afficher une page d’introduction **sans démarrer le compteur** ; ne transmettre le jeton à aucun tiers ; ajouter `Referrer-Policy: no-referrer`, `Cache-Control: no-store`.
- `POST /i/:invitationToken/start` : après protection CSRF, démarrer atomiquement le premier essai, une seule fois. Créer un cookie de session HTTP-only signé ou aléatoire conservé sous forme hachée au serveur. Rediriger vers `/`, sans garder le jeton d’invitation dans l’URL affichée.
- `GET /api/client/status` : retourner uniquement statut, secondes restantes, date d’expiration et nom d’offre affichable ; ne pas inclure de secret.
- `GET /activation` et `POST /api/client/activate` : page et action d’activation. Vérifier le code associé à l’invitation, la validité, l’utilisation unique et les limites de tentatives.
- `GET /paiement` : instructions de paiement **manuel** ; identifiant de commande public non sensible ; bouton WhatsApp éventuellement configuré par l’administrateur, **aucun numéro réel dans les exemples**.
- `GET /admin/login`, `POST /admin/login`, `POST /admin/logout`, `GET /admin`, `/api/admin/...` : administration avec session distincte et rôle admin.
- `GET /healthz` : état local minimal sans paramètres sensibles.
- `GET /` et toutes les autres routes ne correspondant pas aux routes réservées : transmettre au **seul** serveur d’origine fixé par configuration **si l’accès est valide**. Sinon rediriger vers la page de statut/paiement ou renvoyer `401/403` pour API et ressources selon la situation. Ne jamais exposer d’accès proxy sans vérification.
- Route `404` explicite pour toute route d’administration inconnue.

### Règles de proxy

- Une seule destination autorisée configurée au démarrage ; **jamais** d’URL cible fournie par l’utilisateur ou par un paramètre de requête (prévenir SSRF/open proxy).
- Validation du schéma HTTP(S), refus de destinations non autorisées pour le mode production, vérification TLS active.
- Transmettre GET/POST/PUT/PATCH/DELETE, en-têtes utiles, corps multipart, fichiers et encodages sans casser les flux.
- Adapter si possible les redirections HTTP `Location` et les attributs `Set-Cookie: Domain/Path`, avec tests ciblés. Ne pas modifier les scripts propriétaires du site ni désactiver sa sécurité de manière générale.
- Gérer prudemment l’en-tête Host, `Origin`, `Referer`, CORS, CSP, SameSite, URLs absolues, chemins racine et WebSocket. Relever les incompatibilités et ne pas les masquer. Un chargement « visuellement réussi » ne suffit pas : tester les boutons, formulaires et API.
- Vérifier l’autorisation **pour chaque requête HTTP** et **avant toute montée WebSocket** ; couper à l’échéance les WebSockets actifs et flux longue durée lorsque techniquement possible. Documenter les limites des données déjà chargées, du cache et des fichiers téléchargés.
- Ne pas créer un simple écran `iframe` : cela n’impose aucune sécurité serveur et peut être bloqué par X-Frame-Options/CSP.
- Préserver les frontières `/admin`, `/api/client`, `/i`, `/activation`, `/paiement` et les paths réservés. Prévoir les collisions de routes éventuelles avec le site cible et signaler cette limite.
- Pas d’injection de scripts arbitraires dans le HTML du site tiers pour afficher le compteur. Afficher le compte à rebours sur une page ALPHA ACCESS et dans un panneau séparé facultatif ; l’expiration réelle est décidée par le serveur, non par le navigateur.

## 5. Règles métier exactes

### Liens personnalisés

- Un administrateur peut créer un nouveau dossier client : surnom, référence interne facultative, durée prévue de licence, commentaire interne. Ne pas collecter des données non nécessaires.
- Générer un jeton cryptographiquement aléatoire d’au moins 128 bits, encodé en Base64 URL sans caractères réservés. Stocker **seulement son empreinte** en base ; afficher l’URL complète une fois à la création, avec une action de copie côté navigateur.
- Chaque invitation possède `created_at`, `first_started_at`, `trial_expires_at`, `status`, `revoked_at`, et référence au client. `first_started_at` est écrit uniquement au premier clic « Commencer mon essai ».
- L’essai est exactement de `15 * 60` secondes UTC écoulées, indépendamment de l’heure locale et de la fermeture du navigateur. Il n’est pas renouvelé à la fermeture, au rechargement ou au redémarrage du serveur.
- La page d’invitation ne doit pas activer l’essai par simple prévisualisation automatique d’une messagerie ; prévoir `POST` de démarrage explicite.
- Une invitation révoquée ne donne plus d’accès. Un jeton aléatoire deviné ou modifié est rejeté sans fuite d’information.

### Identification du navigateur

- Au lancement, enregistrer une session client sécurisée et associer l’invitation au **premier navigateur ayant démarré l’essai**. Une deuxième session ne doit pas automatiquement prolonger ou réinitialiser l’essai ; politique stricte V1 : demander une réinitialisation administrative. Ne pas utiliser l’adresse IP comme identité unique (NAT, IP mobile).
- Cookies `HttpOnly`, `Secure` en HTTPS, `SameSite=Lax` si compatible, durée adaptée, rotation après activation et révocation immédiate possible.
- Prévoir une fonction admin « Réinitialiser l’appareil » / « Régénérer le lien » avec journal d’audit, et avertir du risque de partage de liens. Ne pas présenter cette liaison comme anti-partage infaillible.

### Codes d’activation

- Après confirmation manuelle du paiement, l’admin génère un code cryptographiquement fort, unique, non prédictible et **lié à une invitation précise**. Ne pas utiliser de codes courts de type `123456`.
- Stocker uniquement une empreinte cryptographique du code, pas le code en clair. Montrer le code une seule fois à sa création ; si perdu, le régénérer et révoquer l’ancien.
- Code utilisable une seule fois, transaction atomique ; protection contre les activations concurrentes et les attaques par force brute.
- Durées au choix : 1 jour, 7 jours, 30 jours ou accès permanent. Départ au moment de la **première utilisation effective du code**, pas à sa création. Les durées sont des périodes de 24h, 7×24h et 30×24h ; UTC en base.
- Une licence `ACTIVE` est prioritaire sur l’essai expiré ; à échéance elle devient `EXPIRED` et ne réactive pas les 15 minutes. L’admin peut révoquer immédiatement ou créer un renouvellement.
- Un code d’une invitation A est inutilisable pour l’invitation B.
- Aucune connexion à un prestataire de paiement dans la V1, aucun paiement automatique présumé ; la mention « paiement confirmé » est une action réservée à l’admin et journalisée.

### Statuts et transitions

`CREATED -> TRIAL_ACTIVE -> TRIAL_EXPIRED -> PAYMENT_PENDING -> LICENSE_ACTIVE -> LICENSE_EXPIRED`

Transitions supplémentaires autorisées : `CREATED/TRIAL_ACTIVE/TRIAL_EXPIRED -> REVOKED`, puis réémission administrative contrôlée. Les statuts affichés doivent être **calculés à partir des dates et du droit d’accès réel** pour éviter des données incohérentes.

## 6. Interface administrateur (V1)

- Écran de connexion sécurisé, procédure de première création d’admin par commande CLI locale interactive, **aucun compte par défaut** et aucun mot de passe codé en dur.
- Résumé : invitations générées, essais en cours, essais expirés, licences actives, licences expirées, licences révoquées.
- Table recherchable/filtrable : référence client, date, état, fin de l’essai, fin de licence, lien (uniquement si généré à l’instant), actions autorisées.
- « Nouvelle invitation » : créer, copier, télécharger un reçu non sensible si utile.
- « Marquer comme payé », « Générer un code », « Renouveler », « Révoquer », « Régénérer lien », « Réinitialiser appareil » ; chaque action demande confirmation quand elle est irréversible.
- Section audit : qui a créé/révoqué/activé, date UTC, identifiant d’objet, action, résultat ; masquer codes, mots de passe et secrets.
- Configuration affichable : nom de service, durée d’essai (fixée à 15 pour la V1), instructions de paiement, URL/numéro de contact public, **sans jamais montrer l’URL d’origine**.
- Responsive bureau et smartphone ; design sobre professionnel, messages français clairs.

## 7. Interface client (V1)

1. Invitation : « Vous bénéficiez de 15 minutes d’essai gratuit », conditions, bouton **Commencer mon essai**.
2. Compteur de référence côté serveur avec seconde restante approximative dans l’UI, et date d’expiration exacte côté serveur ; les requêtes sont refusées une fois la date atteinte.
3. Fin d’essai : « Votre essai de 15 minutes est terminé. Pour continuer **avec ce lien**, contactez-nous et saisissez votre code. »
4. Instructions de paiement manuel configurables, bouton de contact et zone de saisie du code.
5. Code valide : confirmation avec durée ou date de fin ; reprise via la passerelle.
6. Code invalide, expiré, consommé ou rattaché à un autre lien : erreur non révélatrice ; délai de tentative ; contact support.
7. Lien révoqué, session perdue, problème site original : écrans distincts et explicites.
8. Pour les anciens clients, **absolument aucune nouvelle interface** : ils continuent avec leur lien habituel, qui reste entièrement extérieur au système.

## 8. Base de données — modèle logique minimal

Créer migrations SQL versionnées et index :

- `admins`: id, username unique, password_hash, created_at, disabled_at.
- `admin_sessions`: id, token_hash unique, admin_id, expires_at, revoked_at, created_at.
- `clients`: id, reference unique, display_name, internal_note, created_at (collecte minimale).
- `invitations`: id, client_id, token_hash unique, created_at, first_started_at, trial_expires_at, bound_session_id nullable, revoked_at.
- `client_sessions`: id, invitation_id, token_hash unique, created_at, last_seen_at, expires_at, revoked_at.
- `payments`: id, invitation_id, status enum pending/confirmed/cancelled, amount optional, currency optional, confirmed_at, confirmed_by, note.
- `activation_codes`: id, invitation_id, code_hash unique, plan_duration_seconds nullable, is_permanent, created_at, redeemed_at, redeemed_session_id, revoked_at.
- `licenses`: id, invitation_id, activation_code_id, activated_at, expires_at nullable, revoked_at.
- `audit_logs`: id, actor_type, actor_id, action, object_type, object_id, timestamp_utc, metadata_json **sanitisé**.

Privilégier des opérations atomiques/transactées sur `start trial`, `redeem code`, `revoke`, `renew`. Le code doit gérer les doubles clics, courses concurrentes et retentatives réseau sans produire plusieurs essais ou activations.

## 9. Sécurité non négociable

- Ne jamais protéger uniquement en JavaScript ; contrôle serveur avant chaque proxy et WebSocket.
- Utiliser `crypto.randomBytes` ou API CSPRNG équivalente pour les invitations, sessions et codes.
- Hacher les jetons à forte entropie avec SHA-256/HMAC-SHA-256 ; mots de passe **Argon2id**, ralentissement des essais et blocage temporaire.
- CSRF sur les actions qui modifient l’état, y compris l’activation et le début d’essai ; validation de l’origine et formulaires sûrs.
- Protection contre XSS, injection SQL, session fixation, attaques de force brute, open redirect, SSRF, path traversal, abus du proxy et énumération de liens.
- Entêtes HTTP appropriés sur les pages propres à ALPHA ACCESS ; ne pas neutraliser arbitrairement les en-têtes du site d’origine.
- Désactiver l’envoi des cookies de l’admin vers le site d’origine. Séparer les noms de cookies client/admin et masquer les informations sensibles dans les logs.
- Cookies sécurisés en production HTTPS, redirections HTTPS, pas de secrets dans l’URL excepté le jeton d’invitation initial (qui est remplacé au plus vite par la session).
- Pas de stockage d’URL réelle, de codes en clair ni de mot de passe dans Git, journaux, captures, rapports d’erreur ou prompts.
- Configuration exclusivement `ORIGIN_URL` **fournie à l’exécution** par une variable d’environnement locale ou un fichier privé externe indiqué par `ALPHA_PRIVATE_CONFIG_PATH`. Écrire une procédure PowerShell qui permet à un humain de l’insérer **après fermeture de Codex**.
- Refuser de démarrer en production si `ORIGIN_URL` est absente, si les secrets de session manquent, si HTTPS n’est pas configuré côté frontal ou si les permissions privées sont inadéquates ; mode démonstration sur la cible fictive autorisé.
- Éviter les données à caractère personnel superflues et documenter leur conservation/suppression.
- Ne pas intégrer de traqueurs ou services d’analyse non nécessaires.

## 10. Conventions de configuration

Fournir `config/.env.example` entièrement fictif :

```dotenv
NODE_ENV=development
HOST=127.0.0.1
PORT=8080
PUBLIC_BASE_URL=http://localhost:8080
ORIGIN_URL=http://127.0.0.1:4100
TRIAL_SECONDS=900
DATABASE_PATH=./data/alpha-access.sqlite
SESSION_SECRET=REMPLACER_PAR_SECRET_DE_TEST_LOCAL
ACTIVATION_HASH_SECRET=REMPLACER_PAR_SECRET_DE_TEST_LOCAL
BUSINESS_NAME=ALPHA ACCESS
PAYMENT_CONTACT_LABEL=Contacter notre équipe
PAYMENT_CONTACT_URL=https://example.invalid/contact
```

`TRIAL_SECONDS=900` doit être fixé dans la V1 et ne doit jamais être transmis par le navigateur. **Ne pas inclure `ORIGIN_URL` réel dans le dépôt.** En production, utiliser un chemin de configuration extérieur au dossier `C:\Projets\AlphaAccess`. Ne pas placer un secret réellement utilisé dans `.env.example`.

## 11. Arborescence recommandée

```text
AlphaAccess/
├── README.md
├── package.json
├── package-lock.json
├── tsconfig.json
├── .gitignore
├── .env.example
├── docs/
│   ├── INSTALLATION_WINDOWS.md
│   ├── CONFIGURATION_PRIVEE.md
│   ├── TESTS.md
│   ├── DEPLOIEMENT.md
│   ├── LIMITES_ET_RISQUES.md
│   └── RAPPORT_COMPATIBILITE.md
├── src/
│   ├── app.ts
│   ├── server.ts
│   ├── config/
│   ├── db/               # migrations, requêtes paramétrées, transactions
│   ├── domain/           # essais, liens, codes, licences, états
│   ├── security/         # sessions, auth, CSRF, rate limits
│   ├── middleware/
│   ├── proxy/
│   ├── routes/
│   │   ├── admin/
│   │   ├── client/
│   │   └── public/
│   ├── views/
│   └── public/           # CSS, images, scripts locaux
├── mock-origin/
│   └── ...               # FAUX site pour tous les tests avec Codex
├── tests/
│   ├── unit/
│   ├── integration/
│   ├── e2e/
│   └── security/
├── scripts/
│   ├── install-windows.ps1
│   ├── start-local.ps1
│   ├── stop-local.ps1
│   ├── test-local.ps1
│   └── private-config-guide.ps1
└── data/                  # dossier privé ignoré par Git
```

Adapter l’organisation si nécessaire sans supprimer ces responsabilités. Fournir une commande de vérification (`npm run check`) regroupant types, lint et tests essentiels.

## 12. Développement étape par étape — ne pas sauter les validations

**Phase A — Préparation Windows**
1. Vérifier PowerShell, VS Code, Git, Node LTS, npm, permissions de fichiers.
2. Initialiser un projet TypeScript et installer les dépendances stables vérifiées.
3. Créer `.gitignore` avec `.env*` (exception explicite pour `.env.example`), `data/`, bases SQLite, fichiers de sauvegarde, journaux et fichiers temporaires.
4. Mettre en place `npm run dev`, `npm run build`, `npm start`, `npm run db:migrate`, `npm run admin:create`, `npm test`, `npm run test:e2e`, `npm run check`.

**Phase B — Démonstrateur sûr**
5. Créer un `mock-origin` autonome sur `http://127.0.0.1:4100` avec pages, formulaires, JSON et assets.
6. Implémenter proxy depuis `http://127.0.0.1:8080` vers le mock seulement.
7. Tester que les requêtes sans session active sont **refusées avant toute requête au mock**. Journaliser le compteur de requêtes du mock pour le prouver.

**Phase C — Données et règles**
8. Construire migrations, modèles, repos, contraintes, tests de concurrence.
9. Ajouter jetons d’invitation aléatoires, page invitation et démarrage par `POST` seulement.
10. Ajouter vérification des 900 s UTC côté serveur et sessions persistantes.
11. Ajouter expiration automatique, accès coupé pour HTTP/API et tests de rechargement, fermeture du navigateur et redémarrage du serveur.

**Phase D — Activation et administration**
12. Implémenter admin CLI, login/logout, cookies, CSRF, protection de connexion.
13. Implémenter CRUD métier limité, code à usage unique, confirmation manuelle des paiements, durée à partir de la consommation, révocation et renouvellement.
14. Construire tableau de bord et pages client en français.
15. Ajouter audit, gestion d’erreurs, logs censurés, sauvegarde et restauration.

**Phase E — Compatibilité et sécurité**
16. Tester redirections, cookies, formulaires, JSON, assets, requêtes POST, téléchargements ; optional WebSocket et streaming.
17. Tester le passage exact des 15 min avec **horloge injectable** dans les tests pour éviter d’attendre réellement.
18. Vérifier que les fichiers téléchargés ne peuvent pas être retirés rétroactivement et que les flux longs sont interrompus au mieux.
19. Écrire les limites techniques et le rapport de compatibilité ; si une fonction ne peut pas être rendue fiable, la signaler dans la documentation et en sortie de Codex.

**Phase F — Livraison**
20. Fournir un lancement sur Windows PowerShell et une démonstration avec client fictif.
21. Exécuter tests + build, corriger erreurs, rapporter commandes, résultats exacts et défauts résiduels.
22. Préparer instructions de mise en ligne sur un serveur **séparé**, HTTPS + DNS + persistance des données. Aucune modification de l’application d’origine, de son DNS ou des anciens liens.
23. Fournir `GUIDE_EXPLOITATION.md` : génération de liens, consultation, validation des paiements, codes, révocation, sauvegarde, incidents.

## 13. Protocole d’essai local et critères d’acceptation

Un ensemble d’E2E doit couvrir au minimum les cas suivants :

**C01** Sans invitation ni session, `GET /` ne doit envoyer **aucune requête** au site fictif ; écran ALPHA ACCESS attendu.

**C02** L’admin peut créer un lien qui contient un token imprévisible ; aucun secret en base sous forme lisible.

**C03** Un appel `GET /i/token` seul **ne démarre pas** le compteur.

**C04** Après clic `POST start`, l’essai commence une seule fois ; la page mock fonctionne.

**C05** À `t = 14 min 59 s`, accès HTTP autorisé ; à `t = 15 min 00 s`, réponse refusée et **aucune requête au mock**.

**C06** Recharger, fermer, rouvrir, redémarrer le processus ne recrée pas un essai.

**C07** Code aléatoire faux / expiré / consommé / autre invitation → refus, limitation des essais.

**C08** Code correct après confirmation de paiement → licence valable sur son invitation uniquement.

**C09** Deux activations simultanées avec le même code → une seule transaction réussit.

**C10** Licence valable 24h/7j/30j/permanente selon les règles ; expiration et révocation respectées.

**C11** Un second navigateur ne reçoit pas un second essai ; marche à suivre de réinitialisation affichée.

**C12** Aucune route admin sans authentification ; CSRF et bruteforce refusés.

**C13** Test proxy de toutes les méthodes pertinentes, assets et redirections ; si incompatibilité technique, erreur claire et test rouge documenté.

**C14** Les anciens clients ne passent jamais par ALPHA ACCESS : le vieux lien **reste inchangé** (preuve par absence de changement d’architecture, pas par test d’un vrai site).

**C15** Des logs, captures, erreurs et API ne révèlent aucune URL réelle, aucun code ni cookie.

**C16** WebSocket ouvert pendant l’essai : coupure à l’expiration si le support WS est implémenté, sinon avertissement et non prise en charge explicite.

**C17** Une invitation désactivée n’a plus accès, même avec une session auparavant valide.

**C18** Le serveur refusera un mode production incomplet (secrets/HTTPS/config) ; en mode local il utilise seulement le mock.

## 14. Mise en place sur Windows pour le développeur

1. Installer **Git**, **Node.js LTS**, **Visual Studio Code** et l’extension/outil Codex autorisé par l’entreprise.
2. Créer un dossier non confidentiel, par exemple `C:\Projets\AlphaAccess`.
3. Ouvrir VS Code **uniquement** sur ce dossier ; n’y copier ni vrai lien ni document confidentiel.
4. Copier ce cahier des charges dans le projet sous le nom `SPECIFICATION.md`.
5. Ouvrir Codex et demander : « Lis `SPECIFICATION.md`, implémente le projet de bout en bout avec le mock, exécute les tests et rédige la documentation. N’accède à aucune information du site réel. »
6. Après génération, dans PowerShell :

```powershell
cd C:\Projets\AlphaAccess
node --version
npm --version
npm install
npm run db:migrate
npm run admin:create
npm run dev
# Dans un autre terminal :
npm run check
```

7. Ouvrir `http://127.0.0.1:8080/admin/login` et vérifier le tableau de bord, l’invitation, le chronomètre et le site fictif.
8. **Ne pas configurer le site réel tant que Codex a accès au dossier ou aux secrets.** Fermer Codex ; demander à un administrateur autorisé de renseigner la cible réelle selon `CONFIGURATION_PRIVEE.md`, **hors du dossier du projet**, et de réaliser les essais privés permis par la politique de sécurité de l’entreprise.

Les commandes indiquées sont des **interfaces que Codex doit effectivement implémenter** ; si ses choix de dépendances nécessitent une nuance, il doit adapter le README sans laisser de commande factice.

## 15. Passage en production (étape distincte)

- La machine Windows de développement sert aux **tests**. Pour partager les liens à de vrais clients, mettre en place un serveur public, disponible 24 h/24, avec HTTPS, sauvegardes et supervision. Un ordinateur éteint ou derrière un NAT sans solution réseau ne peut pas garantir ce service.
- Utiliser un **nouveau sous-domaine** de l’entreprise, par exemple `acces.exemple.test` pendant la documentation, puis un sous-domaine réel créé **manuellement** par l’administrateur DNS. Ne pas remplacer les enregistrements DNS du domaine d’origine : conserver l’accès des anciens clients.
- Configurer DNS du nouveau sous-domaine vers l’hébergement de la passerelle ; installer HTTPS côté frontal, vérifier les en-têtes de proxy de confiance, le pare-feu et la persistance SQLite. Pour trafic élevé / déploiement multi-instance, migrer vers PostgreSQL avec sessions partagées.
- Faire une campagne de compatibilité **interne et autorisée** avec le site réel, sans fournir l’URL ni les captures sensibles à Codex. Vérifier tous les parcours métier, la protection des requêtes, les liens absolus et la confidentialité.
- Définir politique de consentement, rétention des données et sauvegardes, procédures de renouvellement et d’assistance.
- Le client peut toujours découvrir l’ancienne URL et contourner le paiement ; obtenir un contrôle de l’origine + identification des clients si le besoin devient un **vrai paywall obligatoire**.

## 16. Ordre de priorité

- **P0 :** secret préservé, mock complet, proxy vérifié côté serveur, liens personnels, 900 s persistantes, refus, code unique, admin, SQLite, tests, lancement Windows.
- **P1 :** interface responsive, audit, sauvegarde/restauration, WebSocket (si requis), compatibilité renforcée, renouvellements, export CSV sans secrets.
- **P2 :** vérification par téléphone/e-mail, confirmation de paiement automatique, PostgreSQL, monitoring, gestion multi-admin, statistiques avancées.

## 17. Instruction finale impérative pour Codex

**Tu es l’ingénieur chargé d’implémenter le produit et pas seulement d’en proposer l’architecture.** Crée les fichiers et le code réel, lance les commandes, exécute les tests, corrige ce qui est corrigible, puis remets les procédures reproductibles. Ne t’arrête pas après un plan. Ne demande jamais l’URL d’origine, les identifiants, les données des anciens clients ni un accès à l’ancien serveur. Utilise le mock exclusivement. Marque clairement toutes les fonctions non testées ou limitations structurelles. N’affirme jamais pouvoir rendre inaccessible le site d’origine tant que son URL publique continue de fonctionner.
