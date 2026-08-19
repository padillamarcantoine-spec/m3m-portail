/* Portail client — SPA vanilla JS, câblée à l'API REST.
   Écrans : accueil, boutique, fiche produit, financement, connexion, espace client. */
(() => {
'use strict';

// ---- petits utilitaires DOM ----
const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
async function api(path, opts = {}) {
  const r = await fetch('/api' + path, {
    method: opts.method || 'GET',
    headers: opts.body ? { 'Content-Type': 'application/json' } : {},
    body: opts.body ? JSON.stringify(opts.body) : undefined
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || 'Erreur');
  return data;
}

// ---- état global ----
const S = {
  route: 'accueil', slug: null, menuOuvert: false,
  connecte: false, nom: '', stripeConnecte: false,
  total: 0, categories: [], fournisseurs: [], vedettes: [], cache: {}, lies: [], produitErr: false,
  boutique: { items: [], filtered: 0, loading: false }, _boutiqueSeq: 0,
  q: '', cat: 'Tout', fourn: 'Tous',
  prix: { e: 0, format: '', nom: '', tel: '', err: false },
  fin: { e: 0, item: '', montant: '', nMois: 18, nom: '', courriel: '', tel: '', ref: '', calcul: null, statut: '', etapes: [], message: '', err: '', url: '' },
  ongletConnexion: 'connexion', ongletCompte: 'apercu',
  ident: '', mdp: '', insNom: '', insCourriel: '', insMdp: '', insTel: '', authErr: '', lieCrm: false,
  factures: [], facturesErr: false, service: [], financements: [],
  selection: [], selNom: '', selTel: '', selErr: '', selEnvoye: false,
  srvItem: '', srvDesc: '', srvPhoto: false, srvEnvoye: false, srvRef: '', srvErr: false
};

const CATEGORIES = ['Tout','Base de lit','Causeuse','Chaises de salle à manger (paire)','Chiffonnier','Commode + Miroir','Ensemble chambre','Ensemble salle à manger','Ensemble salon','Fauteuil','Miroir','Sectionnel','Sofa','Table','Table d’appoint','Table de nuit','Table de salon'];

// ================= navigation =================
const BASE_TITLE = 'Meubles Trois Mousquetaires';
function urlFor(route, slug) {
  if (route === 'produit') return '/produit/' + encodeURIComponent(slug || '');
  if (route === 'accueil') return '/';
  return '/' + route;
}
function updateSEO() {
  const p = S.route === 'produit' ? S.cache[S.slug] : null;
  const titres = { accueil: 'Meubles, matelas & électroménagers — Montréal', boutique: 'Boutique — ' + (S.total || '') + ' pièces', financement: 'Financement à votre rythme', connexion: 'Portail client', compte: 'Mon espace', selection: 'Ma sélection' };
  document.title = (p ? p.nom : (titres[S.route] || BASE_TITLE)) + ' | ' + BASE_TITLE;
  const desc = p ? (p.descr || p.nom) : 'Des milliers de meubles et électroménagers en salle de montre à Montréal. Demandez votre prix, financez à votre rythme, livraison et installation gant blanc.';
  const set = (sel, val) => { const el = document.querySelector(sel); if (el && val != null) el.setAttribute('content', val); };
  set('meta[name="description"]', desc);
  set('meta[property="og:title"]', document.title);
  set('meta[property="og:description"]', desc);
  set('meta[property="og:type"]', p ? 'product' : 'website');
  if (p && p.img) set('meta[property="og:image"]', p.img);
  set('meta[property="og:url"]', location.origin + urlFor(S.route, S.slug));
  const c = document.querySelector('link[rel="canonical"]'); if (c) c.setAttribute('href', location.origin + urlFor(S.route, S.slug));
}
function navFromPath() {
  const seg = decodeURIComponent(location.pathname).split('/').filter(Boolean);
  let route = 'accueil', slug = null;
  if (seg[0] === 'produit' && seg[1]) { route = 'produit'; slug = seg[1]; }
  else if (seg[0] === 'financement' && seg[1] === 'suivi') {
    // Retour de Stripe après le 1,15 $ : on mémorise la ref et on réhydrate le suivi.
    route = 'financement';
    const id = new URLSearchParams(location.search).get('id');
    if (id) { try { sessionStorage.setItem('m3m_fin', id); } catch (e) {} }
  }
  else if (['boutique', 'financement', 'connexion', 'compte', 'selection'].includes(seg[0])) route = seg[0];
  if (route === 'compte' && !S.connecte) route = 'connexion';
  S.route = route; S.slug = slug;
  if (route === 'produit') S.prix = { e: 0, format: '', nom: '', tel: '', err: false };
  render(); updateSEO(); window.scrollTo(0, 0); afterNav();
}
window.addEventListener('popstate', navFromPath);
const PAGE = 24;
function cacheProds(arr) { for (const p of (arr || [])) if (p && p.slug) S.cache[p.slug] = p; }
async function chargerBoutique(reset) {
  const seq = ++S._boutiqueSeq;                       // jeton : seule la requête la plus récente s'applique
  if (reset) S.boutique = { items: [], filtered: 0, loading: true }; else S.boutique.loading = true;
  const qp = new URLSearchParams();
  if (S.cat && S.cat !== 'Tout') qp.set('cat', S.cat);
  if (S.fourn && S.fourn !== 'Tous') qp.set('fournisseur', S.fourn);
  if (S.q.trim()) qp.set('q', S.q.trim());
  qp.set('limit', PAGE); qp.set('offset', S.boutique.items.length);
  render();
  try {
    const r = await api('/catalogue?' + qp.toString());
    if (seq !== S._boutiqueSeq) return;               // une requête plus récente a pris le relais → on ignore
    cacheProds(r.products);
    S.boutique.items = S.boutique.items.concat(r.products || []);
    S.boutique.filtered = (r.filtered != null ? r.filtered : r.total) || 0;
  } catch (e) { if (seq !== S._boutiqueSeq) return; }
  S.boutique.loading = false; render();
}
async function ensureProduit(slug) {
  S.produitErr = false; S.lies = []; render();
  try {
    const r = await api('/produit/' + encodeURIComponent(slug));
    if (r && !r.error) { S.cache[slug] = r; S.lies = r.lies || []; cacheProds(r.lies); }
    else S.produitErr = true;
  } catch (e) { S.produitErr = true; }
  render();
}
async function ensureSelection() {
  const manquants = S.selection.filter(sl => !S.cache[sl]);
  for (const sl of manquants) { try { const r = await api('/produit/' + encodeURIComponent(sl)); if (r && !r.error) S.cache[sl] = r; } catch (e) {} }
  render();
}
async function rehydraterFin() {
  let ref = null;
  try { ref = sessionStorage.getItem('m3m_fin'); } catch (e) {}
  if (!ref || S.fin.e !== 0) return;
  try {
    const f = await api('/financement/' + encodeURIComponent(ref));
    if (!f || f.error) return;
    const e = f.statut === 'actif' ? 3 : ['lien_envoye', 'banque_connectee'].includes(f.statut) ? 2 : f.statut === 'demande' ? 1 : 0;
    if (!e) { try { sessionStorage.removeItem('m3m_fin'); } catch (e2) {} return; }
    Object.assign(S.fin, { e, ref: f.ref, item: f.item, nom: f.nom, statut: f.statut, etapes: f.etapes || [], simulation: f.simulation });
    render();
  } catch (e) {}
}
function afterNav() {
  if (S.route === 'financement') rehydraterFin();
  if (S.route === 'boutique') chargerBoutique(true);
  else if (S.route === 'produit') ensureProduit(S.slug);
  else if (S.route === 'selection') ensureSelection();
}
function saveSel() { try { localStorage.setItem('m3m_sel', JSON.stringify(S.selection)); } catch (e) {} }

function go(route, opts = {}) {
  S.menuOuvert = false;
  S.route = route;
  if (opts.slug !== undefined) S.slug = opts.slug;
  if (route === 'produit') S.prix = { e: 0, format: '', nom: '', tel: '', err: false };
  if (route === 'financement' && ![1, 2].includes(S.fin.e)) S.fin = { e: 0, item: '', montant: '', nMois: 18, nom: '', courriel: '', tel: '', ref: '', calcul: null, statut: '', etapes: [], message: '', err: '', url: '' };
  history.pushState({}, '', urlFor(route, S.slug));
  render(); updateSEO();
  window.scrollTo(0, 0); afterNav();
}

// ================= composants =================
function header() {
  const acct = S.connecte
    ? `<button class="navbtn solid" data-go="compte">Mon espace</button>`
    : `<span style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
         <button class="navbtn ghost" data-go="connexion">Se connecter</button>
         <button class="navbtn solid" data-act="inscription">Créer un compte</button>
       </span>`;
  return `<header class="site${S.menuOuvert ? ' open' : ''}"><div class="bar">
    <button class="brand" data-go="accueil">
      <img src="/assets/logo.png" alt="">
      <span style="display:flex;flex-direction:column;gap:2px">
        <span class="kick">Meubles — Montréal</span>
        <span class="name">Trois Mousquetaires</span>
      </span>
    </button>
    <button class="menu-toggle" data-act="menu" aria-label="Menu" aria-expanded="${S.menuOuvert}">\u2630</button>
    <nav aria-label="Navigation principale">
      <button class="navlink" data-go="boutique">Boutique</button>
      <button class="navlink" data-go="financement">Financement</button>
      ${S.selection.length ? `<button class="navlink" data-go="selection" style="color:var(--or-fonce);font-weight:600">Ma s\u00e9lection (${S.selection.length})</button>` : ''}
      <span class="navsep"></span>${acct}
    </nav>
  </div></header>`;
}

function productCard(p, showDemander = true) {
  const img = p.img
    ? `<img src="${esc(p.img)}" alt="${esc(p.nom)}" loading="lazy" decoding="async">`
    : `<span class="ph placeholder-stripe"><span>${esc(('photo — ' + p.nom).toUpperCase())}</span></span>`;
  return `<button class="prod" data-open="${esc(p.slug)}">
    <span class="img">${img}</span>
    <span class="body">
      <span class="cat">${esc(p.cat)}${p.fournisseur ? ' · ' + esc(p.fournisseur) : ''}</span>
      <span class="nom">${esc(p.nom)}</span>
      <span class="foot">
        <span class="prix">Prix sur demande</span>
        ${showDemander ? '<span class="dem">Demander →</span>' : ''}
      </span>
    </span>
  </button>`;
}

function footer() {
  return `<footer class="site"><div class="in">
    <div class="cols">
      <div>
        <div style="display:flex;align-items:center;gap:12px">
          <span style="background:#fffdf8;border-radius:6px;padding:7px;display:inline-flex"><img src="/assets/logo.png" alt="" style="height:38px;display:block"></span>
          <span style="display:flex;flex-direction:column;gap:2px"><span style="font-size:8.5px;letter-spacing:.32em;text-transform:uppercase;color:var(--laiton);font-weight:600">Meubles — Montréal</span><span style="font-family:var(--serif);font-weight:600;font-size:20px;color:var(--creme-claire)">Trois Mousquetaires</span></span>
        </div>
        <p style="margin:16px 0 0;font-size:13.5px;line-height:1.65;color:var(--beige-sec)">2485, rue Leclaire<br>Montréal (QC) H1V 3A6<br><a href="tel:+15142511055" style="color:var(--laiton)">(514) 251-1055</a> · texto <a href="sms:+15146091239" style="color:var(--laiton)">514-609-1239</a></p>
      </div>
      <div><div class="h">Naviguer</div><div style="display:flex;flex-direction:column;gap:10px;align-items:flex-start">
        <button class="lnk" data-go="accueil">Accueil</button>
        <button class="lnk" data-go="boutique">Boutique</button>
        <button class="lnk" data-go="financement">Financement</button>
      </div></div>
      <div><div class="h">Votre compte</div><div style="display:flex;flex-direction:column;gap:10px;align-items:flex-start">
        <button class="lnk" data-go="connexion">Se connecter</button>
        <button class="lnk" data-act="inscription">Créer un compte</button>
        <button class="lnk" data-go="financement">Demande de financement</button>
      </div></div>
      <div><div class="h">Nos promesses</div><p style="margin:0;font-size:13.5px;line-height:1.75;color:var(--beige-sec)">Livraison gratuite à Montréal et environs. Installation gant blanc le jour même. Financement en quatre options.</p></div>
    </div>
    <div class="bottom">
      <span style="font-size:12px;color:var(--gris-brun2)">© 2026 Meubles Trois Mousquetaires — Tous droits réservés</span>
      <span style="display:flex;gap:16px;flex-wrap:wrap"><span style="font-size:12px;color:var(--gris-brun2)">info@meublestroismousquetaires.ca</span><a href="/admin" style="font-size:12px;color:var(--gris-brun)">Administration</a></span>
    </div>
  </div></footer>`;
}

// ================= écran : ACCUEIL =================
function screenAccueil() {
  const vedettes = (S.vedettes || []).slice(0, 4);
  return `<main class="m3mFade" data-screen="Accueil" aria-label="Accueil">
    <section class="hero"><div class="in">
      <div>
        <div class="eyebrow on-dark" style="margin-bottom:22px">Meubles &amp; électroménagers — Montréal</div>
        <h1 class="serif">Tous pour un <em>chez-vous</em>.</h1>
        <p>Des milliers de meubles et électroménagers choisis avec soin, en salle de montre à Montréal. Demandez votre prix en quelques clics, financez à votre rythme — livraison et installation gant blanc incluses.</p>
        <div style="display:flex;gap:14px;flex-wrap:wrap;margin-top:38px">
          <button class="btn btn-or" data-go="boutique">Découvrir la boutique</button>
          <button class="btn btn-ghost-dark" data-go="financement">Options de financement</button>
        </div>
      </div>
      <div style="justify-self:center;width:min(380px,100%)">
        <div class="hero-card">
          <img src="/assets/logo.png" alt="" style="width:min(210px,58%);display:block">
          <div style="width:44px;height:1px;background:var(--laiton)"></div>
          <div style="text-align:center;display:flex;flex-direction:column;gap:6px">
            <span style="font-size:10px;letter-spacing:.26em;text-transform:uppercase;color:var(--gris-brun2);font-weight:500">Des milliers de pièces en salle de montre</span>
            <span style="font-family:var(--serif);font-style:italic;font-size:19px;color:var(--encre)">2485, rue Leclaire — Montréal</span>
          </div>
        </div>
      </div>
    </div></section>

    <section class="services"><div class="in">
      <div class="service"><div class="t">Livraison gratuite</div><div class="s">Montréal et environs</div></div>
      <div class="service"><div class="t">Installation gant blanc</div><div class="s">Montage inclus, le jour même</div></div>
      <div class="service"><div class="t">Délai de 3 à 14 jours</div><div class="s">Date confirmée à la commande</div></div>
      <div class="service"><div class="t">Financement flexible</div><div class="s">Quatre options, demande en ligne</div></div>
    </div></section>

    <section class="container pad">
      <div style="display:flex;align-items:flex-end;justify-content:space-between;gap:20px;flex-wrap:wrap;margin-bottom:34px">
        <div>
          <div class="eyebrow" style="margin-bottom:10px">Notre collection</div>
          <h2 class="serif" style="font-size:clamp(32px,3.6vw,46px)">Pièces en vedette</h2>
        </div>
        <button data-go="boutique" style="background:none;border:none;padding:0 0 3px;cursor:pointer;font-size:13.5px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--or-fonce);border-bottom:1px solid var(--laiton)">Tout le catalogue — ${S.total} pièces</button>
      </div>
      <div class="grid-prod">${vedettes.map(p => productCard(p)).join('')}</div>
    </section>

    <section class="section-dark"><div class="container" style="padding:clamp(60px,8vw,100px) 24px">
      <div class="eyebrow on-dark" style="margin-bottom:12px">Portail client</div>
      <h2 class="serif" style="font-size:clamp(32px,3.8vw,48px);line-height:1.08;color:var(--creme-claire);max-width:22ch">Tout votre magasin, dans votre compte.</h2>
      <p style="margin:18px 0 0;max-width:60ch;font-size:15.5px;line-height:1.65;color:var(--beige-sec)">Factures, versements, livraisons, service après-vente : votre espace client rassemble tout, du salon de montre jusqu'à votre salon.</p>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:22px;margin-top:44px">
        <div class="num-card"><div class="n">01</div><div class="t">Factures et paiements</div><p>Consultez vos factures et payez en ligne, en tout temps. Reçus et historique au même endroit.</p></div>
        <div class="num-card"><div class="n">02</div><div class="t">Prélèvements automatiques</div><p>Connectez votre compte bancaire en toute sécurité avec Stripe — vos versements de financement maison se font tout seuls.</p></div>
        <div class="num-card"><div class="n">03</div><div class="t">Service après-vente</div><p>Un pépin avec un meuble ? Ouvrez une demande en deux minutes, photo à l'appui, et suivez-la jusqu'à la résolution.</p></div>
      </div>
      <div style="display:flex;gap:14px;flex-wrap:wrap;margin-top:38px">
        <button class="btn btn-or" data-act="inscription">Créer mon compte</button>
        <button class="btn btn-ghost-dark" data-go="connexion">J'ai déjà un compte</button>
      </div>
    </div></section>

    <section class="container pad">
      <div class="card" style="padding:clamp(30px,4.5vw,52px);display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:clamp(28px,4vw,56px);align-items:center">
        <div>
          <div class="eyebrow" style="margin-bottom:12px">Financement</div>
          <h3 class="serif" style="font-size:clamp(28px,3vw,38px)">Payez à votre rythme.</h3>
          <p style="margin:14px 0 0;font-size:15px;line-height:1.65;color:var(--gris-brun);max-width:48ch">Quatre chemins vers la maison de vos rêves — demande en ligne en quelques minutes, réponse à présenter en magasin, et c'est réglé.</p>
          <button class="btn" style="margin-top:26px" data-go="financement">Explorer le financement</button>
        </div>
        <div style="display:flex;flex-direction:column">
          ${[['Fairstone','Demande en ligne ou par texto'],['Affirm','Préqualification en quelques minutes'],['iFinance','Demande en ligne'],['Financement maison','Directement avec le magasin']].map((f,i,a)=>`<div style="display:flex;align-items:baseline;justify-content:space-between;gap:14px;padding:14px 0;border-top:1px solid #e9e1cd${i===a.length-1?';border-bottom:1px solid #e9e1cd':''}"><span style="font-size:14.5px;font-weight:600;letter-spacing:.03em">${f[0]}</span><span style="font-size:12.5px;color:${i===a.length-1?'var(--or-fonce)':'var(--gris-brun)'};font-weight:${i===a.length-1?'500':'400'}">${f[1]}</span></div>`).join('')}
        </div>
      </div>
    </section>

    <section class="container" style="padding:0 24px clamp(64px,8vw,104px)">
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:clamp(28px,4vw,64px);align-items:center">
        <div>
          <div class="eyebrow" style="margin-bottom:12px">La salle de montre</div>
          <h2 class="serif" style="font-size:clamp(30px,3.4vw,44px);max-width:18ch">Venez toucher avant d'acheter.</h2>
          <p style="margin:16px 0 0;font-size:15px;line-height:1.65;color:var(--gris-brun);max-width:50ch">Nos conseillers vous reçoivent en salle de montre, sur la rue Leclaire — et le meilleur prix se discute toujours de vive voix.</p>
          <div style="margin-top:28px;display:flex;flex-direction:column;gap:10px">
            <a href="tel:+15142511055" style="font-family:var(--serif);font-weight:600;font-size:30px;color:var(--encre);text-decoration:none">(514) 251-1055</a>
            <span style="font-size:14px;color:var(--gris-brun)">2485, rue Leclaire, Montréal (QC) H1V 3A6</span>
            <span style="font-size:14px;color:var(--gris-brun)">Par texto : <a href="sms:+15146091239">514-609-1239</a></span>
          </div>
        </div>
        <div class="placeholder-stripe" style="aspect-ratio:5/4;border:1px solid var(--bord);border-radius:4px;display:flex;align-items:center;justify-content:center">
          <span style="font-family:var(--mono);font-size:11px;letter-spacing:.18em;color:var(--gris-brun2);text-align:center;padding:20px">PHOTO — SALLE DE MONTRE<br>RUE LECLAIRE</span>
        </div>
      </div>
    </section>
  </main>`;
}

// ================= écran : BOUTIQUE =================
function screenBoutique() {
  const b = S.boutique;
  const chips = S.categories.map(c =>
    `<button class="chip${S.cat === c ? ' actif' : ''}" data-cat="${esc(c)}" aria-pressed="${S.cat === c}">${esc(c)}</button>`).join('');
  const fournChips = S.fournisseurs.map(fr =>
    `<button class="chip${S.fourn === fr ? ' actif' : ''}" data-fourn="${esc(fr)}" aria-pressed="${S.fourn === fr}">${esc(fr === 'Tous' ? 'Tous les fournisseurs' : fr)}</button>`).join('');
  const nb = b.filtered;
  let grid;
  if (b.loading && !b.items.length) {
    grid = `<div style="padding:64px 24px;text-align:center;color:var(--gris-brun2)">Chargement…</div>`;
  } else if (b.items.length) {
    const reste = nb - b.items.length;
    const plus = reste > 0 ? `<div style="text-align:center;margin-top:34px"><button class="btn btn-ghost" data-act="voir-plus"${b.loading ? ' disabled' : ''}>${b.loading ? 'Chargement…' : 'Voir plus — ' + reste + ' pièces de plus'}</button></div>` : '';
    grid = `<div class="grid-prod" style="margin-top:26px">${b.items.map(p => productCard(p)).join('')}</div>${plus}`;
  } else {
    grid = `<div class="card" style="margin-top:26px;padding:56px 28px;text-align:center">
        <div class="serif" style="font-weight:600;font-size:26px">Rien ici pour l'instant.</div>
        <p style="margin:10px auto 0;max-width:52ch;font-size:14px;line-height:1.65;color:var(--gris-brun)">Aucun résultat pour ces filtres — la boutique compte ${S.total} pièces. Dites-nous ce que vous cherchez, on vous le trouve.</p>
        <button class="btn btn-ghost" style="margin-top:22px" data-act="reset-boutique">Voir toutes les pièces</button>
      </div>`;
  }
  return `<main class="m3mFade container" style="padding:clamp(44px,6vw,72px) 24px clamp(64px,8vw,96px)" data-screen="Boutique" aria-label="Boutique">
    <div class="eyebrow" style="margin-bottom:12px">Collection</div>
    <h1 class="serif" style="font-size:clamp(38px,4.6vw,58px)">La boutique</h1>
    <p style="margin:16px 0 0;max-width:56ch;font-size:15.5px;line-height:1.65;color:var(--gris-brun)">${S.total} pièces sélectionnées avec soin. Demandez votre prix en quelques clics — notre équipe vous recontacte rapidement avec la meilleure offre.</p>
    <div style="margin-top:36px;display:flex;flex-direction:column;gap:18px">
      <input id="q" value="${esc(S.q)}" aria-label="Chercher dans la boutique" placeholder="Chercher une pièce, une référence…" style="width:min(440px,100%);background:transparent;border:none;border-bottom:1px solid #c7bba0;padding:10px 2px;font-size:15.5px;color:var(--encre);border-radius:0">
      <div style="display:flex;flex-wrap:wrap;gap:8px">${chips}</div>
      <div style="display:flex;flex-wrap:wrap;gap:8px">${fournChips}</div>
      <div style="font-size:12.5px;color:var(--gris-brun2)">${nb} résultat${nb > 1 ? 's' : ''} sur ${S.total} · ${b.items.length} affichée${b.items.length > 1 ? 's' : ''}</div>
    </div>
    ${grid}
  </main>`;
}

// ================= écran : FICHE PRODUIT =================
function screenProduit() {
  const prod = S.cache[S.slug];
  if (!prod) return `<main class="m3mFade container" style="padding:90px 24px;text-align:center" data-screen="Fiche produit" aria-label="Fiche produit">${S.produitErr ? 'Produit introuvable.' : 'Chargement…'}</main>`;
  const notes = [
    'Livraison gratuite à Montréal et environs',
    'Installation gant blanc le jour de la livraison — montage inclus',
    'Délai typique de 3 à 14 jours ouvrables, date confirmée à la commande'
  ];
  if (prod.lit) notes.push('Matelas et sommier vendus séparément');
  const lies = (S.lies || []).slice(0, 3);
  const opts = (prod.options.length ? prod.options : ['Obtenir mon prix']);
  const dansSel = S.selection.includes(prod.slug);
  const px = S.prix;
  const img = prod.img
    ? `<img src="${esc(prod.img)}" alt="${esc(prod.nom)}" loading="lazy" decoding="async" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover">`
    : `<span class="ph placeholder-stripe" style="padding:20px"><span style="font-size:11px">${esc(('photo — ' + prod.nom).toUpperCase())}</span></span>`;

  // module demande de prix (chat conseiller)
  let chat = '';
  if (px.e === 0) {
    chat = `<div style="display:flex;flex-wrap:wrap;gap:8px;padding-left:40px">${opts.map(o =>
      `<button class="opt-chip${px.format === o ? ' actif' : ''}" data-prixopt="${esc(o)}" aria-pressed="${px.format === o}">${esc(o)}</button>`).join('')}</div>`;
  } else if (px.e === 1) {
    chat = `<div style="display:flex;justify-content:flex-end"><div class="bubble-out">${esc(px.format)}</div></div>
      <div class="chat-msg"><span class="chat-av">M3M</span><div class="bubble-in">Parfait. À quel numéro peut-on vous texter le prix ?</div></div>
      <div style="display:flex;flex-direction:column;gap:10px;padding-left:40px">
        <div style="display:flex;gap:10px;flex-wrap:wrap">
          <input id="prixNom" value="${esc(px.nom)}" placeholder="Votre nom" aria-label="Votre nom" autocomplete="name" class="field" style="flex:1;min-width:150px;background:var(--surface)">
          <input id="prixTel" value="${esc(px.tel)}" placeholder="Cellulaire" type="tel" inputmode="tel" autocomplete="tel" aria-label="Votre cellulaire" class="field" style="flex:1;min-width:150px;background:var(--surface)">
        </div>
        ${px.err ? '<div class="err">Entrez votre nom et votre cellulaire pour recevoir le prix.</div>' : ''}
        <button class="btn" style="align-self:flex-start" data-act="envoyer-prix">Recevoir mon prix</button>
      </div>`;
  } else {
    const prenom = (px.nom.trim().split(' ')[0] || '');
    chat = `<div style="display:flex;justify-content:flex-end"><div class="bubble-out">${esc(px.nom)} — ${esc(px.tel)}</div></div>
      <div class="chat-msg"><span class="chat-av">M3M</span><div class="bubble-in" style="border-color:var(--laiton)">Merci ${esc(prenom)} — votre demande est bien reçue. Un conseiller vous texte le prix de « ${esc(prod.nom)} » rapidement. Pressé ? <a href="tel:+15142511055">(514) 251-1055</a>.</div></div>`;
  }

  return `<main class="m3mFade container" style="padding:clamp(28px,4vw,44px) 24px clamp(64px,8vw,96px)" data-screen="Fiche produit" aria-label="Fiche produit">
    <div style="display:flex;align-items:center;gap:10px;font-size:13px;color:var(--gris-brun2);flex-wrap:wrap">
      <button data-go="boutique" style="background:none;border:none;padding:0;cursor:pointer;font-size:13px;color:var(--or-fonce);font-weight:500">← Boutique</button>
      <span>/</span><span>${esc(prod.cat)}</span>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:clamp(28px,4vw,56px);margin-top:26px;align-items:start">
      <div>
        <div class="card" style="overflow:hidden"><div style="aspect-ratio:4/3;position:relative;background:var(--creme-fonce)">${img}</div></div>
        <div style="margin-top:12px;font-family:var(--mono);font-size:10.5px;letter-spacing:.14em;color:var(--gris-brun2)">RÉF. ${esc(prod.ref)} — ${esc((prod.fournisseur || 'Collection').toUpperCase())}</div>
      </div>
      <div>
        <div class="eyebrow" style="margin-bottom:10px">${esc(prod.cat)}</div>
        <h1 class="serif" style="font-size:clamp(32px,3.8vw,46px);line-height:1.08;text-wrap:balance">${esc(prod.nom)}</h1>
        <div style="display:flex;align-items:center;gap:14px;margin-top:16px;flex-wrap:wrap">
          <span style="font-size:16px;font-weight:600;letter-spacing:.03em">Prix sur demande</span>
          <span style="font-size:11px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:var(--or-fonce);border:1px solid #d8c89b;border-radius:999px;padding:5px 12px">Prix web — en ligne seulement</span>
        </div>
        <div style="margin-top:16px"><button class="btn ${dansSel ? 'btn-ghost' : ''}" data-select="${esc(prod.slug)}">${dansSel ? '\u2713 Dans ma s\u00e9lection' : '+ Ajouter \u00e0 ma s\u00e9lection'}</button></div>
        <p style="margin:18px 0 0;font-size:15px;line-height:1.7;color:var(--gris-brun)">${esc(prod.descr)}</p>
        <div style="margin-top:22px;display:flex;flex-direction:column">
          ${notes.map(n => `<div style="display:flex;align-items:baseline;gap:12px;padding:11px 0;border-top:1px solid #e9e1cd"><span style="width:6px;height:6px;background:var(--laiton);flex:none;transform:rotate(45deg)"></span><span style="font-size:13.5px;line-height:1.5;color:var(--gris-brun3)">${esc(n)}</span></div>`).join('')}
        </div>
        <div class="card" style="margin-top:30px;overflow:hidden">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:16px 20px;border-bottom:1px solid var(--bord4)">
            <span style="font-size:13px;font-weight:600;letter-spacing:.12em;text-transform:uppercase">Demande de prix</span>
            <span style="font-size:12px;color:var(--gris-brun2)">Sans engagement</span>
          </div>
          <div style="padding:20px;background:#f4efe3;display:flex;flex-direction:column;gap:14px">
            <div class="chat-msg"><span class="chat-av">M3M</span><div class="bubble-in">Bonjour ! Ce modèle est offert en prix sur demande. Dites-moi ce qu'il vous faut — je vous texte notre meilleur prix.</div></div>
            ${chat}
          </div>
        </div>
      </div>
    </div>
    <div style="margin-top:clamp(48px,6vw,80px)">
      <div class="eyebrow" style="margin-bottom:10px">Dans la même collection</div>
      <h3 class="serif" style="font-size:clamp(26px,3vw,34px);margin-bottom:26px">Vous aimerez aussi</h3>
      <div class="grid-prod">${lies.map(p => productCard(p, false)).join('')}</div>
    </div>
  </main>`;
}

// ================= écran : FINANCEMENT =================
function screenFinancement() {
  // Vrais codes QR (scannables) vers chaque partenaire de financement — images
  // intégrées à l'app (public/assets/financement/), aucune dépendance externe.
  const qrImg = (key, nom) => `<img src="/assets/financement/qr-${key}.png" alt="Code QR — demande ${esc(nom)}" width="92" height="92" style="width:92px;height:92px;flex:none;border:1px solid var(--bord3);border-radius:4px;background:#fff;padding:4px;box-sizing:border-box" loading="lazy">`;
  const opt = (n, nom, etapes, url, label, note, qrKey) => `<div class="card" style="padding:28px;display:flex;flex-direction:column;gap:18px">
    <div><div style="font-size:10.5px;font-weight:600;letter-spacing:.2em;text-transform:uppercase;color:var(--or-fonce)">Option 0${n}</div><h3 class="serif" style="margin:8px 0 0;font-size:28px">${nom}</h3></div>
    <div style="display:flex;flex-direction:column">${etapes.map((e,i)=>`<div style="display:flex;gap:14px;padding:11px 0;border-top:1px solid var(--bord4)"><span style="font-family:var(--serif);font-weight:600;font-size:21px;color:var(--laiton);width:20px;flex:none">${i+1}</span><span style="font-size:13.5px;line-height:1.55;color:var(--gris-brun3)">${e}</span></div>`).join('')}</div>
    <div style="display:flex;align-items:center;gap:16px;margin-top:auto;padding-top:6px">${qrImg(qrKey, nom)}<span style="font-size:12px;line-height:1.5;color:var(--gris-brun2)">${note}</span></div>
    <a href="${url}" target="_blank" rel="noopener" class="btn" style="display:block;text-align:center;text-decoration:none">${label}</a>
  </div>`;

  const fin = S.fin;
  const tracker = (etapes) => `<div style="display:flex;flex-direction:column;margin-top:4px">${(etapes || []).map(e => `<div style="display:flex;gap:12px;padding:9px 0"><span style="width:10px;height:10px;border-radius:50%;flex:none;margin-top:3px;${e.fait ? 'background:var(--laiton)' : 'border:2px solid #c7bba0;box-sizing:border-box'}"></span><span><span style="display:block;font-size:13.5px;font-weight:600;${e.fait ? '' : 'color:var(--gris-brun)'}">${esc(e.label)}</span><span style="display:block;font-size:12px;color:var(--gris-brun2);margin-top:2px">${esc(e.quand || '')}</span></span></div>`).join('')}</div>`;
  let chat = '';
  if (fin.e === 0) {
    chat = `<div style="display:flex;flex-direction:column;gap:10px;padding-left:40px">
      <input id="finItem" value="${esc(fin.item)}" placeholder="Item à financer (ex. : ensemble de chambre)" aria-label="Item à financer" class="field" style="background:var(--surface)">
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <input id="finMontant" type="number" min="1" inputmode="numeric" value="${esc(fin.montant)}" placeholder="Montant à financer ($)" aria-label="Montant à financer" class="field" style="flex:1;min-width:130px;background:var(--surface)">
        <select id="finMois" aria-label="Durée" class="field" style="flex:1;min-width:120px;background:var(--surface)">${[6,12,18,24,36].map(n => `<option value="${n}"${(+fin.nMois || 18) === n ? ' selected' : ''}>${n} mois</option>`).join('')}</select>
      </div>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <input id="finNom" value="${esc(fin.nom)}" placeholder="Votre nom" aria-label="Votre nom" autocomplete="name" class="field" style="flex:1;min-width:140px;background:var(--surface)">
        <input id="finCourriel" value="${esc(fin.courriel)}" placeholder="Votre courriel" type="email" inputmode="email" autocomplete="email" aria-label="Votre courriel" class="field" style="flex:1;min-width:160px;background:var(--surface)">
      </div>
      <input id="finTel" value="${esc(fin.tel)}" placeholder="Cellulaire" type="tel" inputmode="tel" autocomplete="tel" aria-label="Votre cellulaire" class="field" style="background:var(--surface)">
      ${fin.err ? `<div class="err">${esc(fin.err)}</div>` : ''}
      <button class="btn" style="align-self:flex-start" data-act="fin-demande">Vérifier mon admissibilité</button>
      <div style="font-size:11.5px;color:var(--gris-brun2);line-height:1.5">Réservé aux clients existants. Vérification instantanée et sans engagement.</div>
    </div>`;
  } else if (fin.e === 99) {
    chat = `<div style="display:flex;justify-content:flex-end"><div class="bubble-out">${esc(fin.item)} — ${esc(fin.nom)}</div></div>
      <div class="chat-msg"><span class="chat-av">M3M</span><div class="bubble-in" style="border-color:var(--laiton)">${esc(fin.message)}</div></div>
      <div style="padding-left:40px"><button class="btn btn-ghost" data-act="fin-reset">Recommencer</button></div>`;
  } else {
    const c = fin.calcul || {};
    const prenom = (fin.nom.trim().split(' ')[0] || '');
    chat = `<div style="display:flex;justify-content:flex-end"><div class="bubble-out">${esc(fin.item)} — ${esc(fin.nom)}</div></div>
      <div class="chat-msg"><span class="chat-av">M3M</span><div class="bubble-in" style="border-color:var(--laiton)">Bonne nouvelle ${esc(prenom)} — vous êtes admissible ! Voici votre plan et les prochaines étapes.</div></div>
      <div style="padding-left:40px;display:flex;flex-direction:column;gap:14px">
        <div style="background:var(--surface);border:1px solid var(--bord);border-radius:4px;padding:16px">
          <div style="display:flex;justify-content:space-between;font-size:13px;color:var(--gris-brun)"><span>Dossier nº</span><strong style="color:var(--encre)">${esc(fin.ref)}</strong></div>
          <div style="display:flex;justify-content:space-between;font-size:13px;color:var(--gris-brun);margin-top:6px"><span>Versement mensuel</span><strong style="color:var(--encre)">${esc(c.mensualite || '')}</strong></div>
          <div style="display:flex;justify-content:space-between;font-size:13px;color:var(--gris-brun);margin-top:6px"><span>Durée · taux</span><span>${esc(String(c.nMois || fin.nMois))} mois · ${esc(c.taux || '29,99 %')}</span></div>
        </div>
        <div style="font-size:11px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:var(--or-fonce)">Suivi de votre financement</div>
        ${tracker(fin.etapes)}
        ${fin.err ? `<div class="err">${esc(fin.err)}</div>` : ''}
        ${fin.e === 1 ? `<button class="btn" style="align-self:flex-start" data-act="fin-connexion"${fin.busy ? ' disabled' : ''}>${fin.busy ? 'Un instant…' : 'Obtenir mon lien de connexion bancaire'}</button>` : ''}
        ${fin.e === 2 ? `<div style="background:#faf5e7;border:1px solid #d8c89b;border-radius:3px;padding:12px 14px;font-size:13px;color:var(--gris-brun3);line-height:1.55">Un lien de connexion bancaire sécurisé (Stripe) est prêt. Le paiement de <strong>1,15 $</strong> enregistre votre compte pour les prélèvements — la confirmation prend 4 à 5 jours ouvrables.${fin.url ? '' : ' On peut aussi finaliser en magasin ou par texto au 514-609-1239.'}</div>
          ${fin.url && fin.simulation === false ? `<a class="btn" style="align-self:flex-start" href="${esc(fin.url)}" target="_blank" rel="noopener">Ouvrir le lien de connexion bancaire</a>` : ''}
          ${fin.simulation !== false ? `<button class="btn btn-ghost" style="align-self:flex-start" data-act="fin-confirmer-demo">(Démo) Simuler la confirmation bancaire</button>` : ''}` : ''}
        ${fin.e === 3 ? `<div style="background:#f2f4e6;border:1px solid #b9c39a;border-radius:3px;padding:12px 14px;font-size:13px;color:#4d5c2f;line-height:1.55">Votre financement est <strong>actif</strong> — les versements mensuels se feront automatiquement. Suivez tout depuis votre espace client.</div>` : ''}
      </div>`;
  }

  return `<main class="m3mFade" data-screen="Financement" aria-label="Financement">
    <div class="container" style="padding:clamp(44px,6vw,72px) 24px 0">
      <div class="eyebrow" style="margin-bottom:12px">Payez à votre rythme</div>
      <h1 class="serif" style="font-size:clamp(38px,4.6vw,58px)">Options de financement</h1>
      <p style="margin:16px 0 0;max-width:58ch;font-size:15.5px;line-height:1.65;color:var(--gris-brun)">Choisissez l'option qui vous convient et faites votre demande en quelques minutes. Recevez la réponse sur votre téléphone, présentez-la en magasin — notre équipe s'occupe du reste.</p>
    </div>
    <div class="container" style="padding:30px 24px 0">
      <div class="card" style="padding:clamp(24px,4vw,40px);display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:clamp(24px,4vw,44px);align-items:start">
        <div>
          <div class="eyebrow" style="margin-bottom:10px">Simulateur — financement maison</div>
          <h3 class="serif" style="font-size:clamp(24px,2.6vw,32px)">Estimez vos versements.</h3>
          <p style="margin:12px 0 0;font-size:14px;line-height:1.6;color:var(--gris-brun);max-width:44ch">Entrez le montant à financer et la durée. Taux de 29,99 %. Le financement maison est réservé à nos clients existants — on connecte votre compte bancaire en toute sécurité (Stripe) et les versements mensuels se font tout seuls.</p>
          <div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:20px">
            <label class="label" style="flex:1;min-width:130px">Montant à financer ($)<input id="simMontant" type="number" min="1" value="3285" class="field" style="font-weight:400;letter-spacing:0;text-transform:none"></label>
            <label class="label" style="flex:1;min-width:130px">Durée (mois)<select id="simMois" class="field" style="font-weight:400;letter-spacing:0;text-transform:none">
              ${[6,12,18,24,36].map(n=>`<option value="${n}"${n===18?' selected':''}>${n} mois</option>`).join('')}
            </select></label>
          </div>
          <button class="btn" style="margin-top:16px" data-act="simuler-fin">Calculer ma mensualité</button>
        </div>
        <div id="simResultat" style="background:var(--creme);border:1px solid var(--bord);border-radius:6px;padding:26px;align-self:stretch;display:flex;flex-direction:column;justify-content:center;min-height:180px">
          <div style="font-size:12px;color:var(--gris-brun2);text-align:center">Entrez un montant et cliquez « Calculer » pour voir votre mensualité estimée.</div>
        </div>
      </div>
    </div>
    <div class="container" style="padding:22px 24px 0;display:grid;grid-template-columns:repeat(auto-fit,minmax(290px,1fr));gap:22px">
      ${opt(1,'Fairstone',['Scannez le code QR ou cliquez le bouton — ou textez « meublestroismousquetaires » au 32472.','Complétez la demande directement sur votre téléphone.','Montrez l\'approbation à notre équipe pour finaliser l\'achat.'],'https://web.fairstone.ca/meublestroismousquetaires/fr','Faire ma demande Fairstone','Scannez avec l\'appareil photo de votre téléphone','fairstone')}
      ${opt(2,'Affirm',['Scannez le code QR ou cliquez le bouton pour ouvrir la préqualification.','Complétez la demande sur votre téléphone — quelques minutes suffisent.','Montrez l\'approbation à notre équipe pour finaliser l\'achat.'],'https://www.affirm.ca/apps/prequal/?public_api_key=1TQH39SSET2RG09B&page_type=landing&use_promo=true&locale=fr-CA','Faire ma demande Affirm','Préqualification rapide, directement sur votre téléphone','affirm')}
      ${opt(3,'iFinance',['Scannez le code QR ou cliquez le bouton pour ouvrir la demande.','Sélectionnez « Meubles Trois Mousquetaires — 2485, rue Leclaire », puis complétez la demande.','Montrez l\'approbation à notre équipe pour finaliser l\'achat.'],'https://apply.ifinancecanada.com/20500/new-app/loan-amount','Faire ma demande iFinance','Scannez avec l\'appareil photo de votre téléphone','ifinance')}
    </div>
    <div class="container" style="padding:22px 24px clamp(64px,8vw,96px)">
      <div style="background:var(--noir);border-radius:4px;padding:clamp(30px,4.5vw,52px)">
        <div style="font-size:10.5px;font-weight:600;letter-spacing:.2em;text-transform:uppercase;color:var(--laiton)">Option 04 — directement avec le magasin</div>
        <h2 class="serif" style="margin:10px 0 0;font-size:clamp(30px,3.6vw,42px);color:var(--creme-claire)">Financement maison</h2>
        <p style="margin:14px 0 0;max-width:60ch;font-size:15px;line-height:1.65;color:var(--beige-sec)">Des prélèvements mensuels automatiques, sans intermédiaire. Votre compte bancaire se connecte en toute sécurité avec Stripe, et tout se suit depuis votre espace client.</p>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:clamp(26px,4vw,48px);margin-top:36px;align-items:start">
          <div style="display:flex;flex-direction:column">
            ${[['Recevez le lien de connexion bancaire (Stripe) — en magasin, ou textez votre courriel au 514-609-1239.'],['Payez 1,15 $ via le lien : ce paiement connecte votre compte pour les prélèvements. Confirmation en 4 à 5 jours ouvrables.'],['Complétez la connexion en magasin, avant la signature du contrat.'],['Signez le contrat de financement — une fois la connexion confirmée, on finalise avec vous.']].map((e,i,a)=>`<div style="display:flex;gap:16px;padding:14px 0;border-top:1px solid rgba(243,236,218,.14)${i===a.length-1?';border-bottom:1px solid rgba(243,236,218,.14)':''}"><span style="font-family:var(--serif);font-weight:600;font-size:22px;color:var(--laiton);width:22px;flex:none">${i+1}</span><span style="font-size:14px;line-height:1.6;color:var(--beige-sec2)">${e[0]}</span></div>`).join('')}
            <div style="margin-top:22px;border:1px solid rgba(200,155,60,.4);border-radius:3px;padding:18px 20px">
              <div style="font-size:10.5px;font-weight:600;letter-spacing:.18em;text-transform:uppercase;color:var(--laiton);margin-bottom:10px">À savoir avant de commencer</div>
              <div style="font-size:13px;line-height:1.65;color:var(--beige-sec2)">Réservé aux clients existants. Nouveau client : dépôt minimum de 50 % du total de la facture (après taxes). Aucune commande n'est passée tant que la connexion bancaire n'est pas payée et confirmée.</div>
            </div>
            <div style="display:flex;gap:18px;flex-wrap:wrap;margin-top:20px;font-size:13.5px">
              <a href="https://app.meublestroismousquetaires.ca/financement/guide-financement.pdf" target="_blank" rel="noopener" style="color:var(--laiton)">Télécharger le guide (PDF)</a>
              <a href="sms:+15146091239" style="color:var(--laiton)">Par texto : 514-609-1239</a>
            </div>
          </div>
          <div style="background:var(--creme);border-radius:4px;overflow:hidden">
            <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:16px 20px;border-bottom:1px solid var(--bord)">
              <span style="font-size:13px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:var(--encre)">Demande de financement maison</span>
              <span style="font-size:12px;color:var(--gris-brun2)">Reçue immédiatement</span>
            </div>
            <div style="padding:20px;display:flex;flex-direction:column;gap:14px">
              <div class="chat-msg"><span class="chat-av">M3M</span><div class="bubble-in">Bonjour ! Je prends votre demande ici même. Quel item aimeriez-vous financer ?</div></div>
              ${chat}
            </div>
          </div>
        </div>
      </div>
      <p style="margin:26px 0 0;text-align:center;font-size:13.5px;color:var(--gris-brun)">Des questions ? En magasin — 2485, rue Leclaire · <a href="tel:+15142511055">(514) 251-1055</a> · texto <a href="sms:+15146091239">514-609-1239</a></p>
    </div>
  </main>`;
}

// ================= écran : CONNEXION / INSCRIPTION =================
function screenConnexion() {
  const tabC = (a) => `background:${a ? 'var(--surface)' : 'var(--creme-fonce)'};border:none;border-bottom:2px solid ${a ? 'var(--laiton)' : 'transparent'};padding:15px 10px;cursor:pointer;font-size:13px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:${a ? 'var(--encre)' : 'var(--gris-brun2)'}`;
  const estCo = S.ongletConnexion === 'connexion';
  const titre = estCo ? 'Heureux de vous revoir.' : 'Bienvenue chez vous.';
  const body = estCo
    ? `<div style="padding:28px;display:flex;flex-direction:column;gap:16px">
        <label class="label">Courriel<input id="ident" value="${esc(S.ident)}" placeholder="vous@courriel.com" type="email" inputmode="email" autocomplete="email" class="field" style="font-weight:400;letter-spacing:0;text-transform:none"></label>
        <label class="label">Mot de passe<input id="mdp" type="password" value="${esc(S.mdp)}" placeholder="••••••••" autocomplete="current-password" class="field" style="font-weight:400;letter-spacing:0;text-transform:none"></label>
        ${S.authErr ? `<div class="err">${esc(S.authErr)}</div>` : ''}
        <button class="btn" data-act="connexion">Accéder à mon espace</button>
        <div style="text-align:center;font-size:12px;color:var(--gris-brun2)">Démo : marie-eve@exemple.ca / demo1234 — ou créez votre compte.</div>
      </div>`
    : `<div style="padding:28px;display:flex;flex-direction:column;gap:16px">
        <label class="label">Nom complet<input id="insNom" value="${esc(S.insNom)}" placeholder="Prénom Nom" autocomplete="name" class="field" style="font-weight:400;letter-spacing:0;text-transform:none"></label>
        <label class="label">Courriel<input id="insCourriel" value="${esc(S.insCourriel)}" placeholder="vous@courriel.com" type="email" inputmode="email" autocomplete="email" class="field" style="font-weight:400;letter-spacing:0;text-transform:none"></label>
        <label class="label">Téléphone<input id="insTel" value="${esc(S.insTel)}" placeholder="514-555-0199" type="tel" inputmode="tel" autocomplete="tel" class="field" style="font-weight:400;letter-spacing:0;text-transform:none"></label>
        <div style="font-size:11.5px;color:var(--gris-brun2);margin-top:-8px;line-height:1.5">Le même numéro qu'en magasin — il relie automatiquement votre compte à votre dossier client (factures, financements).</div>
        <label class="label">Mot de passe<input id="insMdp" type="password" value="${esc(S.insMdp)}" placeholder="8 caractères minimum" autocomplete="new-password" class="field" style="font-weight:400;letter-spacing:0;text-transform:none"></label>
        ${S.authErr ? `<div class="err">${esc(S.authErr)}</div>` : ''}
        <button class="btn" data-act="inscription-submit">Créer mon compte</button>
        <div style="text-align:center;font-size:12px;color:var(--gris-brun2)">Gérez factures, versements, livraisons et service après-vente.</div>
      </div>`;
  return `<main class="m3mFade container" style="padding:clamp(48px,7vw,88px) 24px" data-screen="Connexion" aria-label="Connexion">
    <div style="max-width:440px;margin:0 auto">
      <div style="text-align:center;margin-bottom:26px">
        <div class="eyebrow" style="margin-bottom:10px">Portail client</div>
        <h1 class="serif" style="font-size:clamp(30px,4vw,40px)">${titre}</h1>
      </div>
      <div class="card" style="overflow:hidden">
        <div style="display:grid;grid-template-columns:1fr 1fr">
          <button data-act="tab-connexion" aria-pressed="${estCo}" style="${tabC(estCo)}">Se connecter</button>
          <button data-act="tab-inscription" aria-pressed="${!estCo}" style="${tabC(!estCo)}">Créer un compte</button>
        </div>
        ${body}
      </div>
    </div>
  </main>`;
}

// ================= écran : ESPACE CLIENT =================
function screenCompte() {
  const tabK = (a) => `background:none;border:none;border-bottom:2px solid ${a ? 'var(--encre)' : 'transparent'};padding:15px 2px;cursor:pointer;font-size:13.5px;font-weight:${a ? '600' : '500'};letter-spacing:.05em;color:${a ? 'var(--encre)' : 'var(--gris-brun)'}`;
  const t = S.ongletCompte;
  let contenu = '';
  if (t === 'apercu') {
    const fin = (S.financements || []).find(f => f.statut === 'actif') || (S.financements || [])[0];
    const aPayer = (S.factures || []).find(f => f.statut === 'a_payer' || f.statut === 'en_retard');
    const srv = (S.service || [])[0];
    const cards = [];
    if (fin) {
      const faits = fin.versementsFaits || 0;
      const pct = fin.nMois ? Math.min(100, Math.round(faits / fin.nMois * 100)) : 0;
      const actif = fin.statut === 'actif';
      cards.push(`<div class="card" style="padding:24px">
        <div style="font-size:10.5px;font-weight:600;letter-spacing:.18em;text-transform:uppercase;color:var(--or-fonce)">Financement maison</div>
        <div style="font-size:15.5px;font-weight:600;margin-top:12px">${esc(fin.item)}</div>
        <div style="height:6px;border-radius:999px;background:#e9e1cd;margin-top:14px;overflow:hidden"><div style="height:100%;width:${pct}%;background:var(--laiton)"></div></div>
        <div style="font-size:13px;color:var(--gris-brun);margin-top:10px">${faits} versement${faits > 1 ? 's' : ''} sur ${esc(String(fin.nMois))} · ${esc(fin.mensualite)}/mois</div>
        <div style="display:inline-flex;align-items:center;gap:7px;margin-top:12px;border:1px solid #d8c89b;border-radius:999px;padding:5px 12px"><span style="width:6px;height:6px;border-radius:50%;background:${actif ? '#7c8a4f' : '#c89b3c'}"></span><span style="font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--gris-brun)">${esc(actif ? 'Prélèvements actifs' : 'En préparation')}</span></div>
      </div>`);
    }
    if (aPayer) {
      const payableAp = aPayer.source !== 'perfex' && aPayer.id != null;
      cards.push(`<div class="card" style="padding:24px">
        <div style="font-size:10.5px;font-weight:600;letter-spacing:.18em;text-transform:uppercase;color:var(--or-fonce)">Facture à payer</div>
        <div class="serif" style="font-weight:600;font-size:38px;margin-top:12px">${esc(aPayer.solde || aPayer.montant)}</div>
        <div style="font-size:13px;color:var(--gris-brun);margin-top:6px">${esc(aPayer.desc)} · ${esc(aPayer.no)}</div>
        ${payableAp
          ? `<button data-payer="${aPayer.id}" style="margin-top:14px;background:none;border:none;padding:0;cursor:pointer;font-size:12px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:var(--or-fonce)">Payer maintenant →</button>`
          : `<button data-act="tab-factures" style="margin-top:14px;background:none;border:none;padding:0;cursor:pointer;font-size:12px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:var(--or-fonce)">Voir mes factures →</button>`}
      </div>`);
    }
    if (srv) {
      const dernier = srv.steps && srv.steps.length ? srv.steps[srv.steps.length - 1].label : 'En traitement';
      cards.push(`<div class="card" style="padding:24px">
        <div style="font-size:10.5px;font-weight:600;letter-spacing:.18em;text-transform:uppercase;color:var(--or-fonce)">Demande de service</div>
        <div style="font-size:15.5px;font-weight:600;margin-top:12px">${esc(srv.item)}</div>
        <div style="font-size:13px;color:var(--gris-brun);margin-top:6px;line-height:1.55">${esc(dernier)}</div>
        <button data-act="tab-service" style="margin-top:14px;background:none;border:none;padding:0;cursor:pointer;font-size:12px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:var(--or-fonce)">Suivre la demande →</button>
      </div>`);
    }
    contenu = cards.length
      ? `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(255px,1fr));gap:22px">${cards.join('')}</div>`
      : `<div class="card" style="padding:44px 28px;text-align:center;max-width:640px">
          <div class="serif" style="font-weight:600;font-size:26px">Bienvenue dans votre espace, ${esc(S.nom.split(' ')[0] || S.nom)}.</div>
          <p style="margin:10px auto 0;max-width:52ch;font-size:14px;line-height:1.65;color:var(--gris-brun)">Vos factures, versements de financement et demandes de service apparaîtront ici. Explorez la boutique ou faites une demande de financement pour commencer.</p>
          <div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap;margin-top:22px">
            <button class="btn" data-go="boutique">Voir la boutique</button>
            <button class="btn btn-ghost" data-go="financement">Financement maison</button>
          </div>
        </div>`;
  } else if (t === 'factures') {
    const badge = (st) => st === 'payee' ? 'ok' : (st === 'a_payer' || st === 'en_retard') ? 'attention' : 'fin';
    const label = (f) => f.statut === 'payee' ? 'Payée' : f.statut === 'a_payer' ? 'À payer'
      : f.statut === 'en_retard' ? 'En retard' : f.statut === 'annulee' ? 'Annulée' : ('Financement — ' + (f.meta || ''));
    // Payable en ligne = facture locale de l'app (avec id). Payer une VRAIE facture
    // du CRM en ligne viendra avec Stripe ; en attendant, on affiche les modes de règlement.
    const payable = (f) => f.source !== 'perfex' && f.id != null;
    const aRegler = (f) => f.statut === 'a_payer' || f.statut === 'en_retard';
    const montantHtml = (f) => `<div style="text-align:right">
        <span class="serif" style="font-weight:600;font-size:24px">${esc(f.montant)}</span>
        ${f.solde && f.statut !== 'payee' && f.statut !== 'annulee' && f.solde !== f.montant ? `<div style="font-size:12px;color:var(--gris-brun2);margin-top:2px">Solde : ${esc(f.solde)}</div>` : ''}
      </div>`;
    const rows = S.factures.map(f => `<div class="card" style="padding:20px 22px;display:flex;align-items:center;justify-content:space-between;gap:18px;flex-wrap:wrap">
      <div style="min-width:200px">
        <div style="font-family:var(--mono);font-size:10.5px;letter-spacing:.12em;color:var(--gris-brun2)">${esc(f.no)} — ${esc(f.date)}</div>
        <div style="font-size:15px;font-weight:600;margin-top:5px">${esc(f.desc)}</div>
        ${f.statut === 'en_retard' && f.echeance ? `<div style="font-size:11.5px;color:#b4632a;margin-top:3px">Échéance dépassée : ${esc(f.echeance)}</div>` : ''}
      </div>
      <div style="display:flex;align-items:center;gap:18px;flex-wrap:wrap">
        ${montantHtml(f)}
        <span class="badge ${badge(f.statut)}">${esc(label(f))}</span>
        ${aRegler(f)
          ? (payable(f)
              ? `<button class="btn" style="padding:10px 20px;font-size:13px" data-payer="${f.id}">Payer</button>`
              : `<span style="font-size:12px;color:var(--gris-brun2);text-align:right;max-width:160px;line-height:1.45">À régler en magasin, par Interac ou virement</span>`)
          : `<button class="btn btn-ghost" style="padding:10px 20px;font-size:13px">${f.statut === 'financement' ? 'Voir le plan' : f.statut === 'annulee' ? 'Annulée' : 'Reçu'}</button>`}
      </div>
    </div>`).join('');
    contenu = S.facturesErr
      ? `<div class="card" style="padding:40px 28px;text-align:center;max-width:880px"><div class="serif" style="font-weight:600;font-size:22px">Connexion à votre dossier momentanément indisponible.</div><p style="margin:10px auto 0;max-width:48ch;font-size:14px;line-height:1.6;color:var(--gris-brun)">Réessayez dans un instant — vos factures sont en sécurité dans notre système.</p><button class="btn" data-act="tab-factures" style="margin-top:18px">Réessayer</button></div>`
      : S.factures.length
        ? `<div style="display:flex;flex-direction:column;gap:14px;max-width:880px">${rows}
      <div style="font-size:12.5px;color:var(--gris-brun2);display:flex;align-items:center;gap:8px"><span style="width:6px;height:6px;background:var(--laiton);transform:rotate(45deg)"></span>Paiements traités de façon sécurisée par Stripe.</div>
    </div>`
        : `<div class="card" style="padding:40px 28px;text-align:center;max-width:880px"><div class="serif" style="font-weight:600;font-size:24px">Aucune facture pour l'instant.</div><p style="margin:10px auto 0;max-width:48ch;font-size:14px;line-height:1.6;color:var(--gris-brun)">Vos factures et reçus apparaîtront ici après votre premier achat.</p></div>`;
  } else {
    const ticket = S.service[0];
    const suivi = ticket ? `<div class="card" style="padding:26px">
      <div style="font-size:10.5px;font-weight:600;letter-spacing:.18em;text-transform:uppercase;color:var(--or-fonce)">Demande nº ${esc(ticket.ref)}</div>
      <div style="font-size:16px;font-weight:600;margin-top:10px">${esc(ticket.item)}</div>
      <p style="margin:8px 0 0;font-size:13.5px;line-height:1.6;color:var(--gris-brun)">${esc(ticket.descr)}</p>
      <div style="margin-top:20px;display:flex;flex-direction:column">
        ${ticket.steps.map(s => `<div style="display:flex;gap:14px;padding:10px 0"><span style="width:10px;height:10px;border-radius:50%;${s.fait ? 'background:var(--laiton)' : 'border:2px solid #c7bba0;box-sizing:border-box'};flex:none;margin-top:3px"></span><span><span style="display:block;font-size:13.5px;font-weight:600;${s.fait ? '' : 'color:var(--gris-brun)'}">${esc(s.label)}</span><span style="display:block;font-size:12px;color:var(--gris-brun2);margin-top:2px">${esc(s.quand)}</span></span></div>`).join('')}
      </div>
    </div>` : '';
    const form = S.srvEnvoye
      ? `<div class="card" style="padding:26px"><div style="font-size:10.5px;font-weight:600;letter-spacing:.18em;text-transform:uppercase;color:var(--or-fonce)">Nouvelle demande</div>
          <div style="margin-top:14px;border:1px solid var(--laiton);border-radius:3px;padding:18px 20px;background:#faf5e7">
            <div style="font-size:15px;font-weight:600">Demande ${esc(S.srvRef)} bien reçue.</div>
            <p style="margin:7px 0 0;font-size:13.5px;line-height:1.6;color:var(--gris-brun)">Notre équipe vous recontacte rapidement pour planifier la suite. Vous pouvez suivre l'avancement ici même.</p>
          </div></div>`
      : `<div class="card" style="padding:26px"><div style="font-size:10.5px;font-weight:600;letter-spacing:.18em;text-transform:uppercase;color:var(--or-fonce)">Nouvelle demande</div>
          <div style="display:flex;flex-direction:column;gap:14px;margin-top:14px">
            <label class="label">Item concerné<select id="srvItem" class="field" style="font-weight:400;letter-spacing:0;text-transform:none">
              <option value="">Choisir un item…</option>
              ${[...new Set(S.factures.map(f => f.desc)), 'Autre'].map(o => `<option value="${esc(o)}"${S.srvItem === o ? ' selected' : ''}>${esc(o)}</option>`).join('')}
            </select></label>
            <label class="label">Décrivez le problème<textarea id="srvDesc" rows="3" placeholder="Ce qui se passe, depuis quand…" class="field" style="font-weight:400;letter-spacing:0;text-transform:none;resize:vertical">${esc(S.srvDesc)}</textarea></label>
            ${S.srvPhoto
              ? `<div style="border:1px solid #d8c89b;border-radius:3px;padding:13px 16px;display:flex;align-items:center;gap:10px;background:#faf5e7"><span style="width:6px;height:6px;background:var(--laiton);transform:rotate(45deg)"></span><span style="font-family:var(--mono);font-size:12px;color:var(--gris-brun3)">IMG_2043.jpg — ajoutée</span></div>`
              : `<button data-act="ajouter-photo" style="border:1px dashed #c7bba0;border-radius:3px;background:var(--creme);padding:18px;cursor:pointer;font-size:13px;color:var(--gris-brun);line-height:1.5">Ajouter une photo de l'item<br><span style="font-size:11.5px;color:var(--gris-brun2)">directement depuis votre cellulaire</span></button>`}
            ${S.srvErr ? '<div class="err">Choisissez l\'item et décrivez le problème.</div>' : ''}
            <button class="btn" data-act="envoyer-service">Envoyer la demande</button>
          </div></div>`;
    contenu = `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:22px;max-width:980px">${suivi}${form}</div>`;
  }

  return `<main class="m3mFade" data-screen="Espace client" aria-label="Espace client">
    <section class="section-dark"><div class="container" style="padding:clamp(36px,5vw,56px) 24px;display:flex;align-items:flex-end;justify-content:space-between;gap:20px;flex-wrap:wrap">
      <div>
        <div class="eyebrow on-dark" style="margin-bottom:10px">Espace client</div>
        <h1 class="serif" style="font-size:clamp(32px,4vw,46px);color:var(--creme-claire)">Bonjour, ${esc(S.nom.split(' ')[0] || S.nom)}.</h1>
        ${S.stripeConnecte ? `<div style="display:flex;align-items:center;gap:9px;margin-top:12px"><span style="width:7px;height:7px;border-radius:50%;background:var(--laiton)"></span><span style="font-size:13.5px;color:var(--beige-sec)">Compte bancaire connecté (Stripe) — prélèvements automatiques actifs</span></div>` : ''}
      </div>
      <button data-act="deconnexion" style="background:transparent;border:1px solid rgba(243,236,218,.3);border-radius:2px;padding:10px 20px;cursor:pointer;font-size:13px;font-weight:500;letter-spacing:.05em;color:var(--creme-claire)">Se déconnecter</button>
    </div></section>
    <div style="border-bottom:1px solid var(--bord2);background:var(--creme)">
      <div class="container" style="padding:0 24px;display:flex;gap:26px;flex-wrap:wrap">
        <button data-act="tab-apercu" aria-pressed="${t === 'apercu'}" style="${tabK(t === 'apercu')}">Aperçu</button>
        <button data-act="tab-factures" aria-pressed="${t === 'factures'}" style="${tabK(t === 'factures')}">Factures</button>
        <button data-act="tab-service" aria-pressed="${t === 'service'}" style="${tabK(t === 'service')}">Service</button>
      </div>
    </div>
    <div class="container" style="padding:clamp(30px,4vw,44px) 24px clamp(64px,8vw,96px)">${contenu}</div>
  </main>`;
}

// ================= écran : MA SÉLECTION =================
function screenSelection() {
  if (S.selEnvoye) return `<main class="m3mFade container" style="padding:clamp(60px,9vw,110px) 24px;text-align:center" data-screen="Ma sélection" aria-label="Ma sélection"><div class="eyebrow" style="margin-bottom:12px">Merci !</div><h1 class="serif" style="font-size:clamp(32px,4vw,46px)">Votre demande est envoyée.</h1><p style="margin:14px auto 24px;max-width:48ch;font-size:15.5px;line-height:1.65;color:var(--gris-brun)">Un conseiller vous texte vos prix rapidement. Vous pouvez continuer à explorer la boutique.</p><button class="btn" data-go="boutique">Continuer vers la boutique</button></main>`;
  const items = S.selection.map(sl => S.cache[sl]).filter(Boolean);
  const body = items.length ? `
    <div style="display:flex;flex-direction:column;gap:12px;max-width:720px">
      ${items.map(p => `<div class="card" style="padding:14px 18px;display:flex;align-items:center;justify-content:space-between;gap:14px">
        <div style="display:flex;align-items:center;gap:14px;min-width:0">
          <span style="width:54px;height:54px;flex:none;border-radius:3px;overflow:hidden;background:var(--creme-fonce);display:inline-block">${p.img ? `<img src="${esc(p.img)}" alt="" loading="lazy" style="width:100%;height:100%;object-fit:cover">` : ''}</span>
          <div style="min-width:0"><div style="font-size:14px;font-weight:600">${esc(p.nom)}</div><div style="font-size:12px;color:var(--gris-brun2)">${esc(p.cat)} \u00b7 ${esc(p.fournisseur)}</div></div>
        </div>
        <button data-retirer="${esc(p.slug)}" aria-label="Retirer" style="background:none;border:none;cursor:pointer;color:var(--gris-brun);font-size:22px;line-height:1">\u00d7</button>
      </div>`).join('')}
    </div>
    <div class="card" style="margin-top:22px;padding:22px;max-width:520px">
      <div style="font-size:13px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;margin-bottom:12px">Recevez tous vos prix d'un coup</div>
      ${S.selEnvoye ? `<div style="background:#faf5e7;border:1px solid var(--laiton);border-radius:3px;padding:16px;font-size:14px;line-height:1.55">Merci ! Votre s\u00e9lection de ${items.length} pi\u00e8ce${items.length > 1 ? 's' : ''} est envoy\u00e9e \u2014 un conseiller vous texte les prix rapidement.</div>` : `
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <input id="selNom" value="${esc(S.selNom)}" placeholder="Votre nom" aria-label="Votre nom" autocomplete="name" class="field" style="flex:1;min-width:140px">
        <input id="selTel" value="${esc(S.selTel)}" placeholder="Cellulaire" type="tel" inputmode="tel" autocomplete="tel" aria-label="Votre cellulaire" class="field" style="flex:1;min-width:140px">
      </div>
      ${S.selErr ? `<div class="err" style="margin-top:8px">${esc(S.selErr)}</div>` : ''}
      <button class="btn" style="margin-top:14px" data-act="envoyer-selection">Demander mes prix (${items.length})</button>`}
    </div>`
    : `<div class="card" style="padding:44px 28px;text-align:center;max-width:560px"><div class="serif" style="font-weight:600;font-size:24px">Votre s\u00e9lection est vide.</div><p style="margin:10px auto 0;max-width:44ch;font-size:14px;color:var(--gris-brun)">Ajoutez des pi\u00e8ces depuis la boutique, puis demandez tous vos prix en une seule fois.</p><button class="btn" style="margin-top:18px" data-go="boutique">Voir la boutique</button></div>`;
  return `<main class="m3mFade container" style="padding:clamp(44px,6vw,72px) 24px clamp(64px,8vw,96px)" data-screen="Ma s\u00e9lection" aria-label="Ma s\u00e9lection">
    <div class="eyebrow" style="margin-bottom:12px">Votre demande</div>
    <h1 class="serif" style="font-size:clamp(34px,4.4vw,52px)">Ma s\u00e9lection</h1>
    <p style="margin:14px 0 26px;max-width:56ch;font-size:15.5px;line-height:1.65;color:var(--gris-brun)">Regroupez les pi\u00e8ces qui vous int\u00e9ressent et recevez tous vos prix d'un seul coup.</p>
    ${body}
  </main>`;
}

// ================= rendu =================
function render() {
  const screens = {
    accueil: screenAccueil, boutique: screenBoutique, produit: screenProduit,
    financement: screenFinancement, connexion: screenConnexion, compte: screenCompte, selection: screenSelection
  };
  const fn = screens[S.route] || screenAccueil;
  const annonce = `<div class="annonce">Livraison gratuite à Montréal et environs — installation gant blanc le jour de la livraison</div>`;
  const _a = document.activeElement, _kq = _a && _a.id === 'q', _pos = _kq ? _a.selectionStart : null;
  $('#app').innerHTML = '<a href="#contenu" class="skip">Aller au contenu</a>' + annonce + header() + '<div id="contenu">' + fn() + '</div>' + footer();
  if (_kq) { const _ni = $('#q'); if (_ni) { _ni.focus(); if (_pos != null) try { _ni.setSelectionRange(_pos, _pos); } catch (e) {} } }
}

// ================= événements =================
document.addEventListener('click', async (e) => {
  const t = e.target.closest('[data-go],[data-act],[data-open],[data-cat],[data-fourn],[data-prixopt],[data-payer],[data-select],[data-retirer]');
  if (!t) return;

  if (t.dataset.go) { go(t.dataset.go); return; }
  if (t.dataset.open) { go('produit', { slug: t.dataset.open }); return; }
  if (t.dataset.cat) { S.cat = t.dataset.cat; chargerBoutique(true); return; }
  if (t.dataset.fourn) { S.fourn = t.dataset.fourn; chargerBoutique(true); return; }
  if (t.dataset.prixopt) { S.prix.format = t.dataset.prixopt; S.prix.e = Math.max(S.prix.e, 1); render(); return; }
  if (t.dataset.select) { const sl = t.dataset.select; const i = S.selection.indexOf(sl); if (i >= 0) S.selection.splice(i, 1); else S.selection.push(sl); S.selEnvoye = false; saveSel(); render(); return; }
  if (t.dataset.retirer) { const i = S.selection.indexOf(t.dataset.retirer); if (i >= 0) S.selection.splice(i, 1); saveSel(); render(); return; }
  if (t.dataset.payer) {
    try { await api(`/compte/factures/${t.dataset.payer}/payer`, { method: 'POST' }); await chargerFactures(); render(); }
    catch (err) { alert(err.message); }
    return;
  }

  const act = t.dataset.act;
  switch (act) {
    case 'inscription': S.route = 'connexion'; S.ongletConnexion = 'inscription'; S.authErr = ''; render(); window.scrollTo(0,0); break;
    case 'tab-connexion': S.ongletConnexion = 'connexion'; S.authErr = ''; render(); break;
    case 'tab-inscription': S.ongletConnexion = 'inscription'; S.authErr = ''; render(); break;
    case 'reset-boutique': S.cat = 'Tout'; S.q = ''; S.fourn = 'Tous'; chargerBoutique(true); break;
    case 'menu': S.menuOuvert = !S.menuOuvert; render(); break;
    case 'voir-plus': chargerBoutique(false); break;
    case 'envoyer-selection': {
      capter();
      if (!S.selNom.trim() || !S.selTel.trim()) { S.selErr = 'Entrez votre nom et votre cellulaire.'; render(); break; }
      const items = S.selection.map(sl => { const p = S.cache[sl]; return p ? p.nom : null; }).filter(Boolean);
      try { await api('/demande-prix-lot', { method: 'POST', body: { items, nom: S.selNom, tel: S.selTel } }); S.selEnvoye = true; S.selErr = ''; S.selection = []; saveSel(); render(); }
      catch (err) { S.selErr = err.message; render(); }
      break;
    }

    case 'envoyer-prix': {
      capter();
      if (!S.prix.nom.trim() || !S.prix.tel.trim()) { S.prix.err = true; render(); break; }
      const prod = S.cache[S.slug];
      try {
        await api('/demande-prix', { method: 'POST', body: { produit: prod?.nom, option: S.prix.format, nom: S.prix.nom, tel: S.prix.tel } });
        S.prix.e = 2; S.prix.err = false; render();
      } catch (err) { S.prix.err = true; render(); }
      break;
    }
    case 'simuler-fin': {
      const montant = parseFloat(document.getElementById('simMontant')?.value);
      const nMois = parseInt(document.getElementById('simMois')?.value, 10) || 18;
      const box = document.getElementById('simResultat');
      if (!montant || montant <= 0) { if (box) box.innerHTML = '<div class="err" style="text-align:center">Entrez un montant valide.</div>'; break; }
      try {
        const c = await api('/financement/simuler', { method: 'POST', body: { montant, nMois } });
        if (box) box.innerHTML = `
          <div style="text-align:center">
            <div style="font-size:11px;font-weight:600;letter-spacing:.18em;text-transform:uppercase;color:var(--or-fonce)">Versement mensuel estimé</div>
            <div class="serif" style="font-weight:600;font-size:46px;line-height:1;margin:10px 0 4px">${esc(c.mensualite)}</div>
            <div style="font-size:13px;color:var(--gris-brun)">pendant ${esc(String(c.nMois))} mois · taux ${esc(c.taux)}</div>
            <div style="height:1px;background:var(--bord);margin:18px 0"></div>
            <div style="display:flex;justify-content:space-between;font-size:13px;color:var(--gris-brun);margin-bottom:6px"><span>Total remboursé</span><strong style="color:var(--encre)">${esc(c.totalPaye)}</strong></div>
            <div style="display:flex;justify-content:space-between;font-size:13px;color:var(--gris-brun)"><span>Dont intérêts (29,99 %)</span><strong style="color:var(--encre)">${esc(c.interetsTotal)}</strong></div>
            <div style="margin-top:16px;font-size:12px;color:var(--gris-brun2);line-height:1.5">Estimation. Réservé aux clients existants. La demande se fait ci-dessous ↓</div>
          </div>`;
      } catch (err) { if (box) box.innerHTML = '<div class="err" style="text-align:center">Erreur de calcul.</div>'; }
      break;
    }
    case 'fin-demande': {
      const g = id => (document.getElementById(id) || {}).value || '';
      Object.assign(S.fin, { item: g('finItem'), montant: g('finMontant'), nMois: g('finMois') || 18, nom: g('finNom'), courriel: g('finCourriel'), tel: g('finTel') });
      if (!S.fin.item.trim() || !S.fin.nom.trim() || !S.fin.courriel.trim()) { S.fin.err = 'Item, nom et courriel sont requis.'; render(); break; }
      const mNum = parseFloat(String(S.fin.montant || '').replace(/[\s\u00a0\u202f$]/g, '').replace(',', '.'));
      if (!(mNum >= 100 && mNum <= 50000)) { S.fin.err = 'Entrez un montant entre 100 $ et 50 000 $.'; render(); break; }
      if (S.fin.busy) break; S.fin.busy = true; S.fin.err = ''; render();
      try {
        const r = await api('/financement/demande', { method: 'POST', body: { nom: S.fin.nom, courriel: S.fin.courriel, tel: S.fin.tel, item: S.fin.item, montant: S.fin.montant, nMois: S.fin.nMois } });
        if (S.route !== 'financement') { S.fin.busy = false; break; }
        if (!r.existant) { S.fin.e = 99; S.fin.message = r.message || ''; S.fin.err = ''; S.fin.busy = false; render(); break; }
        try { sessionStorage.setItem('m3m_fin', r.ref); } catch (e3) {}
        S.fin.ref = r.ref; S.fin.calcul = r.calcul; S.fin.err = ''; S.fin.e = 1;
        S.fin.etapes = [{ label: 'Demande reçue', quand: '', fait: true }]; render();
        try { const suivi = await api('/financement/' + encodeURIComponent(r.ref)); S.fin.etapes = suivi.etapes || S.fin.etapes; S.fin.statut = suivi.statut; } catch (e2) {}
        S.fin.busy = false; render();
      } catch (err) { S.fin.err = err.message; S.fin.busy = false; render(); }
      break;
    }
    case 'fin-connexion': {
      try {
        if (S.fin.busy) break; S.fin.busy = true; S.fin.err = ''; render();
        const r = await api('/financement/' + encodeURIComponent(S.fin.ref) + '/connexion', { method: 'POST' });
        S.fin.url = r.url; S.fin.simulation = r.simulation !== false;
        if (r.url && !r.simulation) window.open(r.url, '_blank'); // best effort — le lien cliquable est rendu de toute façon
        const suivi = await api('/financement/' + encodeURIComponent(S.fin.ref));
        if (S.route !== 'financement') { S.fin.busy = false; break; }
        S.fin.etapes = suivi.etapes || []; S.fin.e = 2; S.fin.busy = false; render();
      } catch (err) { S.fin.err = err.message; S.fin.busy = false; render(); }
      break;
    }
    case 'fin-confirmer-demo': {
      try {
        if (S.fin.busy) break; S.fin.busy = true; S.fin.err = ''; render();
        await api('/financement/' + encodeURIComponent(S.fin.ref) + '/confirmer-demo', { method: 'POST' });
        const suivi = await api('/financement/' + encodeURIComponent(S.fin.ref));
        S.fin.etapes = suivi.etapes || []; S.fin.e = 3; S.fin.busy = false; render();
      } catch (err) { S.fin.err = err.message; S.fin.busy = false; render(); }
      break;
    }
    case 'fin-reset': try { sessionStorage.removeItem('m3m_fin'); } catch (e4) {} S.fin = { e: 0, item: '', montant: '', nMois: 18, nom: '', courriel: '', tel: '', ref: '', calcul: null, statut: '', etapes: [], message: '', err: '', url: '' }; render(); break;

    case 'connexion': {
      capter();
      try {
        const r = await api('/auth/connexion', { method: 'POST', body: { courriel: S.ident, mdp: S.mdp } });
        await apresConnexion(r.nom);
      } catch (err) { S.authErr = err.message; render(); }
      break;
    }
    case 'inscription-submit': {
      capter();
      try {
        const r = await api('/auth/inscription', { method: 'POST', body: { nom: S.insNom, courriel: S.insCourriel, mdp: S.insMdp, tel: S.insTel } });
        S.lieCrm = !!r.lieCrm;
        await apresConnexion(r.nom);
      } catch (err) { S.authErr = err.message; render(); }
      break;
    }
    case 'deconnexion': {
      await api('/auth/deconnexion', { method: 'POST' });
      S.connecte = false; S.nom = ''; go('accueil');
      break;
    }

    case 'tab-apercu': S.ongletCompte = 'apercu'; render(); break;
    case 'tab-factures': S.ongletCompte = 'factures'; await chargerFactures(); render(); break;
    case 'tab-service': S.ongletCompte = 'service'; await chargerService(); render(); break;
    case 'ajouter-photo': S.srvPhoto = true; render(); break;
    case 'envoyer-service': {
      capter();
      if (!S.srvItem || !S.srvDesc.trim()) { S.srvErr = true; render(); break; }
      try {
        const r = await api('/compte/service', { method: 'POST', body: { item: S.srvItem, descr: S.srvDesc, photo: S.srvPhoto ? 'IMG_2043.jpg' : null } });
        S.srvEnvoye = true; S.srvRef = r.ref; S.srvErr = false;
        await chargerService(); render();
      } catch (err) { S.srvErr = true; render(); }
      break;
    }
  }
});

// live-capture des inputs (on lit le DOM avant chaque action / navigation)
document.addEventListener('input', (e) => {
  const id = e.target.id, v = e.target.value;
  const map = {
    q: () => S.q = v, prixNom: () => S.prix.nom = v, prixTel: () => S.prix.tel = v,
    finItem: () => S.fin.item = v, finNom: () => S.fin.nom = v, finTel: () => S.fin.tel = v,
    finMontant: () => S.fin.montant = v, finCourriel: () => S.fin.courriel = v, finMois: () => S.fin.nMois = v,
    ident: () => S.ident = v, mdp: () => S.mdp = v,
    insNom: () => S.insNom = v, insCourriel: () => S.insCourriel = v, insMdp: () => S.insMdp = v, insTel: () => S.insTel = v,
    srvItem: () => S.srvItem = v, srvDesc: () => S.srvDesc = v,
    selNom: () => S.selNom = v, selTel: () => S.selTel = v
  };
  if (map[id]) map[id]();
  // La recherche boutique doit re-filtrer en direct sans perdre le focus :
  if (id === 'q') { clearTimeout(S._qTimer); S._qTimer = setTimeout(() => chargerBoutique(true), 300); }
});

// Recherche/pagination via le serveur : voir chargerBoutique().

function capter() {
  ['q','prixNom','prixTel','finItem','finNom','finTel','finMontant','finCourriel','finMois','ident','mdp','insNom','insCourriel','insMdp','insTel','srvItem','srvDesc','selNom','selTel']
    .forEach(id => { const el = document.getElementById(id); if (!el) return;
      const m = { q:'q', prixNom:['prix','nom'], prixTel:['prix','tel'], finItem:['fin','item'], finNom:['fin','nom'], finTel:['fin','tel'],
        finMontant:['fin','montant'], finCourriel:['fin','courriel'], finMois:['fin','nMois'],
        ident:'ident', mdp:'mdp', insNom:'insNom', insCourriel:'insCourriel', insMdp:'insMdp', insTel:'insTel', srvItem:'srvItem', srvDesc:'srvDesc', selNom:'selNom', selTel:'selTel' }[id];
      if (Array.isArray(m)) S[m[0]][m[1]] = el.value; else S[m] = el.value;
    });
}

async function apresConnexion(nom) {
  S.connecte = true; S.nom = nom; S.route = 'compte'; S.ongletCompte = 'apercu'; S.authErr = '';
  const moi = await api('/auth/moi'); S.stripeConnecte = moi.stripeConnecte;
  await chargerFactures(); await chargerService(); await chargerFinancements();
  history.pushState({}, '', '/compte'); render(); updateSEO(); window.scrollTo(0, 0);
}
async function chargerFactures() {
  S.facturesErr = false;
  try {
    const r = await api('/compte/factures');
    S.factures = Array.isArray(r) ? r : [];
  } catch (e) {
    S.factures = [];
    if (String(e && e.message || '').includes('crm')) S.facturesErr = true;
  }
}
async function chargerService() { try { S.service = await api('/compte/service'); } catch { S.service = []; } }
async function chargerFinancements() { try { S.financements = await api('/compte/financements'); } catch { S.financements = []; } }

// ================= init =================
(async function init() {
  try { S.selection = JSON.parse(localStorage.getItem('m3m_sel') || '[]') || []; } catch (e) {}
  try {
    const f = await api('/catalogue/facettes');
    S.total = f.total; S.categories = f.categories; S.fournisseurs = f.fournisseurs;
    S.vedettes = f.vedettes || []; cacheProds(S.vedettes);
  } catch (e) {}
  try {
    const moi = await api('/auth/moi');
    if (moi.connecte) { S.connecte = true; S.nom = moi.nom; S.stripeConnecte = moi.stripeConnecte;
      await chargerFactures(); await chargerService(); await chargerFinancements(); }
  } catch {}
  navFromPath();
})();
})();
