# 🚀 Continuer ce projet avec Claude Code

Tu as choisi de passer à **Claude Code** pour faire évoluer ce projet — excellent choix
pour une application de cette ampleur. Voici comment démarrer, étape par étape.

Claude Code est un outil qui s'utilise dans le **terminal** de ton ordinateur. Il garde
le projet en continu, peut se connecter à tes vrais services (Perfex, Stripe), lancer
les tests, et coder avec toi sur la durée.

---

## Étape 1 — Installer ce qu'il faut sur ton ordinateur

1. **Node.js** (version 18+) : télécharge sur https://nodejs.org (bouton « LTS »).
2. **Claude Code** : ouvre un terminal et tape :
   ```bash
   npm install -g @anthropic-ai/claude-code
   ```
   (Sur Mac : l'app « Terminal ». Sur Windows : « PowerShell » ou installe WSL.)

3. Un compte Anthropic avec accès à Claude Code (le même genre de compte que tu utilises
   ici). La première fois que tu lances `claude`, il te demande de te connecter.

---

## Étape 2 — Mettre le projet sur ton ordinateur

1. Décompresse le fichier `m3m-portail.zip` que je viens de te livrer.
2. Tu obtiens un dossier `m3m`. Mets-le où tu veux (ex. ton Bureau).

---

## Étape 3 — Ouvrir le projet dans Claude Code

Dans le terminal :

```bash
cd chemin/vers/m3m      # ex. cd ~/Desktop/m3m
npm install             # installe les dépendances (une fois)
claude                  # lance Claude Code dans ce dossier
```

Claude Code lit automatiquement le fichier **`CLAUDE.md`** que j'ai préparé — il y
trouve toute l'architecture, l'état d'avancement, et ce qu'il reste à faire. Tu peux
donc lui parler directement, par exemple :

> « Lis CLAUDE.md. Construis l'écran admin Service/pièces contre l'API existante. »

> « Aide-moi à brancher mon vrai compte Stripe pour le financement maison. »

> « Connecte mon Perfex CRM — voici mon URL et mon jeton API. »

---

## Étape 4 — Tester en local

Pendant le développement, pour voir le site :

```bash
npm start
```
Puis ouvre http://localhost:3000 (portail) et http://localhost:3000/admin (console).

Comptes de démo : client `marie-eve@exemple.ca` / `demo1234` ; admin code `1055`.

---

## Ce qui est déjà fait (et testé)

- Portail client complet + boutique + fiche produit + demande de prix.
- Espace client (factures, service, aperçu).
- Console admin : commandes multi-magasins, inventaire, fournisseurs.
- **Financement maison** : simulateur (taux 29,99 %), vérification « client existant »,
  calcul des mensualités — API prête, avec le module Stripe (PAD 1,15 $ → abonnement).
- **Agent IA de chat** : widget sur tout le site, base de connaissances qui s'enrichit.
- **Connecteur Perfex** : clients, factures, abonnements (en mode simulation tant que
  tu n'as pas mis ton URL + jeton).
- **Service/pièces** : toute l'API est prête.

## Ce qu'il reste (Claude Code t'aidera à le faire)

Voir la section « À CONSTRUIRE » dans `CLAUDE.md`. En résumé : quelques écrans admin
(service, base de connaissances), le suivi de financement détaillé côté client, les
webhooks Stripe réels, le branchement Perfex réel, et l'import des 523 produits.

---

## Tes 3 clés à préparer (quand tu seras prêt)

1. **Stripe** : `STRIPE_SECRET_KEY` (dashboard.stripe.com/apikeys).
2. **Perfex** : `PERFEX_URL` + `PERFEX_TOKEN` (dans Perfex : Setup → API → Tokens).
3. **Agent IA** : `ANTHROPIC_API_KEY` (ou `OPENAI_API_KEY`).

Tu les mets dans le fichier `.env` (copie de `.env.example`). **Ne partage jamais
ce fichier** et ne le mets pas sur GitHub (il est déjà dans `.gitignore`).

---

## Si tu bloques

Claude Code peut t'expliquer et faire presque tout à ta place — décris-lui simplement
ce que tu veux, en français. Et tu peux toujours revenir ici (Cowork) pour des questions
ou pour que je te prépare des morceaux.
