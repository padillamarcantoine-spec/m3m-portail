// Database layer — SQLite via better-sqlite3.
// Creates the schema on first run and exposes a single shared connection.
import Database from 'better-sqlite3';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');

// Chemin de la base : DB_PATH (ex. disque persistant Render « /var/data/m3m.sqlite »)
// ou, par défaut, le dossier local « data/ ». On s'assure que le dossier parent existe.
const DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, 'm3m.sqlite');
const DB_DIR = path.dirname(DB_PATH);
if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS stores (
  id INTEGER PRIMARY KEY,
  nom TEXT NOT NULL UNIQUE,
  court TEXT NOT NULL,
  init TEXT NOT NULL,
  contact TEXT NOT NULL,
  point TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS suppliers (
  id INTEGER PRIMARY KEY,
  nom TEXT NOT NULL UNIQUE,
  init TEXT NOT NULL,
  categorie TEXT NOT NULL,
  delai TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  nom TEXT NOT NULL,
  ref TEXT NOT NULL,
  cat TEXT NOT NULL,
  img TEXT,
  options TEXT NOT NULL DEFAULT '[]',
  descr TEXT NOT NULL DEFAULT '',
  lit INTEGER NOT NULL DEFAULT 0,
  vedette INTEGER NOT NULL DEFAULT 0,
  fournisseur TEXT NOT NULL DEFAULT '',
  actif INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  courriel TEXT NOT NULL UNIQUE,
  nom TEXT NOT NULL,
  mdp_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'client',
  store_id INTEGER,
  stripe_connecte INTEGER NOT NULL DEFAULT 0,
  cree_le TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (store_id) REFERENCES stores(id)
);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ref TEXT NOT NULL UNIQUE,
  modele TEXT NOT NULL,
  fournisseur TEXT NOT NULL,
  magasin TEXT NOT NULL,
  auteur TEXT NOT NULL,
  date TEXT NOT NULL,
  qte INTEGER NOT NULL,
  statut TEXT NOT NULL DEFAULT 'nouvelle',
  note TEXT NOT NULL DEFAULT '',
  cree_le TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS order_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL,
  label TEXT NOT NULL,
  par TEXT NOT NULL,
  magasin TEXT NOT NULL,
  quand TEXT NOT NULL,
  ts TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS stock (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  modele TEXT NOT NULL,
  fournisseur TEXT NOT NULL,
  categorie TEXT NOT NULL,
  qte INTEGER NOT NULL DEFAULT 0,
  seuil INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ref TEXT NOT NULL,
  user_id INTEGER NOT NULL,
  date TEXT NOT NULL,
  descr TEXT NOT NULL,
  montant_cents INTEGER NOT NULL,
  statut TEXT NOT NULL DEFAULT 'a_payer',
  meta TEXT NOT NULL DEFAULT '',
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS service_tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ref TEXT NOT NULL,
  user_id INTEGER NOT NULL,
  item TEXT NOT NULL,
  descr TEXT NOT NULL,
  photo TEXT,
  statut TEXT NOT NULL DEFAULT 'recue',
  cree_le TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS service_steps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id INTEGER NOT NULL,
  label TEXT NOT NULL,
  quand TEXT NOT NULL,
  fait INTEGER NOT NULL DEFAULT 1,
  FOREIGN KEY (ticket_id) REFERENCES service_tickets(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS price_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL DEFAULT 'prix',
  produit TEXT,
  option TEXT,
  nom TEXT NOT NULL,
  tel TEXT NOT NULL,
  deja_client TEXT,
  cree_le TEXT NOT NULL DEFAULT (datetime('now')),
  traite INTEGER NOT NULL DEFAULT 0
);

-- Plans de financement maison (le cœur : 1$ capture PAD → abonnement mensuel).
-- statut ∈ { demande, lien_envoye, banque_connectee, actif, termine, annule }
CREATE TABLE IF NOT EXISTS financements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ref TEXT NOT NULL UNIQUE,
  user_id INTEGER,
  courriel TEXT NOT NULL,
  nom TEXT NOT NULL,
  tel TEXT,
  item TEXT NOT NULL,
  montant_cents INTEGER NOT NULL DEFAULT 0,
  n_mois INTEGER NOT NULL DEFAULT 18,
  mensualite_cents INTEGER NOT NULL DEFAULT 0,
  taux TEXT NOT NULL DEFAULT '29,99 %',
  statut TEXT NOT NULL DEFAULT 'demande',
  stripe_session TEXT,
  stripe_customer TEXT,
  stripe_subscription TEXT,
  versements_faits INTEGER NOT NULL DEFAULT 0,
  cree_le TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS financement_etapes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  financement_id INTEGER NOT NULL,
  label TEXT NOT NULL,
  quand TEXT NOT NULL,
  fait INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (financement_id) REFERENCES financements(id) ON DELETE CASCADE
);

-- Messages du chat (client ↔ agent IA / équipe).
CREATE TABLE IF NOT EXISTS chat_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session TEXT NOT NULL,
  role TEXT NOT NULL,          -- 'client' | 'agent' | 'equipe'
  contenu TEXT NOT NULL,
  cree_le TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Base de connaissances de l'agent (apprend graduellement : Q/R, faits du magasin).
CREATE TABLE IF NOT EXISTS chat_savoir (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sujet TEXT NOT NULL,
  contenu TEXT NOT NULL,
  cree_le TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Services / pièces (atelier interne).
-- statut ∈ { a_faire, piece_commandee, en_cours, termine }
CREATE TABLE IF NOT EXISTS services (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ref TEXT NOT NULL UNIQUE,
  client TEXT,
  item TEXT NOT NULL,
  probleme TEXT NOT NULL,
  piece TEXT,
  fournisseur TEXT,
  magasin TEXT,
  statut TEXT NOT NULL DEFAULT 'a_faire',
  note TEXT NOT NULL DEFAULT '',
  cree_le TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS service_historique (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  service_id INTEGER NOT NULL,
  label TEXT NOT NULL,
  quand TEXT NOT NULL,
  FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE
);

-- Registre des règlements (chaque paiement reçu, peu importe le mode).
-- mode ∈ { cheque_td, cash, depot_ginette, interac, compte_perso }
-- statut ∈ { encaisse, refuse }  — un chèque refusé garde montant_original_cents
-- mais son montant_cents tombe à 0 et un dossier de recouvrement est créé.
CREATE TABLE IF NOT EXISTS reglements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  client_nom TEXT NOT NULL DEFAULT '',
  financement_ref TEXT,
  facture_id INTEGER,
  mode TEXT NOT NULL CHECK (mode IN ('cheque_td','cash','depot_ginette','interac','compte_perso')),
  montant_cents INTEGER NOT NULL,
  montant_original_cents INTEGER NOT NULL DEFAULT 0,
  no_cheque TEXT,
  date TEXT NOT NULL,
  statut TEXT NOT NULL DEFAULT 'encaisse',
  dossier_ref TEXT,
  note TEXT NOT NULL DEFAULT '',
  cree_le TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Recouvrement : chèques NSF et prélèvements/paiements Stripe refusés.
-- Règle maison : un chèque refusé ne se règle JAMAIS par un autre chèque TD.
-- statut ∈ { ouvert, promesse, recupere, radie }
-- mode_reglement ∈ { cash, depot_ginette, interac, compte_perso, cheque_mois_suivant }
CREATE TABLE IF NOT EXISTS paiements_refuses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ref TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL DEFAULT 'cheque_nsf',      -- cheque_nsf | stripe_echec
  client_nom TEXT NOT NULL,
  client_tel TEXT,
  client_courriel TEXT,
  user_id INTEGER,
  financement_ref TEXT,
  montant_cents INTEGER NOT NULL,
  frais_cents INTEGER NOT NULL DEFAULT 0,
  raison TEXT NOT NULL DEFAULT '',
  no_cheque TEXT,
  date_refus TEXT NOT NULL,
  statut TEXT NOT NULL DEFAULT 'ouvert',
  mode_reglement TEXT CHECK (mode_reglement IN ('cash','depot_ginette','interac','compte_perso','cheque_mois_suivant') OR mode_reglement IS NULL),
  regle_le TEXT,
  promesse_note TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  stripe_event TEXT UNIQUE,
  cree_le TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

// Migration douce : ajoute `fournisseur` aux bases créées avant ce champ.
try { db.exec("ALTER TABLE products ADD COLUMN fournisseur TEXT NOT NULL DEFAULT ''"); } catch (e) {}
// Migrations douces CRM : coordonnées et notes sur la fiche client.
try { db.exec("ALTER TABLE users ADD COLUMN tel TEXT NOT NULL DEFAULT ''"); } catch (e) {}
try { db.exec("ALTER TABLE users ADD COLUMN adresse TEXT NOT NULL DEFAULT ''"); } catch (e) {}
try { db.exec("ALTER TABLE users ADD COLUMN note TEXT NOT NULL DEFAULT ''"); } catch (e) {}
// Liaison au CRM Perfex : id du client Perfex (userid) rattaché au compte,
// posé UNIQUEMENT après vérification (courriel + téléphone) à l'inscription.
// Sert à afficher les VRAIES factures/données du client depuis le CRM.
try { db.exec("ALTER TABLE users ADD COLUMN perfex_id INTEGER"); } catch (e) {}

export default db;
export { DB_PATH };
