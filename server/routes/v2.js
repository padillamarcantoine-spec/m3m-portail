// Routes v2 — financement maison, chat IA, service/pièces.
// Montées sous /api par le serveur principal.
import express from 'express';
import crypto from 'node:crypto';
import db from '../db.js';
import { estClientExistant, trouverClientParCourriel, creerDemandeFinancement, abonnementsClient, facturesClient, perfexConfigured } from '../perfex.js';
import { calculerMensualite, creerLienConnexionBancaire, stripeConfigured } from '../financement.js';
import { repondre, historique, iaConfigured } from '../agent.js';
import { notifierMagasin } from '../integrations.js';

const router = express.Router();
const nowFr = () => { const m = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre']; const d = new Date(); return `${d.getDate()} ${m[d.getMonth()]} ${d.getFullYear()}`; };
// Accepte les montants tapés « à la québécoise » : « 3 285,50 $ », « 3000$ », espaces insécables, etc.
function montantEnNombre(v) {
  if (typeof v === 'number') return v;
  const s = String(v || '').replace(/[\s  $]/g, '').replace(',', '.');
  return parseFloat(s);
}
function requireAdmin(req, res, next) { if (!req.session.adminUnlocked) return res.status(401).json({ error: 'Console verrouillée' }); next(); }
function requireClient(req, res, next) { if (!req.session.userId) return res.status(401).json({ error: 'Non connecté' }); next(); }

// =====================================================================
//  FINANCEMENT MAISON
// =====================================================================

// Bornes communes (validées côté serveur — le client ne peut pas les contourner).
function validerMontantMois(montantBrut, nMoisBrut) {
  const montant = montantEnNombre(montantBrut);
  if (!Number.isFinite(montant) || montant < 100 || montant > 50000)
    return { erreur: 'Le montant doit être entre 100 $ et 50 000 $.' };
  const mois = parseInt(nMoisBrut, 10);
  if (!Number.isInteger(mois) || mois < 3 || mois > 60)
    return { erreur: 'La durée doit être entre 3 et 60 mois.' };
  return { cents: Math.round(montant * 100), mois };
}

// Étape A — le client vérifie son admissibilité + obtient sa simulation.
router.post('/financement/simuler', (req, res) => {
  const v = validerMontantMois(req.body?.montant, req.body?.nMois ?? 18);
  if (v.erreur) return res.status(400).json({ error: v.erreur });
  res.json(calculerMensualite(v.cents, v.mois));
});

// Étape B — le client soumet sa demande. On vérifie qu'il est client EXISTANT (Perfex).
router.post('/financement/demande', async (req, res) => {
  try {
    const { nom, courriel, tel, item, montant, nMois } = req.body || {};
    if (!nom?.trim() || !courriel?.trim() || !item?.trim())
      return res.status(400).json({ error: 'Nom, courriel et item requis.' });
    const v = validerMontantMois(montant, nMois ?? 18);
    if (v.erreur) return res.status(400).json({ error: v.erreur });

    let existant;
    try {
      existant = await estClientExistant(courriel.trim());
    } catch (e) {
      // Panne du CRM ≠ « nouveau client » : on ne refuse personne sur une erreur technique.
      return res.status(503).json({ error: 'Impossible de vérifier votre dossier pour le moment — réessayez dans quelques minutes ou textez-nous au 514-609-1239.' });
    }
    if (!existant && !perfexConfigured()) {
      // CRM pas encore branché : un compte créé sur le portail compte comme client existant
      // (sinon, en démo, tout le monde sauf marie-eve@exemple.ca frappe un mur).
      existant = !!db.prepare('SELECT id FROM users WHERE courriel = ?').get(courriel.trim().toLowerCase());
    }
    const calc = calculerMensualite(v.cents, v.mois);

    const ref = 'FIN-' + crypto.randomBytes(5).toString('hex').toUpperCase();
    const r = db.prepare(`INSERT INTO financements (ref,user_id,courriel,nom,tel,item,montant_cents,n_mois,mensualite_cents,statut)
      VALUES (?,?,?,?,?,?,?,?,?,?)`).run(ref, req.session.userId || null, courriel.trim(), nom.trim(), tel?.trim() || '', item.trim(), v.cents, v.mois, calc.mensualiteCents, existant ? 'demande' : 'refuse_nouveau');
    const fid = r.lastInsertRowid;
    db.prepare('INSERT INTO financement_etapes (financement_id,label,quand,fait) VALUES (?,?,?,1)').run(fid, 'Demande reçue', nowFr());

    // Enregistre la piste dans Perfex (CRM = source de vérité) + avise le magasin.
    await creerDemandeFinancement({ nom: nom.trim(), courriel: courriel.trim(), tel, item, dejaClient: existant }).catch(() => {});
    await notifierMagasin({ sujet: `Financement maison — ${ref}`, message: `${nom} (${courriel}) — ${item} — ${existant ? 'CLIENT EXISTANT' : 'NOUVEAU (dépôt 50% requis)'}` }).catch(() => {});

    if (!existant) {
      return res.json({ ok: true, existant: false,
        message: `Le financement maison est réservé à nos clients existants. Comme premier achat, un dépôt minimum de 50 % (après taxes) est requis — passez nous voir en magasin ou textez le 514-609-1239 et on s'occupe de vous.` });
    }
    res.json({ ok: true, ref, existant: true, financementId: fid, calcul: calc });
  } catch (e) {
    console.error('[financement/demande]', e.message);
    res.status(500).json({ error: 'Erreur inattendue — réessayez ou contactez-nous.' });
  }
});

// Étape C — générer le lien de connexion bancaire (1,15 $ → capture PAD).
// Garde d'état : seuls les dossiers admissibles avancent (un refus « nouveau client »
// ne peut PAS contourner le dépôt de 50 % en appelant cette route directement).
router.post('/financement/:ref/connexion', async (req, res) => {
  try {
    const f = db.prepare('SELECT * FROM financements WHERE ref = ?').get(req.params.ref);
    if (!f) return res.status(404).json({ error: 'Financement introuvable' });
    if (!['demande', 'lien_envoye'].includes(f.statut))
      return res.status(409).json({ error: 'Ce dossier ne peut pas recevoir de lien de connexion (statut : ' + f.statut + ').' });
    // Idempotent : si un lien existe déjà, on le redonne sans dupliquer l'étape.
    const dejaEnvoye = f.statut === 'lien_envoye';
    const lien = await creerLienConnexionBancaire({ courriel: f.courriel, nom: f.nom, financementId: f.ref });
    db.prepare("UPDATE financements SET statut='lien_envoye', stripe_session=? WHERE id=?").run(lien.sessionId || f.stripe_session || '', f.id);
    if (!dejaEnvoye)
      db.prepare('INSERT INTO financement_etapes (financement_id,label,quand,fait) VALUES (?,?,?,1)').run(f.id, 'Lien de connexion bancaire envoyé', nowFr());
    res.json({ ok: true, url: lien.url, simulation: !!lien.simulation });
  } catch (e) {
    console.error('[financement/connexion]', e.message);
    res.status(500).json({ error: 'Impossible de générer le lien pour le moment — réessayez.' });
  }
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
  if (!['demande', 'lien_envoye', 'banque_connectee'].includes(f.statut))
    return res.status(409).json({ error: 'Statut incompatible (' + f.statut + ').' });
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
