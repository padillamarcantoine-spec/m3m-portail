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
import { creerDossierEchecStripe } from './crm.js';

const MOIS = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
const nowFr = () => { const d = new Date(); return `${d.getDate()} ${MOIS[d.getMonth()]} ${d.getFullYear()}`; };

// Active le financement + crée l'abonnement mensuel (idempotent : ne refait rien si déjà actif).
async function activerFinancement(refOuId, session) {
  const f = db.prepare('SELECT * FROM financements WHERE ref = ? OR id = ?').get(refOuId, refOuId);
  if (!f) { console.warn('[Stripe webhook] financement introuvable:', refOuId); return; }
  // Claim atomique : une seule livraison de l'événement peut activer (pas de double abonnement).
  // Seuls les statuts légitimes du parcours passent — jamais « refuse_nouveau » (dépôt 50 % requis).
  const claim = db.prepare("UPDATE financements SET statut='activation_en_cours' WHERE id=? AND statut IN ('demande','lien_envoye','banque_connectee') AND stripe_subscription IS NULL").run(f.id);
  if (claim.changes === 0) return; // déjà traité, en cours, ou statut non admissible

  const customer = session.customer || session.customer_email || null;
  let subId = null;
  try {
    const sub = await creerAbonnementMensuel({
      stripeCustomerId: customer, mensualiteCents: f.mensualite_cents, nMois: f.n_mois, itemNom: f.item,
      session
    });
    subId = sub && sub.id || null;
  } catch (e) {
    // Échec de création : on NE marque PAS actif — on revient à l'état précédent et on
    // répond 500 plus haut pour que Stripe relivre l'événement.
    console.error('[Stripe webhook] création abonnement:', e.message);
    db.prepare("UPDATE financements SET statut=? WHERE id=?").run(f.statut, f.id);
    throw e;
  }

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
    if (process.env.STRIPE_WEBHOOK_SECRET) {
      // Dès qu'un secret est configuré, la signature est TOUJOURS exigée (dev compris) :
      // omettre l'en-tête ne doit jamais contourner la vérification.
      if (!sig) return res.status(400).send('Signature requise');
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
    // PAD canadien (acss_debit) = paiement ASYNCHRONE : à `checkout.session.completed`,
    // payment_status vaut souvent « unpaid » — la confirmation réelle arrive 4-5 jours
    // plus tard via `checkout.session.async_payment_succeeded`. On n'active que payé.
    if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
      const obj = (event.data && event.data.object) || {};
      const fref = obj.metadata && obj.metadata.financementId;
      const paye = obj.payment_status ? obj.payment_status === 'paid' : event.type === 'checkout.session.async_payment_succeeded';
      if (fref && paye) await activerFinancement(fref, obj);
      else if (fref) {
        // Paiement en attente de confirmation bancaire : on note l'étape sans activer.
        const f = db.prepare('SELECT id, statut FROM financements WHERE ref = ?').get(fref);
        if (f && f.statut === 'lien_envoye') {
          db.prepare("UPDATE financements SET statut='banque_connectee' WHERE id=?").run(f.id);
          db.prepare('INSERT INTO financement_etapes (financement_id,label,quand,fait) VALUES (?,?,?,1)')
            .run(f.id, 'Connexion bancaire en cours de confirmation (4-5 jours ouvrables)', nowFr());
        }
      }
    }
    if (event.type === 'checkout.session.async_payment_failed') {
      const obj = (event.data && event.data.object) || {};
      const fref = obj.metadata && obj.metadata.financementId;
      const f = fref ? db.prepare('SELECT id, statut FROM financements WHERE ref = ?').get(fref) : null;
      if (f && !['actif'].includes(f.statut)) {
        db.prepare("UPDATE financements SET statut='demande' WHERE id=?").run(f.id);
        db.prepare('INSERT INTO financement_etapes (financement_id,label,quand,fait) VALUES (?,?,?,1)')
          .run(f.id, 'Connexion bancaire refusée — un nouveau lien peut être envoyé', nowFr());
      }
    }
    // Prélèvement/paiement refusé → dossier de recouvrement créé automatiquement (idempotent par événement).
    if (['charge.failed', 'invoice.payment_failed', 'payment_intent.payment_failed'].includes(event.type)) {
      const obj = (event.data && event.data.object) || {};
      const montantCents = obj.amount_due ?? obj.amount ?? 0;
      const courriel = obj.customer_email || (obj.billing_details && obj.billing_details.email) || '';
      const nom = (obj.billing_details && obj.billing_details.name) || obj.customer_name || '';
      // Retrouver le plan de financement lié via le client/abonnement Stripe.
      const fin = db.prepare('SELECT ref FROM financements WHERE (stripe_customer = ? AND stripe_customer IS NOT NULL) OR (stripe_subscription = ? AND stripe_subscription IS NOT NULL)')
        .get(String(obj.customer || ''), String(obj.subscription || ''));
      const raison = (obj.failure_message || (obj.last_payment_error && obj.last_payment_error.message) || 'Prélèvement refusé').slice(0, 180);
      const ref = creerDossierEchecStripe({ eventId: event.id, montantCents, courriel, nom, raison, financementRef: fin?.ref });
      if (ref) console.log(`[Stripe webhook] paiement refusé → dossier recouvrement ${ref} (${event.type}).`);
    }
  } catch (e) {
    // Erreur de traitement (ex. création d'abonnement) : répondre 500 pour que
    // Stripe relivre l'événement — ne jamais « avaler » une activation ratée.
    console.error('[Stripe webhook] traitement:', e.message);
    return res.status(500).json({ received: false });
  }
  res.json({ received: true });
}
