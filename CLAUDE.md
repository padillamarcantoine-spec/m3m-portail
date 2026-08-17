# Projet — Portail Meubles Trois Mousquetaires (M3M)

Contexte pour Claude Code. Ce fichier décrit l'architecture, l'état d'avancement,
et ce qu'il reste à faire. Lis-le en premier.

## Vue d'ensemble

Application web pour Meubles Trois Mousquetaires (magasin de meubles, matelas
fabriqués à Montréal, électroménagers — Montréal). Trois magasins reliés :
Meubles Trois Mousquetaires, Matelas Dépôt, Électro Marpad.

Deux interfaces :
- **Portail client** (`public/index.html` + `assets/portail.js`) : accueil, boutique,
  fiche produit, financement (avec simulateur), connexion/espace client, chat IA.
- **Console admin** (`public/admin.html` + `assets/admin.js`) : verrou, tableau de
  bord, commandes fournisseurs multi-magasins, inventaire, fournisseurs.

## Stack

- Backend : Node.js + Express (ESM), `server/`.
- Base de données : SQLite via `better-sqlite3` (`server/db.js`, schéma auto-créé,
  seed dans `server/seed.js`). Un seul fichier `data/m3m.sqlite`.
- Frontend : HTML/CSS/JS vanilla (aucun build), `public/`.
- Auth : `express-session` (client par courriel/mdp bcrypt ; admin par code).

## Décision d'architecture importante

**Perfex CRM est la source de vérité** (clients, factures, contrats, abonnements
Stripe). L'app est la **vitrine**. `server/perfex.js` est le connecteur : il lit/écrit
dans Perfex via son API REST (jeton dans `.env`). Sans clé → mode simulation.

**Stripe** : le financement maison passe idéalement par Perfex (déjà branché à Stripe).
`server/financement.js` contient aussi une intégration Stripe directe (Checkout PAD
canadien `acss_debit`, 1,15 $ de capture, puis abonnement mensuel) si tu préfères gérer
Stripe côté app. À trancher : Perfex-only vs app-gère-Stripe.

## Le flux de financement maison (cœur métier)

1. Client EXISTANT seulement (vérifié via Perfex `estClientExistant`).
2. Simulateur de mensualité — taux **29,99 %** (`calculerMensualite`).
3. Lien de connexion bancaire (Stripe Checkout, PAD `acss_debit`, paiement 1,15 $
   qui enregistre le mandat de prélèvement).
4. Après confirmation banque (4-5 j), abonnement mensuel récurrent auto.
5. Client suit chaque étape depuis son espace.

Tables : `financements`, `financement_etapes`. Routes : `server/routes/v2.js`.

## Agent IA de chat

`server/agent.js` — widget flottant (`public/assets/chat.js`) sur tout le portail.
Appelle Claude (Anthropic) ou OpenAI selon la clé présente ; sinon répond depuis la
base de connaissances (`chat_savoir`, enrichissable via la console admin — l'agent
« apprend »). Escalade vers l'équipe si inconnu.

## État d'avancement

FAIT (backend + API + testé) :
- Catalogue, boutique, fiche produit, demande de prix. ✅
- Auth client + espace client (factures via Perfex, service, aperçu). ✅
- Console admin : commandes, inventaire, fournisseurs (multi-magasins). ✅ (UI v1 en place)
- Financement : simulateur + demande + vérif client existant + calcul 29,99 %. ✅ (API + UI simulateur)
- Chat IA : widget + agent + base de connaissances. ✅
- Service/pièces : API complète (`/api/admin/services`). ✅ (backend seulement)
- Connecteur Perfex : clients, factures, abonnements, leads. ✅ (mode simulation)

À CONSTRUIRE :
- [x] Écran admin **Service / pièces** (`admin.js` — vue + création + avancement).
- [x] Écran admin **Base de connaissances de l'agent** (`admin.js` — liste + ajout).
- [x] Écran client **suivi de financement pas-à-pas** (`portail.js` — demande → connexion bancaire → suivi étapes).
- [x] **Webhook Stripe** (`server/routes/stripe-webhook.js`, monté avant express.json ; PAD confirmé → abonnement mensuel). L'app PILOTE Stripe. Nécessite les clés réelles + STRIPE_WEBHOOK_SECRET pour l'activer.
- [x] **Catalogue réel = 1353 pièces** multi-fournisseurs (Matrix 523 + Sofa by Fancy 692 + A-Class 138 avec photos). Champ `fournisseur` partout. Régén : `python gen_catalogue_combined.py` puis `npm run seed -- --force`.
- [ ] Brancher **Perfex réel** (mettre PERFEX_URL/PERFEX_TOKEN dans .env, tester les endpoints selon ta version).
- [ ] Photos Sofa by Fancy + vrai catalogue Modern Furniture (fourni = juste une étiquette-prix).
- [ ] App séparée Électro Marpad (techniciens/réparations) — projet futur.

## Sécurité & audit (2026-08)

Audit multi-agents effectué. **Corrigés** : bypass du code admin ; IDOR/énumération des financements (refs aléatoires `crypto.randomBytes`, `user_id` lié, `confirmer-demo` bloqué en prod) ; webhook Stripe fail-closed en prod + activation **idempotente** (claim atomique, pas de double abonnement) ; `SESSION_SECRET` obligatoire en prod + cookie `secure` + `trust proxy` ; facture non marquée « payée » sans vrai paiement ; catégories normalisées entre fournisseurs (filtre « Sofa » = 516) ; noms Sofa by Fancy nettoyés ; espace client **piloté par les vraies données** + états vides ; capture live des formulaires admin ; images `lazy`.

**FAIT (2e vague) :** anti-force-brute (limiteur en mémoire sur /auth + /admin + écritures) ; validation du montant financé côté serveur (100–50 000 $) ; **routage d'URL + SEO** (URLs produits partageables `/produit/<slug>`, `document.title`+OG par écran, `robots.txt`, `sitemap.xml` 1357 URLs) ; **panier « Ma sélection »** (localStorage, demande groupée → `/api/demande-prix-lot`) ; **menu mobile** (hamburger) ; params catalogue serveur (`/catalogue?cat=&fournisseur=&q=&limit=&offset=`).

**Photos récupérées en ligne (2026-08) :** **Modern ajouté comme 4e fournisseur** (136 produits Shopify mfurniture.ca, tous avec photo) ; **Sofa by Fancy 336 photos** (API WooCommerce sofabyfancy.com, match par n° de modèle) ; Matrix 513/523 (10 récupérées via /product-detail du site). Catalogue = **1489 pièces, ~1113 avec vraie photo**. Sources dans `supplier-data/` (`sofabyfancy_web.json`, `modern.json`) ; régén via `gen_catalogue_combined.py`. Images hotlink (matrixfurnituregroup.ca, sofabyfancy.com, cdn.shopify.com) — si CSP ajoutée, autoriser ces hôtes.

**Reste (dépend de toi) :** 20 photos Matrix manquantes (pas sur le site facilement) + ~356 Sofa by Fancy hors site ; brancher Perfex/Stripe/IA réels ; validation montant contre la vraie facture Perfex (source de vérité).

NOTE : lancer `npm install` → `npm run seed -- --force` → `npm start`. Déploiement : Render (`render.yaml`, auto-seed au 1er boot si BD vide).

## Vérification sur vrai Node — FAIT (2026-08)
L'app a **réellement tourné** (plus seulement le mock Python). Node **20** installé localement (`C:\Users\padil\AppData\Local\node20\node-v20.20.2-win-x64\` — portable, sans admin) car **better-sqlite3 n'a pas de binaire précompilé pour Node 24** (winget installe la 24 → échec node-gyp faute de Visual Studio ; Node 20 = binaire prêt + correspond à render.yaml). Vérifié bout-en-bout via `http://localhost:3000` : `npm install` (112 pkgs, 0 vuln), `npm run seed -- --force` (4003 produits OK, format 10 clés validé), serveur démarre, **auto-seed si BD vide** (index.js:25). Testés live : facettes (30 cat/7 fourn), boutique paginée, fiche+lies, **login client** (marie-eve/demo1234, session, vraies factures Perfex sim), **simulateur + demande financement** (client existant → réf crypto ; nouveau → dépôt 50 %), **demande de prix → BD → inbox admin**, **console admin** (code 1055, 3 magasins, badges), **chat agent** (base de connaissances, mode simulation), sitemap/robots 200. Repo git initialisé (branche `master`, 184 fichiers, node_modules/.env/sqlite exclus). Livrable : `Cowork/m3m-portail.zip` (via `git archive`, 199 fichiers, propre) pour l'upload GitHub du `GUIDE-MISE-EN-LIGNE.md`.

## CRM intégré + Recouvrement — FAIT (2026-08-17)
L'app est maintenant **le CRM** (plus besoin du module API Perfex pour opérer ; Perfex reste connectable plus tard via `perfex.js`).
- **Écran admin « Clients »** : fiches (recherche, tel/adresse/note), création de fiche en magasin, **création de facture manuelle** (visible instantanément dans l'espace client), marquer payée, solde dû, financements et dossiers du client. Routes : `server/routes/crm.js`.
- **Écran admin « Recouvrement »** : chèques NSF + échecs Stripe. 3 tuiles (à récupérer/récupéré/ouverts), aging 0-30/31-60/61-90/90+, escalade ⚠ MED > 45 j, frais NSF (`FRAIS_NSF`, défaut 15 $), promesse, radiation. **RÈGLE MAISON (dictée par Marc-Antoine)** : un chèque refusé ne se règle JAMAIS par un autre chèque TD — modes permis : Cash, **Dépôt Ginette**, Transfert Interac, Transfert compte perso, **Chèque du mois suivant**. Appliquée serveur (liste blanche + message explicite).
- **Registre des règlements** (`reglements`) : chaque paiement reçu (chèque TD, cash, dépôt Ginette, Interac, compte perso). « Marquer refusé » sur un chèque TD → le règlement tombe à **0 $** (montant original conservé) + **dossier recouvrement auto** avec toutes les infos. Régler un dossier enregistre le règlement correspondant (sauf « chèque du mois suivant »).
- **Webhook Stripe** : `charge.failed`/`invoice.payment_failed`/`payment_intent.payment_failed` → dossier auto (idempotent par event id, lié au plan via stripe_customer/subscription).
- Tables : `paiements_refuses`, `reglements` (db.js) + migrations douces users (tel/adresse/note). Seed démo complet (dossier ouvert, promesse escaladée, récupéré via dépôt Ginette).

## Chasse aux bugs financement — 28 confirmés, tous corrigés (2026-08-17, workflow 36 agents)
Bloquants : **bypass du dépôt 50 %** (/connexion et /confirmer-demo sans garde de statut → gardes + claim webhook durci + ref non divulguée sur refus) ; **onglet Factures client vide** (branche `else if` dupliquée vide dans portail.js) ; **lien Stripe jamais affiché** (window.open bloqué → lien `<a>` rendu + bouton démo caché en mode réel) ; **activation sans paiement confirmé** (PAD asynchrone → n'activer que payment_status='paid' + gérer async_payment_succeeded/failed) ; **échec d'abonnement avalé** (→ rollback statut + 500 pour relivraison Stripe) ; **paquet `stripe` absent** de package.json (→ ajouté ^22). Majeurs : montants québécois « 3 285,50 $ » (normalisation partout, y compris CRM) ; validation stricte 100-50 000 $ / 3-60 mois (fini le repli fantôme 1 000 $) ; abonnement avec **cancel_at** (fini les prélèvements à vie) + PAD rattaché en default_payment_method ; signature webhook toujours exigée si secret configuré ; panne Perfex ≠ « nouveau client » (503 réessayez) ; capture live finMontant/finCourriel/finMois ; erreurs visibles à toutes les étapes ; anti double-clic (busy) ; garde de navigation ; **reprise du flux après F5/retour Stripe** (sessionStorage + route /financement/suivi + réhydratation via GET /financement/:ref) ; seed --force réparé (services/chat manquaient à la purge). Détail complet : tasks/w1wfu94gu.output.

## Lancer

```bash
npm install
cp .env.example .env   # remplir les clés au besoin
npm start              # http://localhost:3000  et  /admin
npm run seed -- --force   # réinitialiser les données de démo
```

Comptes démo : client `marie-eve@exemple.ca` / `demo1234` ; admin code `1055`.

## Conventions

- Français partout (UI + commentaires + messages).
- Design tokens dans `public/assets/base.css` (couleurs, typo — respecter le handoff).
- Chaque intégration externe DOIT avoir un mode simulation (jamais planter sans clé).
- Pas de framework front — garder le JS vanilla, lisible, sans build.


## Fournisseurs 5-6 (2026-08)
**Monarch** ajouté (1532 produits, parsés de `monarch price.pdf` → `supplier-data/monarch_price.json`). **IFDC** ajouté (982 produits, scrapés du site Wix → `supplier-data/ifdc.json`). `Tarification mobilier Trois Mousquetaires.pdf` (ta liste maîtresse, 1815 articles avec prix) = non intégrée (prix cachés = stratégie ; utilisable pour l'admin plus tard).

## Peaufinage IFDC + Monarch — FAIT (2026-08, workflow multi-agents + vérif adversariale)
Catalogue = **4003 pièces, 3644 photos (91 %)**, 30 catégories propres (« Accent » éliminé, « Divers » réduit à 21 codes IFDC inconnus).
- **Photos Monarch 1532/1532** : pattern d'URL découvert `monarchspec.com/images/lifestyle_WEBQ50/I_<code>.jpg`, existence vérifiée par sonde HEAD (`supplier-data/monarch_imgs.json`). Hotlink — si CSP, autoriser monarchspec.com.
- **Noms Monarch réécrits en français propre** (accents, format « Type — attributs », dimensions en po) par 8 agents + mes reprises, style vérifié par 3 lentilles adversariales (fidélité/style/cohérence : 236 corrections déterministes appliquées, 0 violation restante). Résultats dans `scratchpad/monarch_renamed/batch_*.json` (requis par le générateur !).
- **Catégories Monarch** : dérivées de la tête de type du nom réécrit (mapping `TETE2CAT` dans le générateur). Nouvelles catégories : **Luminaire** (217), **Déco** (189), **Lit** (239, partagé IFDC), **Lit superposé** (60).
- **Catégories IFDC** : scrape des 31 vraies pages catégories du site (avec pagination Wix `?page=N`) → `supplier-data/ifdc_site_cats.json`, 937/982 couverts + replis par préfixe (t-=dinette, st-=tabouret, c-=chaise, RHF/LHF=sectionnel). Page « sofa-stationary » = dinettes (vérifié par préfixes T-). Noms IFDC = type FR + code (« Lit superposé B-122H »).
- Pooja Cabinets (Modern) → Armoire ; Dream Dressers → Commode + Miroir. Vedettes 8/8 avec photo (dont lit superposé + lampe Monarch).
- Régénération : `python supplier-data/gen_catalogue_combined.py` (copie durable ; lit `monarch_noms_fr.json`, `monarch_imgs.json`, `ifdc_site_cats.json` dans `supplier-data/`). Puis `npm run seed -- --force`.
- Reste : ~360 sans photo (Sofa by Fancy hors site + qq Matrix), 21 « Divers » IFDC à reclasser via admin, noms IFDC = codes (pas de descriptions fournisseur).

## Pagination serveur — FAIT (2026-08, vérifié via mock Python)
Le client ne charge **plus** `catalogue-data.js` (1,5 Mo). Payload initial ≈ **80 Ko de JS + ~3 Ko** (`/catalogue/facettes`). Tout passe par le serveur, 24 pièces/page.
- **API** (`server/routes/api.js`) : `/catalogue/facettes` (→ `{total, categories, fournisseurs, vedettes}`), `/catalogue?cat=&fournisseur=&q=&limit=&offset=` (→ `{products, total, filtered}`), `/produit/:slug` (→ produit + `lies` = 3 pièces même catégorie).
- **Front** (`public/assets/portail.js`) : `chargerBoutique()` (pagination « Voir plus » qui **append**, filtres + recherche **débounce 300 ms** côté serveur, focus/caret du champ `#q` préservé au re-render), `ensureProduit()` (fiche chargée à la volée, états « Chargement… »/« introuvable »), `ensureSelection()` (réhydrate le panier depuis le serveur après un reload). **Garde de séquence** `_boutiqueSeq` : seule la réponse de la requête la plus récente s'applique (anti-course sur clics/frappes rapides).
- **Cache-busting** : `index.html` charge les assets avec `?v=N` (bump N à chaque release ; sinon le navigateur sert l'ancien JS). ⚠️ Le patch pagination avait introduit une **erreur de syntaxe** (accolade `}` manquante avant le `return` de `screenBoutique`) → corrigée ; re-tester le parse après tout patch auto.
- **Vérifié** : facettes (27 cat / 7 fourn / vedettes), page 1 = 24 + « Voir plus » (24→48→72), filtres fournisseur (Monarch 1532, Sofa 692) et catégorie côté serveur, recherche débounce, fiche + « Vous aimerez aussi » (3), accueil vedettes (4), panier ajout + badge + réhydratation. Aucune erreur console.