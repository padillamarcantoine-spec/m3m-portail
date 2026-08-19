// REST API — client portal + admin console.
import express from 'express';
import bcrypt from 'bcryptjs';
import db from '../db.js';
import { creerPaiement, creerConnexionBancaire, notifierMagasin, stripeConfigured } from '../integrations.js';
import { trouverClientParCourriel, facturesClient, perfexConfigured } from '../perfex.js';

const router = express.Router();

// ---- helpers --------------------------------------------------------
const money = (cents) => (cents / 100).toLocaleString('fr-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' $';
// Chiffres seulement (comparaison de téléphones robuste au formatage).
const digits = (s) => String(s || '').replace(/\D/g, '');
const nowFr = () => {
  const mois = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
  const d = new Date();
  return `${d.getDate()} ${mois[d.getMonth()]} ${d.getFullYear()}`;
};
function requireClient(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: 'Non connecté' });
  next();
}
function requireAdmin(req, res, next) {
  if (!req.session.adminUnlocked) return res.status(401).json({ error: 'Console verrouillée' });
  next();
}

// =====================================================================
//  PUBLIC / CATALOGUE
// =====================================================================
router.get('/catalogue', (req, res) => {
  let products = db.prepare('SELECT * FROM products WHERE actif = 1 ORDER BY id').all()
    .map(p => ({ ...p, options: JSON.parse(p.options), lit: !!p.lit, vedette: !!p.vedette }));
  const total = products.length;
  const { cat, fournisseur, q, limit, offset } = req.query;
  if (cat && cat !== 'Tout') products = products.filter(p => p.cat === cat);
  if (fournisseur && fournisseur !== 'Tous') products = products.filter(p => p.fournisseur === fournisseur);
  if (q) { const s = String(q).toLowerCase(); products = products.filter(p => (p.nom + ' ' + p.ref + ' ' + p.fournisseur).toLowerCase().includes(s)); }
  const filtered = products.length;
  if (offset !== undefined || limit !== undefined) products = products.slice(+offset || 0, (+offset || 0) + (+limit || 24));
  res.json({ products, total, filtered });
});

// Demande de prix groupée (panier « Ma sélection ») → une seule piste dans la boîte de réception.
router.post('/demande-prix-lot', async (req, res) => {
  const { items, nom, tel } = req.body || {};
  if (!nom || !nom.trim() || !tel || !tel.trim()) return res.status(400).json({ error: 'Nom et cellulaire requis.' });
  const liste = (Array.isArray(items) ? items : []).map(i => String(i).trim()).filter(Boolean).slice(0, 40);
  if (!liste.length) return res.status(400).json({ error: 'Votre sélection est vide.' });
  const produit = 'Sélection (' + liste.length + ') : ' + liste.join(', ');
  db.prepare('INSERT INTO price_requests (type,produit,nom,tel) VALUES (?,?,?,?)').run('prix', produit.slice(0, 900), nom.trim(), tel.trim());
  await notifierMagasin({ sujet: 'Demande de prix — sélection (' + liste.length + ' items)', message: produit + ' — ' + nom.trim() + ' au ' + tel.trim() });
  res.json({ ok: true, prenom: nom.trim().split(' ')[0] || '', count: liste.length });
});

// Facettes : listes de filtres + vedettes + total (léger — évite de charger tout le catalogue).
router.get('/catalogue/facettes', (req, res) => {
  const all = db.prepare('SELECT cat, fournisseur FROM products WHERE actif = 1').all();
  const cats = [...new Set(all.map(r => r.cat))].sort((a, b) => a.localeCompare(b, 'fr'));
  const fours = [...new Set(all.map(r => r.fournisseur).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fr'));
  const vedettes = db.prepare('SELECT * FROM products WHERE actif = 1 AND vedette = 1 ORDER BY id LIMIT 8').all()
    .map(p => ({ ...p, options: JSON.parse(p.options), lit: !!p.lit, vedette: true }));
  res.json({ total: all.length, categories: ['Tout', ...cats], fournisseurs: ['Tous', ...fours], vedettes });
});

router.get('/produit/:slug', (req, res) => {
  const p = db.prepare('SELECT * FROM products WHERE slug = ? AND actif = 1').get(req.params.slug);
  if (!p) return res.status(404).json({ error: 'Produit introuvable' });
  const lies = db.prepare('SELECT * FROM products WHERE actif = 1 AND cat = ? AND slug != ? ORDER BY (img IS NULL), id LIMIT 3')
    .all(p.cat, p.slug).map(x => ({ ...x, options: JSON.parse(x.options), lit: !!x.lit }));
  res.json({ ...p, options: JSON.parse(p.options), lit: !!p.lit, lies });
});

// Demande de prix (chat conseiller ou formulaire) → enregistrée + notifie le magasin.
router.post('/demande-prix', async (req, res) => {
  const { produit, option, nom, tel } = req.body || {};
  if (!nom || !nom.trim() || !tel || !tel.trim())
    return res.status(400).json({ error: 'Nom et cellulaire requis.' });
  db.prepare('INSERT INTO price_requests (type,produit,option,nom,tel) VALUES (?,?,?,?,?)')
    .run('prix', produit || null, option || null, nom.trim(), tel.trim());
  await notifierMagasin({
    sujet: `Demande de prix — ${produit || 'produit'}`,
    message: `Demande de prix : ${produit || 'produit'}${option ? ' ('+option+')' : ''} — ${nom.trim()} au ${tel.trim()}`
  });
  res.json({ ok: true, prenom: nom.trim().split(' ')[0] || '' });
});

// Demande de financement maison.
router.post('/demande-financement', async (req, res) => {
  const { item, dejaClient, nom, tel } = req.body || {};
  if (!nom || !nom.trim() || !tel || !tel.trim())
    return res.status(400).json({ error: 'Nom et cellulaire requis.' });
  db.prepare('INSERT INTO price_requests (type,produit,nom,tel,deja_client) VALUES (?,?,?,?,?)')
    .run('financement', item || null, nom.trim(), tel.trim(), dejaClient || null);
  await notifierMagasin({
    sujet: `Demande de financement maison — ${item || ''}`,
    message: `Financement maison : ${item || 'item'} — ${nom.trim()} au ${tel.trim()} — ${dejaClient || ''}`
  });
  res.json({ ok: true, prenom: nom.trim().split(' ')[0] || '' });
});

// =====================================================================
//  AUTH CLIENT
// =====================================================================
router.post('/auth/inscription', async (req, res) => {
  const { nom, courriel, mdp, tel } = req.body || {};
  if (!nom || !courriel || !mdp) return res.status(400).json({ error: 'Tous les champs sont requis.' });
  if (mdp.length < 8) return res.status(400).json({ error: 'Mot de passe : 8 caractères minimum.' });
  const courrielN = courriel.toLowerCase().trim();
  const exists = db.prepare('SELECT id FROM users WHERE courriel = ?').get(courrielN);
  if (exists) return res.status(409).json({ error: 'Ce courriel a déjà un compte.' });

  // Liaison au CRM Perfex : on rattache le compte au dossier client SEULEMENT si
  // le courriel existe dans le CRM ET que le téléphone fourni correspond à celui
  // du dossier. Faute de vérification du courriel par email, le téléphone sert de
  // preuve que la personne est bien le client (anti-usurpation / anti-IDOR à la source).
  let perfexId = null, lieCrm = false;
  if (perfexConfigured()) {
    try {
      const pc = await trouverClientParCourriel(courrielN);
      if (pc && pc.id && digits(tel).length >= 10 &&
          digits(pc.phonenumber).slice(-10) === digits(tel).slice(-10)) {
        perfexId = Number(pc.id);
        lieCrm = true;
      }
    } catch (e) {
      // CRM injoignable : on crée quand même le compte local (sans liaison). Le client
      // pourra être relié plus tard ; il ne verra pas de données d'un autre par erreur.
      console.error('[inscription] liaison Perfex impossible:', e.message);
    }
  }

  const hash = bcrypt.hashSync(mdp, 10);
  const r = db.prepare('INSERT INTO users (courriel,nom,mdp_hash,role,perfex_id,tel) VALUES (?,?,?,?,?,?)')
    .run(courrielN, nom.trim(), hash, 'client', perfexId, digits(tel));
  req.session.userId = r.lastInsertRowid;
  res.json({ ok: true, nom: nom.trim(), lieCrm });
});

router.post('/auth/connexion', (req, res) => {
  const { courriel, mdp } = req.body || {};
  if (!courriel || !mdp) return res.status(400).json({ error: 'Courriel et mot de passe requis.' });
  const u = db.prepare('SELECT * FROM users WHERE courriel = ?').get(courriel.toLowerCase());
  if (!u || !bcrypt.compareSync(mdp, u.mdp_hash))
    return res.status(401).json({ error: 'Courriel ou mot de passe incorrect.' });
  req.session.userId = u.id;
  res.json({ ok: true, nom: u.nom });
});

router.post('/auth/deconnexion', (req, res) => {
  req.session.userId = null;
  res.json({ ok: true });
});

router.get('/auth/moi', (req, res) => {
  if (!req.session.userId) return res.json({ connecte: false });
  const u = db.prepare('SELECT id,nom,courriel,stripe_connecte FROM users WHERE id = ?').get(req.session.userId);
  if (!u) { req.session.userId = null; return res.json({ connecte: false }); }
  res.json({ connecte: true, nom: u.nom, courriel: u.courriel, stripeConnecte: !!u.stripe_connecte });
});

// =====================================================================
//  ESPACE CLIENT
// =====================================================================
router.get('/compte/factures', requireClient, async (req, res) => {
  const u = db.prepare('SELECT perfex_id FROM users WHERE id = ?').get(req.session.userId);
  // VRAIES factures du CRM Perfex si le compte est lié. On utilise l'id CRM
  // stocké côté serveur (jamais un id fourni par le client) → un client ne peut
  // voir QUE ses propres factures.
  if (u && u.perfex_id && perfexConfigured()) {
    try {
      const reelles = await facturesClient(u.perfex_id);
      return res.json((reelles || []).map(f => ({
        no: f.no, date: f.date, desc: f.desc,
        montant: f.montant, solde: f.solde,
        statut: f.statut, meta: f.meta || '', source: 'perfex'
      })));
    } catch (e) {
      // Panne CRM : on ne montre PAS les données démo locales d'un client lié
      // (ce ne sont pas les siennes). 503 → le front affiche « réessayez ».
      console.error('[compte/factures] Perfex échec:', e.message);
      return res.status(503).json({ error: 'crm_indisponible' });
    }
  }
  // Compte non lié au CRM : données locales (démo / factures manuelles de l'app).
  const rows = db.prepare('SELECT * FROM invoices WHERE user_id = ? ORDER BY id').all(req.session.userId);
  res.json(rows.map(f => ({
    id: f.id, no: f.ref, date: f.date, desc: f.descr,
    montant: money(f.montant_cents), statut: f.statut, meta: f.meta, source: 'local'
  })));
});

router.post('/compte/factures/:id/payer', requireClient, async (req, res) => {
  const f = db.prepare('SELECT * FROM invoices WHERE id = ? AND user_id = ?').get(req.params.id, req.session.userId);
  if (!f) return res.status(404).json({ error: 'Facture introuvable' });
  if (f.statut === 'payee') return res.json({ ok: true, deja: true });
  const r = await creerPaiement({ facture: f.ref, montantCents: f.montant_cents, description: f.descr });
  if (!r.ok) return res.status(402).json({ error: 'Paiement refusé.' });
  if (r.simulation) {
    db.prepare("UPDATE invoices SET statut = 'payee' WHERE id = ?").run(f.id);
    return res.json({ ok: true, simulation: true });
  }
  // Mode réel : NE PAS marquer payée ici — seulement après confirmation Stripe (client_secret + webhook).
  res.json({ ok: true, simulation: false, clientSecret: r.clientSecret || null, enAttente: true });
});

router.get('/compte/service', requireClient, (req, res) => {
  const tickets = db.prepare('SELECT * FROM service_tickets WHERE user_id = ? ORDER BY id DESC').all(req.session.userId);
  const withSteps = tickets.map(t => ({
    ...t,
    steps: db.prepare('SELECT label,quand,fait FROM service_steps WHERE ticket_id = ? ORDER BY id').all(t.id)
      .map(s => ({ ...s, fait: !!s.fait }))
  }));
  res.json(withSteps);
});

router.post('/compte/service', requireClient, (req, res) => {
  const { item, descr, photo } = req.body || {};
  if (!item || !descr || !descr.trim()) return res.status(400).json({ error: 'Choisissez l’item et décrivez le problème.' });
  const n = db.prepare("SELECT COUNT(*) c FROM service_tickets").get().c;
  const ref = 'S-' + (109 + n);
  const r = db.prepare('INSERT INTO service_tickets (ref,user_id,item,descr,photo,statut) VALUES (?,?,?,?,?,?)')
    .run(ref, req.session.userId, item, descr.trim(), photo || null, 'recue');
  db.prepare('INSERT INTO service_steps (ticket_id,label,quand,fait) VALUES (?,?,?,1)')
    .run(r.lastInsertRowid, 'Demande reçue', nowFr());
  res.json({ ok: true, ref });
});

// =====================================================================
//  ADMIN — auth
// =====================================================================
router.post('/admin/deverrouiller', (req, res) => {
  const code = (req.body?.code || '').trim();
  const attendu = (process.env.ADMIN_CODE || '1055') + '';
  if (code === attendu) {
    req.session.adminUnlocked = true;
    return res.json({ ok: true });
  }
  res.status(401).json({ error: 'Code incorrect.' });
});
router.post('/admin/verrouiller', (req, res) => { req.session.adminUnlocked = false; res.json({ ok: true }); });
router.get('/admin/etat', (req, res) => res.json({ ouvert: !!req.session.adminUnlocked }));

// ---- reference data -------------------------------------------------
router.get('/admin/magasins', requireAdmin, (req, res) =>
  res.json(db.prepare('SELECT * FROM stores ORDER BY id').all()));
router.get('/admin/fournisseurs', requireAdmin, (req, res) =>
  res.json(db.prepare('SELECT * FROM suppliers ORDER BY id').all()));

// ---- orders ---------------------------------------------------------
function loadOrders() {
  const orders = db.prepare('SELECT * FROM orders ORDER BY id DESC').all();
  return orders.map(o => ({
    ...o,
    hist: db.prepare('SELECT label,par,magasin,quand,ts FROM order_history WHERE order_id = ? ORDER BY id').all(o.id)
  }));
}
router.get('/admin/commandes', requireAdmin, (req, res) => res.json(loadOrders()));

router.post('/admin/commandes', requireAdmin, (req, res) => {
  const { modele, fournisseur, qte, date, auteur, note, magasin } = req.body || {};
  const q = parseInt(String(qte).replace(/[^0-9]/g, ''), 10);
  if (!modele || !modele.trim() || !fournisseur || !q || q < 1)
    return res.status(400).json({ error: 'Modèle, fournisseur et quantité (≥1) requis.' });
  // next ref: C-2049+
  const existing = db.prepare("SELECT ref FROM orders WHERE ref LIKE 'C-20%'").all()
    .map(r => +r.ref.slice(2)).filter(n => n >= 2049);
  const ref = 'C-' + (2049 + existing.length);
  const r = db.prepare('INSERT INTO orders (ref,modele,fournisseur,magasin,auteur,date,qte,statut,note) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(ref, modele.trim(), fournisseur, magasin, (auteur || '').trim() || 'Équipe', date, q, 'nouvelle', (note || '').trim());
  db.prepare('INSERT INTO order_history (order_id,label,par,magasin,quand) VALUES (?,?,?,?,?)')
    .run(r.lastInsertRowid, 'Commande créée', (auteur || '').trim() || 'Équipe', magasin, nowFr());
  res.json({ ok: true, ref });
});

const NEXT = { nouvelle: 'commandee', commandee: 'transit', transit: 'recue' };
const NEXT_LABEL = { nouvelle: 'Passée au fournisseur', commandee: 'En transit', transit: 'Reçue à l’entrepôt' };

router.post('/admin/commandes/:ref/avancer', requireAdmin, (req, res) => {
  const o = db.prepare('SELECT * FROM orders WHERE ref = ?').get(req.params.ref);
  if (!o) return res.status(404).json({ error: 'Commande introuvable' });
  const next = NEXT[o.statut];
  if (!next) return res.status(400).json({ error: 'Aucune étape suivante.' });
  const { par, magasin } = req.body || {};
  db.prepare('UPDATE orders SET statut = ? WHERE id = ?').run(next, o.id);
  db.prepare('INSERT INTO order_history (order_id,label,par,magasin,quand) VALUES (?,?,?,?,?)')
    .run(o.id, NEXT_LABEL[o.statut], par || 'Équipe', magasin || o.magasin, nowFr());
  res.json({ ok: true, statut: next });
});

router.post('/admin/commandes/:ref/annuler', requireAdmin, (req, res) => {
  const o = db.prepare('SELECT * FROM orders WHERE ref = ?').get(req.params.ref);
  if (!o) return res.status(404).json({ error: 'Commande introuvable' });
  if (o.statut === 'recue' || o.statut === 'annulee') return res.status(400).json({ error: 'Impossible d’annuler.' });
  const { par, magasin } = req.body || {};
  db.prepare("UPDATE orders SET statut = 'annulee' WHERE id = ?").run(o.id);
  db.prepare('INSERT INTO order_history (order_id,label,par,magasin,quand) VALUES (?,?,?,?,?)')
    .run(o.id, 'Commande annulée', par || 'Équipe', magasin || o.magasin, nowFr());
  res.json({ ok: true });
});

// ---- stock ----------------------------------------------------------
router.get('/admin/inventaire', requireAdmin, (req, res) =>
  res.json(db.prepare('SELECT * FROM stock ORDER BY id').all()));

router.post('/admin/inventaire/:id/ajuster', requireAdmin, (req, res) => {
  const delta = parseInt(req.body?.delta, 10);
  const s = db.prepare('SELECT * FROM stock WHERE id = ?').get(req.params.id);
  if (!s || !Number.isInteger(delta)) return res.status(400).json({ error: 'Requête invalide' });
  const nouvelle = Math.max(0, s.qte + delta);
  db.prepare('UPDATE stock SET qte = ? WHERE id = ?').run(nouvelle, s.id);
  res.json({ ok: true, qte: nouvelle });
});

// financement maison — lien de connexion bancaire (Stripe)
router.post('/compte/connexion-bancaire', requireClient, async (req, res) => {
  const u = db.prepare('SELECT courriel FROM users WHERE id = ?').get(req.session.userId);
  const r = await creerConnexionBancaire({ courriel: u.courriel });
  res.json({ ok: true, ...r });
});

router.get('/config', (req, res) => res.json({
  stripe: stripeConfigured(),
  stripePublishable: process.env.STRIPE_PUBLISHABLE_KEY || null
}));

export default router;
