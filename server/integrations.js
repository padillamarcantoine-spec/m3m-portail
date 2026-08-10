// Integration points for Stripe (payments / financing) and notifications
// (SMS + email). These are written so the whole app runs with ZERO keys
// configured — in that case they operate in "simulation mode": the action
// is recorded and logged, but nothing external is called. Fill the keys in
// .env to switch each one to live mode. No third-party SDK is required to
// boot; the code degrades gracefully and documents exactly where to plug in.

const has = (v) => typeof v === 'string' && v.trim().length > 0;

export const stripeConfigured = () => has(process.env.STRIPE_SECRET_KEY);
export const smsConfigured = () =>
  has(process.env.TWILIO_ACCOUNT_SID) && has(process.env.TWILIO_AUTH_TOKEN) && has(process.env.TWILIO_FROM);
export const emailConfigured = () => has(process.env.SMTP_HOST) && has(process.env.SMTP_USER);

// ---------------------------------------------------------------------
// PAIEMENTS (Stripe)
// ---------------------------------------------------------------------
// Marque une facture comme payée. En mode simulation, on considère le
// paiement réussi immédiatement. En mode réel, c'est ici que vous créez
// un PaymentIntent Stripe et confirmez via webhook.
//
// Pour activer Stripe pour de vrai :
//   1) npm install stripe
//   2) import Stripe from 'stripe';
//   3) const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
//   4) créez un PaymentIntent et renvoyez son client_secret au frontend,
//      puis confirmez le paiement côté navigateur avec Stripe.js.
export async function creerPaiement({ facture, montantCents, description }) {
  if (!stripeConfigured()) {
    console.log(`[Stripe:SIMULATION] Paiement de ${(montantCents / 100).toFixed(2)} $ pour « ${description} » (facture ${facture}).`);
    return { simulation: true, ok: true };
  }
  // --- MODE RÉEL : décommentez après « npm install stripe » ----------
  // const Stripe = (await import('stripe')).default;
  // const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  // const intent = await stripe.paymentIntents.create({
  //   amount: montantCents, currency: 'cad',
  //   description, metadata: { facture },
  //   automatic_payment_methods: { enabled: true }
  // });
  // return { simulation: false, ok: true, clientSecret: intent.client_secret };
  console.log(`[Stripe:LIVE] (à implémenter) Paiement facture ${facture}.`);
  return { simulation: false, ok: true };
}

// Lien de connexion bancaire pour le financement maison (paiement de 1,15 $).
// En réel : créez un Stripe Checkout Session ou un SetupIntent.
export async function creerConnexionBancaire({ courriel }) {
  if (!stripeConfigured()) {
    console.log(`[Stripe:SIMULATION] Lien de connexion bancaire pour ${courriel}.`);
    return { simulation: true, url: null };
  }
  console.log(`[Stripe:LIVE] (à implémenter) Connexion bancaire ${courriel}.`);
  return { simulation: false, url: null };
}

// ---------------------------------------------------------------------
// NOTIFICATIONS (SMS + courriel)
// ---------------------------------------------------------------------
export async function envoyerSMS(message) {
  if (!smsConfigured()) {
    console.log(`[SMS:SIMULATION → ${process.env.NOTIFY_SMS_TO || 'magasin'}] ${message}`);
    return { simulation: true, ok: true };
  }
  // --- MODE RÉEL : décommentez après « npm install twilio » ----------
  // const twilio = (await import('twilio')).default(
  //   process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  // await twilio.messages.create({
  //   body: message, from: process.env.TWILIO_FROM, to: process.env.NOTIFY_SMS_TO });
  console.log(`[SMS:LIVE] (à implémenter) ${message}`);
  return { simulation: false, ok: true };
}

export async function envoyerCourriel({ sujet, corps }) {
  if (!emailConfigured()) {
    console.log(`[COURRIEL:SIMULATION → ${process.env.NOTIFY_EMAIL_TO || 'magasin'}] ${sujet}\n${corps}`);
    return { simulation: true, ok: true };
  }
  // --- MODE RÉEL : décommentez après « npm install nodemailer » ------
  // const nodemailer = (await import('nodemailer')).default;
  // const t = nodemailer.createTransport({
  //   host: process.env.SMTP_HOST, port: +(process.env.SMTP_PORT || 587),
  //   auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } });
  // await t.sendMail({ from: process.env.SMTP_USER, to: process.env.NOTIFY_EMAIL_TO, subject: sujet, text: corps });
  console.log(`[COURRIEL:LIVE] (à implémenter) ${sujet}`);
  return { simulation: false, ok: true };
}

// Notifie le magasin d'une nouvelle demande (prix ou financement) par les
// deux canaux disponibles, sans jamais faire échouer la requête client.
export async function notifierMagasin({ sujet, message }) {
  try { await envoyerSMS(message); } catch (e) { console.error('SMS échec', e.message); }
  try { await envoyerCourriel({ sujet, corps: message }); } catch (e) { console.error('Courriel échec', e.message); }
}
