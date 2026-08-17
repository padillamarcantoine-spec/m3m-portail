// Routes CRM intégré — fiches clients, factures, recouvrement (NSF / Stripe refusés).
// L'app est la source de vérité tant que Perfex n'est pas branché ; quand il le sera,
// les fiches locales et Perfex se complètent (voir perfex.js).
import express from 'express';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import db from '../db.js';

const router = express.Router();
const nowFr = () => { const m = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre']; const d = new Date(); return `${d.getDate()} ${m[d.getMonth()]} ${d.getFullYear()}`; };
const money = (c) => (Number(c || 0) / 100).toLocaleString('fr-CA', { minimumFractionDigits: 2 }) + ' $';
function requireAdmin(req, res, next) { if (!req.session.adminUnlocked) return res.status(401).json({ error: 'Console verrouillée' }); next(); }
// Montants « à la québécoise » : « 3 285,50 $ », espaces insécables, etc.
function montantEnNombre(v) {
  if (typeof v === 'number') return v;
  return parseFloat(String(v || '').replace(/[\s  $]/g, '').replace(',', '.'));
}

// Règle maison : un chèque refusé ne se règle JAMAIS par un autre chèque TD.
export const MODES_REGLEMENT = {
  cash: 'Cash',
  depot_ginette: 'Dépôt Ginette',
  interac: 'Transfert Interac',
  compte_perso: 'Transfert compte perso',
  cheque_mois_suivant: 'Chèque du mois suivant',
};
const FRAIS_NSF_DEFAUT_CENTS = Math.round(parseFloat(process.env.FRAIS_NSF || '15') * 100);

// =====================================================================
//  CLIENTS (fiches)
// =====================================================================
router.get('/admin/clients', requireAdmin, (req, res) => {
  const q = String(req.query.q || '').trim().toLowerCase();
  let rows = db.prepare(`SELECT id, courriel, nom, tel, adresse, note, cree_le FROM users WHERE role='client' ORDER BY nom COLLATE NOCASE`).all();
  if (q) rows = rows.filter(u => (u.nom + ' ' + u.courriel + ' ' + (u.tel || '')).toLowerCase().includes(q));
  const nFact = db.prepare('SELECT COUNT(*) c, COALESCE(SUM(CASE WHEN statut != \'payee\' THEN montant_cents ELSE 0 END),0) du FROM invoices WHERE user_id = ?');
  const nFin = db.prepare("SELECT COUNT(*) c FROM financements WHERE user_id = ? OR courriel = ?");
  const nRec = db.prepare("SELECT COUNT(*) c FROM paiements_refuses WHERE statut IN ('ouvert','promesse') AND (user_id = ? OR client_courriel = ?)");
  res.json(rows.map(u => {
    const f = nFact.get(u.id);
    return { ...u, nFactures: f.c, solde: money(f.du), soldeCents: f.du,
             nFinancements: nFin.get(u.id, u.courriel).c, dossiersOuverts: nRec.get(u.id, u.courriel).c };
  }));
});

router.post('/admin/clients', requireAdmin, (req, res) => {
  const { nom, courriel, tel, adresse, note } = req.body || {};
  if (!nom?.trim() || !courriel?.trim()) return res.status(400).json({ error: 'Nom et courriel requis.' });
  const c = courriel.trim().toLowerCase();
  if (db.prepare('SELECT id FROM users WHERE courriel = ?').get(c)) return res.status(409).json({ error: 'Ce courriel a déjà une fiche.' });
  // Fiche créée en magasin : mot de passe aléatoire — le client pourra le réinitialiser plus tard.
  const hash = bcrypt.hashSync(crypto.randomBytes(12).toString('hex'), 10);
  const r = db.prepare('INSERT INTO users (courriel,nom,mdp_hash,role,tel,adresse,note) VALUES (?,?,?,?,?,?,?)')
    .run(c, nom.trim(), hash, 'client', tel?.trim() || '', adresse?.trim() || '', note?.trim() || '');
  res.json({ ok: true, id: r.lastInsertRowid });
});

router.get('/admin/clients/:id', requireAdmin, (req, res) => {
  const u = db.prepare(`SELECT id, courriel, nom, tel, adresse, note, cree_le FROM users WHERE id = ? AND role='client'`).get(req.params.id);
  if (!u) return res.status(404).json({ error: 'Fiche introuvable' });
  const factures = db.prepare('SELECT id, ref, date, descr, montant_cents, statut, meta FROM invoices WHERE user_id = ? ORDER BY id DESC').all(u.id)
    .map(f => ({ ...f, montant: money(f.montant_cents) }));
  const financements = db.prepare('SELECT ref, item, montant_cents, mensualite_cents, n_mois, statut, cree_le FROM financements WHERE user_id = ? OR courriel = ? ORDER BY id DESC').all(u.id, u.courriel)
    .map(f => ({ ...f, montant: money(f.montant_cents), mensualite: money(f.mensualite_cents) }));
  const dossiers = db.prepare('SELECT ref, type, montant_cents, frais_cents, raison, date_refus, statut, mode_reglement FROM paiements_refuses WHERE user_id = ? OR client_courriel = ? ORDER BY id DESC').all(u.id, u.courriel)
    .map(d => ({ ...d, montant: money(d.montant_cents + d.frais_cents) }));
  const solde = factures.filter(f => f.statut !== 'payee').reduce((a, f) => a + f.montant_cents, 0);
  res.json({ ...u, factures, financements, dossiers, solde: money(solde) });
});

router.post('/admin/clients/:id/maj', requireAdmin, (req, res) => {
  const u = db.prepare('SELECT id FROM users WHERE id = ?').get(req.params.id);
  if (!u) return res.status(404).json({ error: 'Fiche introuvable' });
  const { tel, adresse, note, nom } = req.body || {};
  db.prepare('UPDATE users SET tel = COALESCE(?, tel), adresse = COALESCE(?, adresse), note = COALESCE(?, note), nom = COALESCE(?, nom) WHERE id = ?')
    .run(tel ?? null, adresse ?? null, note ?? null, (nom?.trim() || null), u.id);
  res.json({ ok: true });
});

// Facture manuelle (vente en magasin) — apparaît aussitôt dans l'espace client.
router.post('/admin/clients/:id/facture', requireAdmin, (req, res) => {
  const u = db.prepare('SELECT id FROM users WHERE id = ?').get(req.params.id);
  if (!u) return res.status(404).json({ error: 'Fiche introuvable' });
  const { descr, montant, statut } = req.body || {};
  const cents = Math.round((montantEnNombre(montant) || 0) * 100);
  if (!descr?.trim() || !cents || cents < 0) return res.status(400).json({ error: 'Description et montant requis.' });
  const ref = 'F-' + (2500 + db.prepare('SELECT COUNT(*) c FROM invoices').get().c + 1);
  db.prepare('INSERT INTO invoices (ref,user_id,date,descr,montant_cents,statut) VALUES (?,?,?,?,?,?)')
    .run(ref, u.id, nowFr(), descr.trim(), cents, ['a_payer','payee','financement'].includes(statut) ? statut : 'a_payer');
  res.json({ ok: true, ref });
});

router.post('/admin/factures/:id/statut', requireAdmin, (req, res) => {
  const f = db.prepare('SELECT id FROM invoices WHERE id = ?').get(req.params.id);
  if (!f) return res.status(404).json({ error: 'Facture introuvable' });
  const { statut } = req.body || {};
  if (!['a_payer', 'payee', 'financement'].includes(statut)) return res.status(400).json({ error: 'Statut invalide.' });
  db.prepare('UPDATE invoices SET statut = ? WHERE id = ?').run(statut, f.id);
  res.json({ ok: true });
});

// =====================================================================
//  RÈGLEMENTS (registre des paiements reçus)
// =====================================================================
export const MODES_PAIEMENT = { cheque_td: 'Chèque TD', ...MODES_REGLEMENT };
delete MODES_PAIEMENT.cheque_mois_suivant; // « chèque du mois suivant » n'existe que pour régler un dossier

router.get('/admin/reglements', requireAdmin, (req, res) => {
  const rows = db.prepare('SELECT * FROM reglements ORDER BY id DESC LIMIT 300').all();
  res.json(rows.map(r => ({ ...r, montant: money(r.montant_cents), montantOriginal: money(r.montant_original_cents),
                            modeLabel: MODES_PAIEMENT[r.mode] || r.mode })));
});

// Enregistrer un paiement reçu (chèque du mois, cash, dépôt, Interac…).
router.post('/admin/reglements', requireAdmin, (req, res) => {
  const { client_nom, client_courriel, mode, montant, no_cheque, date, financement_ref, note } = req.body || {};
  const cents = Math.round((montantEnNombre(montant) || 0) * 100);
  if (!client_nom?.trim() || !cents) return res.status(400).json({ error: 'Nom du client et montant requis.' });
  if (!MODES_PAIEMENT[mode]) return res.status(400).json({ error: 'Mode de paiement invalide.' });
  const courriel = (client_courriel || '').trim().toLowerCase();
  const user = courriel ? db.prepare('SELECT id FROM users WHERE courriel = ?').get(courriel) : null;
  const r = db.prepare(`INSERT INTO reglements (user_id,client_nom,financement_ref,mode,montant_cents,montant_original_cents,no_cheque,date,note)
    VALUES (?,?,?,?,?,?,?,?,?)`)
    .run(user?.id || null, client_nom.trim(), financement_ref?.trim() || '', mode, cents, cents,
         no_cheque?.trim() || '', date || new Date().toISOString().slice(0, 10), note?.trim() || '');
  res.json({ ok: true, id: r.lastInsertRowid });
});

// Chèque refusé par la banque : le règlement tombe à 0 $, marqué « refusé »,
// et le dossier de recouvrement est créé AUTOMATIQUEMENT avec toutes les infos.
router.post('/admin/reglements/:id/refuser', requireAdmin, (req, res) => {
  const r = db.prepare('SELECT * FROM reglements WHERE id = ?').get(req.params.id);
  if (!r) return res.status(404).json({ error: 'Règlement introuvable' });
  if (r.statut === 'refuse') return res.status(400).json({ error: 'Déjà marqué refusé.' });
  if (r.mode !== 'cheque_td') return res.status(400).json({ error: 'Seul un chèque TD peut être marqué « refusé » (NSF).' });
  const u = r.user_id ? db.prepare('SELECT courriel, tel FROM users WHERE id = ?').get(r.user_id) : null;
  const ref = 'REC-' + crypto.randomBytes(3).toString('hex').toUpperCase();
  db.prepare(`INSERT INTO paiements_refuses (ref,type,client_nom,client_tel,client_courriel,user_id,financement_ref,montant_cents,raison,no_cheque,date_refus,note)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(ref, 'cheque_nsf', r.client_nom, u?.tel || '', u?.courriel || '', r.user_id, r.financement_ref || '',
         r.montant_original_cents || r.montant_cents, req.body?.raison?.trim() || 'Chèque sans provision (NSF)',
         r.no_cheque || '', new Date().toISOString().slice(0, 10), 'Créé depuis le règlement #' + r.id);
  db.prepare("UPDATE reglements SET statut='refuse', montant_cents=0, dossier_ref=? WHERE id=?").run(ref, r.id);
  res.json({ ok: true, dossier: ref });
});

// =====================================================================
//  RECOUVREMENT (chèques NSF + paiements Stripe refusés)
// =====================================================================
function agingJours(dateRefus) {
  const d = new Date(dateRefus + 'T12:00:00');
  return Math.max(0, Math.floor((Date.now() - d.getTime()) / 86400000));
}
function trancheAging(j) { return j <= 30 ? '0-30' : j <= 60 ? '31-60' : j <= 90 ? '61-90' : '90+'; }

router.get('/admin/recouvrement', requireAdmin, (req, res) => {
  const rows = db.prepare('SELECT * FROM paiements_refuses ORDER BY CASE WHEN statut IN (\'ouvert\',\'promesse\') THEN 0 ELSE 1 END, date_refus').all();
  const dossiers = rows.map(d => {
    const j = agingJours(d.date_refus);
    return { ...d, montant: money(d.montant_cents), frais: money(d.frais_cents), total: money(d.montant_cents + d.frais_cents),
             totalCents: d.montant_cents + d.frais_cents, jours: j, tranche: trancheAging(j),
             modeLabel: MODES_REGLEMENT[d.mode_reglement] || '', escalade: j > 45 && (d.statut === 'ouvert' || d.statut === 'promesse') };
  });
  const ouverts = dossiers.filter(d => d.statut === 'ouvert' || d.statut === 'promesse');
  const aRecuperer = ouverts.reduce((a, d) => a + d.totalCents, 0);
  const recupere = dossiers.filter(d => d.statut === 'recupere').reduce((a, d) => a + d.totalCents, 0);
  res.json({ dossiers, totaux: { aRecuperer: money(aRecuperer), recupere: money(recupere), nOuverts: ouverts.length },
             modes: MODES_REGLEMENT, fraisDefaut: money(FRAIS_NSF_DEFAUT_CENTS) });
});

// Saisie manuelle (chèque NSF reçu de la banque).
router.post('/admin/recouvrement', requireAdmin, (req, res) => {
  const { type, client_nom, client_tel, client_courriel, montant, raison, no_cheque, date_refus, note, financement_ref } = req.body || {};
  const cents = Math.round((montantEnNombre(montant) || 0) * 100);
  if (!client_nom?.trim() || !cents) return res.status(400).json({ error: 'Nom du client et montant requis.' });
  const ref = 'REC-' + crypto.randomBytes(3).toString('hex').toUpperCase();
  const courriel = (client_courriel || '').trim().toLowerCase();
  const user = courriel ? db.prepare('SELECT id FROM users WHERE courriel = ?').get(courriel) : null;
  db.prepare(`INSERT INTO paiements_refuses (ref,type,client_nom,client_tel,client_courriel,user_id,financement_ref,montant_cents,raison,no_cheque,date_refus,note)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(ref, type === 'stripe_echec' ? 'stripe_echec' : 'cheque_nsf', client_nom.trim(), client_tel?.trim() || '', courriel,
         user?.id || null, financement_ref?.trim() || '', cents, raison?.trim() || 'Chèque sans provision (NSF)',
         no_cheque?.trim() || '', date_refus || new Date().toISOString().slice(0, 10), note?.trim() || '');
  res.json({ ok: true, ref });
});

// Régler un dossier — la règle maison est appliquée ici : jamais « chèque TD ».
router.post('/admin/recouvrement/:ref/regler', requireAdmin, (req, res) => {
  const d = db.prepare('SELECT * FROM paiements_refuses WHERE ref = ?').get(req.params.ref);
  if (!d) return res.status(404).json({ error: 'Dossier introuvable' });
  const { mode, note } = req.body || {};
  if (!MODES_REGLEMENT[mode]) {
    return res.status(400).json({ error: 'Mode de règlement invalide. Un chèque refusé se règle par : ' + Object.values(MODES_REGLEMENT).join(', ') + ' — jamais par un autre chèque TD.' });
  }
  db.prepare("UPDATE paiements_refuses SET statut='recupere', mode_reglement=?, regle_le=?, note = CASE WHEN ? != '' THEN note || CASE WHEN note != '' THEN ' — ' ELSE '' END || ? ELSE note END WHERE id=?")
    .run(mode, nowFr(), note?.trim() || '', note?.trim() || '', d.id);
  // Traçabilité : le règlement qui vient payer le dossier est enregistré au registre.
  // « Chèque du mois suivant » : pas de règlement immédiat — ce sera le chèque TD du mois
  // prochain, saisi normalement à son dépôt.
  if (mode !== 'cheque_mois_suivant') {
    db.prepare(`INSERT INTO reglements (user_id,client_nom,financement_ref,mode,montant_cents,montant_original_cents,date,statut,dossier_ref,note)
      VALUES (?,?,?,?,?,?,?,?,?,?)`)
      .run(d.user_id, d.client_nom, d.financement_ref || '', mode, d.montant_cents + d.frais_cents, d.montant_cents + d.frais_cents,
           new Date().toISOString().slice(0, 10), 'encaisse', d.ref, 'Règlement du dossier ' + d.ref);
  }
  res.json({ ok: true });
});

router.post('/admin/recouvrement/:ref/promesse', requireAdmin, (req, res) => {
  const d = db.prepare('SELECT * FROM paiements_refuses WHERE ref = ?').get(req.params.ref);
  if (!d) return res.status(404).json({ error: 'Dossier introuvable' });
  const { note } = req.body || {};
  db.prepare("UPDATE paiements_refuses SET statut='promesse', promesse_note=? WHERE id=?").run(note?.trim() || 'Promesse de paiement', d.id);
  res.json({ ok: true });
});

router.post('/admin/recouvrement/:ref/frais', requireAdmin, (req, res) => {
  const d = db.prepare('SELECT * FROM paiements_refuses WHERE ref = ?').get(req.params.ref);
  if (!d) return res.status(404).json({ error: 'Dossier introuvable' });
  const cents = Math.round((montantEnNombre(req.body?.montant) || 0) * 100) || FRAIS_NSF_DEFAUT_CENTS;
  db.prepare('UPDATE paiements_refuses SET frais_cents = frais_cents + ? WHERE id = ?').run(cents, d.id);
  res.json({ ok: true, frais: money(d.frais_cents + cents) });
});

router.post('/admin/recouvrement/:ref/radier', requireAdmin, (req, res) => {
  const d = db.prepare('SELECT * FROM paiements_refuses WHERE ref = ?').get(req.params.ref);
  if (!d) return res.status(404).json({ error: 'Dossier introuvable' });
  db.prepare("UPDATE paiements_refuses SET statut='radie', regle_le=? WHERE id=?").run(nowFr(), d.id);
  res.json({ ok: true });
});

// Création automatique d'un dossier sur échec Stripe (appelé par le webhook — idempotent par événement).
export function creerDossierEchecStripe({ eventId, montantCents, courriel, nom, raison, financementRef }) {
  if (eventId && db.prepare('SELECT id FROM paiements_refuses WHERE stripe_event = ?').get(eventId)) return null;
  const ref = 'REC-' + crypto.randomBytes(3).toString('hex').toUpperCase();
  const user = courriel ? db.prepare('SELECT id FROM users WHERE courriel = ?').get(String(courriel).toLowerCase()) : null;
  db.prepare(`INSERT INTO paiements_refuses (ref,type,client_nom,client_courriel,user_id,financement_ref,montant_cents,raison,date_refus,stripe_event)
    VALUES (?,?,?,?,?,?,?,?,?,?)`)
    .run(ref, 'stripe_echec', nom || courriel || 'Client Stripe', String(courriel || '').toLowerCase(), user?.id || null,
         financementRef || '', montantCents || 0, raison || 'Prélèvement Stripe refusé', new Date().toISOString().slice(0, 10), eventId || null);
  return ref;
}

export default router;
