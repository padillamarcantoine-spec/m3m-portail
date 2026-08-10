// Agent IA de chat — répond aux clients « comme si c'était le magasin ».
//
// Fonctionnement :
//  - L'agent reçoit le message du client + l'historique de la conversation +
//    une base de connaissances (faits du magasin, questions fréquentes) stockée
//    dans la table chat_savoir (il « apprend » : tu ajoutes des Q/R et il s'en sert).
//  - Il appelle une API d'IA (Claude par défaut, OpenAI en option) pour formuler
//    la réponse dans ton ton.
//  - S'il ne sait pas, il propose d'escalader vers l'équipe (courriel/SMS).
//
// SANS clé IA → MODE SIMULATION : réponses à partir de la base de connaissances +
// message d'attente. Tu ajoutes ANTHROPIC_API_KEY (ou OPENAI_API_KEY) dans .env.

import db from './db.js';

const has = (v) => typeof v === 'string' && v.trim().length > 0;
export const iaConfigured = () => has(process.env.ANTHROPIC_API_KEY) || has(process.env.OPENAI_API_KEY);

const CONSIGNE = `Tu es l'assistant virtuel de Meubles Trois Mousquetaires, un magasin de meubles,
matelas (fabriqués à Montréal) et électroménagers à Montréal. Tu réponds en français québécois,
chaleureux et professionnel, comme un conseiller du magasin. Sois bref et concret.
Coordonnées : 2485 rue Leclaire, Montréal ; (514) 251-1055 ; texto 514-609-1239 ;
info@meublestroismousquetaires.ca. Livraison gratuite + installation gant blanc.
Financement : Fairstone, Affirm, iFinance, et financement maison (réservé aux clients existants,
connexion bancaire Stripe, prélèvements mensuels). Si tu ne connais pas une réponse précise
(prix exact, disponibilité, dossier d'un client), invite gentiment à laisser ses coordonnées
pour qu'un conseiller le recontacte — ne jamais inventer de prix.`;

function savoir() {
  return db.prepare('SELECT sujet, contenu FROM chat_savoir ORDER BY id DESC LIMIT 50').all()
    .map(s => `- ${s.sujet} : ${s.contenu}`).join('\n');
}

// Réponse hors-ligne (mode simulation) : cherche dans la base de connaissances.
function reponseSimulee(message) {
  const q = message.toLowerCase();
  const faits = db.prepare('SELECT sujet, contenu FROM chat_savoir').all();
  const trouve = faits.find(f => q.includes(f.sujet.toLowerCase()) || f.sujet.toLowerCase().split(' ').some(m => m.length > 4 && q.includes(m)));
  if (trouve) return trouve.contenu;
  if (/(financ|paiement|versement|mensuel)/.test(q))
    return `Pour le financement maison, il faut être client existant : on vous envoie un lien de connexion bancaire sécurisé (Stripe), puis les versements mensuels se font automatiquement. On a aussi Fairstone, Affirm et iFinance. Voulez-vous qu'un conseiller vous rappelle ? Laissez-moi votre nom et numéro.`;
  if (/(livraison|installation)/.test(q))
    return `La livraison est gratuite à Montréal et environs, avec installation gant blanc le jour même. Délai typique : 3 à 14 jours ouvrables.`;
  if (/(heure|ouvert|adresse|où)/.test(q))
    return `On est au 2485, rue Leclaire à Montréal. Appelez-nous au (514) 251-1055 ou textez au 514-609-1239 !`;
  if (/(prix|coût|combien)/.test(q))
    return `Nos prix sont sur demande — laissez-moi le modèle qui vous intéresse et votre numéro, un conseiller vous texte le meilleur prix rapidement.`;
  return `Bonne question ! Je transmets ça à un conseiller. Laissez-moi votre nom et numéro et on vous revient très vite — ou appelez le (514) 251-1055.`;
}

async function appelClaude(messages) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || 'claude-3-5-haiku-latest',
      max_tokens: 500,
      system: CONSIGNE + '\n\nBase de connaissances du magasin :\n' + savoir(),
      messages: messages.map(m => ({ role: m.role === 'client' ? 'user' : 'assistant', content: m.contenu }))
    })
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data?.error?.message || 'Erreur IA');
  return data.content?.[0]?.text || '';
}

async function appelOpenAI(messages) {
  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + process.env.OPENAI_API_KEY, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      max_tokens: 500,
      messages: [{ role: 'system', content: CONSIGNE + '\n\nBase de connaissances :\n' + savoir() },
        ...messages.map(m => ({ role: m.role === 'client' ? 'user' : 'assistant', content: m.contenu }))]
    })
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data?.error?.message || 'Erreur IA');
  return data.choices?.[0]?.message?.content || '';
}

// Point d'entrée : reçoit un message, renvoie la réponse de l'agent.
export async function repondre(session, message) {
  db.prepare('INSERT INTO chat_messages (session, role, contenu) VALUES (?,?,?)').run(session, 'client', message);
  const historique = db.prepare('SELECT role, contenu FROM chat_messages WHERE session = ? ORDER BY id DESC LIMIT 12').all(session).reverse();

  let reponse;
  try {
    if (has(process.env.ANTHROPIC_API_KEY)) reponse = await appelClaude(historique);
    else if (has(process.env.OPENAI_API_KEY)) reponse = await appelOpenAI(historique);
    else reponse = reponseSimulee(message);
  } catch (e) {
    console.error('[Agent IA] échec:', e.message);
    reponse = reponseSimulee(message);
  }

  db.prepare('INSERT INTO chat_messages (session, role, contenu) VALUES (?,?,?)').run(session, 'agent', reponse);
  return { reponse, simulation: !iaConfigured() };
}

export function historique(session) {
  return db.prepare('SELECT role, contenu, cree_le FROM chat_messages WHERE session = ? ORDER BY id').all(session);
}
