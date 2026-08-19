// Magasin de sessions SQLite (better-sqlite3) — AUCUNE dépendance de plus.
// Remplace le MemoryStore d'express-session : les connexions clients survivent
// aux redémarrages ET aux redéploiements (la table vit sur le disque persistant,
// à côté du reste de la base). Corrige aussi le warning « MemoryStore is not
// designed for a production environment » des logs.
import session from 'express-session';
import db from './db.js';

db.exec(`CREATE TABLE IF NOT EXISTS sessions (
  sid    TEXT PRIMARY KEY,
  sess   TEXT NOT NULL,
  expire INTEGER NOT NULL
)`);

const stmtGet = db.prepare('SELECT sess, expire FROM sessions WHERE sid = ?');
const stmtSet = db.prepare('INSERT INTO sessions (sid, sess, expire) VALUES (?, ?, ?) ON CONFLICT(sid) DO UPDATE SET sess = excluded.sess, expire = excluded.expire');
const stmtDel = db.prepare('DELETE FROM sessions WHERE sid = ?');
const stmtPurge = db.prepare('DELETE FROM sessions WHERE expire < ?');

export class SqliteStore extends session.Store {
  constructor() {
    super();
    // Purge des sessions expirées : au démarrage puis 1×/heure.
    stmtPurge.run(Date.now());
    const t = setInterval(() => { try { stmtPurge.run(Date.now()); } catch (e) {} }, 60 * 60 * 1000);
    if (t.unref) t.unref(); // n'empêche pas le process de s'arrêter
  }
  _expireDe(sess) {
    const ms = sess?.cookie?.maxAge ?? 14 * 24 * 60 * 60 * 1000;
    return Date.now() + ms;
  }
  get(sid, cb) {
    try {
      const row = stmtGet.get(sid);
      if (!row || row.expire < Date.now()) return cb(null, null);
      cb(null, JSON.parse(row.sess));
    } catch (e) { cb(e); }
  }
  set(sid, sess, cb) {
    try { stmtSet.run(sid, JSON.stringify(sess), this._expireDe(sess)); cb && cb(null); }
    catch (e) { cb && cb(e); }
  }
  destroy(sid, cb) {
    try { stmtDel.run(sid); cb && cb(null); } catch (e) { cb && cb(e); }
  }
  touch(sid, sess, cb) {
    // Prolonge l'expiration sans réécrire la session complète à chaque requête.
    try {
      const row = stmtGet.get(sid);
      if (row) stmtSet.run(sid, row.sess, this._expireDe(sess));
      cb && cb(null);
    } catch (e) { cb && cb(e); }
  }
}
