// Connecteur Perfex CRM (auto-hébergé, PHP/MySQL).
// Perfex reste la SOURCE DE VÉRITÉ : clients, contrats, factures, abonnements Stripe.
// Cette application est la vitrine ; elle lit/écrit dans Perfex via son API REST.
//
// Perfex expose une API (module « API » officiel, jeton Bearer). Certaines données
// (abonnements) peuvent nécessiter le module correspondant activé côté Perfex.
//
// TOUT fonctionne sans configuration : si PERFEX_URL / PERFEX_TOKEN sont absents,
// le connecteur passe en MODE SIMULATION et renvoie des données de démonstration,
// pour que l'app soit testable de bout en bout avant le branchement réel.
//
// Pour brancher pour de vrai, dans .env :
//   PERFEX_URL=https://crm.tondomaine.ca
//   PERFEX_TOKEN=le-jeton-API-genere-dans-Perfex (Setup → API → Tokens)

const has = (v) => typeof v === 'string' && v.trim().length > 0;
export const perfexConfigured = () => has(process.env.PERFEX_URL) && has(process.env.PERFEX_TOKEN);

// Le pont « M3M API » (module Perfex maison) expose les données via
// <PERFEX_URL>/modules/m3m_api/api.php?action=… , protégé par un jeton Bearer.
// PERFEX_API_URL peut surcharger l'URL si le module est ailleurs.
const base = () => (process.env.PERFEX_URL || '').replace(/\/+$/, '');
const apiUrl = () => process.env.PERFEX_API_URL || (base() + '/modules/m3m_api/api.php');
const headers = () => ({ 'Authorization': 'Bearer ' + (process.env.PERFEX_TOKEN || ''), 'Content-Type': 'application/json' });

// pf(action, { query, method, body }) → appelle le pont et renvoie le JSON.
async function pf(action, opts = {}) {
  const u = new URL(apiUrl());
  u.searchParams.set('action', action);
  for (const [k, v] of Object.entries(opts.query || {})) u.searchParams.set(k, v);
  const r = await fetch(u.toString(), {
    method: opts.method || 'GET', headers: headers(),
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const txt = await r.text();
  let data; try { data = JSON.parse(txt); } catch { data = txt; }
  if (!r.ok) throw new Error(`M3M API ${r.status}: ${typeof data === 'string' ? data.slice(0, 200) : JSON.stringify(data).slice(0, 200)}`);
  return data;
}

// --- Données de simulation (mode démo) ------------------------------
const DEMO_CLIENT = {
  id: 'demo-1', company: 'Marie-Ève Tremblay', email: 'marie-eve@exemple.ca',
  phonenumber: '514-555-0199', existing: true
};

// =====================================================================
//  CLIENTS
// =====================================================================
// Retrouve un client Perfex par courriel. Sert à savoir si le client
// « existe déjà » (condition du financement maison).
export async function trouverClientParCourriel(courriel) {
  if (!perfexConfigured()) {
    return courriel && courriel.toLowerCase() === DEMO_CLIENT.email ? { ...DEMO_CLIENT } : null;
  }
  try {
    const c = await pf('customer_by_email', { query: { email: courriel } });
    if (!c || c.existing === false) return null;
    return { id: c.id, company: c.company, email: c.email, phonenumber: c.phonenumber, existing: true };
  } catch (e) {
    // Une panne du CRM n'est PAS « client inconnu » : on relance pour que la route
    // réponde « réessayez » au lieu de refuser un vrai client existant.
    console.error('[Perfex] recherche client échec:', e.message);
    throw new Error('Perfex inaccessible');
  }
}

export async function estClientExistant(courriel) {
  const c = await trouverClientParCourriel(courriel);
  return !!c;
}

// Infos client complètes (pour l'espace client : coordonnées, solde, etc.)
export async function infosClient(id) {
  if (!perfexConfigured()) return { ...DEMO_CLIENT };
  try {
    const d = await pf('customer', { query: { id } });
    return { id: d.id, company: d.company, email: d.email, phonenumber: d.phonenumber, contact: d.contact };
  } catch (e) { console.error('[Perfex] infosClient échec:', e.message); return null; }
}

// =====================================================================
//  FACTURES  (Perfex = source de vérité)
// =====================================================================
export async function facturesClient(clientId) {
  if (!perfexConfigured()) {
    return [
      { no: 'F-2503', date: '12 juillet 2026', desc: 'Chaises Molly (la paire)', montant: '289,00 $', statut: 'a_payer', meta: '' },
      { no: 'F-2467', date: '3 mai 2026', desc: 'Ensemble chambre Bombay', montant: '3 285,00 $', statut: 'financement', meta: '6/18' },
      { no: 'F-2418', date: '2 février 2026', desc: 'Table Mae', montant: '1 095,00 $', statut: 'payee', meta: '' }
    ];
  }
  try {
    const res = await pf('invoices', { query: { clientid: clientId } });
    const list = res?.data || [];
    const fr = (v) => Number(v).toLocaleString('fr-CA', { minimumFractionDigits: 2 }) + ' $';
    return list.map(inv => ({
      no: inv.numero, date: inv.date, desc: 'Facture ' + inv.numero,
      montant: fr(inv.total), solde: fr(inv.solde),
      statut: mapStatutFacture(inv.statut), meta: ''
    }));
  } catch (e) { console.error('[Perfex] facturesClient échec:', e.message); return []; }
}
function mapStatutFacture(s) {
  // Le pont renvoie déjà : impayee / payee / partielle / en_retard / annulee.
  return ({ payee: 'payee', partielle: 'financement', en_retard: 'a_payer', annulee: 'annulee' })[s] || 'a_payer';
}

// =====================================================================
//  ABONNEMENTS / FINANCEMENT (via Perfex, qui est branché à Stripe)
// =====================================================================
// Perfex gère les abonnements Stripe. On lit l'état pour l'afficher au client.
export async function abonnementsClient(clientId) {
  if (!perfexConfigured()) {
    return [{
      id: 'sub_demo', nom: 'Ensemble chambre Bombay', statut: 'actif',
      mensualite: '182,50 $', total_verse: 6, total: 18, reste: '2 190,00 $',
      taux: '29,99 %', prochain: '1er septembre 2026', compte: '••4832'
    }];
  }
  try {
    const res = await pf('subscriptions', { query: { clientid: clientId } });
    const list = res?.data || [];
    return list.map(s => ({
      id: s.id, nom: s.name || 'Financement', statut: (s.status || '').toLowerCase() || 'actif',
      mensualite: '', taux: '29,99 %', prochain: s.next_billing_cycle || '', compte: ''
    }));
  } catch (e) { console.error('[Perfex] abonnementsClient échec:', e.message); return []; }
}

// Crée / enregistre une demande de financement dans Perfex (lead ou tâche),
// pour que ça apparaisse dans ton CRM comme une vraie piste à traiter.
export async function creerDemandeFinancement({ nom, courriel, tel, item, dejaClient }) {
  if (!perfexConfigured()) {
    console.log(`[Perfex:SIMULATION] Demande financement → ${nom} (${courriel}) — ${item}`);
    return { simulation: true, ok: true };
  }
  try {
    // On crée une « piste » (lead) dans Perfex ; ton équipe la traite dans le CRM.
    await pf('create_lead', { method: 'POST', body: {
      name: nom, email: courriel, phonenumber: tel,
      description: `Demande de financement maison — item: ${item} — ${dejaClient ? 'client existant' : 'nouveau client'}`,
    }});
    return { simulation: false, ok: true };
  } catch (e) { console.error('[Perfex] creerDemandeFinancement échec:', e.message); return { ok: false, error: e.message }; }
}
