// Seed the database with the reference data from the design handoff.
// Idempotent: run `npm run seed` any time. It only fills empty tables,
// except with --force which wipes and reseeds.
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import db from './db.js';
// Catalogue réel — 523 pièces générées depuis matrix-ULTIMATE.csv.
// Régénérer : python gen_catalogue_app.py, puis npm run seed -- --force.
import { PRODUCTS } from './catalogue-data.js';

const FORCE = process.argv.includes('--force');

const STORES = [
  { id: 1, nom: 'Meubles Trois Mousquetaires', court: 'Trois Mousquetaires', init: 'M3M', contact: 'Marc-Antoine', point: '#c89b3c' },
  { id: 2, nom: 'Matelas Dépôt', court: 'Matelas Dépôt', init: 'MD', contact: 'Équipe Matelas Dépôt', point: '#6f86b0' },
  { id: 3, nom: 'Électro Marpad', court: 'Électro Marpad', init: 'EM', contact: 'Équipe Électro Marpad', point: '#7c8a4f' }
];

const SUPPLIERS = [
  { nom: 'Matrix Furniture', init: 'MX', categorie: 'Chambres, salons, tables', delai: '3 à 5 sem' },
  { nom: 'Modern Furniture', init: 'MO', categorie: 'Mobilier contemporain', delai: '4 à 6 sem' },
  { nom: 'IFDC', init: 'IF', categorie: 'Mobilier importé, chaises', delai: '6 à 8 sem' },
  { nom: 'A-Class Furniture', init: 'AC', categorie: 'Sofas & sectionnels', delai: '4 à 5 sem' },
  { nom: 'Sofa by Fancy', init: 'SF', categorie: 'Sofas & fauteuils sur mesure', delai: '5 à 7 sem' },
  { nom: 'Littlespills', init: 'LS', categorie: 'Literie & accessoires', delai: '2 à 3 sem' },
  { nom: 'Primo', init: 'PR', categorie: 'Matelas & sommiers', delai: '1 à 2 sem' },
  { nom: 'Monarch', init: 'MN', categorie: 'Tables, accents, miroirs', delai: '2 à 4 sem' }
];

// PRODUCTS est importé depuis ./catalogue-data.js (523 pièces réelles).

const CATEGORIES = ['Tout', 'Base de lit', 'Causeuse', 'Chaises de salle à manger (paire)', 'Chiffonnier', 'Commode + Miroir', 'Ensemble chambre', 'Ensemble salle à manger', 'Ensemble salon', 'Fauteuil', 'Miroir', 'Sectionnel', 'Sofa', 'Table', 'Table d’appoint', 'Table de nuit', 'Table de salon'];

const ORDERS = [
  { ref: 'C-2048', modele: 'Ensemble literie King', fournisseur: 'Littlespills', magasin: 'Matelas Dépôt', auteur: 'Karim', date: '2026-08-04', qte: 20, statut: 'nouvelle', note: '', hist: [
    { label: 'Commande créée', par: 'Karim', magasin: 'Matelas Dépôt', quand: '4 août 2026' } ] },
  { ref: 'C-2047', modele: 'Table Mae — chêne clair', fournisseur: 'Monarch', magasin: 'Meubles Trois Mousquetaires', auteur: 'Luc', date: '2026-08-03', qte: 4, statut: 'nouvelle', note: 'Confirmer la teinte avec le représentant.', hist: [
    { label: 'Commande créée', par: 'Luc', magasin: 'Meubles Trois Mousquetaires', quand: '3 août 2026' } ] },
  { ref: 'C-2046', modele: 'Matelas Primo King', fournisseur: 'Primo', magasin: 'Matelas Dépôt', auteur: 'Karim', date: '2026-08-01', qte: 12, statut: 'transit', note: 'Palette complète — quai de réception.', hist: [
    { label: 'Commande créée', par: 'Karim', magasin: 'Matelas Dépôt', quand: '1 août 2026' },
    { label: 'Passée au fournisseur', par: 'Karim', magasin: 'Matelas Dépôt', quand: '1 août 2026' },
    { label: 'En transit', par: 'Karim', magasin: 'Matelas Dépôt', quand: '3 août 2026' } ] },
  { ref: 'C-2045', modele: 'Causeuse Isabella', fournisseur: 'Modern Furniture', magasin: 'Électro Marpad', auteur: 'Sophie', date: '2026-08-02', qte: 2, statut: 'commandee', note: '', hist: [
    { label: 'Commande créée', par: 'Sophie', magasin: 'Électro Marpad', quand: '2 août 2026' },
    { label: 'Passée au fournisseur', par: 'Sophie', magasin: 'Électro Marpad', quand: '2 août 2026' } ] },
  { ref: 'C-2042', modele: 'Sectionnel Sage', fournisseur: 'A-Class Furniture', magasin: 'Meubles Trois Mousquetaires', auteur: 'Marie-Ève', date: '2026-07-28', qte: 3, statut: 'commandee', note: 'Coloris sauge — priorité plancher.', hist: [
    { label: 'Commande créée', par: 'Marie-Ève', magasin: 'Meubles Trois Mousquetaires', quand: '28 juillet 2026' },
    { label: 'Passée au fournisseur', par: 'Marie-Ève', magasin: 'Meubles Trois Mousquetaires', quand: '28 juillet 2026' } ] },
  { ref: 'C-2037', modele: 'Base de lit Bombay — Queen', fournisseur: 'Matrix Furniture', magasin: 'Meubles Trois Mousquetaires', auteur: 'Marie-Ève', date: '2026-07-20', qte: 5, statut: 'recue', note: '', hist: [
    { label: 'Commande créée', par: 'Marie-Ève', magasin: 'Meubles Trois Mousquetaires', quand: '20 juillet 2026' },
    { label: 'Passée au fournisseur', par: 'Marie-Ève', magasin: 'Meubles Trois Mousquetaires', quand: '20 juillet 2026' },
    { label: 'En transit', par: 'Marie-Ève', magasin: 'Meubles Trois Mousquetaires', quand: '26 juillet 2026' },
    { label: 'Reçue à l’entrepôt', par: 'Marie-Ève', magasin: 'Meubles Trois Mousquetaires', quand: '2 août 2026' } ] }
];

const STOCK = [
  { modele: 'Base de lit Sterling — Queen', fournisseur: 'Matrix Furniture', categorie: 'Bases de lit', qte: 8, seuil: 4 },
  { modele: 'Table Mae', fournisseur: 'Monarch', categorie: 'Tables', qte: 2, seuil: 5 },
  { modele: 'Sectionnel Sage', fournisseur: 'A-Class Furniture', categorie: 'Sectionnels', qte: 1, seuil: 3 },
  { modele: 'Causeuse Isabella', fournisseur: 'Modern Furniture', categorie: 'Causeuses', qte: 6, seuil: 3 },
  { modele: 'Matelas Primo Queen', fournisseur: 'Primo', categorie: 'Matelas', qte: 0, seuil: 6 },
  { modele: 'Chaises Molly (paire)', fournisseur: 'IFDC', categorie: 'Chaises', qte: 14, seuil: 8 },
  { modele: 'Miroir Aria', fournisseur: 'Littlespills', categorie: 'Accessoires', qte: 20, seuil: 6 },
  { modele: 'Fauteuil Madrid — graphite', fournisseur: 'Sofa by Fancy', categorie: 'Fauteuils', qte: 3, seuil: 4 }
];

function wipe() {
  const tables = ['order_history', 'orders', 'stock', 'suppliers', 'products', 'service_steps', 'service_tickets', 'service_historique', 'services', 'invoices', 'price_requests', 'financement_etapes', 'financements', 'paiements_refuses', 'reglements', 'chat_savoir', 'chat_messages', 'users', 'stores'];
  for (const t of tables) db.exec(`DELETE FROM ${t};`);
}

function isEmpty() {
  return db.prepare('SELECT COUNT(*) c FROM stores').get().c === 0;
}

function seed() {
  if (FORCE) wipe();
  if (!isEmpty() && !FORCE) {
    console.log('Base déjà remplie — rien à faire (utilisez --force pour réinitialiser).');
    return;
  }

  const insStore = db.prepare('INSERT INTO stores (id,nom,court,init,contact,point) VALUES (@id,@nom,@court,@init,@contact,@point)');
  for (const s of STORES) insStore.run(s);

  const insSup = db.prepare('INSERT INTO suppliers (nom,init,categorie,delai) VALUES (@nom,@init,@categorie,@delai)');
  for (const s of SUPPLIERS) insSup.run(s);

  const insProd = db.prepare('INSERT INTO products (slug,nom,ref,cat,img,options,descr,lit,vedette,fournisseur) VALUES (@slug,@nom,@ref,@cat,@img,@options,@descr,@lit,@vedette,@fournisseur)');
  for (const p of PRODUCTS) insProd.run({ ...p, options: JSON.stringify(p.options) });

  const insStock = db.prepare('INSERT INTO stock (modele,fournisseur,categorie,qte,seuil) VALUES (@modele,@fournisseur,@categorie,@qte,@seuil)');
  for (const s of STOCK) insStock.run(s);

  const insOrder = db.prepare('INSERT INTO orders (ref,modele,fournisseur,magasin,auteur,date,qte,statut,note) VALUES (@ref,@modele,@fournisseur,@magasin,@auteur,@date,@qte,@statut,@note)');
  const insHist = db.prepare('INSERT INTO order_history (order_id,label,par,magasin,quand) VALUES (?,?,?,?,?)');
  for (const o of ORDERS) {
    const { hist, ...row } = o;
    const r = insOrder.run(row);
    for (const h of hist) insHist.run(r.lastInsertRowid, h.label, h.par, h.magasin, h.quand);
  }

  // Demo client account (Marie-Ève) with invoices, service ticket, deliveries.
  const hash = bcrypt.hashSync('demo1234', 10);
  const u = db.prepare('INSERT INTO users (courriel,nom,mdp_hash,role,stripe_connecte) VALUES (?,?,?,?,1)')
    .run('marie-eve@exemple.ca', 'Marie-Ève', hash, 'client');
  const uid = u.lastInsertRowid;

  const insInv = db.prepare('INSERT INTO invoices (ref,user_id,date,descr,montant_cents,statut,meta) VALUES (?,?,?,?,?,?,?)');
  insInv.run('F-2503', uid, '12 juillet 2026', 'Chaises Molly (la paire)', 28900, 'a_payer', '');
  insInv.run('F-2467', uid, '3 mai 2026', 'Ensemble chambre Bombay', 328500, 'financement', '6/18');
  insInv.run('F-2418', uid, '2 février 2026', 'Table Mae', 109500, 'payee', '');

  // Recouvrement + règlements de démonstration (le flux complet : chèque déposé → refusé → dossier → règlement permis).
  db.prepare("UPDATE users SET tel='514-555-0199', adresse='4550, rue Adam, Montréal (QC)' WHERE id=?").run(uid);
  const dOld = (j) => new Date(Date.now() - j * 86400000).toISOString().slice(0, 10);
  const insReg = db.prepare(`INSERT INTO reglements (user_id,client_nom,financement_ref,mode,montant_cents,montant_original_cents,no_cheque,date,statut,dossier_ref,note)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`);
  const insRec = db.prepare(`INSERT INTO paiements_refuses (ref,type,client_nom,client_tel,client_courriel,user_id,financement_ref,montant_cents,frais_cents,raison,no_cheque,date_refus,statut,mode_reglement,regle_le,promesse_note,note)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  // 1. Chèque du mois encaissé normalement (rien à signaler).
  insReg.run(uid, 'Marie-Ève', '', 'cheque_td', 22885, 22885, '043', dOld(64), 'encaisse', null, 'Versement mensuel — Ensemble chambre Bombay');
  // 2. Chèque refusé il y a 12 jours → règlement à 0 $ + dossier OUVERT (toutes les infos dedans).
  insReg.run(uid, 'Marie-Ève', '', 'cheque_td', 0, 22885, '044', dOld(12), 'refuse', 'REC-DEMO01', 'Versement mensuel — Ensemble chambre Bombay');
  insRec.run('REC-DEMO01', 'cheque_nsf', 'Marie-Ève', '514-555-0199', 'marie-eve@exemple.ca', uid, '', 22885, 1500,
    'Chèque sans provision (NSF)', '044', dOld(12), 'ouvert', null, null, '', 'Créé depuis le règlement refusé — frais NSF 15 $ ajoutés');
  // 3. Vieux dossier (52 jours — escaladé) avec promesse de paiement.
  insRec.run('REC-DEMO02', 'cheque_nsf', 'J. Tremblay', '438-555-0112', '', null, '', 41500, 1500,
    'Compte fermé', '017', dOld(52), 'promesse', null, null, 'Promet de passer vendredi avec le cash', '');
  // 4. Prélèvement Stripe refusé, récupéré par dépôt Ginette (règle maison : jamais par chèque TD).
  insRec.run('REC-DEMO03', 'stripe_echec', 'K. Bouchard', '514-555-0177', '', null, '', 18250, 0,
    'Provision insuffisante (PAD)', '', dOld(30), 'recupere', 'depot_ginette', '5 août 2026', '', '');
  insReg.run(null, 'K. Bouchard', '', 'depot_ginette', 18250, 18250, '', dOld(25), 'encaisse', 'REC-DEMO03', 'Règlement du dossier REC-DEMO03');

  const t = db.prepare('INSERT INTO service_tickets (ref,user_id,item,descr,photo,statut) VALUES (?,?,?,?,?,?)')
    .run('S-108', uid, 'Fauteuil Madrid — mécanisme inclinable', '« Le mécanisme accroche à mi-course. Photo jointe. »', 'IMG_2043.jpg', 'en_cours');
  const tid = t.lastInsertRowid;
  const insStep = db.prepare('INSERT INTO service_steps (ticket_id,label,quand,fait) VALUES (?,?,?,?)');
  insStep.run(tid, 'Demande reçue', '21 juillet', 1);
  insStep.run(tid, 'Technicien assigné', '24 juillet', 1);
  insStep.run(tid, 'Visite à domicile', 'Prévue le 8 août', 0);

  // Base de connaissances de l'agent IA (il « apprend » : ajoute-en d'autres via la console).
  const savoir = db.prepare('INSERT INTO chat_savoir (sujet,contenu) VALUES (?,?)');
  [
    ['financement maison', 'Le financement maison est réservé aux clients existants. On envoie un lien de connexion bancaire sécurisé (Stripe), un petit paiement de 1,15 $ enregistre le compte, puis les versements mensuels se font automatiquement. Taux de 29,99 %.'],
    ['matelas', 'Nos matelas sont fabriqués ici à Montréal — on est associés avec un manufacturier. On peut ajuster le confort et les formats (Queen, King, etc.).'],
    ['électroménagers', 'On vend des électroménagers, surtout usagés remis à neuf, parfois neufs. Passez en salle de montre pour voir l’inventaire du jour.'],
    ['livraison', 'Livraison gratuite à Montréal et environs, installation gant blanc le jour même, montage inclus. Délai typique de 3 à 14 jours ouvrables.'],
    ['heures adresse', 'On est au 2485, rue Leclaire, Montréal (QC) H1V 3A6. Téléphone (514) 251-1055, texto 514-609-1239.'],
    ['financement options', 'On offre Fairstone, Affirm, iFinance et le financement maison. La demande se fait en ligne en quelques minutes.']
  ].forEach(([s, c]) => savoir.run(s, c));

  // Quelques services de démonstration (atelier).
  const insSrv = db.prepare('INSERT INTO services (ref,client,item,probleme,piece,fournisseur,magasin,statut) VALUES (?,?,?,?,?,?,?,?)');
  const insSH = db.prepare('INSERT INTO service_historique (service_id,label,quand) VALUES (?,?,?)');
  const s1 = insSrv.run('SRV-500', 'M. Bélanger', 'Fauteuil Madrid', 'Mécanisme inclinable qui accroche', 'Mécanisme inclinable', 'Sofa by Fancy', 'Meubles Trois Mousquetaires', 'piece_commandee');
  insSH.run(s1.lastInsertRowid, 'Service créé', '2 août 2026'); insSH.run(s1.lastInsertRowid, 'Pièce commandée', '3 août 2026');
  const s2 = insSrv.run('SRV-501', 'Mme Roy', 'Sectionnel Sage', 'Couture décousue accoudoir droit', '', 'A-Class Furniture', 'Meubles Trois Mousquetaires', 'a_faire');
  insSH.run(s2.lastInsertRowid, 'Service créé', '5 août 2026');

  console.log('Base remplie avec succès.');
  console.log('Compte client de démonstration : marie-eve@exemple.ca / demo1234');
}

seed();
