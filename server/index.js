// Main server — serves the client portal + admin console and the REST API.
import 'dotenv/config';
import express from 'express';
import session from 'express-session';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import db from './db.js';
import api from './routes/api.js';
import v2 from './routes/v2.js';
import crm from './routes/crm.js';
import { webhookHandler } from './routes/stripe-webhook.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(__dirname, '..', 'public');
const PORT = process.env.PORT || 3000;
const PROD = process.env.NODE_ENV === 'production';
function sessionSecret() {
  const s = process.env.SESSION_SECRET;
  if (s && s.length >= 16) return s;
  if (PROD) throw new Error('SESSION_SECRET manquant ou trop court (≥16 caractères) en production.');
  return 'm3m-dev-secret-changez-moi';
}

// Auto-seed on first boot if the DB is empty, so `npm start` just works.
if (db.prepare('SELECT COUNT(*) c FROM stores').get().c === 0) {
  console.log('Base vide — remplissage initial…');
  await import('./seed.js');
}

const app = express();
if (PROD) app.set('trust proxy', 1);
// Webhook Stripe : corps BRUT requis pour la signature — monté AVANT express.json().
app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), webhookHandler);
app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());
app.use(session({
  secret: sessionSecret(),
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', secure: PROD, maxAge: 1000 * 60 * 60 * 24 * 14 }
}));

// Limiteur anti-force-brute simple (en mémoire) — protège connexions et écritures publiques.
const _hits = new Map();
function rateLimit({ windowMs, max }) {
  return (req, res, next) => {
    const key = (req.ip || 'x') + '|' + req.path;
    const now = Date.now();
    let e = _hits.get(key);
    if (!e || now > e.reset) { e = { count: 0, reset: now + windowMs }; _hits.set(key, e); }
    e.count++;
    if (e.count > max) return res.status(429).json({ error: 'Trop de tentatives. Réessayez dans quelques minutes.' });
    next();
  };
}
app.use('/api/auth', rateLimit({ windowMs: 15 * 60 * 1000, max: 40 }));
app.use('/api/admin/deverrouiller', rateLimit({ windowMs: 15 * 60 * 1000, max: 20 }));
app.use(['/api/demande-prix', '/api/demande-prix-lot', '/api/demande-financement', '/api/chat', '/api/financement/demande'], rateLimit({ windowMs: 60 * 1000, max: 20 }));

app.use('/api', api);
app.use('/api', v2);
app.use('/api', crm);

// Static assets (logo, css, js) and pages.
app.use(express.static(PUBLIC, { extensions: ['html'] }));

// Client portal is the root; admin console at /admin.
app.get('/', (_req, res) => res.sendFile(path.join(PUBLIC, 'index.html')));
app.get('/admin', (_req, res) => res.sendFile(path.join(PUBLIC, 'admin.html')));

// SPA fallback for the client portal (so refreshes on any client route work).
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/admin')) return next();
  const asFile = path.join(PUBLIC, req.path);
  if (fs.existsSync(asFile) && fs.statSync(asFile).isFile()) return res.sendFile(asFile);
  res.sendFile(path.join(PUBLIC, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\n  Meubles Trois Mousquetaires`);
  console.log(`  Portail client  →  http://localhost:${PORT}/`);
  console.log(`  Console admin   →  http://localhost:${PORT}/admin`);
  console.log(`\n  Prêt.\n`);
});
