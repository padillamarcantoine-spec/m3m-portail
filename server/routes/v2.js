// Routes v2 — financement maison, chat IA, service/pièces.
// Montées sous /api par le serveur principal.
import express from 'express';
import crypto from 'node:crypto';
import db from '../db.js';
import { estClientExistant, trouverClientParCourriel, creerDemandeFinancement, abonnementsClient, facturesClient } from '../perfex.js';
import { calculerMensualite, creerLienConnexionBancaire, stripeConfigured } from '../financement.js';
import { repondre, historique, iaConfigured } from '../agent.js';
import { notifierMagasin } from '../integrations.js';

const router = express.Router();
const nowFr = () => { const m = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre']; const d = new Date(); return `${d.getDate()} ${m[d.getMonth()]} ${d.getFullYear()}`; };
function requireAdmin(req, res, next) { if (!req.session.adminUnlocked) return res.status(401).json({ error: 'Console verrouillée' }); next(); }
function requireClient(req, res, next) { if (!req.session.userId) return res.status(401).json({ error: 'Non connecté' }); next(); }

// =====================================================================
//  FINANCEMENT MAISON
// =====================================================================

// Étape A — le client vérifie son admissibilité + obtient sa simulation.
router.post('/financement/simuler', (req, res) => {
  const montant = parseFloat(req.body?.montant);
  const nMois = parseInt(req.body?.nMois, 10) || 18;
  if (!montant || montant < 100 || montant > 50000) return res.status(400).json({ error: 'Le montant doit être entre 100 $ et 50 000 $.' });
  const calc = calculerMensualite(Math.round(montant * 100), nMois);
  res.json(calc);
});

// Étape B — le client soumet sa demande. On vérifie qu'il est client EXISTANT (Perfex).
router.post('/financement/demande', async (req, res) => {
  const { nom, courriel, tel, item, montant, nMois } = req.body || {};
  if (!nom?.trim() || !courriel?.trim() || !item?.trim())
    return res.status(400).json({ error: 'Nom, courriel et item requis.' });

  const montantNum = parseFloat(montant) || 0;
  if (montantNum && (montantNum < 100 || montantNum > 50000)) return res.status(400).json({ error: 'Le montant doit être entre 100 $ et 50 000 $.' });
  const existant = await estClientExistant(courriel.trim());
  const mois = parseInt(nMois, 10) || 18;
  const cents = Math.round(montantNum * 100);
  const calc = calculerMensualite(cents || 100000, mois);

  const ref = 'FIN-' + crypto.randomBytes(5).toString('hex').toUpperCase();
  const r = db.prepare(`INSERT INTO financements (ref,user_id,courriel,nom,tel,item,montant_cents,n_mois,mensualite_cents,statut)
    VALUES (?,?,?,?,?,?,?,?,?,?)`).run(ref, req.session.userId || null, courriel.trim(), nom.trim(), tel?.trim() || '', item.trim(), cents, mois, calc.mensualiteCents, existant ? 'demande' : 'refuse_nouveau');
  const fid = r.lastInsertRowid;
  const step = db.prepare('INSERT INTO financement_etapes (financement_id,label,quand,fait) VALUES (?,?,?,?)');
  step.run(fid, 'Demande reçue', nowFr(), 1);

  // Enregistre la piste dans Perfex (CRM = source de vérité).
  await creerDemandeFinancement({ nom: nom.trim(), courriel: courriel.trim(), tel, item, dejaClient: existant });
  await notifierMagasin({ sujet: `Financement maison — ${ref}`, message: `${nom} (${courriel}) — ${item} — ${existant ? 'CLIENT EXISTANT' : 'NOUVEAU (dépôt 50% requis)'}` });

  if (!existant) {
    return res.json({ ok: true, ref, existant: false,
      message: `Le financement maison est réservé à nos clients existants. Comme premier achat, un dépôt minimum de 50 % (après taxes) est requis — passez nous voir en magasin ou textez le 514-609-1239 et on s'occupe de vous.` });
  }
  res.json({ ok: true, ref, existant: true, financementId: fid, calcul: calc });
});

// Étape C — générer le lien de connexion bancaire (1,15 $ → capture PAD).
router.post('/financement/:ref/connexion', async (req, res) => {
  const f = db.prepare('SELECT * FROM financements WHERE ref = ?').get(req.params.ref);
  if (!f) return res.status(404).json({ error: 'Financement introuvable' });
  const lien = await creerLienConnexionBancaire({ courriel: f.courriel, nom: f.nom, financementId: f.ref });
  db.prepare("UPDATE financements SET statut='lien_envoye', stripe_session=? WHERE id=?").run(lien.sessionId || '', f.id);
  db.prepare('INSERT INTO financement_etapes (financement_id,label,quand,fait) VALUES (?,?,?,1)').run(f.id, 'Lien de connexion bancaire envoyé', nowFr());
  res.json({ ok: true, url: lien.url, simulation: !!lien.simulation });
});

// Suivi — état complet d'un financement (pour l'écran client).
router.get('/financement/:ref', (req, res) => {
  const f = db.prepare('SELECT * FROM financements WHERE ref = ?').get(req.params.ref);
  if (!f) return res.status(404).json({ error: 'Financement introuvable' });
  const etapes = db.prepare('SELECT label,quand,fait FROM financement_etapes WHERE financement_id=? ORDER BY id').all(f.id).map(e => ({ ...e, fait: !!e.fait }));
  const money = (c) => (c/100).toLocaleString('fr-CA',{minimumFractionDigits:2})+' $';
  res.json({
    ref: f.ref, nom: f.nom, item: f.item, statut: f.statut,
    montant: money(f.montant_cents), mensualite: money(f.mensualite_cents),
    nMois: f.n_mois, taux: f.taux, versementsFaits: f.versements_faits, etapes,
    simulation: !stripeConfigured()
  });
});

// Plans de financement du client connecté (espace client — données réelles).
router.get('/compte/financements', requireClient, (req, res) => {
  const money = (c) => (Number(c || 0) / 100).toLocaleString('fr-CA', { minimumFractionDigits: 2 }) + ' $';
  const rows = db.prepare('SELECT * FROM financements WHERE user_id = ? ORDER BY id DESC').all(req.session.userId);
  res.json(rows.map(f => ({ ref: f.ref, item: f.item, statut: f.statut, montant: money(f.montant_cents), mensualite: money(f.mensualite_cents), nMois: f.n_mois, taux: f.taux, versementsFaits: f.versements_faits,
    etapes: db.prepare('SELECT label,quand,fait FROM financement_etapes WHERE financement_id=? ORDER BY id').all(f.id).map(e => ({ ...e, fait: !!e.fait })) })));
});

// (démo) simuler la confirmation bancaire → active l'abonnement.
router.post('/financement/:ref/confirmer-demo', (req, res) => {
  if (process.env.NODE_ENV === 'production') return res.status(404).json({ error: 'Indisponible' });
  const f = db.prepare('SELECT * FROM financements WHERE ref = ?').get(req.params.ref);
  if (!f) return res.status(404).json({ error: 'Introuvable' });
  db.prepare("UPDATE financements SET statut='actif' WHERE id=?").run(f.id);
  const step = db.prepare('INSERT INTO financement_etapes (financement_id,label,quand,fait) VALUES (?,?,?,1)');
  step.run(f.id, 'Compte bancaire connecté et confirmé', nowFr());
  step.run(f.id, 'Financement actif — premier prélèvement planifié', nowFr());
  res.json({ ok: true });
});

// =====================================================================
//  CHAT IA
// =====================================================================
router.post('/chat', async (req, res) => {
  const { message } = req.body || {};
  if (!message?.trim()) return res.status(400).json({ error: 'Message vide.' });
  if (!req.session.chatId) req.session.chatId = 'c' + Math.random().toString(36).slice(2, 10);
  try {
    const r = await repondre(req.session.chatId, message.trim());
    res.json(r);
  } catch (e) { res.status(500).json({ error: 'Erreur du chat.' }); }
});
router.get('/chat', (req, res) => {
  if (!req.session.chatId) return res.json([]);
  res.json(historique(req.session.chatId));
});
router.get('/chat/etat', (req, res) => res.json({ ia: iaConfigured() }));

// Admin — enrichir la base de connaissances de l'agent (il « apprend »).
router.post('/admin/savoir', requireAdmin, (req, res) => {
  const { sujet, contenu } = req.body || {};
  if (!sujet?.trim() || !contenu?.trim()) return res.status(400).json({ error: 'Sujet et contenu requis.' });
  db.prepare('INSERT INTO chat_savoir (sujet,contenu) VALUES (?,?)').run(sujet.trim(), contenu.trim());
  res.json({ ok: true });
});
router.get('/admin/savoir', requireAdmin, (req, res) =>
  res.json(db.prepare('SELECT id,sujet,contenu FROM chat_savoir ORDER BY id DESC').all()));

// =====================================================================
//  ADMIN — DEMANDES ENTRANTES (boîte de réception des leads)
// =====================================================================
router.get('/admin/demandes', requireAdmin, (req, res) => {
  const money = (c) => (Number(c || 0) / 100).toLocaleString('fr-CA', { minimumFractionDigits: 2 }) + ' $';
  const prix = db.prepare("SELECT id,produit,option,nom,tel,cree_le,traite FROM price_requests WHERE type='prix' ORDER BY id DESC").all().map(r => ({ ...r, traite: !!r.traite }));
  const financement = db.prepare("SELECT id,produit AS item,nom,tel,deja_client,cree_le,traite FROM price_requests WHERE type='financement' ORDER BY id DESC").all().map(r => ({ ...r, traite: !!r.traite }));
  const plans = db.prepare("SELECT ref,nom,courriel,tel,item,montant_cents,mensualite_cents,n_mois,statut,cree_le FROM financements ORDER BY id DESC").all()
    .map(f => ({ ref: f.ref, nom: f.nom, courriel: f.courriel, tel: f.tel, item: f.item, montant: money(f.montant_cents), mensualite: money(f.mensualite_cents), nMois: f.n_mois, statut: f.statut, cree_le: f.cree_le }));
  res.json({ prix, financement, plans, nonTraite: prix.filter(p => !p.traite).length + financement.filter(p => !p.traite).length });
});
router.post('/admin/demandes/:id/traiter', requireAdmin, (req, res) => {
  db.prepare('UPDATE price_requests SET traite = 1 WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// =====================================================================
//  SERVICE / PIÈCES (atelier interne — admin)
// =====================================================================
router.get('/admin/services', requireAdmin, (req, res) => {
  const rows = db.prepare('SELECT * FROM services ORDER BY id DESC').all();
  res.json(rows.map(s => ({ ...s, hist: db.prepare('SELECT label,quand FROM service_historique WHERE service_id=? ORDER BY id').all(s.id) })));
});
router.post('/admin/services', requireAdmin, (req, res) => {
  const { client, item, probleme, piece, fournisseur, magasin, note } = req.body || {};
  if (!item?.trim() || !probleme?.trim()) return res.status(400).json({ error: 'Item et problème requis.' });
  const ref = 'SRV-' + crypto.randomBytes(3).toString('hex').toUpperCase();
  const r = db.prepare(`INSERT INTO services (ref,client,item,probleme,piece,fournisseur,magasin,note,statut)
    VALUES (?,?,?,?,?,?,?,?,?)`).run(ref, client?.trim()||'', item.trim(), probleme.trim(), piece?.trim()||'', fournisseur||'', magasin||'', note?.trim()||'', 'a_faire');
  db.prepare('INSERT INTO service_historique (service_id,label,quand) VALUES (?,?,?)').run(r.lastInsertRowid, 'Service créé', nowFr());
  res.json({ ok: true, ref });
});
const SRV_NEXT = { a_faire: 'piece_commandee', piece_commandee: 'en_cours', en_cours: 'termine' };
const SRV_LABEL = { a_faire: 'Pièce commandée', piece_commandee: 'Réparation en cours', en_cours: 'Service terminé' };
router.post('/admin/services/:ref/avancer', requireAdmin, (req, res) => {
  const s = db.prepare('SELECT * FROM services WHERE ref=?').get(req.params.ref);
  if (!s) return res.status(404).json({ error: 'Introuvable' });
  const next = SRV_NEXT[s.statut];
  if (!next) return res.status(400).json({ error: 'Déjà terminé.' });
  db.prepare('UPDATE services SET statut=? WHERE id=?').run(next, s.id);
  db.prepare('INSERT INTO service_historique (service_id,label,quand) VALUES (?,?,?)').run(s.id, SRV_LABEL[s.statut], nowFr());
  res.json({ ok: true, statut: next });
});

export default router;
