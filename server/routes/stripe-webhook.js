// Webhook Stripe — l'app PILOTE Stripe pour le financement maison.
//
// Quand le client paie le 1,15 $ (Checkout PAD `acss_debit`), Stripe envoie
// `checkout.session.completed`. On active alors le financement et on crée
// l'ABONNEMENT mensuel récurrent (prélèvements automatiques, 29,99 % inclus).
//
// IMPORTANT : ce endpoint doit recevoir le corps BRUT (express.raw) pour vérifier
// la signature Stripe. Il est monté AVANT express.json() dans server/index.js.
//
// Sans STRIPE_WEBHOOK_SECRET → on ne vérifie pas la signature (utile en dev).
// En production, configurez le secret (Stripe Dashboard → Developers → Webhooks).

import db from '../db.js';
import { stripeConfigured, stripeClient, creerAbonnementMensuel } from '../financement.js';

const MOIS = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
const nowFr = () => { const d = new Date(); return `${d.getDate()} ${MOIS[d.getMonth()]} ${d.getFullYear()}`; };

// Active le financement + crée l'abonnement mensuel (idempotent : ne refait rien si déjà actif).
async function activerFinancement(refOuId, session) {
  const f = db.prepare('SELECT * FROM financements WHERE ref = ? OR id = ?').get(refOuId, refOuId);
  if (!f) { console.warn('[Stripe webhook] financement introuvable:', refOuId); return; }
  // Claim atomique : une seule livraison de l'événement peut activer (pas de double abonnement).
  const claim = db.prepare("UPDATE financements SET statut='activation_en_cours' WHERE id=? AND statut NOT IN ('actif','activation_en_cours') AND stripe_subscription IS NULL").run(f.id);
  if (claim.changes === 0) return; // déjà traité ou en cours

  const customer = session.customer || session.customer_email || null;
  let subId = null;
  try {
    const sub = await creerAbonnementMensuel({
      stripeCustomerId: customer, mensualiteCents: f.mensualite_cents, nMois: f.n_mois, itemNom: f.item
    });
    subId = sub && sub.id || null;
  } catch (e) { console.error('[Stripe webhook] création abonnement:', e.message); }

  db.prepare("UPDATE financements SET statut='actif', stripe_customer=?, stripe_subscription=? WHERE id=?")
    .run(customer ? String(customer) : null, subId, f.id);
  const step = db.prepare('INSERT INTO financement_etapes (financement_id,label,quand,fait) VALUES (?,?,?,1)');
  step.run(f.id, 'Compte bancaire connecté et confirmé', nowFr());
  step.run(f.id, 'Financement actif — prélèvements mensuels planifiés', nowFr());
  console.log(`[Stripe webhook] financement ${f.ref} activé (abonnement ${subId || 'simulation'}).`);
}

export async function webhookHandler(req, res) {
  let event;
  try {
    const sig = req.headers['stripe-signature'];
    if (process.env.STRIPE_WEBHOOK_SECRET && sig) {
      const s = await stripeClient();
      if (!s) return res.status(500).send('Stripe non initialisé');
      event = s.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
    } else if (process.env.NODE_ENV !== 'production') {
      // DEV uniquement : accepter un corps non signé pour tester le flux.
      const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8')
        : (typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {}));
      event = JSON.parse(raw || '{}');
    } else {
      console.error('[Stripe webhook] refusé : signature/secret manquant en production.');
      return res.status(400).send('Signature requise');
    }
  } catch (e) {
    console.error('[Stripe webhook] signature/parse:', e.message);
    return res.status(400).send('Webhook Error: ' + e.message);
  }

  try {
    if (event.type === 'checkout.session.completed' || event.type === 'payment_intent.succeeded') {
      const obj = (event.data && event.data.object) || {};
      const fref = obj.metadata && obj.metadata.financementId;
      if (fref) await activerFinancement(fref, obj);
    }
  } catch (e) {
    console.error('[Stripe webhook] traitement:', e.message);
  }
  res.json({ received: true });
}
