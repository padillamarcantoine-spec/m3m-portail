// Module de financement maison — le cœur du projet.
//
// LE FLUX (exactement ce que Marc-Antoine a décrit) :
//   1. Le client existant demande un financement pour un item.
//   2. On lui envoie un lien de connexion bancaire (Stripe Checkout, mode 'setup'
//      ou paiement de 1,15 $) qui CAPTURE son compte bancaire canadien (PAD /
//      acss_debit) comme moyen de paiement enregistré.
//   3. Une fois la banque connectée et confirmée (Stripe met 4-5 jours ouvrables
//      pour vérifier un PAD), on crée un ABONNEMENT mensuel récurrent qui prélève
//      automatiquement chaque mois, intérêts à 29,99 % inclus dans le calcul.
//   4. Le client suit chaque étape depuis son espace, avec explications.
//
// RÈGLE MÉTIER : réservé aux clients EXISTANTS (vérifié via Perfex).
// Nouveau client → message : dépôt min. 50 % après taxes, à voir en magasin.
//
// SANS clés Stripe → MODE SIMULATION : le flux se déroule visuellement de bout en
// bout (le client voit toutes les étapes) mais aucune transaction réelle. Tu ajoutes
// STRIPE_SECRET_KEY dans .env et « npm install stripe » pour passer en réel.

const has = (v) => typeof v === 'string' && v.trim().length > 0;
export const stripeConfigured = () => has(process.env.STRIPE_SECRET_KEY);
const TAUX_ANNUEL = 0.2999; // 29,99 %
const FRAIS_CONNEXION_CENTS = 115; // 1,15 $

let _stripe = null;
async function stripe() {
  if (!stripeConfigured()) return null;
  if (_stripe) return _stripe;
  try {
    const Stripe = (await import('stripe')).default;   // nécessite « npm install stripe »
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' });
    return _stripe;
  } catch (e) {
    console.error('[Stripe] SDK non installé — « npm install stripe » pour activer le réel.', e.message);
    return null;
  }
}

// Calcule la mensualité d'un financement (amortissement standard, taux mensuel).
// montantCents = total à financer (après taxes), nMois = nombre de versements.
export function calculerMensualite(montantCents, nMois) {
  const i = TAUX_ANNUEL / 12;
  const P = montantCents / 100;
  const m = (P * i) / (1 - Math.pow(1 + i, -nMois));
  const mensualite = Math.round(m * 100) / 100;
  const totalPaye = Math.round(mensualite * nMois * 100) / 100;
  return {
    mensualiteCents: Math.round(mensualite * 100),
    mensualite: mensualite.toLocaleString('fr-CA', { minimumFractionDigits: 2 }) + ' $',
    totalPaye: totalPaye.toLocaleString('fr-CA', { minimumFractionDigits: 2 }) + ' $',
    interetsTotal: (totalPaye - P).toLocaleString('fr-CA', { minimumFractionDigits: 2 }) + ' $',
    taux: '29,99 %', nMois
  };
}

// ÉTAPE 2 — créer le lien de connexion bancaire (capture PAD via le 1,15 $).
// Retourne l'URL Stripe Checkout à envoyer au client (SMS/courriel/en magasin).
export async function creerLienConnexionBancaire({ courriel, nom, financementId }) {
  const s = await stripe();
  if (!s) {
    console.log(`[Financement:SIMULATION] Lien de connexion bancaire pour ${courriel} (financement ${financementId}).`);
    return { simulation: true, url: `/financement/suivi?demo=1&id=${encodeURIComponent(financementId)}` };
  }
  // MODE RÉEL — Checkout en mode paiement de 1,15 $ avec PAD canadien (acss_debit).
  // Le paiement enregistre le mandat de prélèvement (setup_future_usage) pour
  // les prélèvements mensuels suivants.
  const session = await s.checkout.sessions.create({
    mode: 'payment',
    payment_method_types: ['acss_debit'],
    customer_email: courriel,
    line_items: [{
      price_data: {
        currency: 'cad',
        product_data: { name: 'Connexion bancaire — Financement maison M3M' },
        unit_amount: FRAIS_CONNEXION_CENTS
      },
      quantity: 1
    }],
    payment_intent_data: {
      setup_future_usage: 'off_session',
      payment_method_options: {
        acss_debit: { mandate_options: {
          payment_schedule: 'interval', interval_description: 'Prélèvement mensuel du financement',
          transaction_type: 'personal'
        } }
      }
    },
    metadata: { financementId: String(financementId), type: 'connexion_bancaire' },
    success_url: (process.env.APP_URL || '') + '/financement/suivi?ok=1&id=' + encodeURIComponent(financementId),
    cancel_url: (process.env.APP_URL || '') + '/financement/suivi?annule=1&id=' + encodeURIComponent(financementId)
  });
  return { simulation: false, url: session.url, sessionId: session.id };
}

// ÉTAPE 3 — créer l'abonnement mensuel récurrent une fois la banque confirmée.
// `session` = la session Checkout confirmée (pour rattacher le PAD enregistré).
export async function creerAbonnementMensuel({ stripeCustomerId, mensualiteCents, nMois, itemNom, session }) {
  const s = await stripe();
  if (!s) {
    console.log(`[Financement:SIMULATION] Abonnement ${nMois} × ${(mensualiteCents/100).toFixed(2)}$ pour « ${itemNom} ».`);
    return { simulation: true, id: 'sub_sim_' + Math.floor(Math.random() * 1e9) };
  }
  // Rattacher le PAD capturé par le paiement de 1,15 $ comme moyen de paiement
  // par défaut — sans ça, les factures mensuelles n'auraient aucun moyen de paiement.
  let padId = null;
  try {
    const piId = session && (typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id);
    if (piId) {
      const pi = await s.paymentIntents.retrieve(piId);
      padId = typeof pi.payment_method === 'string' ? pi.payment_method : pi.payment_method?.id || null;
      if (padId && stripeCustomerId) {
        await s.paymentMethods.attach(padId, { customer: stripeCustomerId }).catch(() => {}); // déjà attaché = ok
      }
    }
  } catch (e) { console.warn('[Stripe] PAD non rattaché (continuera avec le défaut client) :', e.message); }

  const price = await s.prices.create({
    currency: 'cad', unit_amount: mensualiteCents,
    recurring: { interval: 'month' },
    product_data: { name: `Financement maison — ${itemNom}` }
  });
  // L'abonnement S'ARRÊTE tout seul après nMois versements (jamais de prélèvement à vie).
  const finTs = Math.floor(Date.now() / 1000) + Math.round(nMois * 30.44 * 86400);
  const sub = await s.subscriptions.create({
    customer: stripeCustomerId,
    items: [{ price: price.id }],
    collection_method: 'charge_automatically',
    cancel_at: finTs,
    metadata: { nMois: String(nMois), item: itemNom, taux: '29.99' },
    ...(padId ? { default_payment_method: padId } : {})
  });
  return { simulation: false, id: sub.id, status: sub.status };
}

// Vérifie l'état d'une session/mandat (pour le suivi client en temps réel).
export async function etatConnexion(sessionId) {
  const s = await stripe();
  if (!s || !sessionId) return { simulation: !s, statut: 'en_verification' };
  const sess = await s.checkout.sessions.retrieve(sessionId);
  return { simulation: false, statut: sess.payment_status === 'paid' ? 'confirme' : 'en_verification' };
}

// Exposé pour la vérification de signature du webhook (server/routes/stripe-webhook.js).
export { stripe as stripeClient };
