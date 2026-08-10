# Guide de déploiement — Portail Meubles Trois Mousquetaires

Ce projet est une **application web complète et fonctionnelle** : un portail client
public et une console d'administration interne, reliés à une **vraie base de données**
avec **authentification réelle** et **persistance**. Tout fonctionne dès l'installation,
sans aucune clé externe. Stripe et l'envoi de SMS/courriel sont câblés comme points
d'intégration : vous ajoutez vos clés quand vous êtes prêts, sans toucher au code.

---

## 1. Ce qu'il vous faut

- Un serveur (ou hébergement) capable d'exécuter **Node.js 18 ou plus récent**.
  - Fonctionne sur : un VPS (OVH, DigitalOcean, AWS…), Render, Railway, Fly.io,
    un serveur cPanel avec « Setup Node.js App », etc.
  - ⚠️ Un hébergement **statique seul** (sans Node) ne suffit pas, car il y a un vrai
    serveur et une base de données. Si votre offre actuelle est purement statique,
    prenez une petite offre Node (souvent gratuite ou quelques dollars par mois).

---

## 2. Installation (5 minutes)

Dans un terminal, à la racine du projet :

```bash
npm install        # installe les dépendances
cp .env.example .env   # crée votre fichier de configuration
npm start          # démarre le serveur
```

Au premier démarrage, la base de données se remplit toute seule avec les données de
référence. Vous verrez :

```
  Portail client  →  http://localhost:3000/
  Console admin   →  http://localhost:3000/admin
```

Ouvrez ces adresses dans un navigateur. C'est prêt.

**Comptes de démonstration :**
- Espace client : `marie-eve@exemple.ca` / `demo1234` (ou créez un compte).
- Console admin : code d'accès `1055` (configurable, voir plus bas).

---

## 3. Configuration (fichier `.env`)

Ouvrez le fichier `.env` et remplissez au minimum :

```
SESSION_SECRET=une-longue-chaine-aleatoire-secrete
ADMIN_CODE=votre-code-admin
```

Les autres valeurs (Stripe, SMS, courriel) peuvent rester vides pour l'instant —
l'application reste 100 % utilisable ; les paiements et notifications passent alors
en « mode simulation » (l'action est enregistrée mais rien n'est envoyé pour de vrai).

---

## 4. Mettre en ligne

### Option A — Plateforme moderne (le plus simple : Render, Railway, Fly.io)
1. Créez un compte, connectez ce dossier (via Git ou en le téléversant).
2. Réglages de build : commande de démarrage = `npm start`.
3. Ajoutez vos variables d'environnement (celles du `.env`) dans le tableau de bord.
4. Déployez. La plateforme vous donne une URL publique.

### Option B — Serveur / VPS classique
1. Copiez le dossier sur le serveur.
2. `npm install --omit=dev`
3. Lancez avec un gestionnaire de processus pour que ça reste allumé :
   ```bash
   npm install -g pm2
   pm2 start server/index.js --name m3m
   pm2 save
   ```
4. Placez un serveur web (Nginx) devant, avec un certificat HTTPS (Let's Encrypt),
   qui redirige votre domaine vers `http://localhost:3000`.

### Option C — cPanel « Setup Node.js App »
1. Créez une application Node, pointez-la sur ce dossier.
2. Fichier de démarrage : `server/index.js`.
3. Ajoutez les variables d'environnement dans l'interface, puis « Run npm install »
   et démarrez.

---

## 5. Brancher Stripe (paiements réels + financement maison)

Quand vous voulez activer les vrais paiements :

1. `npm install stripe`
2. Dans `.env`, mettez vos clés (depuis https://dashboard.stripe.com/apikeys) :
   ```
   STRIPE_SECRET_KEY=sk_live_...
   STRIPE_PUBLISHABLE_KEY=pk_live_...
   ```
3. Dans `server/integrations.js`, décommentez les blocs marqués « MODE RÉEL »
   (tout est indiqué et commenté, étape par étape).

Tant que les clés sont vides, l'app fonctionne en simulation — aucune transaction réelle.

---

## 6. Brancher les notifications SMS / courriel

Pour recevoir les demandes de prix et de financement par texto/courriel :

- **SMS (Twilio)** : `npm install twilio`, remplissez `TWILIO_*` dans `.env`,
  décommentez le bloc « MODE RÉEL » dans `server/integrations.js`.
- **Courriel (SMTP)** : `npm install nodemailer`, remplissez `SMTP_*` dans `.env`,
  décommentez le bloc correspondant.

---

## 7. Importer le vrai catalogue (523 produits)

Le prototype contient 11 produits d'exemple (dont 2 avec vraies photos). Pour charger
les 523 vrais produits :

1. Exportez le catalogue depuis votre système actuel (`app.meublestroismousquetaires.ca`)
   en CSV, avec colonnes : `slug, nom, ref, cat, img, options, descr, lit`.
2. Un petit script d'import peut être ajouté sur demande — ou insérez-les dans la table
   `products` (voir le schéma dans `server/db.js`). La structure est déjà prête.

---

## 8. Sauvegardes

Toutes les données vivent dans **un seul fichier** : `data/m3m.sqlite`.
Sauvegardez ce fichier régulièrement (copie planifiée) et vous avez tout :
comptes, commandes, inventaire, factures, demandes.

---

## 9. Structure du projet

```
public/            → tout le front-end (ce que voient les visiteurs)
  index.html          portail client
  admin.html          console d'administration
  assets/             CSS, JS, logo
server/            → le back-end (Node + Express)
  index.js            serveur principal
  db.js               base de données (schéma)
  seed.js             données de référence
  routes/api.js       toute l'API REST
  integrations.js     Stripe + SMS/courriel (points de branchement)
data/              → la base de données (créée au 1er démarrage)
.env.example       → modèle de configuration
```

---

## Besoin d'aide ?

Les points à finaliser côté client (clés Stripe, numéro Twilio, import du catalogue,
liste exacte des catégories) sont notés dans le README d'origine. Le reste est prêt
à l'emploi.
