# 🚀 Guide de mise en ligne — étape par étape

Ce guide te mène de « j'ai le dossier du projet » jusqu'à « mon site est en ligne
sur app.meublestroismousquetaires.ca ». Aucune connaissance technique requise —
suis les étapes dans l'ordre.

Le plan : **GitHub** (déposer le code) → **Render** (héberger l'app, gratuit) →
**GoDaddy** (pointer ton domaine dessus).

Compte à te rappeler : Render met le site en veille après 15 min d'inactivité sur
le plan gratuit (il se réveille en ~30 s à la première visite). Pour un site pro
sans veille + base de données qui ne se réinitialise pas, prends le plan **Starter
(7 $/mois)** — j'explique où, plus bas. Tu peux commencer gratuitement et changer après.

---

## ÉTAPE 1 — Mettre le code sur GitHub

Tu as déjà un compte GitHub. Deux façons ; la plus simple est par le site web.

### Le plus simple : par le site GitHub (glisser-déposer)
1. Va sur https://github.com/new
2. **Repository name** : `m3m-portail`
3. Laisse « Private » coché (personne d'autre ne verra le code).
4. Clique **Create repository**.
5. Sur la page suivante, clique le lien **« uploading an existing file »**
   (au milieu de la page).
6. **Décompresse** le fichier `m3m-portail.zip` que je t'ai livré sur ton ordinateur.
   Tu obtiens un dossier `m3m`.
7. Ouvre ce dossier, **sélectionne tout ce qu'il y a dedans** (les fichiers ET les
   sous-dossiers `server`, `public`, etc. — pas le dossier `m3m` lui-même), et
   glisse-les dans la zone de dépôt de GitHub.
8. En bas, clique **Commit changes**.

C'est fait — ton code est sur GitHub. ✅

> 💡 Ne t'inquiète pas pour le fichier `.env` : il n'est pas dans le zip (les secrets
> se configurent directement dans Render à l'étape 2).

---

## ÉTAPE 2 — Déployer sur Render

1. Va sur https://render.com et clique **Get Started** → connecte-toi **avec GitHub**
   (le bouton « GitHub »). Autorise Render à voir tes dépôts.
2. Dans le tableau de bord Render, clique **New +** → **Web Service**.
3. Choisis ton dépôt **`m3m-portail`** dans la liste, clique **Connect**.
4. Render détecte le fichier `render.yaml` et pré-remplit presque tout. Vérifie :
   - **Name** : `m3m-portail` (ou ce que tu veux — ça fait partie de l'URL Render)
   - **Build Command** : `npm install`
   - **Start Command** : `npm start`
5. **Choisis le plan** :
   - **Free** pour tester (gratuit ; le site s'endort après 15 min, et ⚠️ la base de
     données se réinitialise à chaque redéploiement).
   - **Starter (7 $/mois)** recommandé pour la vraie mise en ligne : pas de veille +
     disque persistant (la base de données garde tout). Le `render.yaml` est déjà
     réglé pour ça.
6. **Variables d'environnement** — clique « Advanced » si besoin et ajoute :
   - `ADMIN_CODE` = le code d'accès que tu veux pour la console admin (ex. `1055`
     ou mieux, un code à toi plus long).
   - (`SESSION_SECRET` est généré automatiquement — rien à faire.)
7. Clique **Create Web Service**.

Render installe et démarre l'application (2–4 minutes). Quand c'est fini, tu vois
une adresse du genre `https://m3m-portail.onrender.com` — **clique dessus, ton site
est en ligne !** 🎉

Teste :
- La page d'accueil s'affiche.
- `…onrender.com/admin` → entre ton `ADMIN_CODE`.

---

## ÉTAPE 3 — Brancher ton domaine (app.meublestroismousquetaires.ca)

Ton domaine est chez **GoDaddy**. On va dire à GoDaddy d'envoyer
`app.meublestroismousquetaires.ca` vers Render. **Tes courriels ne seront pas
touchés** (ils sont sur Microsoft Outlook, indépendants de ça).

### 3a. Ajouter le domaine dans Render
1. Dans Render, ouvre ton service → onglet **Settings** → section **Custom Domains**.
2. Clique **Add Custom Domain**, tape `app.meublestroismousquetaires.ca`, valide.
3. Render t'affiche une valeur à copier — en général un **CNAME** pointant vers
   quelque chose comme `m3m-portail.onrender.com`. **Garde cette page ouverte.**

### 3b. Créer l'enregistrement chez GoDaddy
1. Connecte-toi sur https://dcc.godaddy.com/control/portfolio
   (ou GoDaddy → « Mes produits » → à côté du domaine, **DNS**).
2. Ouvre **Gérer le DNS** (Manage DNS) pour `meublestroismousquetaires.ca`.
3. Tu vas voir la liste des enregistrements. Il y a déjà un enregistrement pour `app`
   (type A, vers 160.153.0.81). Il faut le remplacer :
   - **Modifie** (ou supprime puis recrée) l'enregistrement `app`.
   - Type : **CNAME**
   - Nom / Host : `app`
   - Valeur / Points to : `m3m-portail.onrender.com` (la valeur exacte que Render
     t'a donnée à l'étape 3a)
   - TTL : 1 heure (ou la valeur par défaut)
   - **Enregistre.**

> ⚠️ Ne touche à **aucun** enregistrement **MX** ni à ceux liés à
> `outlook`/`microsoft`/`office365` — ce sont tes courriels.

### 3c. Attendre et vérifier
- Le changement DNS prend de quelques minutes à quelques heures à se propager.
- Reviens sur la page « Custom Domains » de Render : quand tout est prêt, tu verras
  une coche verte / « Verified », et le certificat HTTPS s'installe tout seul.
- Ouvre `https://app.meublestroismousquetaires.ca` → ton nouveau site s'affiche. 🎉

---

## ÉTAPE 4 (plus tard) — Activer les vrais paiements et notifications

Quand tu es prêt, ajoute simplement des variables d'environnement dans Render
(onglet **Environment**), puis suis les instructions du fichier
`GUIDE-DEPLOIEMENT.md` (section Stripe et SMS/courriel). Aucun changement de code
compliqué : tout est déjà préparé.

---

## Récapitulatif des identifiants

| Quoi | Valeur |
|---|---|
| Console admin | l'`ADMIN_CODE` que tu as choisi dans Render |
| Compte client démo | `marie-eve@exemple.ca` / `demo1234` |
| URL temporaire Render | `https://m3m-portail.onrender.com` |
| URL finale | `https://app.meublestroismousquetaires.ca` |

---

## Si tu bloques

Dis-moi simplement à quelle étape tu es et ce que tu vois à l'écran (ou envoie-moi
une capture d'écran), et je te débloque. On peut aussi faire l'étape GitHub autrement
(en ligne de commande) si tu préfères — demande-moi.
