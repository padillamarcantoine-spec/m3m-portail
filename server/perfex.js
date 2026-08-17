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

const base = () => (process.env.PERFEX_URL || '').replace(/\/+$/, '');
const headers = () => ({ 'authtoken': process.env.PERFEX_TOKEN, 'Content-Type': 'application/json' });

async function pf(path, opts = {}) {
  const url = base() + '/api' + path;
  const r = await fetch(url, { method: opts.method || 'GET', headers: headers(), body: opts.body ? JSON.stringify(opts.body) : undefined });
  const txt = await r.text();
  let data; try { data = JSON.parse(txt); } catch { data = txt; }
  if (!r.ok) throw new Error(`Perfex ${r.status}: ${typeof data === 'string' ? data.slice(0, 200) : JSON.stringify(data).slice(0, 200)}`);
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
    // L'API Perfex permet la recherche de clients ; selon la version, l'endpoint
    // est /customers/search/{terme} ou /customers avec filtre. On tente la recherche.
    const res = await pf('/customers/search/' + encodeURIComponent(courriel));
    const list = Array.isArray(res) ? res : (res?.data || []);
    const c = list.find(x => (x.email || '').toLowerCase() === courriel.toLowerCase()) || list[0] || null;
    return c ? { id: c.userid || c.id, company: c.company, email: c.email, phonenumber: c.phonenumber, existing: true } : null;
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
    const c = await pf('/customers/' + encodeURIComponent(id));
    const d = c?.data || c;
    return { id: d.userid || d.id, company: d.company, email: d.email, phonenumber: d.phonenumber };
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
    const res = await pf('/invoices/customer/' + encodeURIComponent(clientId)).catch(() => pf('/invoices'));
    const list = Array.isArray(res) ? res : (res?.data || []);
    return list.map(inv => ({
      no: inv.formatted_number || ('F-' + inv.id), date: inv.date, desc: inv.subject || 'Facture',
      montant: (inv.total ? Number(inv.total).toLocaleString('fr-CA', { minimumFractionDigits: 2 }) : '0,00') + ' $',
      statut: mapStatutFacture(inv.status), meta: ''
    }));
  } catch (e) { console.error('[Perfex] facturesClient échec:', e.message); return []; }
}
function mapStatutFacture(s) {
  // Perfex : 1 unpaid, 2 paid, 3 partially paid, 4 overdue, 5 cancelled, 6 draft
  return ({ 2: 'payee', 3: 'financement' })[s] || 'a_payer';
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
    const res = await pf('/subscriptions/customer/' + encodeURIComponent(clientId)).catch(() => pf('/subscriptions'));
    const list = Array.isArray(res) ? res : (res?.data || []);
    return list.map(s => ({
      id: s.id, nom: s.name || s.subject || 'Financement', statut: (s.status || '').toLowerCase() || 'actif',
      mensualite: s.amount ? Number(s.amount).toLocaleString('fr-CA', { minimumFractionDigits: 2 }) + ' $' : '',
      taux: '29,99 %', prochain: s.next_billing_cycle || '', compte: ''
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
    // On crée un « lead » Perfex avec les infos ; ton équipe le traite dans le CRM.
    await pf('/leads', { method: 'POST', body: {
      name: nom, email: courriel, phonenumber: tel,
      description: `Demande de financement maison — item: ${item} — ${dejaClient ? 'client existant' : 'nouveau client'}`,
      source: 1, status: 1
    }});
    return { simulation: false, ok: true };
  } catch (e) { console.error('[Perfex] creerDemandeFinancement échec:', e.message); return { ok: false, error: e.message }; }
}
